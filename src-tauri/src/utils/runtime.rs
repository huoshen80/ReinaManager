use reina_path::{RuntimeEnvironment, initialize_environment, runtime_environment};
#[cfg(any(target_os = "linux", test))]
use std::{ffi::OsStr, process::Command};
#[cfg(target_os = "linux")]
use std::{ffi::OsString, sync::OnceLock};
use tauri::Context;

#[cfg(target_os = "linux")]
static ORIGINAL_GDK_BACKEND: OnceLock<Option<OsString>> = OnceLock::new();

pub fn configure_runtime(context: &mut Context) {
    // CEF 会把进程环境改为 X11；必须在初始化 runtime 前保留用户原本的选择。
    #[cfg(target_os = "linux")]
    ORIGINAL_GDK_BACKEND.get_or_init(|| std::env::var_os("GDK_BACKEND"));

    // 该分支的开发及发行构建都使用实验环境，禁止读取正式版或便携版的数据。
    let environment = RuntimeEnvironment::Preview;
    initialize_environment(environment).expect("必须在访问应用数据前初始化运行环境");
    let config = context.config_mut();
    config.identifier = environment.identifier().into();
}

#[cfg(target_os = "linux")]
pub fn restore_child_gdk_backend(command: &mut Command) {
    let original = ORIGINAL_GDK_BACKEND
        .get()
        .expect("必须在启动外部进程前初始化运行环境");
    restore_gdk_backend(command, original.as_deref());
}

#[cfg(any(target_os = "linux", test))]
fn restore_gdk_backend(command: &mut Command, original: Option<&OsStr>) {
    // 仅还原 CEF 改写的变量，游戏所需的显示、Wine 等环境仍按原有规则继承。
    match original {
        Some(value) => command.env("GDK_BACKEND", value),
        None => command.env_remove("GDK_BACKEND"),
    };
}

#[tauri::command]
pub fn is_development() -> bool {
    runtime_environment().is_development()
}

#[cfg(test)]
mod tests {
    use super::restore_gdk_backend;
    use std::{collections::BTreeMap, ffi::OsStr, process::Command};

    fn assert_child_environment(original: Option<&str>) {
        let mut command = Command::new("unused-test-program");
        command.env("GDK_BACKEND", "x11");
        command.env("DISPLAY", ":1");
        command.env("WAYLAND_DISPLAY", "wayland-1");
        command.env("WINEPREFIX", "/games/wine-prefix");

        restore_gdk_backend(&mut command, original.map(OsStr::new));

        let environment = command.get_envs().collect::<BTreeMap<_, _>>();
        assert_eq!(
            environment.get(OsStr::new("GDK_BACKEND")),
            Some(&original.map(OsStr::new))
        );
        for (name, value) in [
            ("DISPLAY", ":1"),
            ("WAYLAND_DISPLAY", "wayland-1"),
            ("WINEPREFIX", "/games/wine-prefix"),
        ] {
            assert_eq!(
                environment.get(OsStr::new(name)),
                Some(&Some(OsStr::new(value)))
            );
        }
    }

    #[test]
    fn child_restores_wayland_backend() {
        assert_child_environment(Some("wayland"));
    }

    #[test]
    fn child_preserves_explicit_x11_backend() {
        assert_child_environment(Some("x11"));
    }

    #[test]
    fn child_removes_backend_when_originally_unset() {
        assert_child_environment(None);
    }
}
