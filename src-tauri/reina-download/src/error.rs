use std::fmt;
use std::path::PathBuf;

/// [`crate::download`] 返回的错误。
///
/// 取消不是错误：被取消的下载在落盘后返回 [`crate::Outcome::Cancelled`]。
#[derive(Debug)]
pub enum DownloadError {
    /// 无法恢复的 HTTP 状态，或可重试状态耗尽了重试预算。
    Http { status: u16, retryable: bool },
    /// 服务器报告的大小与调用方期望不一致。
    SizeMismatch { expected: u64, actual: u64 },
    /// 远端内容发生变化，且没有校验和可以兜底。
    RemoteChanged(String),
    /// 响应违反 Range 协议（Content-Range 错误、长度不符、被压缩等）。
    Protocol(String),
    /// 传输层失败：连接、TLS、重置、停滞。
    Network(String),
    /// 写数据或控制文件时的本地磁盘错误。
    Disk(std::io::Error),
    /// 目标路径已有文件，但既不是完成的下载也没有控制文件描述它。
    TargetConflict(PathBuf),
    /// 连续可重试失败超出配置的预算。
    RetriesExhausted {
        attempts: u32,
        last: Box<DownloadError>,
    },
    /// 调用方传入的请求或配置无效。
    InvalidConfig(String),
}

impl DownloadError {
    /// 再试一次是否可能成功。
    #[must_use]
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Http { retryable, .. } => *retryable,
            Self::Protocol(_) | Self::Network(_) => true,
            Self::SizeMismatch { .. }
            | Self::RemoteChanged(_)
            | Self::Disk(_)
            | Self::TargetConflict(_)
            | Self::RetriesExhausted { .. }
            | Self::InvalidConfig(_) => false,
        }
    }

    /// 关联的 HTTP 状态码，会透过 [`Self::RetriesExhausted`] 查找。
    #[must_use]
    pub fn http_status(&self) -> Option<u16> {
        match self {
            Self::Http { status, .. } => Some(*status),
            Self::RetriesExhausted { last, .. } => last.http_status(),
            _ => None,
        }
    }

    /// 稳定的错误类别名，供日志与 UI 映射。
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Http { .. } => "http",
            Self::SizeMismatch { .. } => "size_mismatch",
            Self::RemoteChanged(_) => "remote_changed",
            Self::Protocol(_) => "protocol",
            Self::Network(_) => "network",
            Self::Disk(_) => "disk",
            Self::TargetConflict(_) => "target_conflict",
            Self::RetriesExhausted { .. } => "retries_exhausted",
            Self::InvalidConfig(_) => "invalid_config",
        }
    }
}

impl fmt::Display for DownloadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Http { status, retryable } => {
                if *retryable {
                    write!(f, "retryable HTTP status {status}")
                } else {
                    write!(f, "HTTP status {status}")
                }
            }
            Self::SizeMismatch { expected, actual } => {
                write!(
                    f,
                    "size mismatch: expected {expected} bytes, server reports {actual}"
                )
            }
            Self::RemoteChanged(detail) => write!(f, "remote resource changed: {detail}"),
            Self::Protocol(detail) => write!(f, "HTTP protocol violation: {detail}"),
            Self::Network(detail) => write!(f, "network error: {detail}"),
            Self::Disk(error) => write!(f, "disk error: {error}"),
            Self::TargetConflict(path) => {
                write!(
                    f,
                    "target already exists without a control file: {}",
                    path.display()
                )
            }
            Self::RetriesExhausted { attempts, last } => {
                write!(
                    f,
                    "gave up after {attempts} consecutive failures; last error: {last}"
                )
            }
            Self::InvalidConfig(detail) => write!(f, "invalid configuration: {detail}"),
        }
    }
}

impl std::error::Error for DownloadError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Disk(error) => Some(error),
            Self::RetriesExhausted { last, .. } => Some(last.as_ref()),
            _ => None,
        }
    }
}

impl From<std::io::Error> for DownloadError {
    fn from(error: std::io::Error) -> Self {
        Self::Disk(error)
    }
}

pub(crate) fn map_reqwest(error: &reqwest::Error) -> DownloadError {
    if error.is_timeout() {
        return DownloadError::Network(format!("request timed out: {error}"));
    }
    if error.is_connect() {
        return DownloadError::Network(format!("connection failed: {error}"));
    }
    if error.is_redirect() {
        return DownloadError::Protocol(format!("redirect policy violated: {error}"));
    }
    if error.is_body() || error.is_decode() {
        return DownloadError::Network(format!("body transfer failed: {error}"));
    }
    if error.is_builder() || error.is_request() {
        return DownloadError::InvalidConfig(error.to_string());
    }
    DownloadError::Network(error.to_string())
}
