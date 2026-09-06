//! 记录分片进度的磁盘控制文件。
//!
//! 控制文件位于目标文件旁，原子写入（临时文件 + rename）。它的存在表示
//! 目标未完成；下载成功的最后一步就是删掉它。

use std::ffi::OsString;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::fsx::atomic_write;

/// 控制文件名后缀，拼接在目标路径之后。
pub const CONTROL_SUFFIX: &str = ".reina-dl";
pub(crate) const CONTROL_VERSION: u32 = 1;

/// 返回目标文件对应的控制文件路径。
#[must_use]
pub fn control_path(target: &Path) -> PathBuf {
    let mut value: OsString = target.as_os_str().to_owned();
    value.push(CONTROL_SUFFIX);
    PathBuf::from(value)
}

/// 返回下载器可能创建的所有路径（含目标本身），供调用方清理废弃下载。
#[must_use]
pub fn artifact_paths(target: &Path) -> Vec<PathBuf> {
    let control = control_path(target);
    let mut temp: OsString = control.as_os_str().to_owned();
    temp.push(".tmp");
    vec![target.to_path_buf(), control, PathBuf::from(temp)]
}

#[must_use]
pub(crate) fn piece_count(size: u64, piece_size: u64) -> u64 {
    if size == 0 {
        0
    } else {
        size.div_ceil(piece_size)
    }
}

#[must_use]
pub(crate) fn piece_len(size: u64, piece_size: u64, index: u64) -> u64 {
    let start = index * piece_size;
    (size - start).min(piece_size)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ControlFile {
    pub version: u32,
    pub size: u64,
    pub piece_size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    /// 每个分片从起点开始连续已写入的字节数。
    pub pieces: Vec<u64>,
}

impl ControlFile {
    pub(crate) fn new(
        size: u64,
        piece_size: u64,
        identity: Option<String>,
        etag: Option<String>,
        last_modified: Option<String>,
    ) -> Self {
        let count = piece_count(size, piece_size);
        Self {
            version: CONTROL_VERSION,
            size,
            piece_size,
            identity,
            etag,
            last_modified,
            pieces: vec![0; usize::try_from(count).unwrap_or(usize::MAX)],
        }
    }

    /// 加载控制文件。`Ok(None)` 表示不存在；文件损坏报 `InvalidData`，
    /// 调用方按重新开始处理。
    pub(crate) fn load(path: &Path) -> io::Result<Option<Self>> {
        let bytes = match std::fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let parsed: Self = serde_json::from_slice(&bytes)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
        parsed
            .validate()
            .map_err(|detail| io::Error::new(io::ErrorKind::InvalidData, detail))?;
        Ok(Some(parsed))
    }

    pub(crate) fn save(&self, path: &Path) -> io::Result<()> {
        let bytes =
            serde_json::to_vec(self).map_err(|error| io::Error::other(error.to_string()))?;
        atomic_write(path, &bytes)
    }

    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.version != CONTROL_VERSION {
            return Err(format!("unsupported control file version {}", self.version));
        }
        if self.piece_size == 0 {
            return Err("piece size must be positive".to_owned());
        }
        let expected = piece_count(self.size, self.piece_size);
        if u64::try_from(self.pieces.len()).ok() != Some(expected) {
            return Err(format!(
                "piece count mismatch: expected {expected}, found {}",
                self.pieces.len()
            ));
        }
        for (index, written) in self.pieces.iter().enumerate() {
            let len = piece_len(self.size, self.piece_size, index as u64);
            if *written > len {
                return Err(format!("piece {index} claims {written} bytes of {len}"));
            }
        }
        Ok(())
    }

    #[must_use]
    pub(crate) fn written_total(&self) -> u64 {
        self.pieces.iter().sum()
    }

    #[must_use]
    pub(crate) fn is_complete(&self) -> bool {
        self.pieces
            .iter()
            .enumerate()
            .all(|(index, written)| *written == piece_len(self.size, self.piece_size, index as u64))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn piece_geometry() {
        assert_eq!(piece_count(0, 4), 0);
        assert_eq!(piece_count(10, 4), 3);
        assert_eq!(piece_len(10, 4, 0), 4);
        assert_eq!(piece_len(10, 4, 2), 2);
        assert_eq!(piece_count(8, 4), 2);
        assert_eq!(piece_len(8, 4, 1), 4);
    }

    #[test]
    fn control_round_trip_and_validation() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("game.7z.reina-dl");
        let mut control = ControlFile::new(10, 4, Some("sha256:ab".into()), None, None);
        control.pieces[0] = 4;
        control.pieces[2] = 1;
        control.save(&path).unwrap();

        let loaded = ControlFile::load(&path).unwrap().unwrap();
        assert_eq!(loaded, control);
        assert_eq!(loaded.written_total(), 5);
        assert!(!loaded.is_complete());

        std::fs::write(
            &path,
            b"{\"version\":1,\"size\":10,\"piece_size\":4,\"pieces\":[9,0,0]}",
        )
        .unwrap();
        let error = ControlFile::load(&path).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);

        std::fs::write(&path, b"not json").unwrap();
        assert!(ControlFile::load(&path).is_err());
        assert!(
            ControlFile::load(&dir.path().join("missing"))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn artifact_paths_cover_control_and_temp() {
        let paths = artifact_paths(Path::new("/tmp/game.7z"));
        assert_eq!(paths[0], Path::new("/tmp/game.7z"));
        assert_eq!(paths[1], Path::new("/tmp/game.7z.reina-dl"));
        assert_eq!(paths[2], Path::new("/tmp/game.7z.reina-dl.tmp"));
    }
}
