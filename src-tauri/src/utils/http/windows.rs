use super::client::refresh_system_proxy_clients;
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use windows::Win32::Foundation::{HANDLE, WAIT_FAILED, WAIT_OBJECT_0};
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, RegNotifyChangeKeyValue,
    RegOpenKeyExW,
};
use windows::Win32::System::Threading::{
    CREATE_EVENT, CREATE_EVENT_MANUAL_RESET, CreateEventExW, EVENT_ALL_ACCESS, INFINITE, SetEvent,
    WaitForMultipleObjects,
};
use windows::core::{Error as WindowsError, Owned, PCWSTR, w};

const INTERNET_SETTINGS_KEY: PCWSTR =
    w!("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings");

/// Windows 系统代理监听器。
///
/// 停止事件由该对象唯一持有；监听线程只借用其进程级句柄值。退出时先通知并
/// 等待线程结束，再关闭句柄，保证监听期间句柄始终有效。
pub struct SystemProxyMonitor {
    stop_event: usize,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl SystemProxyMonitor {
    pub fn shutdown(&self) {
        let stop_event = HANDLE(self.stop_event as *mut _);
        // SAFETY: stop_event 在监控对象存活期间保持有效，且 SetEvent 支持跨线程调用。
        if let Err(error) = unsafe { SetEvent(stop_event) } {
            log::warn!("停止系统代理监听失败: {error}");
        }

        let worker = self
            .worker
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take();
        if let Some(worker) = worker
            && worker.join().is_err()
        {
            log::warn!("系统代理监听线程异常退出");
        }
    }
}

impl Drop for SystemProxyMonitor {
    fn drop(&mut self) {
        self.shutdown();

        let stop_event = HANDLE(self.stop_event as *mut _);
        // SAFETY: stop_event 的所有权由本对象持有，监听线程已经结束，此处只关闭一次。
        let owned = unsafe { Owned::new(stop_event) };
        // 立即释放句柄，并防止后续代码误用已经失效的值。
        self.stop_event = 0;
        drop(owned);
    }
}

pub fn start_system_proxy_monitor() -> Result<SystemProxyMonitor, String> {
    // SAFETY: 不传安全属性和名称，创建一个仅当前进程使用的手动复位事件。
    let stop_event = unsafe {
        CreateEventExW(
            None,
            PCWSTR::null(),
            CREATE_EVENT_MANUAL_RESET,
            EVENT_ALL_ACCESS.0,
        )
    }
    .map_err(|error| format!("创建系统代理监听停止事件失败: {error}"))?;
    // SAFETY: CreateEventExW 返回了由当前作用域唯一拥有的有效句柄。
    let stop_event = unsafe { Owned::new(stop_event) };
    let stop_event_value = stop_event.0 as usize;

    let worker = thread::Builder::new()
        .name("system-proxy-monitor".to_string())
        .spawn(move || monitor_system_proxy(stop_event_value))
        .map_err(|error| format!("启动系统代理监听线程失败: {error}"))?;

    // 所有权转移给 SystemProxyMonitor，由其 Drop 在工作线程退出后关闭。
    std::mem::forget(stop_event);
    Ok(SystemProxyMonitor {
        stop_event: stop_event_value,
        worker: Mutex::new(Some(worker)),
    })
}

fn monitor_system_proxy(stop_event_value: usize) {
    if let Err(error) = run_system_proxy_monitor(stop_event_value) {
        log::warn!("系统代理监听已停止: {error}");
    }
}

fn run_system_proxy_monitor(stop_event_value: usize) -> Result<(), String> {
    let mut internet_settings = HKEY::default();
    // SAFETY: phkresult 指向有效可写的 HKEY，返回成功后由 Owned 负责关闭。
    unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            INTERNET_SETTINGS_KEY,
            None,
            KEY_NOTIFY,
            &mut internet_settings,
        )
    }
    .ok()
    .map_err(|error| format!("打开系统代理注册表项失败: {error}"))?;
    // SAFETY: RegOpenKeyExW 成功后，internet_settings 是当前线程唯一拥有的句柄。
    let internet_settings = unsafe { Owned::new(internet_settings) };

    // SAFETY: 不传安全属性和名称，创建一个仅监听线程使用的自动复位事件。
    let change_event =
        unsafe { CreateEventExW(None, PCWSTR::null(), CREATE_EVENT(0), EVENT_ALL_ACCESS.0) }
            .map_err(|error| format!("创建系统代理变更事件失败: {error}"))?;
    // SAFETY: CreateEventExW 返回了由当前线程唯一拥有的有效句柄。
    let change_event = unsafe { Owned::new(change_event) };
    let stop_event = HANDLE(stop_event_value as *mut _);

    register_proxy_change(&internet_settings, &change_event)?;

    loop {
        let handles = [stop_event, *change_event];
        // SAFETY: 两个句柄在等待期间都有效；数组在调用期间保持存活。
        let wait_result = unsafe { WaitForMultipleObjects(&handles, false, INFINITE) };
        if wait_result == WAIT_OBJECT_0 {
            return Ok(());
        }
        if wait_result.0 == WAIT_OBJECT_0.0 + 1 {
            // 先重新注册通知，避免 Client 构建期间遗漏后续系统代理变化。
            register_proxy_change(&internet_settings, &change_event)?;
            match refresh_system_proxy_clients() {
                Ok(true) => log::info!("检测到 Windows 系统代理变化，已重建 HTTP 客户端"),
                Ok(false) => {}
                Err(error) => log::warn!("系统代理变化后重建 HTTP 客户端失败: {error}"),
            }
            continue;
        }
        if wait_result == WAIT_FAILED {
            return Err(format!(
                "等待系统代理变化失败: {}",
                WindowsError::from_thread()
            ));
        }
        return Err(format!("等待系统代理变化返回未知状态: {}", wait_result.0));
    }
}

fn register_proxy_change(
    internet_settings: &Owned<HKEY>,
    change_event: &Owned<HANDLE>,
) -> Result<(), String> {
    // SAFETY: 注册表键和事件句柄均有效，异步通知只在句柄存活期间使用。
    unsafe {
        RegNotifyChangeKeyValue(
            **internet_settings,
            false,
            REG_NOTIFY_CHANGE_LAST_SET,
            Some(**change_event),
            true,
        )
    }
    .ok()
    .map_err(|error| format!("注册系统代理变化通知失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::start_system_proxy_monitor;

    #[test]
    fn system_proxy_monitor_starts_and_stops_cleanly() {
        let monitor = start_system_proxy_monitor().expect("系统代理监听应能启动");
        monitor.shutdown();
    }
}
