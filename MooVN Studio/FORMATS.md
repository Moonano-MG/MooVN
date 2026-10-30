# Development project and chapter formats

These formats are under development. This document describes the current
TypeScript implementation, not a cross-language interoperability guarantee.

## `.mpvn` project

A new export is a JSON object with `magic: "MPVN_STUDIO_PROJECT"`,
`format: "mpvn"`, `envelopeVersion: 2`, project metadata, `project`, and
`integrity: { "algorithm": "sha256", "digest": "<64 lowercase hex>" }`.
The project schema version (currently `1.1.0`) is separate from the envelope
version. Input and output are limited to 16 MiB of UTF-8 data.

Unversioned historical envelopes and bare project objects are still accepted
if their schema is valid. They have no package checksum: the parser reports
`legacy-unchecked`, and the project launcher warns before opening them. A
version-2 envelope with a missing or invalid integrity field is rejected.
Legacy coordinate migration and subsequent saving require user review.

## `.msvn` chapter data

A new chapter JSON object retains the historical magic
`MSVN_CHAPTER_PACKAGE_V1` and adds `envelopeVersion: 2` and the same
`integrity` structure. The envelope includes chapter metadata, an asset
manifest, and a `compressedNodesEnvelope`. The manifest contains references,
not the asset files. The nodes are either raw UTF-8 or MooVN's LZ77 stream;
legacy `7z`, `xz`, and `brotli` labels are interpreted as historical MooVN
LZ77, not as those external formats. Input is limited to 48 MiB, the encoded
compressed bytes to 32 MiB, and the decoded node bytes to 16 MiB. The parser
validates node structure, duplicate identifiers and chapter consistency.

Legacy chapter files return `integrity: "legacy-unchecked"`. Any future UI
that opens them must surface that status. There is currently no chapter-pack
loader in the HTML runtime, and no portable external-asset bundle.

## Checksum calculation and security boundary

For both version-2 envelopes, remove the top-level `integrity` field, then
serialize the remaining parsed object with JavaScript `JSON.stringify`
(without indentation), encode that string as UTF-8, and compute SHA-256.
Formatting whitespace in the file does not matter, but property order does:
reordering JSON keys can change the computed checksum. JavaScript number and
string serialization rules apply. A future implementation in another language
needs shared fixtures and matching serialization before interoperability can
be claimed.

This is an **unkeyed checksum**, not a digital signature or MAC. Anyone who
can change a file can recompute the digest, or remove both version and digest
and cause a legacy-unchecked import. It detects some accidental damage; it
does not verify authorship or prevent intentional tampering. The older
compressed-node FNV checksum is also only a corruption check.
