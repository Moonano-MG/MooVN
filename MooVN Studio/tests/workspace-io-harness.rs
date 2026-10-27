// Test the same bounded native I/O modules used by the Tauri commands, without
// requiring a graphical runtime for the platform-independent unit-test job.
#[path = "../src-tauri/src/workspace_io.rs"]
mod workspace_io;
#[path = "../src-tauri/src/asset_io.rs"]
mod asset_io;
