use super::{
    persistence::{
        check_task_control, claim_game_import, complete_task_in_transaction, emit_progress,
        find_task, save_game_install_result, set_task_stage,
    },
    types::{
        GAME_INSTALL_TASK_TYPE, GameInstallCompletedEvent, GameInstallFailedEvent,
        GameInstallMetadataRequestedEvent, GameInstallResultV1, GameInstallTaskPayloadV1,
        TaskControl, TaskFailure,
    },
};
use crate::database::dto::{InsertGameData, UpdateGameData};
use crate::database::repository::games_repository::GamesRepository;
use crate::entity::{game_sources, games, tasks};
use crate::game::scan::scan_executable_candidates;
use crate::install::protocol::InstallRequest;
use crate::utils::fs::validate_executable_name;
use sea_orm::*;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::sync::watch;

fn resolve_installed_game_id_type(source_names: &[&str], fallback: &str) -> String {
    match source_names {
        [] => fallback.to_string(),
        [source] => (*source).to_string(),
        _ => "mixed".to_string(),
    }
}

pub(crate) async fn prepare_game_import(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task: &tasks::Model,
    request: &InstallRequest,
    mut result: GameInstallResultV1,
    control: &watch::Receiver<TaskControl>,
) -> Result<(), TaskFailure> {
    check_task_control(control)?;
    let install_path = PathBuf::from(&result.install_path);
    if !install_path.is_dir() {
        return Err(TaskFailure::new(
            "install_path_missing",
            "已整理的游戏目录不存在",
        ));
    }

    set_task_stage(db, task.id, "scanning").await?;
    emit_progress(
        app,
        task.id,
        "running",
        Some("scanning"),
        request.size as i64,
        Some(request.size as i64),
        Some("bytes"),
    );
    let candidates = tokio::task::spawn_blocking({
        let install_path = install_path.clone();
        move || scan_executable_candidates(&install_path)
    })
    .await
    .map_err(|error| TaskFailure::new("scan_task_failed", error.to_string()))?
    .map_err(|message| TaskFailure::new("scan_failed", message))?;
    let executable = (candidates.len() == 1).then(|| candidates[0].as_str());
    result = GameInstallResultV1::partial(&install_path, executable);
    save_game_install_result(db, task.id, &result).await?;

    check_task_control(control)?;
    set_task_stage(db, task.id, "matching_metadata").await?;
    emit_progress(
        app,
        task.id,
        "running",
        Some("matching_metadata"),
        request.size as i64,
        Some(request.size as i64),
        Some("bytes"),
    );
    let _ = app.emit(
        "game-install-metadata-requested",
        GameInstallMetadataRequestedEvent { task_id: task.id },
    );
    Ok(())
}

pub(crate) async fn import_installed_game(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task_id: i64,
    mut metadata: InsertGameData,
) -> Result<tasks::Model, TaskFailure> {
    let task = find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))?;
    if task.task_type != GAME_INSTALL_TASK_TYPE
        || task.status != "running"
        || task.stage.as_deref() != Some("matching_metadata")
    {
        return Err(TaskFailure::new(
            "invalid_task_state",
            "安装任务当前不等待元数据导入",
        ));
    }
    let request = parse_game_install_payload(&task)?.request;
    let partial = parse_game_install_result(&task)?.ok_or_else(|| {
        TaskFailure::new("install_result_missing", "安装任务缺少已整理的游戏目录")
    })?;
    let install_path = PathBuf::from(&partial.install_path);
    if !install_path.is_dir() {
        return Err(TaskFailure::new(
            "install_path_missing",
            "已整理的游戏目录不存在",
        ));
    }
    let executable_name = resolve_installed_executable_name(&install_path, &partial)?;
    let task = claim_game_import(db, task_id).await?;
    emit_progress(
        app,
        task_id,
        "running",
        Some("importing_game"),
        request.size as i64,
        Some(request.size as i64),
        Some("bytes"),
    );

    let transaction = db
        .begin()
        .await
        .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;
    let source_ids = [
        ("bgm", request.bgm_id.as_deref()),
        ("hikarinagi", request.hikarinagi_id.as_deref()),
    ];
    let mut matched_game = None;
    let mut matched_by = None;
    for (source, external_id) in source_ids {
        let Some(external_id) = external_id else {
            continue;
        };
        let source_matches = game_sources::Entity::find()
            .join(JoinType::InnerJoin, game_sources::Relation::Games.def())
            .filter(game_sources::Column::Source.eq(source))
            .filter(game_sources::Column::ExternalId.eq(external_id))
            .filter(games::Column::Localpath.is_null())
            .all(&transaction)
            .await
            .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;
        if source_matches.len() > 1 {
            return Err(TaskFailure::new(
                format!("duplicate_{source}_match"),
                format!("同一 {source} ID 命中了多个游戏，数据异常，已停止自动导入"),
            ));
        }
        if let Some(game) = source_matches.into_iter().next() {
            matched_by = Some(source.to_string());
            matched_game = Some(game);
            break;
        }
    }

    // games 表的时间字段目前是 i32 Unix 秒；迁移 schema 前保持与现有仓储接口一致。
    // TODO: 在 2038 年前将 games 时间字段及相关接口迁移为 i64。
    let now = chrono::Utc::now().timestamp() as i32;
    let (game_id, created_new_game, matched_by) = if let Some(source) = matched_game {
        let existing_sources = game_sources::Entity::find()
            .filter(game_sources::Column::GameId.eq(source.game_id))
            .all(&transaction)
            .await
            .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;
        let mut source_names = existing_sources
            .iter()
            .map(|existing| existing.source.as_str())
            .collect::<Vec<_>>();
        for incoming in &metadata.sources {
            if !source_names.contains(&incoming.source.as_str()) {
                source_names.push(incoming.source.as_str());
            }
        }
        // 只覆盖本次推送携带的来源，保留已有的其他来源；用户自定义覆盖也不清理。
        let updates = UpdateGameData {
            id_type: Some(resolve_installed_game_id_type(
                &source_names,
                &metadata.id_type,
            )),
            date: Some(metadata.date.clone()),
            localpath: Some(Some(partial.install_path.clone())),
            executable: Some(executable_name.clone()),
            upsert_sources: Some(metadata.sources.clone()),
            ..Default::default()
        }
        .cleaned();
        let game = GamesRepository::update_aggregate(&transaction, source.game_id, updates, now)
            .await
            .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;
        (game.id, false, matched_by)
    } else {
        metadata.localpath = Some(partial.install_path.clone());
        metadata.executable = executable_name.clone();
        let game = GamesRepository::insert_aggregate(&transaction, metadata.cleaned(), now)
            .await
            .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;
        (game.id, true, None)
    };

    let completed_result = GameInstallResultV1 {
        version: 1,
        game_id: Some(game_id),
        install_path: partial.install_path.clone(),
        executable: executable_name.clone(),
        created_new_game: Some(created_new_game),
        matched_by,
    };
    let completed = complete_task_in_transaction(&transaction, &task, &completed_result)
        .await
        .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;
    transaction
        .commit()
        .await
        .map_err(|error| TaskFailure::new("game_import_failed", error.to_string()))?;

    let _ = app.emit(
        "game-install-completed",
        GameInstallCompletedEvent {
            task_id,
            game_id,
            result_path: completed_result.install_path,
            executable_missing: completed_result.executable.is_none(),
            executable: completed_result.executable,
        },
    );
    Ok(completed)
}

pub(crate) fn parse_game_install_payload(
    task: &tasks::Model,
) -> Result<GameInstallTaskPayloadV1, TaskFailure> {
    let payload: GameInstallTaskPayloadV1 = serde_json::from_value(task.payload_json.clone())
        .map_err(|error| TaskFailure::new("invalid_payload", error.to_string()))?;
    match payload.request.v {
        1 => {
            payload.install_root()?;
            Ok(GameInstallTaskPayloadV1 {
                request: payload
                    .request
                    .validate()
                    .map_err(|message| TaskFailure::new("invalid_payload", message))?,
                install_root: payload.install_root,
            })
        }
        version => Err(TaskFailure::new(
            "unsupported_payload_version",
            format!("不支持的游戏安装载荷版本: {version}"),
        )),
    }
}

pub(crate) fn parse_game_install_result(
    task: &tasks::Model,
) -> Result<Option<GameInstallResultV1>, TaskFailure> {
    let Some(value) = task.result_json.clone() else {
        return Ok(None);
    };
    let result: GameInstallResultV1 = serde_json::from_value(value)
        .map_err(|error| TaskFailure::new("invalid_task_result", error.to_string()))?;
    if result.version != 1 {
        return Err(TaskFailure::new(
            "unsupported_result_version",
            format!("不支持的游戏安装结果版本: {}", result.version),
        ));
    }
    Ok(Some(result))
}

pub(crate) fn resolve_installed_executable_name(
    install_path: &Path,
    result: &GameInstallResultV1,
) -> Result<Option<String>, TaskFailure> {
    let Some(executable) = result.executable.as_deref() else {
        return Ok(None);
    };
    validate_executable_name(executable)
        .map_err(|message| TaskFailure::new("invalid_executable", message))?;
    if !install_path.join(executable).is_file() {
        return Ok(None);
    }
    Ok(Some(executable.to_string()))
}

pub(crate) fn game_install_dedupe_key(request: &InstallRequest) -> String {
    format!("game_install:{}:{}", request.provider, request.resource_id)
}

pub(crate) fn game_directory_name(
    game_root: &Path,
    staging: &Path,
    request: &InstallRequest,
    task_id: i64,
) -> String {
    if game_root != staging
        && let Some(name) = game_root.file_name().and_then(|name| name.to_str())
    {
        return name.to_string();
    }

    let suffix = format!(".{}", request.archive_format);
    let lower_name = request.file_name.to_ascii_lowercase();
    if lower_name.ends_with(&suffix) {
        let name = &request.file_name[..request.file_name.len() - suffix.len()];
        if !name.trim().is_empty() {
            return name.to_string();
        }
    }
    Path::new(&request.file_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("game-{task_id}"))
}

pub(crate) fn emit_game_install_failed(
    app: &tauri::AppHandle,
    task_id: i64,
    task: Option<&tasks::Model>,
    failure: &TaskFailure,
) {
    let game_id = task
        .and_then(|task| parse_game_install_result(task).ok().flatten())
        .and_then(|result| result.game_id);
    let _ = app.emit(
        "game-install-failed",
        GameInstallFailedEvent {
            task_id,
            game_id,
            error_code: failure.code.clone(),
            error_message: failure.message.clone(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::{
        GameInstallResultV1, resolve_installed_executable_name, resolve_installed_game_id_type,
    };
    use std::path::Path;

    #[test]
    fn rejects_nested_executable_path() {
        let result = GameInstallResultV1 {
            version: 1,
            game_id: None,
            install_path: "C:\\Games\\Reina".to_string(),
            executable: Some("bin/game.exe".to_string()),
            created_new_game: None,
            matched_by: None,
        };

        let error = resolve_installed_executable_name(Path::new("C:\\Games\\Reina"), &result)
            .expect_err("嵌套可执行文件路径应被拒绝");

        assert_eq!(error.code, "invalid_executable");
    }

    #[test]
    fn keeps_existing_source_type_when_fallback_has_no_sources() {
        assert_eq!(
            resolve_installed_game_id_type(&["hikarinagi"], "custom"),
            "hikarinagi"
        );
    }

    #[test]
    fn uses_custom_type_when_no_sources_exist() {
        assert_eq!(resolve_installed_game_id_type(&[], "custom"), "custom");
    }
}
