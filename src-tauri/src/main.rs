// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg_attr(target_os = "linux", tauri_runtime_cef::cef_entry_point)]
fn main() {
    reina_manager_lib::run();
}
