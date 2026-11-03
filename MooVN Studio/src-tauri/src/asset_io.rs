//! Bounded, chunked binary asset I/O. Asset names are content hashes, not user paths.
use crate::workspace_io;
use sha2::{Digest, Sha256};
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

/// Hash the actual file on disk, with a bounded read, not the bytes supplied by
/// the caller. A matching filename is a content address, not proof of integrity.
fn verify_file(file: &mut File, name: &str, expected: u64) -> Result<(), String> {
    let metadata = file.metadata().map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
    if !metadata.is_file() || metadata.len() != expected || expected == 0 || expected > MAX_ASSET_BYTES {
        return Err("ERR_ASSET_SIZE: 资源大小与预期不符".into());
    }
    file.seek(SeekFrom::Start(0)).map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let read = file.read(&mut buffer).map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
        if read == 0 { break; }
        total += read as u64;
        if total > expected { return Err("ERR_ASSET_SIZE: 读取期间资源大小发生变化".into()); }
        digest.update(&buffer[..read]);
    }
    if total != expected { return Err("ERR_ASSET_SIZE: 资源读取不完整".into()); }
    let actual = format!("{:x}", digest.finalize());
    let expected_hash = name.split_once('.').ok_or("ERR_ASSET_NAME: missing extension")?.0;
    if actual != expected_hash {
        return Err("ERR_ASSET_HASH_MISMATCH: 资源内容与名称的 SHA-256 不一致，未覆盖已有文件".into());
    }
    Ok(())
}

fn remove_temporary(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("ERR_ASSET_CLEANUP: 上传临时文件未清理（{}）：{e}", path.display())),
    }
}

#[cfg(unix)]
fn sync_asset_directory(target: &Path) -> Result<(), String> {
    File::open(target.parent().ok_or("ERR_ASSET_PARENT")?).and_then(|dir| dir.sync_all())
        .map_err(|e| format!("ERR_ASSET_DIRECTORY_FSYNC: 资源可能已提交，请检查后重试：{e}"))
}

#[cfg(not(unix))]
fn sync_asset_directory(_target: &Path) -> Result<(), String> { Ok(()) }

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
        let file = OpenOptions::new().read(true).write(true).create_new(true).open(&temporary)
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

    pub fn abort(&mut self, token: &str) -> Result<(), String> {
        if let Some(upload) = self.active.remove(token) {
            drop(upload.file);
            remove_temporary(&upload.temporary)?;
        }
        Ok(())
    }

    pub fn finish(&mut self, token: &str) -> Result<String, String> {
        let upload = self.active.remove(token).ok_or("ERR_ASSET_UPLOAD: unknown upload")?;
        let Upload { mut file, temporary, root, name, expected, written } = upload;
        let verified = (|| -> Result<(), String> {
            if written != expected { return Err("ERR_ASSET_SIZE: upload incomplete".into()); }
            file.sync_all().map_err(|e| format!("ERR_ASSET_FSYNC: {e}"))?;
            verify_file(&mut file, &name, expected)
        })();
        drop(file); // Windows cannot reliably link or delete an open upload handle.

        let result = verified.and_then(|()| {
            let target = asset_path(&root, &name)?;
            // A same-directory hard link creates the final name atomically and
            // fails if it already exists; rename would replace the old asset.
            // Filesystems without hard links fail closed rather than overwrite.
            let created = match fs::hard_link(&temporary, &target) {
                Ok(()) => true,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => false,
                Err(e) => return Err(format!("ERR_ASSET_COMMIT: 无法不覆盖旧资源地提交文件；请检查文件系统是否支持硬链接及写入权限：{e}")),
            };
            // Another importer may have committed first, or a path may have
            // changed since temporary-file verification. Check the final name in
            // both cases; do not delete it on failure since someone may use it.
            let checked = (|| -> Result<(), String> {
                let final_path = asset_path(&root, &name)?;
                let mut final_file = File::open(final_path).map_err(|e| format!("ERR_ASSET_READ: {e}"))?;
                verify_file(&mut final_file, &name, expected)
            })();
            if let Err(reason) = checked {
                return Err(if created {
                    format!("ERR_ASSET_COMMIT_VERIFY: 提交后的资源未通过校验，文件已保留；请备份并检查工作区 Assets：{reason}")
                } else {
                    format!("ERR_ASSET_CONFLICT: 同名资源内容不符，原文件已保留；请备份并检查工作区 Assets：{reason}")
                });
            }
            // If this fails, the verified link may already exist. Report that
            // uncertainty and never delete it: another importer may be using it.
            sync_asset_directory(&target)?;
            Ok(target.to_string_lossy().into_owned())
        });
        let cleanup = remove_temporary(&temporary);
        match (result, cleanup) {
            (Ok(path), Ok(())) => Ok(path),
            (Err(error), Ok(())) => Err(error),
            (Ok(_), Err(cleanup_error)) => Err(format!("{cleanup_error}；资源可能已提交，请检查后重试")),
            (Err(error), Err(cleanup_error)) => Err(format!("{error}；{cleanup_error}")),
        }
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
        // SHA-256 of 50 MiB of byte 42, independently checked with Node crypto.
        let name = "0ee242e5d5f722d0a764532d5a59311eacff9cf6146deaee4d19aeaae1c0c6be.mp4";
        let mut uploads = AssetUploads::default();
        let token = uploads.begin(&root, name, 50 * 1024 * 1024).unwrap();
        let chunk = vec![42; MAX_CHUNK_BYTES];
        for _ in 0..50 { uploads.append(&token, &chunk).unwrap(); }
        uploads.finish(&token).unwrap();
        let (first, total) = read_chunk(&root, name, 0, MAX_CHUNK_BYTES).unwrap();
        assert_eq!(total, 50 * 1024 * 1024);
        assert_eq!(first, chunk);
        let (last, _) = read_chunk(&root, name, total - 3, 3).unwrap();
        assert_eq!(last, vec![42; 3]);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn a_mismatched_upload_must_not_replace_an_existing_asset() {
        // SHA-256 of the original bytes `abc`. All files live in a disposable test root.
        let root = root();
        let name = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.png";
        let mut uploads = AssetUploads::default();
        let first = uploads.begin(&root, name, 3).unwrap();
        uploads.append(&first, b"abc").unwrap();
        uploads.finish(&first).unwrap();

        let replacement = uploads.begin(&root, name, 3).unwrap();
        uploads.append(&replacement, b"BAD").unwrap();
        let result = uploads.finish(&replacement);
        let remaining = fs::read(root.join("Assets").join(name)).unwrap();
        fs::remove_dir_all(root).unwrap();

        assert_eq!(remaining, b"abc", "the committed original must be retained");
        assert!(result.is_err(), "a mismatched upload was accepted: {result:?}");
    }

    const ABC_NAME: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.png";

    fn upload(uploads: &mut AssetUploads, root: &Path, bytes: &[u8]) -> Result<String, String> {
        let token = uploads.begin(root, ABC_NAME, bytes.len() as u64)?;
        uploads.append(&token, bytes)?;
        uploads.finish(&token)
    }

    #[test]
    fn mismatched_new_upload_is_rejected_and_leaves_no_asset_or_temporary() {
        let root = root();
        let mut uploads = AssetUploads::default();
        let error = upload(&mut uploads, &root, b"BAD").unwrap_err();
        assert!(error.starts_with("ERR_ASSET_HASH_MISMATCH"), "{error}");
        assert!(!root.join("Assets").join(ABC_NAME).exists());
        assert_eq!(fs::read_dir(root.join("Assets")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_temporary_file_is_read_back_before_commit() {
        let root = root();
        let mut uploads = AssetUploads::default();
        let token = uploads.begin(&root, ABC_NAME, 3).unwrap();
        uploads.append(&token, b"abc").unwrap();
        let temp = uploads.active.get(&token).unwrap().temporary.clone();
        // Simulate a changed temporary file, not merely a bad input buffer.
        fs::write(&temp, b"BAD").unwrap();
        let error = uploads.finish(&token).unwrap_err();
        assert!(error.starts_with("ERR_ASSET_HASH_MISMATCH"), "{error}");
        assert!(!root.join("Assets").join(ABC_NAME).exists());
        assert!(!temp.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn identical_upload_reuses_the_original_and_corrupt_conflicts_are_preserved() {
        let root = root();
        let mut uploads = AssetUploads::default();
        let first_path = upload(&mut uploads, &root, b"abc").unwrap();
        let path = root.join("Assets").join(ABC_NAME);
        #[cfg(unix)]
        let before = {
            use std::os::unix::fs::MetadataExt;
            fs::metadata(&path).unwrap().ino()
        };
        assert_eq!(upload(&mut uploads, &root, b"abc").unwrap(), first_path);
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            assert_eq!(fs::metadata(&path).unwrap().ino(), before, "duplicate must not replace the file");
        }
        assert_eq!(fs::read(&path).unwrap(), b"abc");

        // The conflict may already exist, or arrive while the upload is in progress.
        let token = uploads.begin(&root, ABC_NAME, 3).unwrap();
        uploads.append(&token, b"abc").unwrap();
        fs::write(&path, b"BAD").unwrap();
        let error = uploads.finish(&token).unwrap_err();
        assert!(error.starts_with("ERR_ASSET_CONFLICT"), "{error}");
        assert_eq!(fs::read(&path).unwrap(), b"BAD", "even damaged pre-existing data is not silently replaced");
        assert_eq!(fs::read_dir(root.join("Assets")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn simultaneous_independent_uploads_do_not_clobber_each_other() {
        use std::sync::{Arc, Barrier};
        use std::thread;
        let root = root();
        workspace_io::ensure_root(&root).unwrap();
        let barrier = Arc::new(Barrier::new(8));
        let workers: Vec<_> = (0..8).map(|_| {
            let root = root.clone();
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                let mut uploads = AssetUploads::default();
                let token = uploads.begin(&root, ABC_NAME, 3).unwrap();
                uploads.append(&token, b"abc").unwrap();
                barrier.wait();
                uploads.finish(&token)
            })
        }).collect();
        for worker in workers { worker.join().unwrap().unwrap(); }
        assert_eq!(fs::read(root.join("Assets").join(ABC_NAME)).unwrap(), b"abc");
        assert_eq!(fs::read_dir(root.join("Assets")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_appearing_before_commit_is_not_followed_or_overwritten() {
        use std::os::unix::fs::symlink;
        let root = root();
        let outside = root.with_extension("outside");
        fs::write(&outside, b"outside-data").unwrap();
        let mut uploads = AssetUploads::default();
        let token = uploads.begin(&root, ABC_NAME, 3).unwrap();
        uploads.append(&token, b"abc").unwrap();
        let target = root.join("Assets").join(ABC_NAME);
        symlink(&outside, &target).unwrap();
        assert!(uploads.finish(&token).is_err());
        assert!(fs::symlink_metadata(&target).unwrap().file_type().is_symlink());
        assert_eq!(fs::read(&outside).unwrap(), b"outside-data");
        fs::remove_dir_all(root).unwrap();
        fs::remove_file(outside).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn reports_cleanup_failure_instead_of_hiding_it() {
        let root = root();
        let mut uploads = AssetUploads::default();
        let token = uploads.begin(&root, ABC_NAME, 3).unwrap();
        uploads.append(&token, b"abc").unwrap();
        let temp = uploads.active.get(&token).unwrap().temporary.clone();
        let moved = root.join("moved-upload");
        fs::rename(&temp, &moved).unwrap();
        fs::create_dir(&temp).unwrap();
        let error = uploads.finish(&token).unwrap_err();
        assert!(error.contains("ERR_ASSET_CLEANUP"), "{error}");
        assert!(!root.join("Assets").join(ABC_NAME).exists());
        assert_eq!(fs::read(moved).unwrap(), b"abc");
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
        let aborted = uploads.begin(&root, &valid, 4).unwrap();
        uploads.abort(&aborted).unwrap();
        uploads.abort(&aborted).unwrap(); // cleanup after finish or a repeated abort is harmless
        assert_eq!(fs::read_dir(root.join("Assets")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
}
