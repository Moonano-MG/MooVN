#!/usr/bin/env node
// =============================================================================
// MooVN 版本同步脚本（CI / 本地发布共用）
//   用法: node scripts/set-version.mjs <version-slug>
//   - 将 package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml 的 version
//     统一为 <slug>（通常是清洗后的分支名，全小写）。
//   - Tauri 要求 version 为 semver：非标准 slug 自动降级为 "0.0.0+<slug>"（build metadata）。
//   - iOS bundleIdentifier / Android applicationId 强制小写（防止大小写识别错乱）。
//   ** 只写文件，绝不执行任何 git 操作、绝不创建 tag **
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slugRaw = process.argv[2] || process.env.MOOVN_VERSION_OVERRIDE || '';
if (!slugRaw) {
  console.error('用法: node scripts/set-version.mjs <version-slug>');
  process.exit(2);
}

// 文件名安全清洗 + 全小写（mac/iOS/android 防呆）
const clean = (s) =>
  s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
const slug = clean(slugRaw);
if (!slug) {
  console.error('slug 清洗后为空');
  process.exit(2);
}

const BASE_VERSION = '0.1.0'; // package.json 基础版本（Cargo/Tauri 必须保持数字 semver）
// 规则：分支名本身是标准 semver（如 v1.2.3-beta -> 1.2.3-beta）则直接使用；
//       否则视为开发分支 -> "0.1.0-<slug>"（prerelease 形式，全小写）。
let version = slug.replace(/^v(?=\d)/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i.test(version)) {
  version = `${BASE_VERSION}-${slug}`;
}

console.log(`==> set-version: raw="${slugRaw}" -> slug="${slug}" -> tauri/cargo version="${version}"`);

// ---- package.json（保留原字符串风格，仅替换 version 行）----
const pkgPath = resolve(ROOT, 'package.json');
let pkg = readFileSync(pkgPath, 'utf8');
pkg = pkg.replace(/^([ \t]*"version"[ \t]*:[ \t]*)"[^"]*"/m, `$1"${slug}"`);
writeFileSync(pkgPath, pkg);

// ---- src-tauri/tauri.conf.json（JSONC：注释与尾逗号需容忍，按行替换）----
const confPath = resolve(ROOT, 'src-tauri', 'tauri.conf.json');
let conf = readFileSync(confPath, 'utf8');
conf = conf.replace(/^([ \t]*"version"[ \t]*:[ \t]*)"[^"]*"/m, `$1"${version}"`);
// 顶层 identifier 强制全小写（Tauri 用它派生 iOS bundleIdentifier / Android applicationId，
// 大小写混用会让 macOS/iOS 安装器与商店识别错乱）
conf = conf.replace(
  /^([ \t]*"identifier"[ \t]*:[ \t]*")([^"]*)"/m,
  (mm, p1, id) => `${p1}${id.toLowerCase()}"`
);
writeFileSync(confPath, conf);

// ---- src-tauri/Cargo.toml（仅替换 [package] 段第一个 version）----
const cargoPath = resolve(ROOT, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
let done = false;
cargo = cargo.replace(/^(\s*version\s*=\s*)"[^"]*"/m, (mm, p1) => {
  done = true;
  return `${p1}"${version}"`;
});
if (!done) throw new Error('Cargo.toml 未找到 [package] version 字段');
writeFileSync(cargoPath, cargo);

// ---- Android applicationId 小写检查（gen/android 存在时）----
const gradlePath = resolve(ROOT, 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
try {
  let g = readFileSync(gradlePath, 'utf8');
  const before = g;
  g = g.replace(/applicationId\s*=\s*"([^"]+)"/, (mm, id) => `applicationId = "${id.toLowerCase()}"`);
  if (before !== g) {
    writeFileSync(gradlePath, g);
    console.log('==> Android applicationId 已转小写');
  }
} catch {
  /* android 工程尚未 init，跳过 */
}

console.log('==> 版本同步完成（未执行任何 git 操作 / 未创建 tag）');
