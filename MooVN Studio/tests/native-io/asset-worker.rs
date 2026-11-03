// Test-only transport: exposes the same native asset module to the browser
// regression over stdin/stdout. This is not Tauri IPC or an installed app.
use moovn_native_io_tests::asset_io::{read_chunk, AssetUploads, MAX_CHUNK_BYTES};
use std::io::{self, BufRead, BufWriter, Write};
use std::path::Path;

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 || value.len() > MAX_CHUNK_BYTES * 2 || !value.is_ascii() {
        return Err("invalid test chunk".into());
    }
    (0..value.len()).step_by(2).map(|i| u8::from_str_radix(&value[i..i + 2], 16)
        .map_err(|_| "invalid test chunk".to_string())).collect()
}

fn execute(root: &Path, uploads: &mut AssetUploads, line: &str) -> Result<String, String> {
    let parts: Vec<_> = line.split('\t').collect();
    match parts.as_slice() {
        ["begin", name, size] => uploads.begin(root, name, size.parse().map_err(|_| "invalid size")?),
        ["append", token, bytes] => { uploads.append(token, &decode_hex(bytes)?)?; Ok(String::new()) },
        ["finish", token] => uploads.finish(token),
        ["abort", token] => { uploads.abort(token)?; Ok(String::new()) },
        ["read", name, offset, length] => {
            let (bytes, total) = read_chunk(root, name, offset.parse().map_err(|_| "invalid offset")?, length.parse().map_err(|_| "invalid length")?)?;
            let encoded: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
            Ok(format!("{total}\t{encoded}"))
        },
        _ => Err("unknown test command".into()),
    }
}

fn main() -> io::Result<()> {
    let root = std::env::args_os().nth(1).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing disposable workspace"))?;
    let mut uploads = AssetUploads::default();
    let mut output = BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        match execute(Path::new(&root), &mut uploads, &line?) {
            Ok(value) => writeln!(output, "ok\t{value}")?,
            Err(error) => writeln!(output, "error\t{}", error.replace(['\r', '\n', '\t'], " "))?,
        }
        output.flush()?;
    }
    Ok(())
}
