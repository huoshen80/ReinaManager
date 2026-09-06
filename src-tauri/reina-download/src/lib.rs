//! ReinaManager 安装流水线使用的分段续传 HTTP 下载核心。
//!
//! 一次 [`download`] 调用传输一个文件；多任务排队与并发数由调用方负责，
//! 跨任务的总连接数用 [`SharedBudget`] 约束。
//!
//! 约定：
//! - 文件按固定分片（默认 4 MiB）下载，片内记录连续已写字节数，
//!   中断只损失未落盘的页缓存；
//! - 进度存于旁路控制文件（`target` + [`CONTROL_SUFFIX`]），fdatasync 后
//!   原子写入，只会低估不会高估；目标文件存在且无控制文件即视为完成；
//! - 续传身份是 `expected_size` 加 `identity` 校验和，与 URL 无关，
//!   换签名直链可以续传；无校验和时以 ETag/Last-Modified 为准；
//! - 取消（暂停与取消对核心等价）先落盘再返回 [`Outcome::Cancelled`]，
//!   不算错误；服务器忽略 Range 时回退单流，中断后从头重来。
//!
//! 最终内容校验（sha256/blake3）由调用方负责，核心只保证字节落位。

mod control;
mod engine;
mod error;
mod fsx;
mod http;
mod limiter;
mod progress;
mod types;

pub use control::{CONTROL_SUFFIX, artifact_paths, control_path};
pub use engine::download;
pub use error::DownloadError;
pub use progress::{Phase, Progress};
// 重新导出，调用方无需直接依赖 tokio-util。
pub use tokio_util::sync::CancellationToken;
pub use types::{DEFAULT_PIECE_SIZE, DownloadOptions, DownloadRequest, Outcome, SharedBudget};
