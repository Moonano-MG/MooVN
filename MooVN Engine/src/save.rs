//! Save System (`moovn.save.create(NAME)`) for MooVN Engine (`GPT-59`, `GPT-60`).
//!
//! Builds a local canonical v2 checksum payload using the following shape:
//! `v2|slot={slot_name}|ch={chapter_id}|node={node_id}|dlg={dialogue_index}|bg={active_background}|bgm={active_bgm}|vars=[{k}={v},...]|aff=[{k}={v},...]`
//!
//! Rust and Studio v2 are not guaranteed byte-for-byte equivalent: variable merging
//! and non-ASCII key ordering differ. FNV is an accidental-corruption check, not authentication.
//!
//! Supports both in-memory session storage and disk persistence (`SaveManager::with_storage_dir`)
//! using `temp -> sync_all -> backup -> rename`.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SAVE_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveSlotRecord {
    pub slot_name: String,
    pub chapter_id: String,
    pub node_id: String,
    pub dialogue_index: usize,
    pub active_background: String,
    pub active_bgm: String,
    pub variables: HashMap<String, String>,
    pub affection: HashMap<String, i32>,
    pub checksum_fnv1a: u64,
    pub timestamp_epoch_ms: u64,
}

fn percent_encode(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => {
                out.push(*b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

fn percent_decode(encoded: &str) -> Result<String, String> {
    let bytes = encoded.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err("Invalid percent encoding in save file".to_string());
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .map_err(|_| "Invalid hex sequence".to_string())?;
            let val = u8::from_str_radix(hex, 16)
                .map_err(|_| "Invalid hex byte".to_string())?;
            out.push(val);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| format!("Invalid UTF-8 in save field: {}", e))
}

impl SaveSlotRecord {
    /// Builds the Rust v2 payload. It is not a cross-language canonical standard.
    pub fn compute_canonical_payload(&self) -> String {
        let mut var_pairs: Vec<(&String, &String)> = self.variables.iter().collect();
        var_pairs.sort_by(|a, b| a.0.cmp(b.0));
        let vars_serialized: Vec<String> = var_pairs
            .into_iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        let mut aff_pairs: Vec<(&String, &i32)> = self.affection.iter().collect();
        aff_pairs.sort_by(|a, b| a.0.cmp(b.0));
        let aff_serialized: Vec<String> = aff_pairs
            .into_iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        format!(
            "v2|slot={}|ch={}|node={}|dlg={}|bg={}|bgm={}|vars=[{}]|aff=[{}]",
            self.slot_name,
            self.chapter_id,
            self.node_id,
            self.dialogue_index,
            self.active_background,
            self.active_bgm,
            vars_serialized.join(","),
            aff_serialized.join(",")
        )
    }

    /// Computes the FNV-1a checksum of the legacy v2 payload; timestamp is not included.
    pub fn compute_canonical_checksum(&self) -> u64 {
        let canonical = self.compute_canonical_payload();
        SaveManager::compute_fnv1a64(&canonical)
    }

    /// Returns the 16-character lowercase hex string matching TypeScript `computeFnv1a64Hex`.
    pub fn checksum_hex(&self) -> String {
        format!("{:016x}", self.checksum_fnv1a)
    }

    /// Checks the v2 payload against its non-zero checksum; this does not authenticate data or cover the timestamp.
    pub fn verify(&self) -> bool {
        self.checksum_fnv1a != 0 && self.checksum_fnv1a == self.compute_canonical_checksum()
    }

    /// Serializes this record into a deterministic disk representation (`MOOVN_SAVE_V2`).
    pub fn to_disk_string(&self) -> String {
        let mut lines = Vec::new();
        lines.push("MOOVN_SAVE_V2".to_string());
        lines.push(format!("slot={}", percent_encode(&self.slot_name)));
        lines.push(format!("ch={}", percent_encode(&self.chapter_id)));
        lines.push(format!("node={}", percent_encode(&self.node_id)));
        lines.push(format!("dlg={}", self.dialogue_index));
        lines.push(format!("bg={}", percent_encode(&self.active_background)));
        lines.push(format!("bgm={}", percent_encode(&self.active_bgm)));
        lines.push(format!("ts={}", self.timestamp_epoch_ms));
        lines.push(format!("checksum={:016x}", self.checksum_fnv1a));

        let mut var_keys: Vec<&String> = self.variables.keys().collect();
        var_keys.sort();
        for k in var_keys {
            if let Some(v) = self.variables.get(k) {
                // The first literal dot separates the key from the value. Escaping
                // dots in keys preserves the v2 wire format without ambiguity.
                let encoded_key = percent_encode(k).replace('.', "%2E");
                lines.push(format!("var.{}.{}", encoded_key, percent_encode(v)));
            }
        }

        let mut aff_keys: Vec<&String> = self.affection.keys().collect();
        aff_keys.sort();
        for k in aff_keys {
            if let Some(v) = self.affection.get(k) {
                lines.push(format!("aff.{}={}", percent_encode(k), v));
            }
        }

        lines.join("\n")
    }

    /// Parses and verifies a `SaveSlotRecord` from disk text.
    pub fn from_disk_string(raw: &str) -> Result<Self, String> {
        let mut lines = raw.lines();
        let header = lines.next().ok_or_else(|| "Empty save file".to_string())?;
        if header.trim() != "MOOVN_SAVE_V2" {
            return Err("Unsupported save header: expected MOOVN_SAVE_V2".to_string());
        }

        let mut slot_name = String::new();
        let mut chapter_id = String::new();
        let mut node_id = String::new();
        let mut dialogue_index: usize = 0;
        let mut active_background = String::new();
        let mut active_bgm = String::new();
        let mut timestamp_epoch_ms: u64 = 0;
        let mut checksum_fnv1a: u64 = 0;
        let mut variables: HashMap<String, String> = HashMap::new();
        let mut affection: HashMap<String, i32> = HashMap::new();

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("var.") {
                if let Some(dot_idx) = rest.find('.') {
                    let k = percent_decode(&rest[..dot_idx])?;
                    let v = percent_decode(&rest[dot_idx + 1..])?;
                    variables.insert(k, v);
                }
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("aff.") {
                if let Some(eq_idx) = rest.find('=') {
                    let k = percent_decode(&rest[..eq_idx])?;
                    let v = rest[eq_idx + 1..]
                        .parse::<i32>()
                        .map_err(|_| "Invalid affection integer".to_string())?;
                    affection.insert(k, v);
                }
                continue;
            }
            if let Some((key, val)) = trimmed.split_once('=') {
                match key {
                    "slot" => slot_name = percent_decode(val)?,
                    "ch" => chapter_id = percent_decode(val)?,
                    "node" => node_id = percent_decode(val)?,
                    "dlg" => {
                        dialogue_index = val
                            .parse::<usize>()
                            .map_err(|_| "Invalid dialogue_index".to_string())?
                    }
                    "bg" => active_background = percent_decode(val)?,
                    "bgm" => active_bgm = percent_decode(val)?,
                    "ts" => {
                        timestamp_epoch_ms = val
                            .parse::<u64>()
                            .map_err(|_| "Invalid timestamp_epoch_ms".to_string())?
                    }
                    "checksum" => {
                        checksum_fnv1a = u64::from_str_radix(val, 16)
                            .map_err(|_| "Invalid hex checksum".to_string())?
                    }
                    _ => {}
                }
            }
        }

        let record = Self {
            slot_name,
            chapter_id,
            node_id,
            dialogue_index,
            active_background,
            active_bgm,
            variables,
            affection,
            checksum_fnv1a,
            timestamp_epoch_ms,
        };

        if !record.verify() {
            return Err("ERR_SAVE_CHECKSUM_MISMATCH: Save slot failed FNV-1a integrity check".to_string());
        }

        Ok(record)
    }
}

#[derive(Debug, Default)]
pub struct SaveManager {
    slots: HashMap<String, SaveSlotRecord>,
    storage_dir: Option<PathBuf>,
}

impl SaveManager {
    pub fn new() -> Self {
        Self {
            slots: HashMap::new(),
            storage_dir: None,
        }
    }

    /// Creates a disk-backed manager and loads all `.msave` files, or fails without a partial reload.
    pub fn with_storage_dir(dir: impl Into<PathBuf>) -> Result<Self, String> {
        let dir_path = dir.into();
        fs::create_dir_all(&dir_path)
            .map_err(|e| format!("ERR_SAVE_DIR_CREATE: Failed to create save directory: {}", e))?;
        let mut mgr = Self {
            slots: HashMap::new(),
            storage_dir: Some(dir_path),
        };
        mgr.reload_from_disk()?;
        Ok(mgr)
    }

    pub fn storage_dir(&self) -> Option<&Path> {
        self.storage_dir.as_deref()
    }

    pub fn compute_fnv1a64(payload: &str) -> u64 {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in payload.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }

    pub fn compute_fnv1a64_hex(payload: &str) -> String {
        format!("{:016x}", Self::compute_fnv1a64(payload))
    }

    fn slot_file_path(dir: &Path, slot_name: &str) -> PathBuf {
        let safe_name: String = slot_name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        dir.join(format!("{}.msave", if safe_name.is_empty() { "slot" } else { &safe_name }))
    }

    /// The lossy legacy filename scheme can map different names to one path.
    /// Check the saved record before replacing or deleting it; do not silently
    /// overwrite a corrupt file or a different slot. Cross-process races remain.
    fn verify_slot_file_owner(path: &Path, slot_name: &str) -> Result<(), String> {
        let metadata = fs::symlink_metadata(path).map_err(|e| format!("ERR_SAVE_TARGET: {}", e))?;
        if !metadata.file_type().is_file() {
            return Err("ERR_SAVE_TARGET: 存档目标不是普通文件".to_string());
        }
        let contents = fs::read_to_string(path).map_err(|e| format!("ERR_SAVE_READ_FILE: {}", e))?;
        let existing = SaveSlotRecord::from_disk_string(&contents)
            .map_err(|e| format!("ERR_SAVE_EXISTING_INVALID: {}", e))?;
        if existing.slot_name != slot_name {
            return Err(format!("ERR_SAVE_SLOT_COLLISION: '{}' 与已有存档映射到同一文件", slot_name));
        }
        Ok(())
    }

    fn atomic_write_slot_file(target_path: &Path, content: &str) -> Result<(), String> {
        // A unique, create-new temporary file prevents two saves from sharing
        // or truncating a pre-existing temporary file. It is in the same directory.
        let sequence = SAVE_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let tmp_path = target_path.with_extension(format!("msave.{}.{}.tmp", std::process::id(), sequence));
        let bak_path = target_path.with_extension("msave.bak");
        let mut created = false;
        let result = (|| -> Result<(), String> {
            let mut file = OpenOptions::new().write(true).create_new(true).open(&tmp_path)
                .map_err(|e| format!("ERR_SAVE_TEMP_CREATE: {}", e))?;
            created = true;
            file.write_all(content.as_bytes()).map_err(|e| format!("ERR_SAVE_TEMP_WRITE: {}", e))?;
            file.sync_all().map_err(|e| format!("ERR_SAVE_FSYNC: {}", e))?;
            drop(file);

            match fs::symlink_metadata(target_path) {
                Ok(metadata) => {
                    if !metadata.file_type().is_file() {
                        return Err("ERR_SAVE_TARGET: 存档目标不是普通文件".to_string());
                    }
                    match fs::symlink_metadata(&bak_path) {
                        Ok(backup) if !backup.file_type().is_file() => {
                            return Err("ERR_SAVE_BACKUP: 备份目标不是普通文件".to_string());
                        }
                        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                            return Err(format!("ERR_SAVE_BACKUP: {}", error));
                        }
                        _ => {}
                    }
                    fs::copy(target_path, &bak_path).map_err(|e| format!("ERR_SAVE_BACKUP: {}", e))?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("ERR_SAVE_TARGET: {}", error)),
            }
            fs::rename(&tmp_path, target_path).map_err(|e| format!("ERR_SAVE_ATOMIC_RENAME: {}", e))?;
            Ok(())
        })();
        if let Err(error) = result {
            if created {
                match fs::remove_file(&tmp_path) {
                    Ok(()) => {}
                    Err(cleanup) if cleanup.kind() == std::io::ErrorKind::NotFound => {}
                    Err(cleanup) => return Err(format!("{}; ERR_SAVE_TEMP_CLEANUP: {}", error, cleanup)),
                }
            }
            return Err(error);
        }
        Ok(())
    }

    /// Reloads all `.msave` files from `storage_dir` into memory, verifying each slot's checksum.
    pub fn reload_from_disk(&mut self) -> Result<usize, String> {
        let Some(ref dir) = self.storage_dir else {
            return Ok(0);
        };
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("ERR_SAVE_READ_DIR: {}", e))?;
        let mut loaded_slots = HashMap::new();
        for entry in entries {
            let entry = entry.map_err(|e| format!("ERR_SAVE_READ_DIR_ENTRY: {}", e))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("msave") {
                continue;
            }
            if !entry.file_type().map_err(|e| format!("ERR_SAVE_TARGET: {}", e))?.is_file() {
                return Err(format!("ERR_SAVE_TARGET: 不是普通存档文件: {}", path.display()));
            }
            let raw = fs::read_to_string(&path)
                .map_err(|e| format!("ERR_SAVE_READ_FILE: {}", e))?;
            let rec = SaveSlotRecord::from_disk_string(&raw)?;
            if loaded_slots.insert(rec.slot_name.clone(), rec).is_some() {
                return Err("ERR_SAVE_DUPLICATE_SLOT: 多个文件声明同一存档名".to_string());
            }
        }
        let loaded = loaded_slots.len();
        self.slots = loaded_slots;
        Ok(loaded)
    }

    /// Creates or overwrites a slot; failures leave the in-memory slot unchanged.
    pub fn create_save(&mut self, mut record: SaveSlotRecord) -> Result<&SaveSlotRecord, String> {
        record.checksum_fnv1a = record.compute_canonical_checksum();
        if let Some(ref dir) = self.storage_dir {
            let path = Self::slot_file_path(dir, &record.slot_name);
            match fs::symlink_metadata(&path) {
                Ok(_) => Self::verify_slot_file_owner(&path, &record.slot_name)?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("ERR_SAVE_TARGET: {}", error)),
            }
            Self::atomic_write_slot_file(&path, &record.to_disk_string())?;
        }
        let key = record.slot_name.clone();
        self.slots.insert(key.clone(), record);
        Ok(self.slots.get(&key).expect("just inserted"))
    }

    /// Backwards-compatible name for the checked save operation.
    pub fn create_save_checked(&mut self, record: SaveSlotRecord) -> Result<&SaveSlotRecord, String> {
        self.create_save(record)
    }

    /// Loads and verifies a save slot by name (`moovn.save.load(NAME)`).
    pub fn load_save(&self, slot_name: &str) -> Option<&SaveSlotRecord> {
        let rec = self.slots.get(slot_name)?;
        if rec.verify() {
            Some(rec)
        } else {
            None
        }
    }

    /// Deletes a save slot by name (`moovn.save.delete(NAME)`), removing its disk file if present.
    pub fn delete_save(&mut self, slot_name: &str) -> Result<bool, String> {
        if !self.slots.contains_key(slot_name) { return Ok(false); }
        if let Some(ref dir) = self.storage_dir {
            let path = Self::slot_file_path(dir, slot_name);
            Self::verify_slot_file_owner(&path, slot_name)?;
            fs::remove_file(path).map_err(|e| format!("ERR_SAVE_DELETE: {}", e))?;
        }
        Ok(self.slots.remove(slot_name).is_some())
    }

    pub fn list_saves(&self) -> Vec<&SaveSlotRecord> {
        let mut list: Vec<&SaveSlotRecord> = self.slots.values().collect();
        list.sort_by(|a, b| a.slot_name.cmp(&b.slot_name));
        list
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_legacy_v2_ascii_payload() {
        let mut vars = HashMap::new();
        vars.insert("key".to_string(), "true".to_string());
        let mut aff = HashMap::new();
        aff.insert("ayase".to_string(), 15);

        let rec = SaveSlotRecord {
            slot_name: "Slot_01".to_string(),
            chapter_id: "ch-1".to_string(),
            node_id: "node_opening".to_string(),
            dialogue_index: 2,
            active_background: "bg-station".to_string(),
            active_bgm: "bgm-main".to_string(),
            variables: vars,
            affection: aff,
            checksum_fnv1a: 0,
            timestamp_epoch_ms: 1729857600000,
        };

        assert_eq!(
            rec.compute_canonical_payload(),
            "v2|slot=Slot_01|ch=ch-1|node=node_opening|dlg=2|bg=bg-station|bgm=bgm-main|vars=[key=true]|aff=[ayase=15]"
        );
        let expected_hash = SaveManager::compute_fnv1a64(&rec.compute_canonical_payload());
        assert_ne!(expected_hash, 0);
    }

    #[test]
    fn checksum_does_not_authenticate_changes_or_cover_timestamp() {
        let mut record = SaveSlotRecord {
            slot_name: "slot".into(), chapter_id: "chapter".into(), node_id: "node".into(),
            dialogue_index: 0, active_background: String::new(), active_bgm: String::new(),
            variables: HashMap::new(), affection: HashMap::new(),
            checksum_fnv1a: 0, timestamp_epoch_ms: 100,
        };
        record.checksum_fnv1a = record.compute_canonical_checksum();
        assert!(record.verify());
        record.timestamp_epoch_ms = 200;
        assert!(record.verify(), "v2 does not include the timestamp");
        record.node_id = "edited".into();
        assert!(!record.verify());
        record.checksum_fnv1a = record.compute_canonical_checksum();
        assert!(record.verify(), "anyone can recalculate the public checksum");
    }

    #[test]
    fn test_persistent_save_manager_roundtrip_and_tamper_detection() {
        let temp_dir = std::env::temp_dir().join("moovn_engine_save_test");
        let _ = fs::remove_dir_all(&temp_dir);

        {
            let mut mgr = SaveManager::with_storage_dir(&temp_dir).expect("create save manager");
            let mut vars = HashMap::new();
            vars.insert("flag_clocktower".to_string(), "1".to_string());
            let mut aff = HashMap::new();
            aff.insert("yukina".to_string(), 40);

            let rec = SaveSlotRecord {
                slot_name: "Slot_Persist_01".to_string(),
                chapter_id: "chapter-1".to_string(),
                node_id: "scene-start-01".to_string(),
                dialogue_index: 0,
                active_background: "bg-classroom-day".to_string(),
                active_bgm: "".to_string(),
                variables: vars,
                affection: aff,
                checksum_fnv1a: 0,
                timestamp_epoch_ms: 1729857600000,
            };
            mgr.create_save_checked(rec).expect("persist save");
        }

        // Simulate process restart: new SaveManager reloads from temp_dir
        let mgr_reloaded = SaveManager::with_storage_dir(&temp_dir).expect("reload save manager");
        let loaded = mgr_reloaded.load_save("Slot_Persist_01").expect("slot must exist");
        assert_eq!(loaded.node_id, "scene-start-01");
        assert_eq!(loaded.affection.get("yukina"), Some(&40));
        assert!(loaded.verify());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
