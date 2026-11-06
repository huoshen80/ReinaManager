use super::assets;
use crate::utils::image::{content_type_for_file, make_image_response, make_status_response};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, Weak};
use tauri::Manager;
use tauri::http::StatusCode;
use tokio::sync::Semaphore;

const MAX_CONCURRENT_COVER_DOWNLOADS: usize = 32;
const BANGUMI_IMAGE_HOST: &str = "lain.bgm.tv";
const VNDB_IMAGE_HOST: &str = "t.vndb.org";
const BANGUMI_IMAGE_PROXY_PREFIX: &str = "https://imagesp.yurari.moe/bangumi/";
const VNDB_IMAGE_PROXY_PREFIX: &str = "https://imagesp.yurari.moe/vndb/";
#[derive(Clone, Debug, Eq, PartialEq)]
struct CoverDownloadCandidate {
    label: &'static str,
    url: String,
}

pub struct DownloadState {
    semaphore: Semaphore,
    locks: Mutex<HashMap<String, Weak<tokio::sync::Mutex<()>>>>,
}
impl DownloadState {
    fn asset_lock(&self, id: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self.locks.lock().unwrap_or_else(|e| e.into_inner());
        locks.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = locks.get(id).and_then(Weak::upgrade) {
            return lock;
        }
        let lock = Arc::new(tokio::sync::Mutex::new(()));
        locks.insert(id.to_string(), Arc::downgrade(&lock));
        lock
    }
}

fn build_cover_download_candidates(original_url: &str) -> Vec<CoverDownloadCandidate> {
    build_cover_download_candidates_with_proxy(
        original_url,
        crate::utils::http::has_effective_proxy(),
    )
}

fn build_cover_download_candidates_with_proxy(
    original_url: &str,
    has_proxy: bool,
) -> Vec<CoverDownloadCandidate> {
    let proxy = url::Url::parse(original_url).ok().and_then(|parsed| {
        if !matches!(parsed.scheme(), "http" | "https") {
            return None;
        }

        match parsed.host_str() {
            Some(BANGUMI_IMAGE_HOST) => Some(("Bangumi 代理", BANGUMI_IMAGE_PROXY_PREFIX, true)),
            Some(VNDB_IMAGE_HOST) => {
                // 有代理时镜像优先 (proxy_first = true)；无代理时原站优先 (proxy_first = false)
                Some(("VNDB 代理", VNDB_IMAGE_PROXY_PREFIX, has_proxy))
            }
            _ => None,
        }
    });

    let original = CoverDownloadCandidate {
        label: "原始地址",
        url: original_url.to_string(),
    };

    if let Some((label, prefix, proxy_first)) = proxy {
        let proxy = CoverDownloadCandidate {
            label,
            url: format!("{prefix}{original_url}"),
        };
        let (first, second) = if proxy_first {
            (proxy, original)
        } else {
            (original, proxy)
        };
        return vec![first.clone(), second.clone(), first, second];
    }

    vec![original.clone(), original]
}

async fn resolve_cover(
    db: &DatabaseConnection,
    state: &DownloadState,
    asset_id: &str,
    root: &std::path::Path,
) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(asset_id).map_err(|_| "无效的封面 UUID".to_string())?;
    if let Some(path) = assets::cache_path(db, root, asset_id).await? {
        return Ok(path);
    }
    let lock = state.asset_lock(asset_id);
    let _guard = lock.lock().await;
    if let Some(path) = assets::cache_path(db, root, asset_id).await? {
        return Ok(path);
    }
    let _permit = state.semaphore.acquire().await.map_err(|e| e.to_string())?;
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT original_url FROM cover_assets WHERE id = ? AND kind = 'cloud'",
            [asset_id.into()],
        ))
        .await
        .map_err(|e| e.to_string())?
        .ok_or("封面资产已失效")?;
    let url: String = row.try_get("", "original_url").map_err(|e| e.to_string())?;
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("无效的远程封面地址".into());
    }
    let mut error = String::new();
    for candidate in build_cover_download_candidates(&url) {
        let result = async {
            let response = crate::utils::http::get_client()
                .get(&candidate.url)
                .header("Cache-Control", "no-cache")
                .send()
                .await
                .map_err(|e| e.to_string())?
                .error_for_status()
                .map_err(|e| e.to_string())?;
            if response
                .content_length()
                .is_some_and(|n| n > 32 * 1024 * 1024)
            {
                return Err("封面文件过大".to_string());
            }
            let mut response = response;
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
                if bytes.len() + chunk.len() > 32 * 1024 * 1024 {
                    return Err("封面文件过大".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            assets::image_extension(&bytes)?;
            Ok::<_, String>(bytes)
        }
        .await;
        let bytes = match result {
            Ok(bytes) => bytes,
            Err(e) => {
                error = e;
                continue;
            }
        };
        let _operation_guard =
            crate::backup::common::acquire_database_backup_operation_lock().await;
        if db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT 1 FROM cover_assets WHERE id = ? AND kind = 'cloud'",
                [asset_id.into()],
            ))
            .await
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Err("封面资产已失效".into());
        }
        let ext = assets::image_extension(&bytes)?;
        let path = assets::asset_path(root, "cloud", asset_id, ext)?;
        assets::write_asset_file(&path, &bytes).await?;
        // 只补全仍有效的资产，来源删除或替换后不能由旧下载重建关联。
        let result = db
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE cover_assets SET extension = ? WHERE id = ? AND kind = 'cloud'",
                [ext.into(), asset_id.into()],
            ))
            .await
            .map_err(|e| e.to_string())
            .and_then(|result| {
                if result.rows_affected() == 0 {
                    Err("封面资产已失效".to_string())
                } else {
                    Ok(())
                }
            });
        if let Err(e) = result {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(e);
        }
        return Ok(path);
    }
    Err(format!("所有封面候选下载失败: {error}"))
}

pub fn register_game_cover_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .manage(DownloadState {
            semaphore: Semaphore::new(MAX_CONCURRENT_COVER_DOWNLOADS),
            locks: Mutex::new(HashMap::new()),
        })
        .register_asynchronous_uri_scheme_protocol("reina-cover", |app, request, responder| {
            let app = app.app_handle().clone();
            let uri = request.uri().to_string();
            tauri::async_runtime::spawn(async move {
                let parsed = match url::Url::parse(&uri) {
                    Ok(url) => url,
                    Err(_) => {
                        responder.respond(make_status_response(StatusCode::BAD_REQUEST));
                        return;
                    }
                };
                let asset_id = parsed.path().trim_start_matches('/');
                if uuid::Uuid::parse_str(asset_id).is_err() {
                    responder.respond(make_status_response(StatusCode::BAD_REQUEST));
                    return;
                }
                let db = app.state::<DatabaseConnection>();
                let state = app.state::<DownloadState>();
                let root = match reina_path::get_base_data_dir() {
                    Ok(root) => root.join("covers"),
                    Err(_) => {
                        responder.respond(make_status_response(StatusCode::INTERNAL_SERVER_ERROR));
                        return;
                    }
                };
                match resolve_cover(&db, &state, asset_id, &root).await {
                    Ok(path) => match tokio::fs::read(&path).await {
                        Ok(bytes) => responder.respond(make_image_response(
                            bytes,
                            content_type_for_file(&path),
                            "max-age=31536000, immutable",
                        )),
                        Err(e) => {
                            log::warn!("读取封面失败: {e}");
                            responder
                                .respond(make_status_response(StatusCode::INTERNAL_SERVER_ERROR));
                        }
                    },
                    Err(e) => {
                        log::warn!("加载封面失败 asset_id={asset_id}: {e}");
                        responder.respond(make_status_response(StatusCode::BAD_GATEWAY));
                    }
                }
            });
        })
}

pub async fn delete_game_cover_dir(game_id: i32) -> Result<(), String> {
    let path = reina_path::get_base_data_dir()?
        .join("covers")
        .join(format!("game_{game_id}"));
    match tokio::fs::remove_dir_all(path).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state() -> DownloadState {
        DownloadState {
            semaphore: Semaphore::new(2),
            locks: Mutex::new(HashMap::new()),
        }
    }
    async fn register_asset(db: &DatabaseConnection, source: &str, url: &str) -> String {
        let id = uuid::Uuid::now_v7().to_string();
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO cover_assets(id,game_id,kind,source,original_url) VALUES(?,1,'cloud',?,?)",
            [id.clone().into(), source.into(), url.into()],
        ))
        .await
        .unwrap();
        id
    }
    async fn test_server(
        failures: usize,
    ) -> (
        String,
        tokio::sync::oneshot::Receiver<()>,
        tokio::sync::oneshot::Sender<()>,
        tokio::task::JoinHandle<()>,
    ) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/cover.png", listener.local_addr().unwrap());
        let (arrived_tx, arrived_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            for _ in 0..failures {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = [0; 4096];
                assert!(socket.read(&mut request).await.unwrap() > 0);
                socket.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.unwrap();
            }
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 4096];
            assert!(socket.read(&mut request).await.unwrap() > 0);
            let _ = arrived_tx.send(());
            let _ = release_rx.await;
            let mut bytes = std::io::Cursor::new(Vec::new());
            image::DynamicImage::new_rgba8(1, 1)
                .write_to(&mut bytes, image::ImageFormat::Png)
                .unwrap();
            let bytes = bytes.into_inner();
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        bytes.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            socket.write_all(&bytes).await.unwrap();
        });
        (url, arrived_rx, release_tx, task)
    }
    #[tokio::test]
    async fn downloads_deduplicate_and_cached_sources_do_not_wait() {
        let (url, arrived, release, server) = test_server(0).await;
        let db = assets::tests::database().await;
        let state = test_state();
        let root = assets::tests::temporary_root();
        let bgm = register_asset(&db, "bgm", &url).await;
        let vndb = register_asset(&db, "vndb", &url).await;
        let cached = assets::asset_path(&root, "cloud", &vndb, "png").unwrap();
        assets::write_asset_file(&cached, &assets::tests::png())
            .await
            .unwrap();
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "UPDATE cover_assets SET extension='png' WHERE id=?",
            [vndb.clone().into()],
        ))
        .await
        .unwrap();
        let download = resolve_cover(&db, &state, &bgm, &root);
        let duplicate = resolve_cover(&db, &state, &bgm, &root);
        let check = async {
            arrived.await.unwrap();
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(2),
                resolve_cover(&db, &state, &vndb, &root),
            )
            .await;
            release.send(()).unwrap();
            assert_eq!(result.unwrap().unwrap(), cached);
        };
        let (first, second, _) = tokio::join!(download, duplicate, check);
        assert_eq!(first.as_ref().unwrap(), second.as_ref().unwrap());
        server.await.unwrap();
        assert_eq!(
            first.unwrap(),
            resolve_cover(&db, &state, &bgm, &root).await.unwrap()
        );
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn replaced_or_deleted_asset_cannot_be_restored_by_late_download() {
        for delete_game in [false, true] {
            let (url, arrived, release, server) = test_server(0).await;
            let db = assets::tests::database().await;
            let state = test_state();
            let root = assets::tests::temporary_root();
            let id = register_asset(&db, "bgm", &url).await;
            let download = resolve_cover(&db, &state, &id, &root);
            let change = async {
                arrived.await.unwrap();
                if delete_game {
                    db.execute_unprepared("DELETE FROM games WHERE id=1")
                        .await
                        .unwrap();
                } else {
                    db.execute_unprepared("DELETE FROM cover_assets")
                        .await
                        .unwrap();
                    register_asset(&db, "bgm", &url).await;
                }
                release.send(()).unwrap();
            };
            let (result, _) = tokio::join!(download, change);
            assert!(result.unwrap_err().contains("失效"));
            server.await.unwrap();
            assert!(
                !assets::asset_path(&root, "cloud", &id, "png")
                    .unwrap()
                    .exists()
            );
            assert!(!root.exists());
        }
    }

    #[tokio::test]
    async fn failed_download_keeps_pending_asset_for_retry() {
        let db = assets::tests::database().await;
        let root = assets::tests::temporary_root();
        let (url, arrived, release, server) = test_server(2).await;
        let id = register_asset(&db, "bgm", &url).await;
        assert!(resolve_cover(&db, &test_state(), &id, &root).await.is_err());
        assets::clean_unused_covers_at(&db, &root).await.unwrap();
        let state = test_state();
        let download = resolve_cover(&db, &state, &id, &root);
        let respond = async {
            arrived.await.unwrap();
            release.send(()).unwrap();
        };
        let (result, _) = tokio::join!(download, respond);
        assert!(result.unwrap().is_file());
        server.await.unwrap();
        tokio::fs::remove_dir_all(root).await.unwrap();
    }

    #[test]
    fn bangumi_cover_uses_proxy_before_original_url() {
        let original = "https://lain.bgm.tv/pic/cover/l/9b/e7/59392_05W7s.jpg";

        assert_eq!(
            build_cover_download_candidates_with_proxy(original, false),
            vec![
                CoverDownloadCandidate {
                    label: "Bangumi 代理",
                    url: format!("{BANGUMI_IMAGE_PROXY_PREFIX}{original}"),
                },
                CoverDownloadCandidate {
                    label: "原始地址",
                    url: original.to_string(),
                },
                CoverDownloadCandidate {
                    label: "Bangumi 代理",
                    url: format!("{BANGUMI_IMAGE_PROXY_PREFIX}{original}"),
                },
                CoverDownloadCandidate {
                    label: "原始地址",
                    url: original.to_string(),
                },
            ]
        );
    }

    #[test]
    fn vndb_cover_without_proxy_uses_original_before_proxy_url() {
        let original = "https://t.vndb.org/cv/12/79412.jpg";

        assert_eq!(
            build_cover_download_candidates_with_proxy(original, false),
            vec![
                CoverDownloadCandidate {
                    label: "原始地址",
                    url: original.to_string(),
                },
                CoverDownloadCandidate {
                    label: "VNDB 代理",
                    url: format!("{VNDB_IMAGE_PROXY_PREFIX}{original}"),
                },
                CoverDownloadCandidate {
                    label: "原始地址",
                    url: original.to_string(),
                },
                CoverDownloadCandidate {
                    label: "VNDB 代理",
                    url: format!("{VNDB_IMAGE_PROXY_PREFIX}{original}"),
                },
            ]
        );
    }

    #[test]
    fn vndb_cover_with_proxy_uses_proxy_before_original_url() {
        let original = "https://t.vndb.org/cv/12/79412.jpg";

        assert_eq!(
            build_cover_download_candidates_with_proxy(original, true),
            vec![
                CoverDownloadCandidate {
                    label: "VNDB 代理",
                    url: format!("{VNDB_IMAGE_PROXY_PREFIX}{original}"),
                },
                CoverDownloadCandidate {
                    label: "原始地址",
                    url: original.to_string(),
                },
                CoverDownloadCandidate {
                    label: "VNDB 代理",
                    url: format!("{VNDB_IMAGE_PROXY_PREFIX}{original}"),
                },
                CoverDownloadCandidate {
                    label: "原始地址",
                    url: original.to_string(),
                },
            ]
        );
    }

    #[test]
    fn unrelated_or_invalid_urls_only_use_original_url() {
        for original in [
            "https://example.com/cover.jpg",
            "ftp://lain.bgm.tv/pic/cover/l/cover.jpg",
            "not-a-url",
        ] {
            assert_eq!(
                build_cover_download_candidates_with_proxy(original, false),
                vec![
                    CoverDownloadCandidate {
                        label: "原始地址",
                        url: original.to_string(),
                    },
                    CoverDownloadCandidate {
                        label: "原始地址",
                        url: original.to_string(),
                    },
                ]
            );
        }
    }
}
