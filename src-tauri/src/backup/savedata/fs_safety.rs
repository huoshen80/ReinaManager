use std::fs;
#[cfg(windows)]
use std::os::windows::fs::MetadataExt;
use std::path::Path;

pub(super) fn reject_path_redirector(metadata: &fs::Metadata, path: &Path) -> Result<(), String> {
    if metadata.file_type().is_symlink() {
        return Err(format!("路径不能是符号链接: {}", path.display()));
    }
    #[cfg(windows)]
    if metadata.file_attributes() & 0x400 != 0 && has_name_surrogate_reparse_tag(path)? {
        return Err(format!(
            "路径不能是 junction 或其他重定向型 reparse 对象: {}",
            path.display()
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn has_name_surrogate_reparse_tag(path: &Path) -> Result<bool, String> {
    use std::mem::size_of;
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        FILE_ATTRIBUTE_TAG_INFO, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FileAttributeTagInfo,
        GetFileInformationByHandleEx,
    };

    let file = fs::OpenOptions::new()
        .access_mode(0)
        .share_mode((FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE).0)
        .custom_flags((FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS).0)
        .open(path)
        .map_err(|error| format!("打开 reparse 对象失败 {}: {error}", path.display()))?;
    let mut info = FILE_ATTRIBUTE_TAG_INFO::default();
    // SAFETY: 句柄由仍存活的 File 持有，输出指针和长度对应 FILE_ATTRIBUTE_TAG_INFO。
    unsafe {
        GetFileInformationByHandleEx(
            HANDLE(file.as_raw_handle()),
            FileAttributeTagInfo,
            (&raw mut info).cast(),
            size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32,
        )
    }
    .map_err(|error| format!("读取 reparse tag 失败 {}: {error}", path.display()))?;

    Ok(is_name_surrogate_reparse_tag(info.ReparseTag))
}

#[cfg(windows)]
fn is_name_surrogate_reparse_tag(tag: u32) -> bool {
    // Windows 的 name-surrogate 位表示该对象会把路径解析重定向到其他位置。
    const NAME_SURROGATE_BIT: u32 = 0x2000_0000;
    tag & NAME_SURROGATE_BIT != 0
}

#[cfg(all(test, windows))]
mod tests {
    use super::is_name_surrogate_reparse_tag;

    #[test]
    fn distinguishes_path_redirectors_from_cloud_and_wof_tags() {
        assert!(is_name_surrogate_reparse_tag(0xA000_0003));
        assert!(is_name_surrogate_reparse_tag(0xA000_000C));
        assert!(!is_name_surrogate_reparse_tag(0x9000_001A));
        assert!(!is_name_surrogate_reparse_tag(0x8000_0017));
    }
}
