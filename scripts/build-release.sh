#!/usr/bin/env bash
# =============================================================================
# MooVN 发布构建脚本
#   1) 编译 Tauri 安装包（Windows: NSIS .exe / MSI；macOS: .dmg/.app；Linux: deb/rpm/AppImage）
#   2) 额外打包 ZIP「免安装绿色版」（Windows 用 portable exe，其它平台用运行目录）
#   3) 产物统一收集到 release/，生成 SHA256SUMS.txt
#   ** 全程不创建任何 git tag、不做 git 提交 **
#
# 用法:
#   ./scripts/build-release.sh                 # 当前平台默认目标
#   ./scripts/build-release.sh --targets nsis,msi   # 指定 bundle targets
#   ./scripts/build-release.sh --skip-frontend      # 跳过前端构建（已构建过时）
#   MOOVN_VERSION=0.2.0 ./scripts/build-release.sh  # 覆盖版本号（默认读 package.json）
#
# 依赖: node+npm（或 bun）、Rust(cargo)、tauri CLI（npm run tauri 提供）、zip 工具
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---------- 参数解析 ----------
TARGETS=""
SKIP_FRONTEND=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --targets) TARGETS="$2"; shift 2 ;;
    --targets=*) TARGETS="${1#*=}"; shift ;;
    --skip-frontend) SKIP_FRONTEND=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1（--help 查看用法）" >&2; exit 2 ;;
  esac
done

# ---------- 版本与名称（只读取，绝不写 git） ----------
VERSION="${MOOVN_VERSION:-$(node -p "require('./package.json').version")}"
PRODUCT="MooVN"
PKG="${PRODUCT}-v${VERSION}"
OUT="$ROOT/release"
REL="$ROOT/src-tauri/target/release"

echo "==> MooVN 发布构建 v${VERSION}"
echo "==> 注意: 本脚本不会创建 git tag / 不会执行任何 git 写操作"

# ---------- 前置检查 ----------
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少依赖: $1" >&2; exit 1; }; }
need node; need npm; need cargo

# ---------- 包管理器选择（兼容 bun，但不强制） ----------
if command -v bun >/dev/null 2>&1; then PM="bun"; else PM="npm"; fi
run_pm() { if [[ "$PM" == "bun" ]]; then bun "$@"; else npm "$@"; fi; }

# ---------- 图标自检（缺失则自动生成） ----------
if [[ ! -f src-tauri/icons/icon.ico || ! -f src-tauri/icons/32x32.png ]]; then
  echo "==> 检测到 Tauri 图标缺失，运行 scripts/gen-icons.py"
  python3 scripts/gen-icons.py || { echo "图标生成失败，请手动执行: npm run tauri icon src-tauri/icons/app-icon.jpg" >&2; exit 1; }
fi

# ---------- 类型检查 + 前端构建 ----------
echo "==> 类型检查 (tsc --noEmit)"
run_pm run typecheck

if [[ "$SKIP_FRONTEND" == "0" ]]; then
  echo "==> 前端构建 (vite build)"
  run_pm run build
fi

# ---------- Tauri 编译打包 ----------
TAURI_ARGS=(build)
if [[ -n "$TARGETS" ]]; then
  TAURI_ARGS+=(--targets "$TARGETS")
else
  case "$(uname -s)" in
    Linux*)  TAURI_ARGS+=(--bundles deb,rpm,appimage) ;;
    Darwin*) TAURI_ARGS+=(--bundles dmg,app) ;;
    MINGW*|MSYS*|CYGWIN*) TAURI_ARGS+=(--bundles nsis,msi) ;;
  esac
fi

echo "==> cargo/tauri 编译（release，耗时较长）: $PM run tauri ${TAURI_ARGS[*]}"
run_pm run tauri "${TAURI_ARGS[@]}"

# ---------- 收集产物 ----------
mkdir -p "$OUT"
shopt -s nullglob

echo "==> 收集安装包产物 -> $OUT"
copied=0
for f in \
  "$REL"/bundle/nsis/*.exe \
  "$REL"/bundle/msi/*.msi \
  "$REL"/bundle/macos/*.app \
  "$REL"/bundle/dmg/*.dmg \
  "$REL"/bundle/deb/*.deb \
  "$REL"/bundle/rpm/*.rpm \
  "$REL"/bundle/appimage/*.AppImage \
  "$REL"/../target/*/release/bundle/**/*.{exe,dmg,deb,rpm,AppImage} \
  ; do
  base="$(basename "$f")"
  # 重命名为带版本号的规范名: MooVN_0.1.0_x64-setup.exe -> MooVN-v0.1.0-win-x64-setup.exe 之类保持原名亦可
  cp -a "$f" "$OUT/$base"
  echo "   + $base"
  copied=$((copied+1))
done

# Windows 下 .app 集合是 mac 专用，其它平台自动为空——nullglob 已处理
if [[ $copied -eq 0 ]]; then
  echo "!! 未在 src-tauri/target 下找到 bundle 产物，请检查上方 tauri build 日志" >&2
  exit 1
fi

# ---------- ZIP 免安装绿色版 ----------
mkzip() { # mkzip <zipname> <srcdir...>  —— 优先 zip，回退 python
  local name="$1"; shift
  if command -v zip >/dev/null 2>&1; then
    ( cd "$1" && shift && zip -qr "$OUT/$name" "$@" )
  elif command -v 7z >/dev/null 2>&1; then
    ( cd "$1" && shift && 7z a -tzip "$OUT/$name" "$@" >/dev/null )
  else
    ( cd "$1" && shift && python3 -m zipfile -c "$OUT/$name" "$@" )
  fi
}

echo "==> 打包 ZIP 免安装版"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # Windows: 使用 Tauri portable 单文件 exe（若存在），否则收集 NSIS 解包前的 exe+bundle 资源
    PORTABLE=$(find "$REL" -maxdepth 1 -name "*.exe" ! -name "*install*" | head -1 || true)
    STAGE="$OUT/.stage-win"
    rm -rf "$STAGE"; mkdir -p "$STAGE/${PKG}-win-portable"
    if [[ -n "${PORTABLE:-}" && -f "$PORTABLE" ]]; then
      cp "$PORTABLE" "$STAGE/${PKG}-win-portable/${PRODUCT}.exe"
    elif [[ -f "$REL/${PRODUCT}.exe" ]]; then
      cp "$REL/${PRODUCT}.exe" "$STAGE/${PKG}-win-portable/${PRODUCT}.exe"
    else
      echo "!! 未找到可执行文件用于免安装包（尝试在 tauri.conf 中启用 windows-nsis template 或使用 nsis 输出）" >&2
    fi
    [[ -f "$STAGE/${PKG}-win-portable/${PRODUCT}.exe" ]] && {
      printf 'MooVN %s 免安装版\n双击 MooVN.exe 启动；数据保存在 %%APPDATA%%\\dev.moonano.moovn\n' "$VERSION" > "$STAGE/${PKG}-win-portable/README.txt"
      mkzip "${PKG}-windows-portable.zip" "$STAGE" "${PKG}-win-portable"
      echo "   + ${PKG}-windows-portable.zip"
    }
    rm -rf "$STAGE"
    ;;
  Darwin*)
    STAGE="$OUT/.stage-mac"; rm -rf "$STAGE"; mkdir -p "$STAGE"
    APPD=$(find "$OUT" -maxdepth 1 -name "*.app" | head -1 || true)
    if [[ -n "${APPD:-}" ]]; then
      cp -aR "$APPD" "$STAGE/"
      mkzip "${PKG}-macos-portable.zip" "$STAGE" "$(basename "$APPD")"
      echo "   + ${PKG}-macos-portable.zip"
    fi
    rm -rf "$STAGE"
    ;;
  Linux*)
    STAGE="$OUT/.stage-linux"; rm -rf "$STAGE"; mkdir -p "$STAGE/${PKG}-linux"
    BIN="$REL/moovn"
    if [[ -x "$BIN" ]]; then
      cp "$BIN" "$STAGE/${PKG}-linux/MooVN"
      cat > "$STAGE/${PKG}-linux/run.sh" <<'EOF'
#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/MooVN" "$@"
EOF
      chmod +x "$STAGE/${PKG}-linux/run.sh"
      printf 'MooVN %s 免安装版 (Linux)。运行 ./run.sh 启动。\n' "$VERSION" > "$STAGE/${PKG}-linux/README.txt"
      mkzip "${PKG}-linux-portable.zip" "$STAGE" "${PKG}-linux"
      echo "   + ${PKG}-linux-portable.zip"
    fi
    rm -rf "$STAGE"
    ;;
esac

# AppImage 本身就是免安装单文件，直接作为绿色版补充说明
ls "$OUT"/*.AppImage >/dev/null 2>&1 && echo "   (提示: *.AppImage 即为 Linux 免安装单文件)"

# ---------- 校验和 ----------
echo "==> 生成 SHA256SUMS.txt"
( cd "$OUT" && sha256sum -- * 2>/dev/null | grep -v SHA256SUMS > SHA256SUMS.txt || shasum -a 256 -- * | grep -v SHA256SUMS > SHA256SUMS.txt )

echo ""
echo "================ 构建完成 ================"
ls -lh "$OUT"
echo "=========================================="
echo "未创建任何 git tag。如需打标签请自行执行: git tag v${VERSION}"
