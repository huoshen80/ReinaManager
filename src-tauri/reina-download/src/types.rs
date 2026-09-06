use std::ops::RangeInclusive;
use std::path::PathBuf;
use std::time::Duration;

use crate::error::DownloadError;
use crate::limiter::Gate;

/// 默认分片大小：足够小让中断损失以秒计，又不会让大文件产生过多请求。
pub const DEFAULT_PIECE_SIZE: u64 = 4 * 1024 * 1024;

/// 下载请求：下什么、写到哪。
#[derive(Debug, Clone)]
pub struct DownloadRequest {
    /// 下载地址。续传身份与 URL 无关，重试时可以换新直链。
    pub url: String,
    /// 目标路径；控制文件为 `target` + [`crate::CONTROL_SUFFIX`]。
    pub target: PathBuf,
    /// 调用方期望的文件大小，服务器报告的大小必须与之一致。
    pub expected_size: u64,
    /// 内容标识（如 `"sha256:…"`）。提供时 ETag/Last-Modified 漂移不中断
    /// 续传，最终哈希校验由调用方兜底。
    pub identity: Option<String>,
}

/// 跨下载共享的连接总数上限，避免多任务并行时打爆同一 CDN。
#[derive(Debug, Clone)]
pub struct SharedBudget(pub(crate) Gate);

impl SharedBudget {
    /// 创建总共允许 `max` 条并发连接的预算。
    #[must_use]
    pub fn new(max: usize) -> Self {
        Self(Gate::new(max))
    }
}

/// 单个下载的可调参数；[`Default`] 即设计方案中的默认值。
#[derive(Debug, Clone)]
pub struct DownloadOptions {
    pub piece_size: u64,
    pub min_connections: usize,
    pub initial_connections: usize,
    pub max_connections: usize,
    /// 单连接超过该时长没有收到字节即断开重试。
    pub stall_timeout: Duration,
    /// 落盘进度写入控制文件的间隔。
    pub commit_interval: Duration,
    /// 进度快照推送到 watch 通道的间隔。
    pub progress_interval: Duration,
    /// 连续成功该数量的分片后连接目标加一。
    pub grow_after_successes: u32,
    /// 连续可重试失败超过该数量则整体失败。
    pub max_consecutive_failures: u32,
    /// 探测拿到 200 后进入单流前的复测等待；部分源站只在首个请求上
    /// 忽略 Range，稍等复测即可直接走分段模式。
    pub range_confirm_delay: Duration,
    /// 单流模式下重新探测 Range 支持的间隔，一旦拿到 206 即升级为分段下载。
    pub upgrade_probe_interval: Duration,
    /// 可选的跨下载连接预算。
    pub budget: Option<SharedBudget>,
}

impl Default for DownloadOptions {
    fn default() -> Self {
        Self {
            piece_size: DEFAULT_PIECE_SIZE,
            min_connections: 1,
            initial_connections: 4,
            max_connections: 8,
            stall_timeout: Duration::from_secs(20),
            commit_interval: Duration::from_secs(2),
            progress_interval: Duration::from_millis(250),
            grow_after_successes: 8,
            max_consecutive_failures: 20,
            range_confirm_delay: Duration::from_millis(1500),
            upgrade_probe_interval: Duration::from_secs(10),
            budget: None,
        }
    }
}

impl DownloadOptions {
    #[must_use]
    pub fn connections(&self) -> RangeInclusive<usize> {
        self.min_connections..=self.max_connections
    }

    pub(crate) fn validate(&self) -> Result<(), DownloadError> {
        if self.piece_size == 0 {
            return Err(DownloadError::InvalidConfig(
                "piece_size must be positive".into(),
            ));
        }
        if self.min_connections == 0 {
            return Err(DownloadError::InvalidConfig(
                "min_connections must be >= 1".into(),
            ));
        }
        if self.max_connections < self.min_connections {
            return Err(DownloadError::InvalidConfig(
                "max_connections must be >= min_connections".into(),
            ));
        }
        Ok(())
    }

    pub(crate) fn clamped_initial(&self) -> usize {
        self.initial_connections
            .clamp(self.min_connections, self.max_connections)
    }
}

/// 下载的结束方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// 目标文件完整，控制文件已移除。
    Completed,
    /// 收到取消信号；进度已持久化，可稍后续传。
    Cancelled,
}
