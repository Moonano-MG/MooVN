# Third-Party Notices

The repository uses [GPL-3.0](../LICENSE) as its base license. The root LICENSE also retains the pre-existing MooVN Game Output & Runtime Exception. That non-standard exception's authority, validity, scope and compatibility with third-party dependencies have not been verified; no conclusion about a particular distribution is promised. Authors retain ownership of their own story and assets. Exported HTML includes player code, so distributors must assess the applicable GPL terms, the existing exception and all asset licenses before distribution.

## Dependencies

- React and React DOM — MIT, Meta Platforms and contributors.
- Lucide React — ISC, Lucide contributors.
- Tailwind CSS — MIT, Tailwind Labs and contributors.
- yaml — ISC, Eemeli Aro.
- @noble/hashes — MIT, Paul Miller and contributors; used for unkeyed SHA-256 project and chapter checksums.
- Tauri v2 — Apache-2.0 OR MIT, The Commons Conservancy and contributors.
- Serde and serde_json — Apache-2.0 OR MIT, respective contributors.
- RustCrypto [`sha2` 0.10.9](https://github.com/RustCrypto/hashes/tree/sha2-v0.10.9/sha2) — MIT OR Apache-2.0, RustCrypto Developers; used to verify native content-addressed assets before commit. Its transitive dependency versions/licenses must also be reviewed for each distribution; the native I/O test harness pins its own dependencies in `tests/native-io/Cargo.lock`.

The provenance and redistribution permissions of bundled artwork are not yet fully documented. Do not assume the source-code license grants rights over artwork whose provenance has not been established. Obtain independent permission before redistribution when necessary.
