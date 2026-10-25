use moovn_engine::{MooVNEngineRuntime, PolyglotTranslator, SourceLanguage};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static ENGINE_RUNTIME: Mutex<Option<MooVNEngineRuntime>> = Mutex::new(None);

const ALLOWED_WORKSPACE_SUBDIRS: &[&str] = &["Projects", "Exports", "Cache", "Assets"];
const MAX_PAYLOAD_BYTES: usize = 16 * 1024 * 1024; // 16 MiB limit

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

fn ensure_workspace_root() -> Result<PathBuf, String> {
    let base = std::env::current_dir()
        .map_err(|e| format!("ERR_WORKSPACE_CWD: {}", e))?
        .join("MooVN_Workspace");
    fs::create_dir_all(&base).map_err(|e| format!("ERR_WORKSPACE_INIT: {}", e))?;
    for sub in ALLOWED_WORKSPACE_SUBDIRS {
        let p = base.join(sub);
        fs::create_dir_all(&p).map_err(|e| format!("ERR_WORKSPACE_SUBDIR: {}", e))?;
    }
    base.canonicalize()
        .map_err(|e| format!("ERR_WORKSPACE_CANONICALIZE: {}", e))
}

/// Validates and resolves a file path strictly inside `MooVN_Workspace/<subdir>/<file_name>`.
/// Rejects path traversal (`..`), path separators, null bytes, and unapproved file extensions.
pub fn resolve_safe_workspace_file(
    subdir: &str,
    raw_file_name: &str,
    allowed_exts: &[&str],
) -> Result<PathBuf, String> {
    if !ALLOWED_WORKSPACE_SUBDIRS.contains(&subdir) {
        return Err(format!(
            "ERR_INVALID_SUBDIR: '{}' is not an allowed workspace directory",
            subdir
        ));
    }

    let trimmed = raw_file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains(':')
        || trimmed.contains('\0')
    {
        return Err("ERR_PATH_TRAVERSAL_REJECTED: file name must be a single relative basename within the workspace".to_string());
    }

    let has_valid_ext = allowed_exts.iter().any(|ext| {
        trimmed
            .to_ascii_lowercase()
            .ends_with(&format!(".{}", ext.to_ascii_lowercase()))
    });
    if !has_valid_ext {
        return Err(format!(
            "ERR_EXTENSION_NOT_ALLOWED: '{}' must end with one of {:?}",
            trimmed, allowed_exts
        ));
    }

    let root = ensure_workspace_root()?;
    let target_dir = root
        .join(subdir)
        .canonicalize()
        .map_err(|e| format!("ERR_SUBDIR_CANONICALIZE: {}", e))?;

    if !target_dir.starts_with(&root) {
        return Err("ERR_WORKSPACE_ESCAPE: target directory escaped workspace root".to_string());
    }

    let full_path = target_dir.join(trimmed);
    if full_path.parent() != Some(target_dir.as_path()) {
        return Err("ERR_WORKSPACE_ESCAPE: resolved file parent mismatch".to_string());
    }

    Ok(full_path)
}

/// Performs an atomic file write (`temp -> flush & sync_all -> rename`) so crashes or power loss
/// never leave a truncated or corrupted project file on disk.
pub fn atomic_write_file(target: &Path, content: &[u8]) -> Result<(), String> {
    if content.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "ERR_PAYLOAD_TOO_LARGE: payload ({} bytes) exceeds limit ({} bytes)",
            content.len(),
            MAX_PAYLOAD_BYTES
        ));
    }

    let parent = target
        .parent()
        .ok_or_else(|| "ERR_NO_PARENT_DIR: target path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("ERR_CREATE_DIR: {}", e))?;

    let file_name = target
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "ERR_INVALID_FILENAME".to_string())?;
    let tmp_path = parent.join(format!(".{}.tmp.{}", file_name, std::process::id()));

    {
        let mut tmp_file =
            File::create(&tmp_path).map_err(|e| format!("ERR_TEMP_CREATE: {}", e))?;
        tmp_file
            .write_all(content)
            .map_err(|e| format!("ERR_TEMP_WRITE: {}", e))?;
        tmp_file
            .sync_all()
            .map_err(|e| format!("ERR_TEMP_FSYNC: {}", e))?;
    }

    fs::rename(&tmp_path, target).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("ERR_ATOMIC_RENAME: {}", e)
    })?;

    Ok(())
}

fn sanitize_project_slug(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_');
    if trimmed.is_empty() {
        "moovn_project".to_string()
    } else {
        trimmed.chars().take(64).collect()
    }
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
    project_id: Option<String>,
    payload: String,
) -> Result<SaveProjectResult, String> {
    if payload.trim().is_empty() {
        return Err("ERR_EMPTY_PAYLOAD: project JSON cannot be empty".to_string());
    }
    // Validate JSON syntax before touching disk
    let parsed: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|e| format!("ERR_INVALID_JSON: project payload is not valid JSON ({})", e))?;

    let inferred_id = project_id
        .or_else(|| {
            parsed
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "moovn_project".to_string());

    let slug = sanitize_project_slug(&inferred_id);
    let primary_name = format!("{}.mpvn", slug);
    let backup_name = format!("{}.bak.mpvn", slug);

    let primary_path = resolve_safe_workspace_file("Projects", &primary_name, &["mpvn", "json"])?;
    let backup_path = resolve_safe_workspace_file("Projects", &backup_name, &["mpvn", "json"])?;

    // If a primary file already exists, copy it to `.bak.mpvn` before overwriting
    if primary_path.exists() {
        if let Ok(existing_bytes) = fs::read(&primary_path) {
            let _ = atomic_write_file(&backup_path, &existing_bytes);
        }
    }

    let bytes = payload.as_bytes();
    atomic_write_file(&primary_path, bytes)?;

    Ok(SaveProjectResult {
        ok: true,
        path: primary_path.to_string_lossy().to_string(),
        backup_path: backup_path.to_string_lossy().to_string(),
        bytes_written: bytes.len(),
        saved_at_epoch_ms: current_epoch_ms(),
    })
}

#[tauri::command]
fn load_project_json(project_id: String) -> Result<String, String> {
    let slug = sanitize_project_slug(&project_id);
    let primary_name = format!("{}.mpvn", slug);
    let backup_name = format!("{}.bak.mpvn", slug);

    let primary_path = resolve_safe_workspace_file("Projects", &primary_name, &["mpvn", "json"])?;
    let backup_path = resolve_safe_workspace_file("Projects", &backup_name, &["mpvn", "json"])?;

    if primary_path.exists() {
        match fs::read_to_string(&primary_path) {
            Ok(content) if serde_json::from_str::<serde_json::Value>(&content).is_ok() => {
                return Ok(content);
            }
            _ => {}
        }
    }

    if backup_path.exists() {
        let backup_content = fs::read_to_string(&backup_path)
            .map_err(|e| format!("ERR_READ_BACKUP: {}", e))?;
        let _: serde_json::Value = serde_json::from_str(&backup_content)
            .map_err(|e| format!("ERR_CORRUPT_BACKUP: {}", e))?;
        return Ok(backup_content);
    }

    Err(format!("ERR_PROJECT_NOT_FOUND: no saved project found for '{}'", slug))
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
fn eval_engine_script(source_code: String, lang: String) -> Result<Vec<String>, String> {
    if source_code.len() > MAX_PAYLOAD_BYTES {
        return Err("ERR_SCRIPT_TOO_LARGE".to_string());
    }
    let mut guard = ENGINE_RUNTIME
        .lock()
        .map_err(|_| "ERR_ENGINE_LOCK_POISONED".to_string())?;
    let rt = guard.get_or_insert_with(MooVNEngineRuntime::new);
    Ok(rt.eval_polyglot_script(&source_code, SourceLanguage::from_tag(&lang)))
}

#[tauri::command]
fn export_scene_yaml(file_name: String, yaml_content: String) -> Result<String, String> {
    let target = resolve_safe_workspace_file("Projects", &file_name, &["yaml", "yml"])?;
    atomic_write_file(&target, yaml_content.as_bytes())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn import_scene_yaml(file_name: String) -> Result<String, String> {
    let target = resolve_safe_workspace_file("Projects", &file_name, &["yaml", "yml"])?;
    fs::read_to_string(&target).map_err(|e| format!("ERR_YAML_READ: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            save_project_json,
            load_project_json,
            translate_polyglot_script,
            eval_engine_script,
            export_scene_yaml,
            import_scene_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running MooVN Studio Tauri v2 middleware");
}
