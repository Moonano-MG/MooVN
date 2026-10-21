use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub tauri_version: String,
    pub supported_targets: Vec<String>,
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        tauri_version: "2.2.0".to_string(),
        supported_targets: vec![
            "Windows (x64 / ARM64 - MSI & NSIS)".to_string(),
            "Android (API 24+ APK / AAB)".to_string(),
            "iOS (iOS 13.0+ IPA - Optional)".to_string(),
            "macOS (Universal .app / .dmg - Optional)".to_string(),
        ],
    }
}

#[tauri::command]
fn export_scene_yaml(path: String, yaml_content: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, yaml_content).map_err(|e| e.to_string())?;
    Ok(format!("Successfully saved YAML to {}", path))
}

#[tauri::command]
fn import_scene_yaml(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            export_scene_yaml,
            import_scene_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running MooVN Tauri v2 application");
}
