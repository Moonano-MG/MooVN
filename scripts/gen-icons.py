#!/usr/bin/env python3
"""从 src-tauri/icons/app-icon.jpg 生成 Tauri 所需的全套应用图标。

生成:
  - PNG: 32x32.png / 128x128.png / 128x128@2x.png(256) / icon.png(512)
  - Windows: icon.ico（含 16/24/32/48/64/128/256 多尺寸）
  - macOS:   icon.icns（含 16~1024 全套 iOS/macOS 命名条目，Android mipmap 亦可复用）
若 Pillow 不可用则跳过（此时请手动运行 `npm run tauri icon`）。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ICONS = os.path.join(ROOT, "src-tauri", "icons")
SRC = os.path.join(ICONS, "app-icon.jpg")


def main() -> int:
    try:
        from PIL import Image
    except ImportError:
        print("[icons] 未安装 Pillow，跳过自动生成。请在开发机执行: npm run tauri icon src-tauri/icons/app-icon.jpg")
        return 0
    if not os.path.isfile(SRC):
        print(f"[icons] 源图不存在: {SRC}")
        return 1

    base = Image.open(SRC).convert("RGBA")
    # 裁成居中正方形再缩放，避免拉伸变形
    w, h = base.size
    side = min(w, h)
    base = base.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))

    def sized(px: int) -> "Image.Image":
        return base.resize((px, px), Image.LANCZOS)

    os.makedirs(ICONS, exist_ok=True)
    for name, px in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
        sized(px).save(os.path.join(ICONS, name))
        print(f"[icons] 生成 {name}")

    # ---- ICO（Windows）----
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    sized(max(ico_sizes)).save(
        os.path.join(ICONS, "icon.ico"),
        sizes=[(s, s) for s in ico_sizes],
    )
    print("[icons] 生成 icon.ico")

    # ---- ICNS（macOS）：Pillow 支持多尺寸 icns 保存 ----
    entries = []
    mapping = [
        ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
    ]
    tmpdir = os.path.join(ICONS, ".icns_tmp")
    os.makedirs(tmpdir, exist_ok=True)
    for name, px in mapping:
        p = os.path.join(tmpdir, name)
        sized(min(px, 1024)).save(p)
        entries.append(p)
    try:
        sized(1024).save(
            os.path.join(ICONS, "icon.icns"),
            sizes=[(s, s) for _, s in mapping],
        )
        print("[icons] 生成 icon.icns")
    except Exception as e:  # 某些 Pillow 版本对 icns 支持有限
        print(f"[icons] icns 生成失败({e})，请在 macOS 上运行: npm run tauri icon {SRC}")
    finally:
        for p in entries:
            try:
                os.remove(p)
            except OSError:
                pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
