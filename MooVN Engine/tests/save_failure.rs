use moovn_engine::{EngineOp, MooVNEngineRuntime};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).expect("clock").as_nanos();
    std::env::temp_dir().join(format!("moovn-save-failure-{name}-{}-{nonce}", std::process::id()))
}

#[test]
fn failed_disk_write_is_reported_and_not_kept_as_a_successful_slot() {
    let root = temp_dir("write");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    fs::remove_dir(&root).expect("remove empty dir");
    fs::write(&root, b"not a directory").expect("block parent");
    let result = runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    assert!(result.contains("ERR_SAVE"), "must report write error, got {result}");
    assert!(runtime.saves.load_save("Manual").is_none(), "failed disk write must not leave a successful in-memory slot");
    fs::remove_file(root).expect("cleanup");
}

#[test]
fn failed_backup_keeps_the_original_slot_and_reports_an_error() {
    let root = temp_dir("backup");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    let first = runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    assert!(first.contains("已创建存档"), "first save failed: {first}");
    let target = root.join("Manual.msave");
    let before = fs::read(&target).expect("read original");
    fs::create_dir(root.join("Manual.msave.bak")).expect("block backup file");
    runtime.state.current_node_id = "new-node".into();
    let result = runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    assert!(result.contains("ERR_SAVE"), "must report backup failure, got {result}");
    assert_eq!(fs::read(&target).expect("read original"), before, "failed backup must not replace original");
    assert_ne!(runtime.saves.load_save("Manual").expect("original in memory").node_id, "new-node");
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn failed_delete_does_not_claim_success_or_forget_the_slot() {
    let root = temp_dir("delete");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    let target = root.join("Manual.msave");
    fs::remove_file(&target).expect("remove stored slot");
    fs::create_dir(&target).expect("block removal");
    let result = runtime.execute_op(EngineOp::SaveDelete { slot_name: "Manual".into() });
    assert!(result.contains("ERR_SAVE"), "must report delete failure, got {result}");
    assert!(runtime.saves.load_save("Manual").is_some(), "failed delete must keep in-memory slot");
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn colliding_slot_names_never_overwrite_or_delete_each_other() {
    let root = temp_dir("collision");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    let first = runtime.execute_op(EngineOp::SaveCreate { slot_name: "a/b".into() });
    assert!(first.contains("已创建存档"), "first save failed: {first}");
    let before = fs::read(root.join("a_b.msave")).expect("read original");
    let second = runtime.execute_op(EngineOp::SaveCreate { slot_name: "a?b".into() });
    assert!(second.contains("ERR_SAVE"), "collision must fail explicitly, got {second}");
    assert_eq!(fs::read(root.join("a_b.msave")).expect("original"), before);
    assert!(runtime.saves.load_save("a/b").is_some());
    assert!(runtime.saves.load_save("a?b").is_none());
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn script_stops_after_save_failure_but_reports_previous_effects() {
    use moovn_engine::SourceLanguage;
    let root = temp_dir("script");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    fs::remove_dir(&root).expect("remove dir");
    fs::write(&root, b"not a directory").expect("block parent");
    let script = "moovn.bg.show(\"first\", \"fade\");\nmoovn.save.create(\"Manual\");\nmoovn.bg.show(\"after\", \"fade\");";
    let logs = runtime.eval_polyglot_script(script, SourceLanguage::TypeScript);
    assert_eq!(logs.len(), 2);
    assert!(logs[1].starts_with("ERR_SAVE"));
    assert_eq!(runtime.state.active_background, "first", "prior operations are not rolled back and later ones must not run");
    fs::remove_file(root).expect("cleanup");
}

#[test]
fn c_abi_reports_save_failure_and_missing_load() {
    use moovn_engine::ffi::{moovn_engine_destroy, moovn_engine_eval_script, moovn_engine_save_create, moovn_engine_save_load};
    use std::ffi::CString;
    let root = temp_dir("ffi");
    let runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    fs::remove_dir(&root).expect("remove dir");
    fs::write(&root, b"not a directory").expect("block parent");
    let engine = Box::into_raw(Box::new(runtime));
    let slot = CString::new("Manual").unwrap();
    let lang = CString::new("ts").unwrap();
    let script = CString::new("moovn.save.create(\"Manual\");").unwrap();
    unsafe {
        assert!(!moovn_engine_save_create(engine, slot.as_ptr()));
        assert!(!moovn_engine_save_load(engine, slot.as_ptr()));
        assert_eq!(moovn_engine_eval_script(engine, lang.as_ptr(), script.as_ptr()), 0);
        moovn_engine_destroy(engine);
    }
    fs::remove_file(root).expect("cleanup");
}

#[cfg(unix)]
#[test]
fn save_and_backup_symlinks_are_rejected_without_touching_targets() {
    use std::os::unix::fs::symlink;
    let root = temp_dir("symlink");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    let outside = root.join("outside.txt");
    fs::write(&outside, b"untouched").expect("create outside target");
    symlink(&outside, root.join("Manual.msave")).expect("create target symlink");
    let first = runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    assert!(first.contains("ERR_SAVE_TARGET"));
    assert_eq!(fs::read(&outside).unwrap(), b"untouched");
    fs::remove_file(root.join("Manual.msave")).unwrap();
    runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    symlink(&outside, root.join("Manual.msave.bak")).expect("create backup symlink");
    let second = runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    assert!(second.contains("ERR_SAVE_BACKUP"));
    assert_eq!(fs::read(&outside).unwrap(), b"untouched");
    assert!(!fs::read_dir(&root).unwrap().any(|entry| entry.unwrap().path().extension().is_some_and(|ext| ext == "tmp")));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn reload_is_transactional_and_removes_slots_no_longer_on_disk() {
    let root = temp_dir("reload");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    for name in ["one", "two"] {
        assert!(runtime.execute_op(EngineOp::SaveCreate { slot_name: name.into() }).contains("已创建存档"));
    }
    fs::write(root.join("two.msave"), b"broken file").unwrap();
    assert!(runtime.saves.reload_from_disk().is_err());
    assert!(runtime.saves.load_save("one").is_some());
    assert!(runtime.saves.load_save("two").is_some(), "failed reload must not partially replace memory");
    fs::remove_file(root.join("two.msave")).unwrap();
    assert_eq!(runtime.saves.reload_from_disk().unwrap(), 1);
    assert!(runtime.saves.load_save("one").is_some());
    assert!(runtime.saves.load_save("two").is_none(), "removed disk slots must not linger in memory");
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn reload_rejects_duplicate_records_and_missing_directory_without_losing_memory() {
    let root = temp_dir("reload-errors");
    let unavailable = root.with_extension("missing");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    runtime.execute_op(EngineOp::SaveCreate { slot_name: "one".into() });
    fs::copy(root.join("one.msave"), root.join("duplicate.msave")).unwrap();
    let duplicate = runtime.saves.reload_from_disk().unwrap_err();
    assert!(duplicate.starts_with("ERR_SAVE_DUPLICATE_SLOT"), "{duplicate}");
    assert!(runtime.saves.load_save("one").is_some());
    fs::remove_file(root.join("duplicate.msave")).unwrap();
    fs::rename(&root, &unavailable).unwrap();
    assert!(runtime.saves.reload_from_disk().is_err());
    assert!(runtime.saves.load_save("one").is_some(), "missing directory must not erase memory");
    fs::remove_dir_all(unavailable).expect("cleanup");
}

#[test]
fn dotted_variable_keys_survive_real_disk_round_trip() {
    let root = temp_dir("dotted-vars");
    let mut runtime = MooVNEngineRuntime::with_save_dir(&root).expect("create save dir");
    let variables = [
        ("quest.stage", "3.14"), (".", "empty-looking.key"),
        ("版本.状态", "完成.1"), ("literal%2E", "percent"), ("normal", "value"),
    ];
    for (key, value) in variables {
        runtime.state.variables.insert(key.into(), value.into());
    }
    let result = runtime.execute_op(EngineOp::SaveCreate { slot_name: "Manual".into() });
    assert!(result.contains("已创建存档"), "save failed: {result}");
    drop(runtime);
    let reopened = MooVNEngineRuntime::with_save_dir(&root).expect("a saved slot must reopen successfully");
    let stored = reopened.saves.load_save("Manual").expect("slot");
    for (key, value) in variables {
        assert_eq!(stored.variables.get(key).map(String::as_str), Some(value));
    }
    fs::remove_dir_all(root).expect("cleanup");
}
