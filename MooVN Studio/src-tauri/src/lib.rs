use moovn_engine::{MooVNEngineRuntime, PolyglotTranslator, SourceLanguage};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

mod workspace_io;
mod asset_io;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

static ENGINE_RUNTIME: Mutex<Option<MooVNEngineRuntime>> = Mutex::new(None);
static ASSET_UPLOADS: OnceLock<Mutex<asset_io::AssetUploads>> = OnceLock::new();

fn asset_uploads() -> &'static Mutex<asset_io::AssetUploads> {
    ASSET_UPLOADS.get_or_init(|| Mutex::new(asset_io::AssetUploads::default()))
}

const MAX_PAYLOAD_BYTES: usize = workspace_io::MAX_PROJECT_BYTES;

#[derive(Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub tauri_version: String,
    pub engine_version: String,
    pub supported_targets: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct SaveProjectResult {
    pub ok: bool,
    pub path: String,
    pub backup_path: String,
    pub bytes_written: usize,
    pub saved_at_epoch_ms: u64,
}

#[derive(Serialize, Deserialize)]
pub struct TranslationCommandResult {
    pub code: String,
    pub diagnostics: Vec<String>,
}

fn current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ensure_workspace_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir()
        .map_err(|e| format!("ERR_WORKSPACE_PATH: {e}"))?
        .join("MooVN_Workspace");
    workspace_io::ensure_root(&base)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePaths {
    workspace_root_path: String,
    projects_directory_path: String,
    export_output_directory_path: String,
    cache_directory_path: String,
    settings_file_path: String,
}

#[tauri::command]
fn get_workspace_paths(app: tauri::AppHandle) -> Result<WorkspacePaths, String> {
    let root = ensure_workspace_root(&app)?;
    let as_string = |path: PathBuf| path.to_string_lossy().to_string();
    Ok(WorkspacePaths {
        workspace_root_path: as_string(root.clone()),
        projects_directory_path: as_string(root.join("Projects")),
        export_output_directory_path: as_string(root.join("Exports")),
        cache_directory_path: as_string(root.join("Cache")),
        settings_file_path: as_string(root.join("Cache").join("settings.moovn.json")),
    })
}

fn resolve_safe_workspace_file(
    app: &tauri::AppHandle,
    subdir: &str,
    name: &str,
    extensions: &[&str],
) -> Result<PathBuf, String> {
    workspace_io::resolve_file(&ensure_workspace_root(app)?, subdir, name, extensions)
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        tauri_version: "2.2.0".to_string(),
        engine_version: "MooVN Engine 0.1.0".to_string(),
        supported_targets: vec![
            "web".to_string(),
            "windows".to_string(),
            "macos".to_string(),
            "android".to_string(),
            "ios".to_string(),
        ],
    }
}

#[tauri::command]
fn save_project_json(
    app: tauri::AppHandle,
    file_name: String,
    payload: String,
    retain_backup: Option<bool>,
) -> Result<SaveProjectResult, String> {
    if payload.trim().is_empty() {
        return Err("ERR_EMPTY_PAYLOAD: project JSON cannot be empty".into());
    }
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err("ERR_PAYLOAD_TOO_LARGE: project exceeds 16 MiB".into());
    }
    let parsed: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| format!("ERR_INVALID_JSON: {e}"))?;
    if !parsed.is_object() {
        return Err("ERR_INVALID_JSON: project must be an object".into());
    }
    let root = ensure_workspace_root(&app)?;
    let (primary, backup) = workspace_io::save_project(&root, &file_name, payload.as_bytes(), retain_backup.unwrap_or(false))?;
    Ok(SaveProjectResult {
        ok: true,
        path: primary.to_string_lossy().into_owned(),
        backup_path: backup.to_string_lossy().into_owned(),
        bytes_written: payload.len(),
        saved_at_epoch_ms: current_epoch_ms(),
    })
}

#[derive(Serialize)]
struct LoadProjectResult {
    payload: String,
    path: String,
    recovered_from_backup: bool,
}

#[tauri::command]
fn load_project_json(app: tauri::AppHandle, file_name: String, prefer_backup: Option<bool>) -> Result<LoadProjectResult, String> {
    let primary = resolve_safe_workspace_file(&app, "Projects", &file_name, &["mpvn"])?;
    let backup = primary.with_file_name(format!("{file_name}.bak"));
    let load = |path: &std::path::Path| -> Result<String, String> {
        let content = workspace_io::read_bounded(path, MAX_PAYLOAD_BYTES)?;
        let _: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("ERR_INVALID_JSON: {e}"))?;
        Ok(content)
    };
    if prefer_backup.unwrap_or(false) {
        return Ok(LoadProjectResult {
            payload: load(&backup)?,
            path: primary.to_string_lossy().into_owned(),
            recovered_from_backup: true,
        });
    }
    match load(&primary) {
        Ok(payload) => Ok(LoadProjectResult {
            payload,
            path: primary.to_string_lossy().into_owned(),
            recovered_from_backup: false,
        }),
        Err(primary_error) => match load(&backup) {
            Ok(payload) => Ok(LoadProjectResult {
                payload,
                path: primary.to_string_lossy().into_owned(),
                recovered_from_backup: true,
            }),
            Err(_) => Err(primary_error),
        },
    }
}

#[tauri::command]
fn translate_polyglot_script(
    source_code: String,
    from_lang: String,
    to_lang: String,
) -> Result<TranslationCommandResult, String> {
    if source_code.len() > MAX_PAYLOAD_BYTES {
        return Err("ERR_SCRIPT_TOO_LARGE".to_string());
    }
    let src_lang = SourceLanguage::from_tag(&from_lang);
    let dst_lang = SourceLanguage::from_tag(&to_lang);
    let (program, diagnostics) = PolyglotTranslator::compile_to_ir(&source_code, src_lang);
    let code = PolyglotTranslator::transpile(&program, dst_lang);
    Ok(TranslationCommandResult { code, diagnostics })
}

#[tauri::command]
fn eval_engine_script(app: tauri::AppHandle, source_code: String, lang: String) -> Result<Vec<String>, String> {
    if source_code.len() > MAX_PAYLOAD_BYTES {
        return Err("ERR_SCRIPT_TOO_LARGE".to_string());
    }
    let mut guard = ENGINE_RUNTIME
        .lock()
        .map_err(|_| "ERR_ENGINE_LOCK_POISONED".to_string())?;
    if guard.is_none() {
        let save_dir = ensure_workspace_root(&app)?.join("Cache").join("Saves");
        let rt = MooVNEngineRuntime::with_save_dir(save_dir)
            .map_err(|e| format!("ERR_ENGINE_SAVE_DIR: {e}"))?;
        *guard = Some(rt);
    }
    let rt = guard.as_mut().expect("initialized");
    Ok(rt.eval_polyglot_script(&source_code, SourceLanguage::from_tag(&lang)))
}

#[tauri::command]
fn write_workspace_file(
    app: tauri::AppHandle,
    sub_dir: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    let target = resolve_safe_workspace_file(
        &app,
        &sub_dir,
        &file_name,
        &["mpvn", "msvn", "json", "yaml", "yml", "ts", "js", "cs", "cpp", "rs", "html", "txt"],
    )?;
    workspace_io::atomic_write_file(&target, content.as_bytes(), MAX_PAYLOAD_BYTES)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn read_workspace_file(app: tauri::AppHandle, sub_dir: String, file_name: String) -> Result<String, String> {
    let target = resolve_safe_workspace_file(
        &app,
        &sub_dir,
        &file_name,
        &["mpvn", "msvn", "json", "yaml", "yml", "ts", "js", "cs", "cpp", "rs", "html", "txt"],
    )?;
    workspace_io::read_bounded(&target, MAX_PAYLOAD_BYTES)
}

#[tauri::command]
fn export_scene_yaml(app: tauri::AppHandle, file_name: String, yaml_content: String) -> Result<String, String> {
    let target = resolve_safe_workspace_file(&app, "Projects", &file_name, &["yaml", "yml"])?;
    workspace_io::atomic_write_file(&target, yaml_content.as_bytes(), MAX_PAYLOAD_BYTES)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn import_scene_yaml(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let target = resolve_safe_workspace_file(&app, "Projects", &file_name, &["yaml", "yml"])?;
    workspace_io::read_bounded(&target, MAX_PAYLOAD_BYTES)
}

#[tauri::command]
fn begin_asset_upload(app: tauri::AppHandle, file_name: String, size: u64) -> Result<String, String> {
    asset_uploads().lock().map_err(|_| "ERR_ASSET_LOCK")?.begin(&ensure_workspace_root(&app)?, &file_name, size)
}

#[tauri::command]
fn append_asset_upload(token: String, bytes: Vec<u8>) -> Result<(), String> {
    asset_uploads().lock().map_err(|_| "ERR_ASSET_LOCK")?.append(&token, &bytes)
}

#[tauri::command]
fn finish_asset_upload(token: String) -> Result<String, String> {
    asset_uploads().lock().map_err(|_| "ERR_ASSET_LOCK")?.finish(&token)
}

#[tauri::command]
fn abort_asset_upload(token: String) -> Result<(), String> {
    asset_uploads().lock().map_err(|_| "ERR_ASSET_LOCK")?.abort(&token);
    Ok(())
}

#[derive(Serialize)]
struct AssetChunk { bytes: Vec<u8>, total_bytes: u64 }

#[tauri::command]
fn read_asset_chunk(app: tauri::AppHandle, file_name: String, offset: u64, length: usize) -> Result<AssetChunk, String> {
    let (bytes, total_bytes) = asset_io::read_chunk(&ensure_workspace_root(&app)?, &file_name, offset, length)?;
    Ok(AssetChunk { bytes, total_bytes })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            get_workspace_paths,
            begin_asset_upload,
            append_asset_upload,
            finish_asset_upload,
            abort_asset_upload,
            read_asset_chunk,
            save_project_json,
            load_project_json,
            translate_polyglot_script,
            eval_engine_script,
            write_workspace_file,
            read_workspace_file,
            export_scene_yaml,
            import_scene_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running MooVN Studio Tauri v2 middleware");
}
