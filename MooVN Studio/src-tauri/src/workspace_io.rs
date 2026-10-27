//! Confined, atomic workspace file operations shared by Tauri commands.
//! The caller supplies an application-owned root; names are always basenames.
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const SUBDIRECTORIES: &[&str] = &["Projects", "Exports", "Cache", "Assets"];
pub const MAX_PROJECT_BYTES: usize = 16 * 1024 * 1024;
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn ensure_root(base: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(base).map_err(|e| format!("ERR_WORKSPACE_INIT: {e}"))?;
    let root = base.canonicalize().map_err(|e| format!("ERR_WORKSPACE_CANONICALIZE: {e}"))?;
    for sub in SUBDIRECTORIES {
        let path = root.join(sub);
        fs::create_dir_all(&path).map_err(|e| format!("ERR_WORKSPACE_SUBDIR: {e}"))?;
        let canonical = path.canonicalize().map_err(|e| format!("ERR_SUBDIR_CANONICALIZE: {e}"))?;
        if !canonical.starts_with(&root) {
            return Err("ERR_WORKSPACE_ESCAPE: workspace directory points outside the root".into());
        }
    }
    Ok(root)
}

fn reject_symlink(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Err("ERR_SYMLINK_REJECTED: symbolic links are not workspace files".into()),
        Ok(meta) if !meta.is_file() => Err("ERR_NOT_A_FILE: target is not a regular file".into()),
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("ERR_FILE_METADATA: {e}")),
    }
}

pub fn resolve_file(base: &Path, subdir: &str, name: &str, allowed: &[&str]) -> Result<PathBuf, String> {
    if !SUBDIRECTORIES.contains(&subdir) {
        return Err("ERR_INVALID_SUBDIR: unsupported workspace directory".into());
    }
    if name.trim().is_empty() || name != name.trim() || name.starts_with('.')
        || name.contains("..") || name.contains('/') || name.contains('\\')
        || name.contains(':') || name.contains('\0')
        || name.chars().any(char::is_control)
    {
        return Err("ERR_PATH_TRAVERSAL_REJECTED: expected a single file name".into());
    }
    let ext = Path::new(name).extension().and_then(|s| s.to_str()).unwrap_or("");
    if !allowed.iter().any(|candidate| ext.eq_ignore_ascii_case(candidate)) {
        return Err(format!("ERR_EXTENSION_NOT_ALLOWED: .{ext}"));
    }
    let root = ensure_root(base)?;
    let dir = root.join(subdir).canonicalize().map_err(|e| format!("ERR_SUBDIR_CANONICALIZE: {e}"))?;
    if !dir.starts_with(&root) {
        return Err("ERR_WORKSPACE_ESCAPE: directory points outside workspace".into());
    }
    let target = dir.join(name);
    reject_symlink(&target)?;
    Ok(target)
}

/// Writes to a unique temporary file in the same directory and replaces the target only after fsync.
pub fn atomic_write_file(target: &Path, content: &[u8], max_bytes: usize) -> Result<(), String> {
    if content.len() > max_bytes {
        return Err(format!("ERR_PAYLOAD_TOO_LARGE: {} bytes exceeds {} bytes", content.len(), max_bytes));
    }
    reject_symlink(target)?;
    let parent = target.parent().ok_or("ERR_NO_PARENT_DIR: missing parent")?;
    let file_name = target.file_name().and_then(|s| s.to_str()).ok_or("ERR_INVALID_FILENAME")?;
    let serial = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temporary = parent.join(format!(".{file_name}.tmp.{}.{}", std::process::id(), serial));
    let result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)
            .map_err(|e| format!("ERR_TEMP_CREATE: {e}"))?;
        file.write_all(content).map_err(|e| format!("ERR_TEMP_WRITE: {e}"))?;
        file.sync_all().map_err(|e| format!("ERR_TEMP_FSYNC: {e}"))?;
        drop(file);
        fs::rename(&temporary, target).map_err(|e| format!("ERR_ATOMIC_RENAME: {e}"))?;
        #[cfg(unix)]
        File::open(parent).and_then(|dir| dir.sync_all()).map_err(|e| format!("ERR_DIRECTORY_FSYNC: {e}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Keep the previous committed version as `<name>.bak`; failure to make a backup aborts the save.
pub fn save_project(base: &Path, name: &str, content: &[u8], retain_backup: bool) -> Result<(PathBuf, PathBuf), String> {
    if content.len() > MAX_PROJECT_BYTES {
        return Err(format!("ERR_PAYLOAD_TOO_LARGE: {} bytes exceeds {} bytes", content.len(), MAX_PROJECT_BYTES));
    }
    let target = resolve_file(base, "Projects", name, &["mpvn"])?;
    let backup = target.with_file_name(format!("{name}.bak"));
    reject_symlink(&backup)?;
    if target.exists() && !retain_backup {
        let metadata = fs::metadata(&target).map_err(|e| format!("ERR_READ_PROJECT: {e}"))?;
        if metadata.len() > MAX_PROJECT_BYTES as u64 {
            return Err("ERR_PREVIOUS_FILE_TOO_LARGE: previous project exceeds limit".into());
        }
        let previous = fs::read(&target).map_err(|e| format!("ERR_READ_PROJECT: {e}"))?;
        atomic_write_file(&backup, &previous, MAX_PROJECT_BYTES)?;
    }
    atomic_write_file(&target, content, MAX_PROJECT_BYTES)?;
    Ok((target, backup))
}

pub fn read_bounded(path: &Path, limit: usize) -> Result<String, String> {
    reject_symlink(path)?;
    let meta = fs::metadata(path).map_err(|e| format!("ERR_WORKSPACE_READ: {e}"))?;
    if meta.len() > limit as u64 {
        return Err("ERR_PAYLOAD_TOO_LARGE: file exceeds limit".into());
    }
    fs::read_to_string(path).map_err(|e| format!("ERR_WORKSPACE_READ: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn root() -> PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("moovn-workspace-test-{}-{nonce}", std::process::id()))
    }

    #[test]
    fn saves_one_file_and_previous_backup_and_survives_failed_write() {
        let root = root();
        let (project, backup) = save_project(&root, "story.mpvn", b"first", false).unwrap();
        save_project(&root, "story.mpvn", b"second", false).unwrap();
        assert_eq!(fs::read(&project).unwrap(), b"second");
        assert_eq!(fs::read(&backup).unwrap(), b"first");
        assert!(save_project(&root, "story.mpvn", &vec![0; MAX_PROJECT_BYTES + 1], false).is_err());
        assert_eq!(fs::read(&project).unwrap(), b"second");
        assert_eq!(fs::read(&backup).unwrap(), b"first");
        assert_eq!(fs::read_dir(root.join("Projects")).unwrap().count(), 2);
        // Recovery saves must not replace the good backup with the damaged primary.
        fs::write(&project, b"corrupt-primary").unwrap();
        save_project(&root, "story.mpvn", b"restored", true).unwrap();
        assert_eq!(fs::read(&backup).unwrap(), b"first");
        assert_eq!(fs::read(&project).unwrap(), b"restored");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_traversal_unsupported_extension_and_unwritable_root() {
        let root = root();
        assert!(resolve_file(&root, "Projects", "../../outside.mpvn", &["mpvn"]).is_err());
        assert!(resolve_file(&root, "Projects", "test.exe", &["mpvn"]).is_err());
        assert!(resolve_file(&root, "outside", "test.mpvn", &["mpvn"]).is_err());
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("not-a-directory"), b"x").unwrap();
        assert!(save_project(&root.join("not-a-directory"), "a.mpvn", b"x", false).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_file_and_directory_escape() {
        use std::os::unix::fs::symlink;
        let root = root();
        let outside = root.with_extension("outside");
        fs::create_dir_all(&outside).unwrap();
        ensure_root(&root).unwrap();
        symlink(outside.join("secret"), root.join("Projects").join("link.mpvn")).unwrap();
        assert!(resolve_file(&root, "Projects", "link.mpvn", &["mpvn"]).is_err());
        fs::remove_dir_all(root.join("Assets")).unwrap();
        symlink(&outside, root.join("Assets")).unwrap();
        assert!(ensure_root(&root).is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }
}
