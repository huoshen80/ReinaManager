use super::protocol::InstallRequest;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::sync::watch;

pub(crate) const GAME_INSTALL_TASK_TYPE: &str = "game_install";
pub(crate) const ACTIVE_TASK_STATUSES: &[&str] = &["pending", "running", "paused"];

#[derive(Default)]
pub struct TaskRuntimeState {
    running: Mutex<HashMap<i64, RunningTask>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TaskControl {
    Running,
    Pause,
    Cancel,
}

struct RunningTask {
    pub(crate) control: watch::Sender<TaskControl>,
    pub(crate) completion: watch::Sender<bool>,
}

impl TaskRuntimeState {
    pub(crate) fn start(&self, task_id: i64) -> Result<watch::Receiver<TaskControl>, String> {
        let mut running = self.running.lock();
        if running.contains_key(&task_id) {
            return Err("任务已经在运行".to_string());
        }
        let (control, receiver) = watch::channel(TaskControl::Running);
        let (completion, _) = watch::channel(false);
        running.insert(
            task_id,
            RunningTask {
                control,
                completion,
            },
        );
        Ok(receiver)
    }

    pub(crate) fn cancel(&self, task_id: i64) -> Option<watch::Receiver<bool>> {
        self.request_control(task_id, TaskControl::Cancel)
    }

    pub(crate) fn pause(&self, task_id: i64) -> Option<watch::Receiver<bool>> {
        self.request_control(task_id, TaskControl::Pause)
    }

    pub(crate) fn request_control(
        &self,
        task_id: i64,
        control: TaskControl,
    ) -> Option<watch::Receiver<bool>> {
        let running = self.running.lock();
        let task = running.get(&task_id)?;
        let completion = task.completion.subscribe();
        let _ = task.control.send(control);
        Some(completion)
    }

    pub(crate) fn completion(&self, task_id: i64) -> Option<watch::Receiver<bool>> {
        self.running
            .lock()
            .get(&task_id)
            .map(|task| task.completion.subscribe())
    }

    pub(crate) fn finish(&self, task_id: i64) {
        if let Some(task) = self.running.lock().remove(&task_id) {
            let _ = task.completion.send(true);
        }
    }
}

pub(crate) async fn wait_for_task_completion(mut completion: watch::Receiver<bool>) {
    while !*completion.borrow() {
        if completion.changed().await.is_err() {
            break;
        }
    }
}

#[derive(Debug)]
pub(crate) struct TaskFailure {
    pub(crate) code: String,
    pub(crate) message: String,
}

impl TaskFailure {
    pub(crate) fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct TaskProgressEvent {
    pub(crate) task_id: i64,
    pub(crate) status: String,
    pub(crate) stage: Option<String>,
    pub(crate) progress_current: i64,
    pub(crate) progress_total: Option<i64>,
    pub(crate) progress_unit: Option<String>,
    pub(crate) bytes_per_second: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct GameInstallMetadataRequestedEvent {
    pub(crate) task_id: i64,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct GameInstallCompletedEvent {
    pub(crate) task_id: i64,
    pub(crate) game_id: i32,
    pub(crate) result_path: String,
    pub(crate) executable: Option<String>,
    pub(crate) executable_missing: bool,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct GameInstallFailedEvent {
    pub(crate) task_id: i64,
    pub(crate) game_id: Option<i32>,
    pub(crate) error_code: String,
    pub(crate) error_message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GameInstallResultV1 {
    pub(crate) version: u32,
    pub(crate) game_id: Option<i32>,
    pub(crate) install_path: String,
    /// 安装目录直属的可执行文件名，不保存绝对路径。
    pub(crate) executable: Option<String>,
    pub(crate) created_new_game: Option<bool>,
    pub(crate) matched_by: Option<String>,
}

impl GameInstallResultV1 {
    pub(crate) fn partial(install_path: &Path, executable: Option<&str>) -> Self {
        Self {
            version: 1,
            game_id: None,
            install_path: install_path.to_string_lossy().into_owned(),
            executable: executable.map(str::to_owned),
            created_new_game: None,
            matched_by: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct GameInstallTaskPayloadV1 {
    #[serde(flatten)]
    pub(crate) request: InstallRequest,
    pub(crate) install_root: String,
}

impl GameInstallTaskPayloadV1 {
    pub(crate) fn new(request: InstallRequest, install_root: &Path) -> Self {
        Self {
            request,
            install_root: install_root.to_string_lossy().into_owned(),
        }
    }

    pub(crate) fn install_root(&self) -> Result<PathBuf, TaskFailure> {
        let path = PathBuf::from(&self.install_root);
        if !path.is_absolute() {
            return Err(TaskFailure::new(
                "invalid_payload",
                "安装任务中的游戏库路径必须是绝对路径",
            ));
        }
        Ok(path)
    }

    pub(crate) fn download_path(&self, task_id: i64) -> Result<PathBuf, TaskFailure> {
        Ok(self.install_root()?.join(format!(
            "{}.reina-{task_id}.download",
            self.request.file_name
        )))
    }

    pub(crate) fn staging_directory(&self, task_id: i64) -> Result<PathBuf, TaskFailure> {
        Ok(self
            .install_root()?
            .join(format!("reina-{task_id}.extracting")))
    }
}

#[cfg(test)]
mod tests {
    use super::GameInstallResultV1;
    use std::path::Path;

    #[test]
    fn partial_result_stores_executable_name_only() {
        let result = GameInstallResultV1::partial(Path::new(r"C:\Games\Reina"), Some("game.exe"));

        assert_eq!(result.executable.as_deref(), Some("game.exe"));
    }
}
