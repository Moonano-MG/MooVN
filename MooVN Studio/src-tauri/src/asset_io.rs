//! Bounded, chunked binary asset I/O. Asset names are content hashes, not user paths.
use crate::workspace_io;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;
pub const MAX_CHUNK_BYTES: usize = 1024 * 1024;
const EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "apng", "mp4", "webm", "mov", "ogv"];
static SERIAL: AtomicU64 = AtomicU64::new(0);

fn asset_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let (hash, ext) = name.split_once('.').ok_or("ERR_ASSET_NAME: missing extension")?;
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        || !EXTENSIONS.contains(&ext) {
        return Err("ERR_ASSET_NAME: invalid content-hash filename".into());
    }
    workspace_io::resolve_file(root, "Assets", name, EXTENSIONS)
}

struct Upload {
    file: File,
    temporary: PathBuf,
    root: PathBuf,
    name: String,
    expected: u64,
    written: u64,
}

#[derive(Default)]
pub struct AssetUploads {
    active: HashMap<String, Upload>,
}

impl AssetUploads {
    pub fn begin(&mut self, root: &Path, name: &str, size: u64) -> Result<String, String> {
        if size == 0 || size > MAX_ASSET_BYTES {
            return Err(format!("ERR_ASSET_SIZE: asset size must be between 1 and {MAX_ASSET_BYTES} bytes"));
        }
        if self.active.len() >= 4 {
            return Err("ERR_ASSET_UPLOAD: too many concurrent uploads".into());
        }
        let target = asset_path(root, name)?;
        let serial = SERIAL.fetch_add(1, Ordering::Relaxed);
        let token = format!("{}-{serial}", std::process::id());
        let temporary = target.with_file_name(format!(".{name}.upload.{token}"));
        let file = OpenOptions::new().write(true).create_new(true).open(&temporary)
            .map_err(|e| format!("ERR_ASSET_CREATE: {e}"))?;
        self.active.insert(token.clone(), Upload { file, temporary, root: root.to_path_buf(), name: name.into(), expected: size, written: 0 });
        Ok(token)
    }

    pub fn append(&mut self, token: &str, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty() || bytes.len() > MAX_CHUNK_BYTES {
            return Err("ERR_ASSET_CHUNK: invalid chunk length".into());
        }
        let upload = self.active.get_mut(token).ok_or("ERR_ASSET_UPLOAD: unknown upload")?;
        if upload.written + bytes.len() as u64 > upload.expected {
            return Err("ERR_ASSET_SIZE: upload exceeded expected size".into());
        }
        upload.file.write_all(bytes).map_err(|e| format!("ERR_ASSET_WRITE: {e}"))?;
        upload.written += bytes.len() as u64;
        Ok(())
    }

    pub fn abort(&mut self, token: &str) {
        if let Some(upload) = self.active.remove(token) {
            drop(upload.file);
            let _ = fs::remove_file(upload.temporary);
        }
    }

    pub fn finish(&mut self, token: &str) -> Result<String, String> {
        let upload = self.active.remove(token).ok_or("ERR_ASSET_UPLOAD: unknown upload")?;
        let Upload { file, temporary, root, name, expected, written } = upload;
        if written != expected {
            drop(file);
            let _ = fs::remove_file(&temporary);
            return Err("ERR_ASSET_SIZE: upload incomplete".into());
        }
        let sync_result = file.sync_all();
        drop(file); // Windows cannot reliably rename or delete an open upload handle.
        let result = (|| -> Result<String, String> {
            sync_result.map_err(|e| format!("ERR_ASSET_FSYNC: {e}"))?;
            let target = asset_path(&root, &name)?;
            fs::rename(&temporary, &target).map_err(|e| format!("ERR_ASSET_RENAME: {e}"))?;
            #[cfg(unix)]
            File::open(target.parent().ok_or("ERR_ASSET_PARENT")?).and_then(|dir| dir.sync_all())
                .map_err(|e| format!("ERR_ASSET_DIRECTORY_FSYNC: {e}"))?;
            Ok(target.to_string_lossy().into_owned())
        })();
        if result.is_err() { let _ = fs::remove_file(&temporary); }
        result
    }
}

pub fn read_chunk(root: &Path, name: &str, offset: u64, length: usize) -> Result<(Vec<u8>, u64), String> {
    if length == 0 || length > MAX_CHUNK_BYTES {
        return Err("ERR_ASSET_CHUNK: invalid read size".into());
    }
    let target = asset_path(root, name)?;
    let mut file = File::open(target).map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
    let size = file.metadata().map_err(|e| format!("ERR_ASSET_READ: {e}"))?.len();
    if size > MAX_ASSET_BYTES || offset > size {
        return Err("ERR_ASSET_SIZE: invalid asset size or offset".into());
    }
    file.seek(SeekFrom::Start(offset)).map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
    let mut bytes = vec![0; std::cmp::min(length as u64, size - offset) as usize];
    file.read_exact(&mut bytes).map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
    Ok((bytes, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    fn root() -> PathBuf {
        let n = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("moovn-assets-{}-{n}", std::process::id()))
    }
    #[test]
    fn stores_and_reads_50_mib_without_embedding_in_a_project() {
        let root = root();
        let name = format!("{}.mp4", "a".repeat(64));
        let mut uploads = AssetUploads::default();
        let token = uploads.begin(&root, &name, 50 * 1024 * 1024).unwrap();
        let chunk = vec![42; MAX_CHUNK_BYTES];
        for _ in 0..50 { uploads.append(&token, &chunk).unwrap(); }
        uploads.finish(&token).unwrap();
        let (first, total) = read_chunk(&root, &name, 0, MAX_CHUNK_BYTES).unwrap();
        assert_eq!(total, 50 * 1024 * 1024);
        assert_eq!(first, chunk);
        let (last, _) = read_chunk(&root, &name, total - 3, 3).unwrap();
        assert_eq!(last, vec![42; 3]);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_oversize_invalid_names_incomplete_uploads_and_traversal() {
        let root = root();
        let mut uploads = AssetUploads::default();
        let valid = format!("{}.png", "b".repeat(64));
        assert!(uploads.begin(&root, "../../evil.mp4", 10).is_err());
        assert!(uploads.begin(&root, &valid, MAX_ASSET_BYTES + 1).is_err());
        let token = uploads.begin(&root, &valid, 4).unwrap();
        uploads.append(&token, &[1, 2]).unwrap();
        assert!(uploads.finish(&token).is_err());
        assert!(read_chunk(&root, &valid, 0, 2).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
