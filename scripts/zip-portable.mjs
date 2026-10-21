#!/usr/bin/env node
/**
 * zip-portable.mjs —— 跨平台 ZIP 免安装包生成器（纯 Node，Windows/macOS/Linux 通用）
 *
 * 在 `tauri build` 之后运行：
 *   - Windows: 找到 target/release/MooVN.exe（portable 单文件）或 NSIS setup exe，压成 *-windows-portable.zip
 *   - macOS:   找到 .app 目录，压成 *-macos-portable.zip
 *   - Linux:   找到 target/release/moovn 可执行文件 + run.sh，压成 *-linux-portable.zip
 *   同时把 bundle/ 下的安装器复制到 release/ 目录并生成 SHA256SUMS.txt。
 *
 * 不执行任何 git 操作、不打 tag。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = process.env.MOOVN_VERSION || pkg.version;
const PKG_NAME = `MooVN-v${VERSION}`;
const OUT = path.join(ROOT, 'release');

const relBase = path.join(ROOT, 'src-tauri', 'target', 'release');
// cargo profile 可能在 target/<triple>/release（交叉编译时），做兜底搜索
function findReleaseDirs() {
  const dirs = [relBase];
  const t = path.join(ROOT, 'src-tauri', 'target');
  if (fs.existsSync(t)) {
    for (const e of fs.readdirSync(t)) {
      const d = path.join(t, e, 'release');
      if (e !== 'release' && fs.existsSync(d)) dirs.push(d);
    }
  }
  return dirs.filter((d) => fs.existsSync(d));
}

function log(...a) { console.log('[zip-portable]', ...a); }
function fail(msg) { console.error('[zip-portable] !!', msg); process.exitCode = 1; }

function sha256(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 用系统 zip/7z，回退到 PowerShell(Windows)/python3 —— 保证三平台都能出包 */
function makeZip(zipPath, cwd, entries) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  const tools = [
    ['zip', ['-qr', zipPath, ...entries]],
    ['7z', ['a', '-tzip', zipPath, ...entries]],
    ['/usr/bin/zip', ['-qr', zipPath, ...entries]],
  ];
  for (const [bin, args] of tools) {
    try { execFileSync(bin, args, { cwd, stdio: 'inherit' }); return true; } catch { /* next */ }
  }
  // Windows: powershell Compress-Archive
  if (process.platform === 'win32') {
    try {
      const items = entries.map((e) => `'${path.join(cwd, e).replace(/'/g, "''")}'`).join(',');
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Compress-Archive -Path ${items} -DestinationPath '${zipPath}' -Force`], { stdio: 'inherit' });
      return true;
    } catch { /* next */ }
  }
  // python3 zipfile
  try {
    execFileSync('python3', ['-c', `
import zipfile, os, sys
cwd = r'''${cwd}'''
out = r'''${zipPath}'''
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root_entry in sys.argv[1:]:
        p0 = os.path.join(cwd, root_entry)
        if os.path.isdir(p0):
            for dp, _, fns in os.walk(p0):
                for fn in fns:
                    fp = os.path.join(dp, fn)
                    z.write(fp, os.path.relpath(fp, cwd))
        else:
            z.write(p0, root_entry)
`, ...entries], { stdio: 'inherit' });
    return true;
  } catch { return false; }
}

function collectInstallers() {
  fs.mkdirSync(OUT, { recursive: true });
  const exts = ['.exe', '.msi', '.dmg', '.deb', '.rpm', '.AppImage'];
  let n = 0;
  for (const dir of findReleaseDirs()) {
    const bundleDir = path.join(dir, 'bundle');
    if (!fs.existsSync(bundleDir)) continue;
    for (const sub of fs.readdirSync(bundleDir)) {
      const sd = path.join(bundleDir, sub);
      if (!fs.statSync(sd).isDirectory()) continue;
      for (const f of fs.readdirSync(sd)) {
        if (exts.some((e) => f.endsWith(e)) || f.endsWith('.app')) {
          const src = path.join(sd, f);
          const dst = path.join(OUT, f);
          fs.cpSync(src, dst, { recursive: true });
          log('复制安装器:', f);
          n++;
        }
      }
    }
  }
  return n;
}

function buildPortableZip() {
  const dirs = findReleaseDirs();
  const stage = path.join(OUT, `.stage-${PKG_NAME}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const inner = path.join(stage, `${PKG_NAME}-portable`);
  fs.mkdirSync(inner, { recursive: true });

  let made = false;
  if (process.platform === 'win32') {
    // Tauri 默认产出的是 NSIS 安装器；若配置了 portable 则 target/release 下有主 exe
    const exeCandidates = [];
    for (const d of dirs) {
      for (const name of ['MooVN.exe', 'moovn.exe']) {
        const p = path.join(d, name);
        if (fs.existsSync(p)) exeCandidates.push(p);
      }
    }
    if (exeCandidates.length) {
      fs.copyFileSync(exeCandidates[0], path.join(inner, 'MooVN.exe'));
      made = true;
    } else {
      fail('未找到 target/release 下的 MooVN.exe。如需真正的 Windows 绿色版，请在 tauri.conf.json 的 bundle.windows 中增加 nsis template 或改用 portable 插件后重新构建；当前仅能提供安装器。');
    }
    fs.writeFileSync(path.join(inner, 'README.txt'),
      `MooVN ${VERSION} 免安装版 (Windows)\r\n双击 MooVN.exe 启动。存档与设置位于 %APPDATA%\\dev.moonano.moovn\r\n`);
    if (made) {
      const zip = path.join(OUT, `${PKG_NAME}-windows-portable.zip`);
      if (makeZip(zip, stage, [`${PKG_NAME}-portable`])) log('生成:', path.basename(zip));
    }
  } else if (process.platform === 'darwin') {
    let app = null;
    for (const d of dirs) {
      const macDir = path.join(d, 'bundle', 'macos');
      if (fs.existsSync(macDir)) {
        const e = fs.readdirSync(macDir).find((f) => f.endsWith('.app'));
        if (e) { app = path.join(macDir, e); break; }
      }
    }
    if (app) {
      fs.cpSync(app, path.join(inner, path.basename(app)), { recursive: true });
      fs.writeFileSync(path.join(inner, 'README.txt'), `MooVN ${VERSION} 免安装版 (macOS)。拖出 .app 即可运行。\n`);
      const zip = path.join(OUT, `${PKG_NAME}-macos-portable.zip`);
      if (makeZip(zip, inner, [path.basename(app), 'README.txt'])) log('生成:', path.basename(zip));
      made = true;
    } else fail('未找到 .app 产物');
  } else {
    let bin = null;
    for (const d of dirs) {
      const p = path.join(d, 'moovn');
      if (fs.existsSync(p)) { bin = p; break; }
    }
    if (bin) {
      fs.copyFileSync(bin, path.join(inner, 'MooVN'));
      fs.chmodSync(path.join(inner, 'MooVN'), 0o755);
      fs.writeFileSync(path.join(inner, 'run.sh'),
        '#!/bin/sh\nDIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$DIR/MooVN" "$@"\n');
      fs.chmodSync(path.join(inner, 'run.sh'), 0o755);
      fs.writeFileSync(path.join(inner, 'README.txt'),
        `MooVN ${VERSION} 免安装版 (Linux)。./run.sh 启动。AppImage 亦为免安装单文件。\n`);
      const zip = path.join(OUT, `${PKG_NAME}-linux-portable.zip`);
      if (makeZip(zip, inner, ['MooVN', 'run.sh', 'README.txt'])) log('生成:', path.basename(zip));
      made = true;
    } else fail('未找到 target/release/moovn 可执行文件');
  }

  fs.rmSync(stage, { recursive: true, force: true });
  return made;
}

function writeSums() {
  const files = fs.readdirSync(OUT).filter((f) => !f.startsWith('.') && f !== 'SHA256SUMS.txt');
  if (!files.length) return;
  const lines = files.map((f) => {
    const p = path.join(OUT, f);
    if (fs.statSync(p).isDirectory()) return null; // .app 目录单独处理
    return `${sha256(p)}  ${f}`;
  }).filter(Boolean);
  fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  log('写入 SHA256SUMS.txt');
}

log(`版本 v${VERSION}, 平台 ${process.platform}`);
const n = collectInstallers();
if (n === 0) fail('未在 src-tauri/target/*/release/bundle 下找到安装器产物（请先完成 tauri build）');
buildPortableZip();
writeSums();
log('完成。产物位于 release/（未创建任何 git tag）');
