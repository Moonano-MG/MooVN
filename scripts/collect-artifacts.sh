#!/usr/bin/env bash
# =============================================================================
# MooVN CI 产物收集脚本（配合 .github/workflows/build.yml）
#   用法: bash scripts/collect-artifacts.sh <platform-dir>
#     platform-dir 例: windows-x64 / windows-x86 / mac-arm64 / ubuntu-amd64 / android / ios
#   - 从 src-tauri/target/<triple>/release/bundle/** 与 gen/android|apple 收集产物
#   - 全部重命名为 **全小写** 规范名: moovn-<平台>-<版本>.<ext>（防止 mac/iOS 大小写认错）
#   - Windows 额外生成 ZIP 免安装包（portable exe；若不存在则打包 NSIS 解包目录结构说明）
#   - 输出到 release/<platform-dir>/，并生成 SHA256SUMS.txt
#   ** 不执行任何 git 操作、不创建 tag；单平台失败由调用方 job 自行决定，不影响其它平台 **
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PLATFORM_DIR="${1:?用法: collect-artifacts.sh <platform-dir>}"
OUT="$ROOT/release/$PLATFORM_DIR"
mkdir -p "$OUT"

VERSION="${MOOVN_VERSION_OVERRIDE:-$(node -p "require('./package.json').version")}"
# 规范化：全小写 + 文件名安全
VERSION=$(echo "$VERSION" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')

lower() { echo "$1" | tr 'A-Z' 'a-z'; }

copied=0
emit() { # emit <src> <dest-name>
  local src="$1" dest="$2"
  [ -e "$src" ] || return 0
  cp -a "$src" "$OUT/$dest"
  echo "   + $dest"
  copied=$((copied+1))
}

shopt -s nullglob globstar

case "$PLATFORM_DIR" in
  windows-*)
    ARCH="${PLATFORM_DIR#windows-}"   # x64 / x86
    for f in src-tauri/target/*/release/bundle/nsis/*.exe src-tauri/target/release/bundle/nsis/*.exe; do
      [ -f "$f" ] || continue
      b="$(basename "$f")"
      [[ "$b" == *"_x64-setup.exe" || "$ARCH" != "x64" ]] || true
      case "$b" in
        *_x64-setup.exe) emit "$f" "moovn-win-x64-${VERSION}-setup.exe" ;;
        *_x86-setup.exe|*_setup.exe) emit "$f" "moovn-win-x86-${VERSION}-setup.exe" ;;
      esac
    done
    for f in src-tauri/target/*/release/bundle/msi/*.msi src-tauri/target/release/bundle/msi/*.msi; do
      [ -f "$f" ] || continue
      b="$(basename "$f")"
      case "$b" in
        *_x64_en-US.msi) emit "$f" "moovn-win-x64-${VERSION}.msi" ;;
        *)               emit "$f" "moovn-win-x86-${VERSION}.msi" ;;
      esac
    done
    # ZIP 免安装：找 portable exe（tauri.windows.portable 或 target/release/MooVN.exe）
    PORTABLE=""
    for cand in \
      "src-tauri/target/${ARCHDIR:-x86_64-pc-windows-msvc}/release/moovn.exe" \
      "src-tauri/target/x86_64-pc-windows-msvc/release/MooVN.exe" \
      "src-tauri/target/i686-pc-windows-msvc/release/MooVN.exe" \
      "src-tauri/target/release/MooVN.exe"; do
      [ -f "$cand" ] && { PORTABLE="$cand"; break; }
    done
    if [ -n "$PORTABLE" ]; then
      STAGE="$OUT/.stage"; rm -rf "$STAGE"; mkdir -p "$STAGE/moovn-win-${ARCH}-portable"
      cp "$PORTABLE" "$STAGE/moovn-win-${ARCH}-portable/moovn.exe"
      printf 'MooVN %s win-%s 免安装版\n双击 moovn.exe 启动。数据保存在 %%APPDATA%%\\dev.moonano.moovn\n' \
        "$VERSION" "$ARCH" > "$STAGE/moovn-win-${ARCH}-portable/readme.txt"
      ( cd "$STAGE" && python3 -m zipfile -c "../moovn-win-${ARCH}-${VERSION}-portable.zip" "moovn-win-${ARCH}-portable" ) 2>/dev/null \
        || powershell.exe -NoProfile -Command "Compress-Archive -Path '$STAGE/moovn-win-${ARCH}-portable' -DestinationPath '$OUT/moovn-win-${ARCH}-${VERSION}-portable.zip'"
      rm -rf "$STAGE"
      [ -f "$OUT/moovn-win-${ARCH}-${VERSION}-portable.zip" ] && { echo "   + moovn-win-${ARCH}-${VERSION}-portable.zip"; copied=$((copied+1)); }
    else
      echo "::warning::未找到可执行文件用于免安装 ZIP（Windows portable 需在 tauri.conf 启用相应配置）"
    fi
    ;;
  mac-*)
    ARCH="${PLATFORM_DIR#mac-}"   # arm64 / x64
    for f in src-tauri/target/*/release/bundle/dmg/*.dmg src-tauri/target/release/bundle/dmg/*.dmg; do
      [ -f "$f" ] && emit "$f" "moovn-mac-${ARCH}-${VERSION}.dmg"
    done
    for d in src-tauri/target/*/release/bundle/macos/*.app src-tauri/target/release/bundle/macos/*.app; do
      [ -d "$d" ] || continue
      STAGE="$OUT/.stage-app"; rm -rf "$STAGE"; mkdir -p "$STAGE"
      cp -aR "$d" "$STAGE/"
      ( cd "$STAGE" && zip -qr "$OUT/moovn-mac-${ARCH}-${VERSION}-portable.app.zip" "$(basename "$d")" ) \
        || ( cd "$STAGE" && ditto -c -k --keepParent "$(basename "$d")" "$OUT/moovn-mac-${ARCH}-${VERSION}-portable.app.zip" )
      rm -rf "$STAGE"
      echo "   + moovn-mac-${ARCH}-${VERSION}-portable.app.zip"; copied=$((copied+1))
    done
    ;;
  ubuntu-*)
    ARCH="${PLATFORM_DIR#ubuntu-}"   # amd64 / i386
    for f in src-tauri/target/*/release/bundle/deb/*.deb src-tauri/target/release/bundle/deb/*.deb; do
      [ -f "$f" ] && emit "$f" "moovn-ubuntu-${ARCH}-${VERSION}.deb"
    done
    for f in src-tauri/target/*/release/bundle/rpm/*.rpm src-tauri/target/release/bundle/rpm/*.rpm; do
      [ -f "$f" ] && emit "$f" "moovn-ubuntu-${ARCH}-${VERSION}.rpm"
    done
    for f in src-tauri/target/*/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/appimage/*.AppImage; do
      [ -f "$f" ] && emit "$f" "moovn-ubuntu-${ARCH}-${VERSION}.appimage"
    done
    ;;
  android)
    for f in src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk \
             src-tauri/gen/android/app/build/outputs/apk/universal/debug/*.apk; do
      [ -f "$f" ] && emit "$f" "moovn-android-${VERSION}.apk"
    done
    for f in src-tauri/gen/android/app/build/outputs/bundle/universalRelease/*.aab; do
      [ -f "$f" ] && emit "$f" "moovn-android-${VERSION}.aab"
    done
    ;;
  ios)
    for f in src-tauri/gen/apple/build/arm64/*.ipa $(find src-tauri/gen/apple -name '*.ipa' 2>/dev/null); do
      [ -f "$f" ] && emit "$f" "moovn-ios-${VERSION}.ipa"
    done
    # 无签名 ipa 时打包 Xcode 工程作为兜底产物
    if [ "$copied" -eq 0 ] && [ -d src-tauri/gen/apple ]; then
      ditto -c -k --keepParent src-tauri/gen/apple "$OUT/moovn-ios-${VERSION}-project.zip" && \
        { echo "   + moovn-ios-${VERSION}-project.zip (Xcode 工程，需本地签名)"; copied=$((copied+1)); }
    fi
    ;;
  *)
    echo "未知 platform-dir: $PLATFORM_DIR" >&2; exit 2 ;;
esac

if [ "$copied" -eq 0 ]; then
  echo "!! release/$PLATFORM_DIR 下未收集到任何产物，请检查上方构建日志" >&2
  exit 1
fi

# 最终防呆：目录内所有文件名强制小写扩展名统一（保留内容不动）
for f in "$OUT"/*; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  low="$(lower "$base")"
  if [ "$base" != "$low" ]; then mv -f "$f" "$OUT/$low"; echo "   ~ 重命名 -> $low"; fi
done

( cd "$OUT" && sha256sum -- * 2>/dev/null | grep -v SHA256SUMS > SHA256SUMS.txt || shasum -a 256 -- * | grep -v SHA256SUMS > SHA256SUMS.txt )
echo "==> collect-artifacts[$PLATFORM_DIR] 完成: $copied 个产物 -> $OUT"
