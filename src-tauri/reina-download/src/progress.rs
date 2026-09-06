//! 进度上报：共享原子快照与阶段枚举。
//!
//! 独立任务按固定间隔采样并推送 [`Progress`]，UI 刷新与传输节奏解耦。

use std::sync::atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering};

/// 下载所处的阶段，供 UI 展示。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Phase {
    /// 正在发送初始 Range 探测。
    Probing = 0,
    /// 多连接分段下载中。
    Downloading = 1,
    /// 服务器不支持 Range，单流下载中。
    SingleStream = 2,
    /// 正在落盘收尾并移除控制文件。
    Finalizing = 3,
    /// 已成功完成。
    Done = 4,
    /// 因暂停或取消而停止。
    Cancelled = 5,
}

impl Phase {
    #[must_use]
    pub(crate) fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::Probing,
            1 => Self::Downloading,
            2 => Self::SingleStream,
            3 => Self::Finalizing,
            5 => Self::Cancelled,
            _ => Self::Done,
        }
    }
}

/// 通过进度通道推送的时点快照。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Progress {
    pub phase: Phase,
    /// 总大小；探测完成前为 0。
    pub total: u64,
    /// 已落盘且写入控制文件的字节数，崩溃后仍然有效。
    pub committed: u64,
    /// 已写入页缓存的字节数，单调递增，UI 进度条用它。
    pub written: u64,
    /// 平滑后的速度（字节/秒）。
    pub speed_bps: f64,
    /// 当前连接数目标。
    pub connections: usize,
    /// 累计重试次数。
    pub retries: u32,
}

impl Progress {
    /// 用于初始化调用方 watch 通道的初值。
    #[must_use]
    pub fn initial() -> Self {
        Self {
            phase: Phase::Probing,
            total: 0,
            committed: 0,
            written: 0,
            speed_bps: 0.0,
            connections: 0,
            retries: 0,
        }
    }
}

/// 由 worker 与提交器更新的原子后备存储。
#[derive(Debug)]
pub(crate) struct Shared {
    phase: AtomicU8Cell,
    total: AtomicU64,
    pub written: AtomicU64,
    pub committed: AtomicU64,
    pub connections: AtomicUsize,
    pub retries: AtomicU32,
}

impl Shared {
    pub(crate) fn new() -> Self {
        Self {
            phase: AtomicU8Cell::new(Phase::Probing as u8),
            total: AtomicU64::new(0),
            written: AtomicU64::new(0),
            committed: AtomicU64::new(0),
            connections: AtomicUsize::new(0),
            retries: AtomicU32::new(0),
        }
    }

    pub(crate) fn set_phase(&self, phase: Phase) {
        self.phase.0.store(phase as u8, Ordering::Relaxed);
    }

    pub(crate) fn set_total(&self, total: u64) {
        self.total.store(total, Ordering::Relaxed);
    }

    pub(crate) fn snapshot(&self, speed_bps: f64) -> Progress {
        Progress {
            phase: Phase::from_u8(self.phase.0.load(Ordering::Relaxed)),
            total: self.total.load(Ordering::Relaxed),
            committed: self.committed.load(Ordering::Relaxed),
            written: self.written.load(Ordering::Relaxed),
            speed_bps,
            connections: self.connections.load(Ordering::Relaxed),
            retries: self.retries.load(Ordering::Relaxed),
        }
    }
}

// 小包装类型，让字段读起来更清楚。
#[derive(Debug)]
struct AtomicU8Cell(std::sync::atomic::AtomicU8);

impl AtomicU8Cell {
    fn new(value: u8) -> Self {
        Self(std::sync::atomic::AtomicU8::new(value))
    }
}
