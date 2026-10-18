use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};
use tokio::sync::oneshot;

use super::logs::open_log_directory;

const OPEN_LOGS_LABEL: &str = "查看日志";

/// 不依赖前端或数据库的原生提示，由调用方决定关闭后的行为。
#[derive(Clone)]
pub struct NativeDialog {
    title: String,
    message: String,
    kind: MessageDialogKind,
    button_label: String,
    show_log_folder_button: bool,
}

impl NativeDialog {
    pub fn new(
        title: impl Into<String>,
        message: impl Into<String>,
        kind: MessageDialogKind,
    ) -> Self {
        Self {
            title: title.into(),
            message: message.into(),
            kind,
            button_label: "确定".into(),
            show_log_folder_button: false,
        }
    }

    pub fn details(mut self, details: impl std::fmt::Display) -> Self {
        self.message.push_str(&format!("\n\n详细信息：\n{details}"));
        self
    }

    pub fn button_label(mut self, label: impl Into<String>) -> Self {
        self.button_label = label.into();
        self
    }

    pub fn with_log_folder_button(mut self) -> Self {
        self.show_log_folder_button = true;
        self
    }

    /// 在事件循环运行后调用，异步等待用户关闭，避免阻塞主线程。
    pub async fn show(self, app: &AppHandle) {
        let (sender, receiver) = oneshot::channel();
        let buttons = if self.show_log_folder_button {
            MessageDialogButtons::OkCancelCustom(OPEN_LOGS_LABEL.into(), self.button_label)
        } else {
            MessageDialogButtons::OkCustom(self.button_label)
        };
        let mut dialog = app
            .dialog()
            .message(self.message)
            .title(self.title)
            .kind(self.kind)
            .buttons(buttons);

        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.parent(&window);
        }

        dialog.show_with_result(move |result| {
            let _ = sender.send(result);
        });

        let open_logs = match receiver.await {
            Ok(MessageDialogResult::Custom(label)) => {
                self.show_log_folder_button && label == OPEN_LOGS_LABEL
            }
            Ok(MessageDialogResult::Ok) => self.show_log_folder_button,
            Ok(_) => false,
            Err(error) => {
                log::error!("等待原生提示关闭失败: {error}");
                false
            }
        };
        if open_logs && let Err(error) = open_log_directory(app).await {
            log::error!("打开日志文件夹失败: {error}");
        }
    }
}
