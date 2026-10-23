use moovn_engine::{MooVNEngineRuntime, PolyglotTranslator, SourceLanguage};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

static ENGINE_RUNTIME: Mutex<Option<MooVNEngineRuntime>> = Mutex::new(None);

#[derive(Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub tauri_version: String,
    pub engine_version: String,
    pub supported_targets: Vec<String>,
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        tauri_version: "2.2.0".to_string(),
        engine_version: "MooVN Engine 0.1.0 (Rust + C++ Hybrid Bridge)".to_string(),
        supported_targets: vec![
            "Windows (x64 / x86 / ARM64 - ZIP & Install)".to_string(),
            "Android (API 24+ APK / AAB)".to_string(),
            "iOS (iOS 13.0+ IPA)".to_string(),
            "macOS (Universal .app / .dmg)".to_string(),
            "Linux (AppImage / DEB)".to_string(),
        ],
    }
}

#[tauri::command]
fn translate_polyglot_script(
    source_code: String,
    from_lang: String,
    to_lang: String,
) -> String {
    let src_lang = SourceLanguage::from_tag(&from_lang);
    let dst_lang = SourceLanguage::from_tag(&to_lang);
    let (program, _) = PolyglotTranslator::compile_to_ir(&source_code, src_lang);
    PolyglotTranslator::transpile(&program, dst_lang)
}

#[tauri::command]
fn eval_engine_script(source_code: String, lang: String) -> Vec<String> {
    let mut guard = ENGINE_RUNTIME.lock().unwrap();
    let rt = guard.get_or_insert_with(MooVNEngineRuntime::new);
    rt.eval_polyglot_script(&source_code, SourceLanguage::from_tag(&lang))
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
            translate_polyglot_script,
            eval_engine_script,
            export_scene_yaml,
            import_scene_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running MooVN Studio Tauri v2 middleware");
}

