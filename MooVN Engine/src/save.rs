//! Save System (`moovn.save:create(NAME)` / `moobn.sava:create(NAME)`) for MooVN Engine.

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

    /// Creates or overwrites a save slot (`moovn.save:create(NAME)` / `moobn.sava:create(NAME)`).
    pub fn create_save(&mut self, record: SaveSlotRecord) -> &SaveSlotRecord {
        let key = record.slot_name.clone();
        self.slots.insert(key.clone(), record);
        self.slots.get(&key).expect("just inserted")
    }

    /// Loads a save slot by name (`moovn.save:load(NAME)` / `moobn.sava:load(NAME)`).
    pub fn load_save(&self, slot_name: &str) -> Option<&SaveSlotRecord> {
        self.slots.get(slot_name)
    }

    /// Deletes a save slot by name (`moovn.save:delete(NAME)` / `moobn.sava:delete(NAME)`).
    pub fn delete_save(&mut self, slot_name: &str) -> bool {
        self.slots.remove(slot_name).is_some()
    }

    pub fn list_saves(&self) -> Vec<&SaveSlotRecord> {
        let mut list: Vec<&SaveSlotRecord> = self.slots.values().collect();
        list.sort_by(|a, b| a.slot_name.cmp(&b.slot_name));
        list
    }
}
