use super::client::refresh_system_proxy_clients;
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
use tauri::Emitter;
use windows::Win32::Foundation::{HANDLE, WAIT_FAILED, WAIT_OBJECT_0};
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, KEY_QUERY_VALUE, REG_DWORD, REG_EXPAND_SZ,
    REG_NOTIFY_CHANGE_LAST_SET, REG_SZ, REG_VALUE_TYPE, RegNotifyChangeKeyValue, RegOpenKeyExW,
    RegQueryValueExW,
};
use windows::Win32::System::Threading::{
    CREATE_EVENT, CREATE_EVENT_MANUAL_RESET, CreateEventExW, EVENT_ALL_ACCESS, INFINITE, SetEvent,
    WaitForMultipleObjects,
};
use windows::core::{Error as WindowsError, Owned, PCWSTR, w};

const INTERNET_SETTINGS_KEY: PCWSTR =
    w!("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings");
const PROXY_ENABLE_VALUE: PCWSTR = w!("ProxyEnable");
const PROXY_SERVER_VALUE: PCWSTR = w!("ProxyServer");

/// 读取 Windows 注册表判断当前系统代理是否处于启用状态 (ProxyEnable == 1 且 ProxyServer 字符串非空)
pub fn is_system_proxy_enabled() -> bool {
    let mut key = HKEY::default();
    // SAFETY: 路径常量以 NUL 结尾，key 指向当前栈帧内有效且可写的 HKEY 输出位置。
    let open_res = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            INTERNET_SETTINGS_KEY,
            None,
            KEY_QUERY_VALUE,
            &mut key,
        )
    };
    if open_res.is_err() {
        return false;
    }
    // SAFETY: RegOpenKeyExW 成功后 key 是当前作用域唯一拥有的有效注册表句柄。
    let key = unsafe { Owned::new(key) };
    let mut proxy_enable: u32 = 0;
    let mut data_len = std::mem::size_of::<u32>() as u32;
    let mut enable_value_type = REG_VALUE_TYPE::default();

    // SAFETY: key 有效；proxy_enable 是 4 字节可写缓冲区，data_len 准确声明其容量。
    let enable_query_res = unsafe {
        RegQueryValueExW(
            *key,
            PROXY_ENABLE_VALUE,
            None,
            Some(&mut enable_value_type),
            Some(&mut proxy_enable as *mut u32 as *mut u8),
            Some(&mut data_len),
        )
    };

    if enable_query_res.is_err() || enable_value_type != REG_DWORD || proxy_enable == 0 {
        return false;
    }

    // 校验 ProxyServer 是否存在且非空（与 reqwest system-proxy 行为保持一致）
    let mut server_data_len: u32 = 0;
    let mut server_value_type = REG_VALUE_TYPE::default();
    // SAFETY: key 有效；数据指针为空时 RegQueryValueExW 仅写入类型和所需字节数。
    let server_size_res = unsafe {
        RegQueryValueExW(
            *key,
            PROXY_SERVER_VALUE,
            None,
            Some(&mut server_value_type),
            None,
            Some(&mut server_data_len),
        )
    };

    if server_size_res.is_err()
        || server_data_len == 0
        || (server_value_type != REG_SZ && server_value_type != REG_EXPAND_SZ)
        || !server_data_len.is_multiple_of(2)
    {
        return false;
    }

    // 使用等长 Vec<u8> 分配精确字节数，杜绝因整数除法向下取整导致的越界写风险
    let mut byte_buffer: Vec<u8> = vec![0u8; server_data_len as usize];
    // SAFETY: key 有效；byte_buffer 容量等于 data_len 声明值，WinAPI 不会写过该容量；
    // 若查询期间注册表值增长，调用返回错误并通过下方分支丢弃缓冲区。
    let server_query_res = unsafe {
        RegQueryValueExW(
            *key,
            PROXY_SERVER_VALUE,
            None,
            Some(&mut server_value_type),
            Some(byte_buffer.as_mut_ptr()),
            Some(&mut server_data_len),
        )
    };

    // 两次查询间值可能变化，必须以第二次查询返回的类型和实际长度为准。
    if server_query_res.is_err()
        || server_data_len == 0
        || server_data_len as usize > byte_buffer.len()
        || (server_value_type != REG_SZ && server_value_type != REG_EXPAND_SZ)
        || !server_data_len.is_multiple_of(2)
    {
        return false;
    }
    byte_buffer.truncate(server_data_len as usize);

    let u16_slice: Vec<u16> = byte_buffer
        .chunks_exact(2)
        .map(|chunk| u16::from_ne_bytes([chunk[0], chunk[1]]))
        .collect();

    let trimmed_slice = match u16_slice.iter().rposition(|&c| c != 0) {
        Some(pos) => &u16_slice[..=pos],
        None => return false,
    };

    let proxy_server_str = String::from_utf16_lossy(trimmed_slice);
    !proxy_server_str.trim().is_empty()
}

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

pub fn start_system_proxy_monitor(
    app_handle: Option<tauri::AppHandle>,
) -> Result<SystemProxyMonitor, String> {
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
        .spawn(move || monitor_system_proxy(stop_event_value, app_handle))
        .map_err(|error| format!("启动系统代理监听线程失败: {error}"))?;

    // 所有权转移给 SystemProxyMonitor，由其 Drop 在工作线程退出后关闭。
    std::mem::forget(stop_event);
    Ok(SystemProxyMonitor {
        stop_event: stop_event_value,
        worker: Mutex::new(Some(worker)),
    })
}

fn monitor_system_proxy(stop_event_value: usize, app_handle: Option<tauri::AppHandle>) {
    if let Err(error) = run_system_proxy_monitor(stop_event_value, app_handle) {
        log::warn!("系统代理监听已停止: {error}");
    }
}

fn run_system_proxy_monitor(
    stop_event_value: usize,
    app_handle: Option<tauri::AppHandle>,
) -> Result<(), String> {
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
            if let Some(ref handle) = app_handle {
                let enabled = is_system_proxy_enabled();
                let _ = handle.emit(
                    "system-proxy-changed",
                    serde_json::json!({ "enabled": enabled }),
                );
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
        let monitor = start_system_proxy_monitor(None).expect("系统代理监听应能启动");
        monitor.shutdown();
    }
}
