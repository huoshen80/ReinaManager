use tauri::{Emitter, WebviewWindow};
use tauri_runtime_wry::WebviewWryExt;
use webview2_com::{
    AcceleratorKeyPressedEventHandler,
    Microsoft::Web::WebView2::Win32::COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
    ZoomFactorChangedEventHandler,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, VK_CONTROL, VK_MENU, VK_NUMPAD0, VK_SHIFT,
};

const MIN_ZOOM_FACTOR: f64 = 0.8;
const MAX_ZOOM_FACTOR: f64 = 1.5;

pub fn listen_to_webview_zoom(window: &WebviewWindow) -> tauri::Result<()> {
    let window_for_event = window.clone();
    let window_for_reset = window.clone();
    window.with_wry_webview(move |webview| {
        let callback = ZoomFactorChangedEventHandler::create(Box::new(move |sender, _| {
            if let Some(controller) = sender {
                let mut factor = 0.0;
                // SAFETY: 回调由 WebView2 在控制器有效期间调用，factor 是可写的 f64 地址。
                match unsafe { controller.ZoomFactor(&mut factor) } {
                    Ok(()) if factor.is_finite() && factor > 0.0 => {
                        let bounded_factor = factor.clamp(MIN_ZOOM_FACTOR, MAX_ZOOM_FACTOR);
                        // 忽略边界附近的浮点误差，避免无谓地改写 WebView2 的默认缩放比例。
                        let effective_factor = if (factor - bounded_factor).abs() > 0.001 {
                            // SAFETY: 回调期间控制器仍有效，缩放比例限制在 WebView2 支持的正常范围内。
                            match unsafe { controller.SetZoomFactor(bounded_factor) } {
                                Ok(()) => bounded_factor,
                                Err(error) => {
                                    log::warn!("限制 WebView 缩放比例失败: {error}");
                                    factor
                                }
                            }
                        } else {
                            factor
                        };
                        let percent = (effective_factor * 100.0).round() as u32;
                        if let Err(error) = window_for_event.emit("webview-zoom-changed", percent) {
                            log::warn!("发送 WebView 缩放事件失败: {error}");
                        }
                    }
                    Ok(()) => log::warn!("WebView 返回无效缩放比例: {factor}"),
                    Err(error) => log::warn!("读取 WebView 缩放比例失败: {error}"),
                }
            }
            Ok(())
        }));

        let mut token = 0;
        // SAFETY: callback 在注册时交给 WebView2 持有，token 是可写的事件令牌地址。
        if let Err(error) = unsafe {
            webview
                .controller()
                .add_ZoomFactorChanged(&callback, &mut token)
        } {
            log::warn!("注册 WebView 缩放事件失败: {error}");
        }

        let reset_callback = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut kind = Default::default();
            let mut key = 0;
            // SAFETY: 事件参数在回调期间有效，输出地址指向已初始化的局部变量。
            unsafe {
                args.KeyEventKind(&mut kind)?;
                args.VirtualKey(&mut key)?;
            }
            if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                || (key != u32::from(b'0') && key != u32::from(VK_NUMPAD0.0))
            {
                return Ok(());
            }
            // SAFETY: 在接收键盘事件的 UI 线程上查询有效的虚拟键码，无指针参数。
            let reset_pressed = unsafe {
                GetKeyState(i32::from(VK_CONTROL.0)) < 0
                    && GetKeyState(i32::from(VK_MENU.0)) >= 0
                    && GetKeyState(i32::from(VK_SHIFT.0)) >= 0
            };
            if !reset_pressed {
                return Ok(());
            }

            let mut status = Default::default();
            // SAFETY: 回调参数仍有效；先阻止原生重置，再读取按键状态过滤长按重复。
            unsafe {
                args.SetHandled(true)?;
                args.PhysicalKeyStatus(&mut status)?;
            }
            if !status.WasKeyDown.as_bool() {
                let window = window_for_reset.clone();
                // 原生键盘回调是同步的，异步发送事件以避免在其中执行 WebView 脚本。
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = window.emit("webview-zoom-reset-requested", ()) {
                        log::warn!("发送 WebView 缩放重置事件失败: {error}");
                    }
                });
            }
            Ok(())
        }));
        let mut reset_token = 0;
        // SAFETY: 注册后 WebView2 持有回调，reset_token 是可写的事件令牌地址。
        if let Err(error) = unsafe {
            webview
                .controller()
                .add_AcceleratorKeyPressed(&reset_callback, &mut reset_token)
        } {
            log::warn!("注册 WebView 缩放重置快捷键失败: {error}");
        }
    })
}
