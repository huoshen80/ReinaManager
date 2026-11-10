use arboard::Clipboard;
use image::{ColorType, ImageFormat};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;

fn map_clipboard_error(error: arboard::Error) -> String {
    let message = error.to_string();
    let lower_message = message.to_lowercase();
    if lower_message.contains("not available")
        || lower_message.contains("unavailable")
        || lower_message.contains("requested format")
    {
        "CLIPBOARD_IMAGE_NOT_FOUND".to_string()
    } else {
        format!("CLIPBOARD_IMAGE_READ_FAILED: {}", message)
    }
}

/// 从剪贴板读取图片并写入临时 PNG 文件。
///
/// 该文件只用于前端保存前预览，由资料保存工作流复制到正式封面目录。
#[command]
pub async fn import_clipboard_image_to_temp(game_id: u32) -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(map_clipboard_error)?;
    let clipboard_image = clipboard.get_image().map_err(map_clipboard_error)?;
    let width = u32::try_from(clipboard_image.width)
        .map_err(|_| "CLIPBOARD_IMAGE_READ_FAILED: 图片宽度超出支持范围".to_string())?;
    let height = u32::try_from(clipboard_image.height)
        .map_err(|_| "CLIPBOARD_IMAGE_READ_FAILED: 图片高度超出支持范围".to_string())?;

    let temp_dir = std::env::temp_dir()
        .join("ReinaManager")
        .join("clipboard-cover");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建剪贴板图片临时目录失败: {}", e))?;

    let timestamp_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("获取系统时间失败: {}", e))?
        .as_nanos();
    let target_path = temp_dir.join(format!(
        "clipboard_cover_{}_{}.png",
        game_id, timestamp_nanos
    ));

    image::save_buffer_with_format(
        &target_path,
        clipboard_image.bytes.as_ref(),
        width,
        height,
        ColorType::Rgba8,
        ImageFormat::Png,
    )
    .map_err(|e| format!("CLIPBOARD_IMAGE_WRITE_FAILED: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

pub async fn custom_cover_extension(path: &std::path::Path) -> Result<String, String> {
    use tokio::io::AsyncReadExt;
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|e| e.to_string())?;
    if !file.metadata().await.map_err(|e| e.to_string())?.is_file() {
        return Err("封面不是普通文件".into());
    }
    let mut header = Vec::new();
    file.take(32)
        .read_to_end(&mut header)
        .await
        .map_err(|e| e.to_string())?;
    super::assets::image_extension(&header).map(str::to_string)
}

pub async fn save_custom_cover(
    root: &std::path::Path,
    id: &str,
    source: &std::path::Path,
) -> Result<String, String> {
    let mut extension = custom_cover_extension(source).await?;
    let path = source.to_path_buf();
    let compressed = tokio::task::spawn_blocking(move || compress_custom_cover(&path))
        .await
        .unwrap_or_else(|e| {
            log::warn!("封面压缩未完成，保留原图: {e}");
            None
        });
    if compressed.is_some() {
        extension = "webp".into();
    } else {
        log::info!("自定义封面未采用优化结果，保留原图: {}", source.display());
    }
    let target = super::assets::asset_path(root, "custom", id, &extension)?;
    match tokio::fs::metadata(&target).await {
        // 迁移重试保留已落盘的同 UUID 图片，不能用稍后恢复的旧备份覆盖。
        Ok(meta) if meta.is_file() => {
            custom_cover_extension(&target).await?;
        }
        Ok(_) => return Err(format!("封面目标不是文件: {}", target.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if let Some(bytes) = compressed {
                super::assets::write_asset_file(&target, &bytes).await?;
            } else {
                let file = tokio::fs::File::open(source)
                    .await
                    .map_err(|e| e.to_string())?;
                super::assets::write_asset_stream(&target, file).await?;
            }
        }
        Err(e) => return Err(e.to_string()),
    }
    Ok(extension)
}

fn compress_custom_cover(path: &std::path::Path) -> Option<Vec<u8>> {
    use image::{DynamicImage, ImageDecoder, ImageReader, Limits};
    use std::io::BufReader;
    let file = fs::File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    // 超出解码预算只跳过优化，仍允许流式保存原图。
    if size > 64 * 1024 * 1024 {
        return None;
    }
    let mut reader = ImageReader::new(BufReader::new(file))
        .with_guessed_format()
        .ok()?;
    let format = reader.format()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits.clone());
    let mut decoder: Box<dyn ImageDecoder> = match format {
        ImageFormat::Png => {
            let decoder =
                image::codecs::png::PngDecoder::with_limits(reader.into_inner(), limits.clone())
                    .ok()?;
            if decoder.is_apng().ok()? || decoder.gamma_value().ok()?.is_some() {
                return None;
            }
            Box::new(decoder)
        }
        ImageFormat::WebP => {
            let decoder = image::codecs::webp::WebPDecoder::new(reader.into_inner()).ok()?;
            if decoder.has_animation() {
                return None;
            }
            Box::new(decoder)
        }
        ImageFormat::Jpeg | ImageFormat::Bmp => Box::new(reader.into_decoder().ok()?),
        // GIF、AVIF 和多图标 ICO 原样保留，避免静态解码丢失动画或其他图像。
        _ => return None,
    };
    decoder.set_limits(limits).ok()?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > 32 * 1024 * 1024 {
        return None;
    }
    let needs_resize = width > 1600 || height > 1600;
    if !needs_resize && size < 1024 {
        return None;
    }
    // 转换只接受八位颜色；保留带方向、色彩或其他元数据的原图。
    if !matches!(
        decoder.color_type(),
        ColorType::Rgb8 | ColorType::Rgba8 | ColorType::L8 | ColorType::La8
    ) || decoder.icc_profile().ok()?.is_some()
        || decoder.exif_metadata().ok()?.is_some()
        || decoder.xmp_metadata().ok()?.is_some()
    {
        return None;
    }
    let mut image = DynamicImage::from_decoder(decoder)
        .inspect_err(|error| log::warn!("封面解码失败，保留原图 {}: {error}", path.display()))
        .ok()?
        .into_rgba8();
    if needs_resize {
        let transparent = image.pixels().any(|pixel| pixel[3] != 255);
        // 先预乘透明度再缩放，避免透明区域隐藏的颜色污染边缘。
        if transparent {
            for pixel in image.pixels_mut() {
                let alpha = u32::from(pixel[3]);
                for channel in &mut pixel.0[..3] {
                    *channel = ((u32::from(*channel) * alpha + 127) / 255) as u8;
                }
            }
        }
        image = DynamicImage::ImageRgba8(image)
            .resize(1600, 1600, image::imageops::FilterType::Lanczos3)
            .into_rgba8();
        if transparent {
            for pixel in image.pixels_mut() {
                let alpha = u32::from(pixel[3]);
                for channel in &mut pixel.0[..3] {
                    *channel = (u32::from(*channel) * 255 + alpha / 2)
                        .checked_div(alpha)
                        .unwrap_or(0)
                        .min(255) as u8;
                }
            }
        }
    }
    let mut config = webp::WebPConfig::new().ok()?;
    config.quality = 85.0;
    config.method = 4;
    config.alpha_quality = 100;
    config.use_sharp_yuv = 1;
    let bytes = webp::Encoder::from_rgba(&image, image.width(), image.height())
        .encode_advanced(&config)
        .inspect_err(|error| log::warn!("封面编码失败，保留原图 {}: {error:?}", path.display()))
        .ok()?;
    // 限制解码尺寸优先于文件大小；尺寸合适时不做体积反增的有损转换。
    (needs_resize || (bytes.len() as u64) < size).then(|| bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::cover::assets::{
        asset_path,
        tests::{png, temporary_root},
    };
    use image::{DynamicImage, Rgba, RgbaImage};
    use std::io::Write;

    #[tokio::test]
    async fn compresses_static_covers_without_upscaling_or_losing_transparency() {
        let root = temporary_root();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("selected.png");
        let pixels =
            RgbaImage::from_fn(128, 128, |x, y| Rgba([x as u8, y as u8, 50, (x + y) as u8]));
        DynamicImage::ImageRgba8(pixels.clone())
            .save(&source)
            .unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(&source)
            .unwrap()
            .write_all(&[0; 4096])
            .unwrap();
        let id = uuid::Uuid::now_v7().to_string();
        let ext = save_custom_cover(&root, &id, &source).await.unwrap();
        assert_eq!(ext, "webp");
        let target = asset_path(&root, "custom", &id, &ext).unwrap();
        assert!(fs::metadata(&target).unwrap().len() < fs::metadata(&source).unwrap().len());
        let decoded = image::open(target).unwrap().into_rgba8();
        assert_eq!(decoded.dimensions(), pixels.dimensions());
        assert!(
            decoded
                .pixels()
                .zip(pixels.pixels())
                .all(|(a, b)| a[3] == b[3])
        );
        let error: u64 = decoded
            .pixels()
            .zip(pixels.pixels())
            .filter(|(_, original)| original[3] > 0)
            .map(|(a, b)| (0..3).map(|c| u64::from(a[c].abs_diff(b[c]))).sum::<u64>())
            .sum();
        assert!(error < u64::from(pixels.width() * pixels.height()) * 3 * 8);
        assert!(source.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn preserves_animation_bytes_including_timing_and_loop_count() {
        use base64::Engine;
        let root = temporary_root();
        fs::create_dir_all(&root).unwrap();
        // 两帧、不同延时、循环三次的 GIF、APNG 和动画 WebP。
        for (ext, encoded) in ["gif", "png", "webp"].into_iter().zip([
            "R0lGODlhCAAIAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEDAAAh+QQACQAAACwAAAAACAAIAAAIDwABCBxIsKDBgwgTKkwYEAAh+QQBEQABACwAAAAACAAIAIEA/wAAAAAAAAAAAAAIDwABCBxIsKDBgwgTKkwYEAA7",
"iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACGFjVEwAAAACAAAAA2qEwsoAAAAaZmNUTAAAAAAAAAAIAAAACAAAAAAAAAAAAAkAZAAAgHcXiQAAABVJREFUeJxj/M/A0MCABzDhkxw+CgCRUAGPKjeCoQAAABpmY1RMAAAAAQAAAAgAAAAIAAAAAAAAAAAAEQBkAABLlCEeAAAAGmZkQVQAAAACeJxjZPjP8J8BD2DCJzl8FAAAEVwCDn0uSQEAAAAASUVORK5CYII=",
"UklGRoQAAABXRUJQVlA4WAoAAAASAAAABwAABwAAQU5JTQYAAAAAAAAAAwBBTk1GKAAAAAAAAAAAAAcAAAcAAFoAAAJWUDhMDwAAAC8HwAEQBxD9jwIGIqL/AQBBTk1GKAAAAAAAAAAAAAcAAAcAAKoAAABWUDhMDwAAAC8HwAEAB9D/iP4HIqL/AQA="
        ]) {
            let mut bytes = base64::engine::general_purpose::STANDARD.decode(encoded).unwrap();
            bytes.resize(bytes.len().max(2048), 0);
            let source = root.join(format!("animated.{ext}"));
            fs::write(&source, &bytes).unwrap();
            assert!(compress_custom_cover(&source).is_none());
            let id = uuid::Uuid::now_v7().to_string();
            assert_eq!(save_custom_cover(&root, &id, &source).await.unwrap(), ext);
            assert_eq!(fs::read(asset_path(&root, "custom", &id, ext).unwrap()).unwrap(), bytes);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn streams_large_files_and_preserves_over_budget_or_failed_decodes() {
        let root = temporary_root();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("large.png");
        fs::write(&source, png()).unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&source)
            .unwrap()
            .set_len(65 * 1024 * 1024)
            .unwrap();
        assert!(compress_custom_cover(&source).is_none());
        let id = uuid::Uuid::now_v7().to_string();
        assert_eq!(save_custom_cover(&root, &id, &source).await.unwrap(), "png");
        let target = asset_path(&root, "custom", &id, "png").unwrap();
        assert_eq!(fs::metadata(target).unwrap().len(), 65 * 1024 * 1024);
        DynamicImage::new_rgb8(8193, 1)
            .save_with_format(&source, ImageFormat::Bmp)
            .unwrap();
        assert!(compress_custom_cover(&source).is_none());
        let original = fs::read(&source).unwrap();
        let id = uuid::Uuid::now_v7().to_string();
        assert_eq!(save_custom_cover(&root, &id, &source).await.unwrap(), "bmp");
        assert_eq!(
            fs::read(asset_path(&root, "custom", &id, "bmp").unwrap()).unwrap(),
            original
        );
        // 可识别但解码失败的旧文件也应保留，不让可选压缩阻塞迁移。
        let mut broken = png()[..32].to_vec();
        broken.resize(2048, 0);
        fs::write(&source, &broken).unwrap();
        let id = uuid::Uuid::now_v7().to_string();
        assert_eq!(save_custom_cover(&root, &id, &source).await.unwrap(), "png");
        assert_eq!(
            fs::read(asset_path(&root, "custom", &id, "png").unwrap()).unwrap(),
            broken
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn retains_original_when_lossy_output_is_larger() {
        let root = temporary_root();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("noise.jpg");
        let mut seed = 1_u32;
        let pixels = image::RgbImage::from_fn(128, 128, |_, _| {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            image::Rgb([(seed >> 24) as u8, (seed >> 16) as u8, (seed >> 8) as u8])
        });
        image::codecs::jpeg::JpegEncoder::new_with_quality(fs::File::create(&source).unwrap(), 10)
            .encode_image(&pixels)
            .unwrap();
        assert!(fs::metadata(&source).unwrap().len() > 1024);
        assert!(compress_custom_cover(&source).is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resizes_portrait_and_landscape_covers_without_cropping() {
        let root = temporary_root();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("large.png");
        for (width, height, expected) in [
            (3200, 1600, (1600, 800)),
            (1600, 3200, (800, 1600)),
            (1, 2000, (1, 1600)),
        ] {
            DynamicImage::ImageRgba8(RgbaImage::from_pixel(
                width,
                height,
                Rgba([40, 80, 120, 128]),
            ))
            .save(&source)
            .unwrap();
            let bytes = compress_custom_cover(&source).unwrap();
            let decoded = image::load_from_memory(&bytes).unwrap().into_rgba8();
            assert_eq!(decoded.dimensions(), expected);
            assert!(decoded.pixels().all(|pixel| pixel[3] == 128));
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resizing_does_not_bleed_hidden_colors_into_visible_edges() {
        let root = temporary_root();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("transparent.png");
        DynamicImage::ImageRgba8(RgbaImage::from_fn(3200, 2, |x, _| {
            if x < 1600 {
                Rgba([255, 0, 0, 255])
            } else {
                Rgba([0, 0, 255, 0])
            }
        }))
        .save(&source)
        .unwrap();
        let decoded = image::load_from_memory(&compress_custom_cover(&source).unwrap())
            .unwrap()
            .into_rgba8();
        assert_eq!(decoded.dimensions(), (1600, 1));
        assert!(
            decoded
                .pixels()
                .filter(|p| p[3] >= 128)
                .all(|p| p[0] > 230 && p[2] < 20)
        );
        fs::remove_dir_all(root).unwrap();
    }
}
