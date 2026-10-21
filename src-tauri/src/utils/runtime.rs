use reina_path::{RuntimeEnvironment, initialize_environment, runtime_environment};
use tauri::Context;

pub fn configure_runtime(context: &mut Context) {
    // 该分支的开发及发行构建都使用实验环境，禁止读取正式版或便携版的数据。
    let environment = RuntimeEnvironment::Preview;
    initialize_environment(environment).expect("必须在访问应用数据前初始化运行环境");
    let config = context.config_mut();
    config.identifier = environment.identifier().into();
}

#[tauri::command]
pub fn is_development() -> bool {
    runtime_environment().is_development()
}
