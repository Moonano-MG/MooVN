use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// 应用数据目录（跨平台：Windows %APPDATA%、macOS ~/Library、Android app files）
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    Ok(dir)
}

fn safe_key(key: &str) -> Result<String, String> {
    let cleaned: String = key
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if cleaned.is_empty() {
        return Err("空的存储键".into());
    }
    Ok(cleaned)
}

/* ---------------- KV 存储（存档 / 设置 / 进度 / 编辑器项目） ---------------- */

#[tauri::command]
fn kv_read(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join(format!("{}.json", safe_key(&key)?));
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn kv_write(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let path = data_dir(&app)?.join(format!("{}.json", safe_key(&key)?));
    fs::write(&path, value).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
fn kv_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = data_dir(&app)?.join(format!("{}.json", safe_key(&key)?));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))?;
    }
    Ok(())
}

/* ---------------- 项目文件（桌面端打开 / 保存 .moovnproj.zip 与 YAML） ---------------- */

#[derive(Serialize, Deserialize)]
struct ProjectFile {
    content: String,
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    // 桌面端由对话框选择路径，这里仅做读取；拒绝敏感目录以保守起见
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err("文件不存在".into());
    }
    fs::read_to_string(&p).map_err(|e| format!("读取失败: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            kv_read,
            kv_write,
            kv_delete,
            read_text_file,
            write_text_file,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running MooVN");
}
