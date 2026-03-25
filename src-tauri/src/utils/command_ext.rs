use std::process::{Command, Stdio};

/// 为 GUI 环境下启动子进程提供统一的标准流处理。
pub trait CommandGuiExt {
    /// 在 Windows GUI 进程中切断标准流继承，避免无控制台句柄导致的启动失败。
    fn gui_safe(&mut self) -> &mut Self;
}

impl CommandGuiExt for Command {
    fn gui_safe(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            self.stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
        }

        #[cfg(not(target_os = "windows"))]
        {
            self
        }
    }
}
