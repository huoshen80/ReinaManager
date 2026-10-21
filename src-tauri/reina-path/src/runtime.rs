use std::sync::OnceLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeEnvironment {
    Development,
    Preview,
    Production,
}

impl RuntimeEnvironment {
    pub const fn from_development(is_development: bool) -> Self {
        if is_development {
            Self::Development
        } else {
            Self::Production
        }
    }

    pub const fn is_development(self) -> bool {
        // 实验发行包沿用开发版的隔离及系统集成限制，不能因 release 优化而访问正式数据。
        matches!(self, Self::Development | Self::Preview)
    }

    pub const fn identifier(self) -> &'static str {
        match self {
            Self::Development => "com.reinamanager.dev.debug",
            Self::Preview => "com.reinamanager.cef-preview",
            // 保留已发布版本的标识，避免正式版用户的数据位置发生变化。
            Self::Production => "com.reinamanager.dev",
        }
    }
}

static ENVIRONMENT: OnceLock<RuntimeEnvironment> = OnceLock::new();

/// 应用必须在初始化插件、数据库和后台任务前固定环境，运行中禁止切换。
pub fn initialize_environment(environment: RuntimeEnvironment) -> Result<(), &'static str> {
    ENVIRONMENT
        .set(environment)
        .map_err(|_| "运行环境已经初始化")
}

pub fn runtime_environment() -> RuntimeEnvironment {
    // 独立使用路径 crate 的迁移工具维持正式版路径语义。
    // 提前读路径会固定环境，使 GUI 入口的后续初始化显式失败，避免混用目录。
    *ENVIRONMENT.get_or_init(|| RuntimeEnvironment::Production)
}
