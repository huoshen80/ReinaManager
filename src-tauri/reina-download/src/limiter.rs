//! 并发控制。
//!
//! [`Gate`] 是上限可调的计数限流器，用于跨下载连接预算；[`Adaptive`]
//! 维护单个下载的连接目标：限流时减半，连续成功后回升。

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

/// 上限可调的异步计数信号量。
#[derive(Debug, Clone)]
pub(crate) struct Gate {
    inner: Arc<GateInner>,
}

#[derive(Debug)]
struct GateInner {
    state: Mutex<GateState>,
    notify: Notify,
}

#[derive(Debug)]
struct GateState {
    max: usize,
    in_flight: usize,
}

/// drop 时释放一个槽位。
#[derive(Debug)]
pub(crate) struct GatePermit {
    inner: Arc<GateInner>,
}

impl Gate {
    pub(crate) fn new(max: usize) -> Self {
        Self {
            inner: Arc::new(GateInner {
                state: Mutex::new(GateState {
                    max: max.max(1),
                    in_flight: 0,
                }),
                notify: Notify::new(),
            }),
        }
    }

    /// 等待空闲槽位；`cancel` 先触发则返回 `None`。
    pub(crate) async fn acquire(&self, cancel: &CancellationToken) -> Option<GatePermit> {
        loop {
            let notified = {
                let mut state = self.lock();
                if state.in_flight < state.max {
                    state.in_flight += 1;
                    return Some(GatePermit {
                        inner: Arc::clone(&self.inner),
                    });
                }
                self.inner.notify.notified()
            };
            tokio::select! {
                biased;
                () = cancel.cancelled() => return None,
                () = notified => {}
            }
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, GateState> {
        self.inner
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

impl Drop for GatePermit {
    fn drop(&mut self) {
        {
            let mut state = self
                .inner
                .state
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            state.in_flight = state.in_flight.saturating_sub(1);
        }
        self.inner.notify.notify_one();
    }
}

/// 单个下载的自适应连接目标。
#[derive(Debug)]
pub(crate) struct Adaptive {
    min: usize,
    max: usize,
    target: AtomicUsize,
    grow_after: u32,
    successes: AtomicUsize,
    timing: Mutex<Timing>,
}

#[derive(Debug)]
struct Timing {
    last_change: Option<Instant>,
    not_before: Instant,
}

impl Adaptive {
    pub(crate) fn new(min: usize, initial: usize, max: usize, grow_after: u32) -> Self {
        Self {
            min: min.max(1),
            max: max.max(min.max(1)),
            target: AtomicUsize::new(initial.clamp(min.max(1), max.max(min.max(1)))),
            grow_after,
            successes: AtomicUsize::new(0),
            timing: Mutex::new(Timing {
                last_change: None,
                not_before: Instant::now(),
            }),
        }
    }

    pub(crate) fn current(&self) -> usize {
        self.target.load(Ordering::Relaxed)
    }

    /// 距下一次允许请求的等待时长（来自 Retry-After 的全局暂停）。
    pub(crate) fn remaining_pause(&self) -> Duration {
        let timing = self.lock();
        timing.not_before.saturating_duration_since(Instant::now())
    }

    /// 记录一次限流：目标减半（同一窗口只减一次），全局暂停延长 `delay`。
    pub(crate) fn on_rate_limited(&self, attempt_started: Instant, delay: Duration) {
        let now = Instant::now();
        let mut timing = self.lock();
        timing.not_before = timing.not_before.max(now + delay);
        self.decrease(attempt_started, now, &mut timing);
        self.successes.store(0, Ordering::Relaxed);
    }

    pub(crate) fn on_success(&self) {
        let streak = self.successes.fetch_add(1, Ordering::Relaxed) + 1;
        if streak >= self.grow_after as usize {
            self.successes.store(0, Ordering::Relaxed);
            let current = self.current();
            if current < self.max {
                self.target.store(current + 1, Ordering::Relaxed);
            }
        }
    }

    fn decrease(&self, attempt_started: Instant, now: Instant, timing: &mut Timing) {
        // 同一窗口只减一次，同批连接的连锁失败不会把目标直接打到底。
        if timing
            .last_change
            .is_some_and(|last| attempt_started <= last)
        {
            return;
        }
        let current = self.current();
        if current <= self.min {
            return;
        }
        let next = current.div_ceil(2).max(self.min);
        self.target.store(next, Ordering::Relaxed);
        timing.last_change = Some(now);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Timing> {
        self.timing
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn gate_caps_in_flight() {
        let gate = Gate::new(2);
        let cancel = CancellationToken::new();
        let a = gate.acquire(&cancel).await.unwrap();
        let b = gate.acquire(&cancel).await.unwrap();
        let cancel2 = cancel.clone();
        let pending = tokio::spawn({
            let gate = gate.clone();
            async move { gate.acquire(&cancel2).await.is_some() }
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(!pending.is_finished());
        drop(a);
        assert!(pending.await.unwrap());
        drop(b);
    }

    #[test]
    fn adaptive_halves_then_grows() {
        let adaptive = Adaptive::new(1, 8, 8, 2);
        let start = Instant::now();
        adaptive.on_rate_limited(start, Duration::from_millis(0));
        assert_eq!(adaptive.current(), 4);
        // 同一窗口内更早发起的尝试再次失败，不重复减半。
        adaptive.on_rate_limited(start, Duration::from_millis(0));
        assert_eq!(adaptive.current(), 4);
        adaptive.on_success();
        adaptive.on_success();
        assert_eq!(adaptive.current(), 5);
    }

    #[test]
    fn adaptive_respects_floor() {
        let adaptive = Adaptive::new(2, 2, 8, 4);
        adaptive.on_rate_limited(Instant::now(), Duration::from_millis(0));
        assert_eq!(adaptive.current(), 2);
    }
}
