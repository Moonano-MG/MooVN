//! Save System (`moovn.save.create(NAME)`) for MooVN Engine.

use std::collections::HashMap;

#[derive(Debug, Clone)]
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

impl SaveSlotRecord {
    /// Serializes all state fields (including sorted `variables` and `affection`)
    /// into a deterministic string and computes its 64-bit FNV-1a checksum.
    pub fn compute_canonical_checksum(&self) -> u64 {
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

        let canonical = format!(
            "v2|slot={}|ch={}|node={}|dlg={}|bg={}|bgm={}|vars=[{}]|aff=[{}]",
            self.slot_name,
            self.chapter_id,
            self.node_id,
            self.dialogue_index,
            self.active_background,
            self.active_bgm,
            vars_serialized.join(","),
            aff_serialized.join(",")
        );
        SaveManager::compute_fnv1a64(&canonical)
    }

    /// Verifies that the save record's checksum is non-zero and matches all fields.
    pub fn verify(&self) -> bool {
        self.checksum_fnv1a != 0 && self.checksum_fnv1a == self.compute_canonical_checksum()
    }
}

#[derive(Debug, Default)]
pub struct SaveManager {
    slots: HashMap<String, SaveSlotRecord>,
}

impl SaveManager {
    pub fn new() -> Self {
        Self {
            slots: HashMap::new(),
        }
    }

    pub fn compute_fnv1a64(payload: &str) -> u64 {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in payload.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }

    /// Creates or overwrites a save slot (`moovn.save.create(NAME)`).
    pub fn create_save(&mut self, mut record: SaveSlotRecord) -> &SaveSlotRecord {
        record.checksum_fnv1a = record.compute_canonical_checksum();
        let key = record.slot_name.clone();
        self.slots.insert(key.clone(), record);
        self.slots.get(&key).expect("just inserted")
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

    /// Deletes a save slot by name (`moovn.save.delete(NAME)`).
    pub fn delete_save(&mut self, slot_name: &str) -> bool {
        self.slots.remove(slot_name).is_some()
    }

    pub fn list_saves(&self) -> Vec<&SaveSlotRecord> {
        let mut list: Vec<&SaveSlotRecord> = self.slots.values().collect();
        list.sort_by(|a, b| a.slot_name.cmp(&b.slot_name));
        list
    }
}
