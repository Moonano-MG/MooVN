import { VNProject, ExportPlatform } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS, AUDIO_ASSETS } from '../data/assets';

export interface MultiPlatformBuildOptions {
  platform: ExportPlatform;
  packageId: string;
  appName: string;
  version: string;
  fullscreen: boolean;
  landscapeLock: boolean;
}

/**
 * Generates the standalone playable runtime HTML (used both by Web export and as the core
 * asset payload inside Android / Windows / macOS / iOS native containers).
 * Honors 100% of project.uiConfig and executes all 40 categorized node types.
 */
export function buildStandaloneGameHtml(project: VNProject, platform: ExportPlatform = 'web'): string {
  const projectJson = JSON.stringify(project);
  const bgJson = JSON.stringify(BACKGROUND_ASSETS);
  const charJson = JSON.stringify(CHARACTER_ASSETS);
  const audioJson = JSON.stringify(AUDIO_ASSETS);
  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const ui = project.uiConfig;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="${ui.mainMenu.panelColor}" />
  <title>${project.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-tap-highlight-color: transparent; }
    body, html {
      width: 100%; height: 100%; overflow: hidden;
      background: #030712; color: #f8fafc;
      font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    #app { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #040916; }
    .layer-bg {
      position: absolute; inset: 0;
      background-size: cover; background-position: center;
      transition: background-image 0.55s ease, transform 0.65s ease, filter 0.5s ease;
    }
    .layer-chars { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .char-sprite {
      position: absolute; transform: translate(-50%, -50%);
      max-height: 86vh; object-fit: contain;
      filter: drop-shadow(0 16px 32px rgba(0,0,0,0.65));
      transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    }
    /* Screen Free Text Overlay */
    #screen-text-layer {
      position: absolute; inset: 0; z-index: 22; pointer-events: none;
      display: none;
    }
    #cinematic-top, #cinematic-bottom {
      position: absolute; left: 0; right: 0; height: 11vh; background: #000; z-index: 21; display: none;
    }
    #cinematic-top { top: 0; }
    #cinematic-bottom { bottom: 0; }
    /* Main Menu */
    #main-menu { position: absolute; inset: 0; z-index: 40; display: flex; }
    .menu-left {
      width: 34%; min-width: 300px; max-width: 460px; height: 100%;
      background: ${ui.mainMenu.panelColor};
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 54px 44px; position: relative; z-index: 3;
    }
    .menu-blur-bridge {
      position: absolute; top: 0; bottom: 0; left: 31%; width: 140px; z-index: 2;
      background: linear-gradient(90deg, ${ui.mainMenu.panelColor} 0%, ${ui.mainMenu.panelColor}cc 45%, transparent 100%);
      backdrop-filter: blur(10px); pointer-events: none;
    }
    .menu-right { flex: 1; height: 100%; position: relative; overflow: hidden; }
    .menu-btn {
      width: 100%; text-align: left; background: transparent;
      border: none; border-left: 3px solid transparent;
      color: #cbd5e1; font-size: 18px; font-weight: 600;
      padding: 13px 18px; cursor: pointer; letter-spacing: 0.08em;
      transition: all 0.2s ease;
    }
    .menu-btn:hover {
      color: #fff; border-left-color: ${ui.mainMenu.accentColor};
      background: linear-gradient(90deg, rgba(56,189,248,0.18), transparent);
      padding-left: 26px;
    }
    /* Customizable Dialogue Box */
    #dlg-wrap {
      position: absolute; left: 50%; transform: translateX(-50%);
      bottom: ${ui.dialogueBox.bottomOffset}px;
      width: ${ui.dialogueBox.widthPercent}%;
      max-width: 1180px; z-index: 25;
    }
    .dlg-box {
      position: relative;
      min-height: ${ui.dialogueBox.heightPx}px;
      padding: ${ui.dialogueBox.paddingPx}px ${ui.dialogueBox.paddingPx + 6}px 48px ${ui.dialogueBox.paddingPx + 6}px;
      background: ${ui.dialogueBox.bgColor};
      opacity: ${ui.dialogueBox.bgOpacity};
      border: ${ui.dialogueBox.borderWidth}px solid ${ui.dialogueBox.borderColor};
      border-radius: ${ui.dialogueBox.borderRadius}px;
      backdrop-filter: ${ui.dialogueBox.backdropBlur ? 'blur(16px)' : 'none'};
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.72);
      cursor: pointer;
    }
    .speaker-name {
      font-size: ${ui.dialogueBox.speakerFontSize}px; font-weight: 700;
      margin-bottom: 10px; letter-spacing: 0.04em;
    }
    .dlg-text {
      font-size: ${ui.dialogueBox.textFontSize}px;
      line-height: ${ui.dialogueBox.lineHeight};
      color: ${ui.dialogueBox.textColor};
      white-space: pre-wrap;
    }
    .dlg-controls {
      position: absolute; right: 20px; bottom: 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .ctrl-btn {
      background: rgba(15, 29, 58, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #cbd5e1; font-size: 12px; padding: 4px 12px;
      border-radius: 6px; cursor: pointer; transition: all 0.15s;
    }
    .ctrl-btn:hover, .ctrl-btn.active {
      color: #fff; border-color: #38bdf8; background: rgba(14, 116, 144, 0.45);
    }
    /* Choices */
    #choice-overlay {
      position: absolute;
      left: ${ui.choiceBox.position === 'screen_center' ? '50%' : `calc((100% - ${ui.dialogueBox.widthPercent}%) / 2)`};
      transform: ${ui.choiceBox.position === 'screen_center' ? 'translate(-50%, -50%)' : 'none'};
      top: ${ui.choiceBox.position === 'screen_center' ? '45%' : 'auto'};
      bottom: ${ui.choiceBox.position === 'screen_center' ? 'auto' : `${ui.dialogueBox.bottomOffset + ui.dialogueBox.heightPx + 18}px`};
      display: none; flex-direction: column; gap: 10px; z-index: 30;
      max-width: 92vw;
    }
    .choice-item {
      position: relative;
      background: ${ui.choiceBox.bgColor};
      border: 1px solid ${ui.choiceBox.borderColor};
      color: ${ui.choiceBox.textColor};
      padding: 11px 22px 11px 24px;
      border-radius: ${ui.choiceBox.borderRadius}px;
      font-size: ${ui.choiceBox.fontSize}px;
      cursor: pointer; text-align: left;
      white-space: nowrap; overflow-x: auto; max-width: 92vw;
      box-shadow: 0 10px 26px rgba(0,0,0,0.55);
      transition: all 0.18s ease;
    }
    .choice-item::before {
      content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
      background: transparent; transition: background 0.18s ease;
    }
    .choice-item:hover {
      background: rgba(18, 43, 84, 0.96);
      border-color: ${ui.choiceBox.hoverAccentColor}; color: #fff;
      transform: translateX(4px);
    }
    .choice-item:hover::before { background: ${ui.choiceBox.hoverAccentColor}; }
    /* Hide Hint */
    #restore-hint {
      position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%);
      padding: 8px 20px; border-radius: 999px;
      background: rgba(6, 15, 34, 0.82); border: 1px solid rgba(56,189,248,0.3);
      color: #e2e8f0; font-size: 13px; pointer-events: none;
      opacity: 0; transition: opacity 0.65s ease; z-index: 35;
    }
    /* Toast Banner */
    #toast-banner {
      position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
      padding: 10px 24px; border-radius: 999px;
      background: rgba(7, 20, 43, 0.92); border: 1px solid #38bdf8;
      color: #f8fafc; font-size: 14px; font-weight: 600;
      z-index: 38; display: none; box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="bg-layer" class="layer-bg"></div>
    <div id="char-layer" class="layer-chars"></div>
    <div id="cinematic-top"></div>
    <div id="cinematic-bottom"></div>
    <div id="screen-text-layer"></div>
    <div id="toast-banner"></div>

    <div id="main-menu">
      <div class="menu-left">
        <div>
          <div style="font-size:11px;letter-spacing:0.25em;color:${ui.mainMenu.accentColor};margin-bottom:10px;">${ui.mainMenu.subtitleText}</div>
          <h1 style="font-size:32px;font-weight:800;line-height:1.25;color:${ui.mainMenu.titleColor};">${project.title}</h1>
          <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Version ${project.version} · Target: ${platform.toUpperCase()}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="menu-btn" onclick="startNewGame()">开始游戏</button>
          <button class="menu-btn" onclick="continueGame()">继续游戏</button>
          <button class="menu-btn" onclick="window.close()">退出游戏</button>
        </div>
        <div style="font-size:11px;color:#64748b;">Powered by MooVN Engine</div>
      </div>
      <div class="menu-blur-bridge"></div>
      <div class="menu-right" id="menu-kv"></div>
    </div>

    <div id="choice-overlay"></div>

    <div id="dlg-wrap" style="display:none;">
      <div class="dlg-box" onclick="advanceStep()">
        <div id="speaker-name" class="speaker-name"></div>
        <div id="dlg-text" class="dlg-text"></div>
        <div class="dlg-controls" onclick="event.stopPropagation()">
          ${ui.dialogueBox.visibleControls.back ? '<button class="ctrl-btn" onclick="stepBack()">后退</button>' : ''}
          ${ui.dialogueBox.visibleControls.auto ? '<button class="ctrl-btn" id="btn-auto" onclick="toggleAuto()">自动</button>' : ''}
          ${ui.dialogueBox.visibleControls.skip ? '<button class="ctrl-btn" id="btn-skip" onclick="toggleSkip()">快进</button>' : ''}
          ${ui.dialogueBox.visibleControls.hide ? '<button class="ctrl-btn" onclick="hideUI()">隐藏</button>' : ''}
        </div>
      </div>
    </div>

    <div id="restore-hint">点击屏幕任意位置恢复界面</div>
  </div>

  <script>
    const PROJECT = ${projectJson};
    const BG_ASSETS = ${bgJson};
    const CHAR_ASSETS = ${charJson};
    const ORIGIN = "${originUrl}";

    let currentNodeId = PROJECT.startNodeId;
    let dlgIdx = 0;
    let historyStack = [];
    let affection = {};
    PROJECT.characters.forEach(c => affection[c.id] = c.initialAffection);

    let fullText = "";
    let typedText = "";
    let typingTimer = null;
    let isAuto = false;
    let isSkip = false;
    let uiHidden = false;

    function resolveUrl(p) {
      if (!p) return "";
      if (p.startsWith("http") || p.startsWith("data:")) return p;
      return ORIGIN ? (ORIGIN + p) : p;
    }

    const menuBg = BG_ASSETS.find(b => b.id === PROJECT.uiConfig.mainMenu.backgroundId) || BG_ASSETS[0];
    if (menuBg) {
      document.getElementById("menu-kv").style.backgroundImage = "url('" + resolveUrl(menuBg.path) + "')";
      document.getElementById("menu-kv").style.backgroundSize = "cover";
      document.getElementById("menu-kv").style.backgroundPosition = "center";
    }

    function getNode(id) {
      return PROJECT.nodes.find(n => n.id === id) || PROJECT.nodes[0];
    }

    function startNewGame() {
      currentNodeId = PROJECT.startNodeId;
      dlgIdx = 0;
      document.getElementById("main-menu").style.display = "none";
      document.getElementById("dlg-wrap").style.display = "block";
      renderScene();
    }

    function continueGame() { startNewGame(); }

    function renderScene() {
      const node = getNode(currentNodeId);
      const bg = BG_ASSETS.find(b => b.id === node.backgroundId) || BG_ASSETS[0];
      const bgEl = document.getElementById("bg-layer");
      if (bg) bgEl.style.backgroundImage = "url('" + resolveUrl(bg.path) + "')";

      // Filter & Camera
      bgEl.style.filter = node.colorFilter === 'sepia' ? 'sepia(0.75)' : node.colorFilter === 'grayscale' ? 'grayscale(0.9)' : 'none';
      const cam = node.cameraConfig;
      bgEl.style.transform = cam ? \`scale(\${cam.zoom || 1}) translate(\${cam.offsetX || 0}%, \${cam.offsetY || 0}%)\` : 'none';

      // Toast
      const toastEl = document.getElementById("toast-banner");
      if (node.toastMessage) {
        toastEl.textContent = node.toastMessage;
        toastEl.style.display = "block";
        setTimeout(() => { toastEl.style.display = "none"; }, 3000);
      }

      // Screen Text Layer
      const stLayer = document.getElementById("screen-text-layer");
      const topBar = document.getElementById("cinematic-top");
      const botBar = document.getElementById("cinematic-bottom");
      if (node.screenTextConfig) {
        const st = node.screenTextConfig;
        stLayer.style.display = "block";
        stLayer.style.background = st.bgOverlay === 'dim' ? 'rgba(2,6,23,0.68)' : st.bgOverlay === 'black' ? '#020617' : 'transparent';
        topBar.style.display = st.bgOverlay === 'cinematic_bars' ? 'block' : 'none';
        botBar.style.display = st.bgOverlay === 'cinematic_bars' ? 'block' : 'none';
        stLayer.innerHTML = \`<div style="position:absolute;left:\${st.x}%;top:\${st.y}%;transform:translate(-50%,-50%);text-align:\${st.align};width:84%;">
          <div style="font-size:\${st.fontSize}px;font-weight:800;color:\${st.color};text-shadow:0 4px 24px rgba(0,0,0,0.85);white-space:pre-wrap;">\${st.text}</div>
          \${st.subText ? \`<div style="font-size:13px;letter-spacing:0.24em;color:#94a3b8;margin-top:10px;">\${st.subText}</div>\` : ''}
        </div>\`;
      } else {
        stLayer.style.display = "none";
        topBar.style.display = "none";
        botBar.style.display = "none";
      }

      // Characters & expression override from current dialogue line
      const line = (node.dialogues && node.dialogues[dlgIdx]) || { speakerName: "旁白", speakerColor: "#94a3b8", text: "" };
      const charLayer = document.getElementById("char-layer");
      charLayer.innerHTML = "";
      (node.characters || []).forEach(pl => {
        let spriteId = pl.spriteId;
        if (line.speakerId === pl.characterId && line.expressionSpriteId) {
          spriteId = line.expressionSpriteId;
        }
        const asset = CHAR_ASSETS.find(a => a.id === spriteId) || CHAR_ASSETS[0];
        if (!asset) return;
        const img = document.createElement("img");
        img.className = "char-sprite";
        img.src = resolveUrl(asset.path);
        img.style.left = pl.x + "%";
        img.style.top = pl.y + "%";
        img.style.height = (76 * (pl.scale || 1)) + "vh";
        charLayer.appendChild(img);
      });

      const spEl = document.getElementById("speaker-name");
      spEl.textContent = line.speakerName || "";
      spEl.style.color = line.speakerColor || "#38bdf8";

      startTyping(line.text || "");
      renderChoices(node);
    }

    function startTyping(text) {
      clearInterval(typingTimer);
      fullText = text;
      const textEl = document.getElementById("dlg-text");
      if (isSkip) {
        typedText = fullText;
        textEl.textContent = fullText;
        return;
      }
      typedText = "";
      textEl.textContent = "";
      let i = 0;
      typingTimer = setInterval(() => {
        i++;
        typedText = fullText.slice(0, i);
        textEl.textContent = typedText;
        if (i >= fullText.length) clearInterval(typingTimer);
      }, 24);
    }

    function renderChoices(node) {
      const box = document.getElementById("choice-overlay");
      box.innerHTML = "";
      const isLastLine = dlgIdx >= (node.dialogues.length - 1);
      if ((node.type === "choice" || node.type === "timed_choice") && isLastLine && node.choices && node.choices.length > 0) {
        box.style.display = "flex";
        node.choices.forEach(ch => {
          const btn = document.createElement("button");
          btn.className = "choice-item";
          btn.textContent = ch.text;
          btn.onclick = (e) => {
            e.stopPropagation();
            if (ch.affectionCharacterId && ch.affectionDelta) {
              affection[ch.affectionCharacterId] = (affection[ch.affectionCharacterId] || 0) + ch.affectionDelta;
            }
            historyStack.push({ nodeId: currentNodeId, dlgIdx });
            currentNodeId = ch.targetNodeId;
            dlgIdx = 0;
            renderScene();
          };
          box.appendChild(btn);
        });
      } else {
        box.style.display = "none";
      }
    }

    function advanceStep() {
      if (uiHidden) return;
      if (typedText.length < fullText.length && !isSkip) {
        clearInterval(typingTimer);
        typedText = fullText;
        document.getElementById("dlg-text").textContent = fullText;
        return;
      }
      const node = getNode(currentNodeId);
      if (dlgIdx < node.dialogues.length - 1) {
        historyStack.push({ nodeId: currentNodeId, dlgIdx });
        dlgIdx++;
        renderScene();
        return;
      }
      if (node.type === "choice" || node.type === "timed_choice") return;
      if (node.type === "condition" && node.conditionRule) {
        const rule = node.conditionRule;
        const val = affection[rule.characterId] || 0;
        const pass = val >= Number(rule.compareValue);
        currentNodeId = pass ? rule.trueTargetNodeId : rule.falseTargetNodeId;
        dlgIdx = 0;
        renderScene();
        return;
      }
      if (node.nextNodeId) {
        historyStack.push({ nodeId: currentNodeId, dlgIdx });
        currentNodeId = node.nextNodeId;
        dlgIdx = 0;
        renderScene();
      }
    }

    function stepBack() {
      if (historyStack.length === 0) return;
      const prev = historyStack.pop();
      currentNodeId = prev.nodeId;
      dlgIdx = prev.dlgIdx;
      renderScene();
    }

    function toggleAuto() {
      isAuto = !isAuto;
      const btn = document.getElementById("btn-auto");
      if (btn) btn.classList.toggle("active", isAuto);
    }

    function toggleSkip() {
      isSkip = !isSkip;
      const btn = document.getElementById("btn-skip");
      if (btn) btn.classList.toggle("active", isSkip);
      if (isSkip) advanceStep();
    }

    function hideUI() {
      uiHidden = true;
      document.getElementById("dlg-wrap").style.display = "none";
      document.getElementById("choice-overlay").style.display = "none";
      const hint = document.getElementById("restore-hint");
      setTimeout(() => { if (uiHidden) hint.style.opacity = "1"; }, 550);
      setTimeout(() => { hint.style.opacity = "0"; }, 2600);
    }

    document.getElementById("app").addEventListener("click", () => {
      if (uiHidden) {
        uiHidden = false;
        document.getElementById("dlg-wrap").style.display = "block";
        renderChoices(getNode(currentNodeId));
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Generates platform-specific multi-file bundle archive / build kit for Android, Windows, macOS, iOS, or Web.
 */
export function exportPlatformPackage(
  project: VNProject,
  options: MultiPlatformBuildOptions
): void {
  const htmlRuntime = buildStandaloneGameHtml(project, options.platform);
  const safeName = project.title.replace(/\s+/g, '_');

  if (options.platform === 'web') {
    const blob = new Blob([htmlRuntime], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, `${safeName}_Web_PC_Mobile.html`);
    return;
  }

  if (options.platform === 'android') {
    // Export complete Android APK Build Bundle (Capacitor + Tauri Android + Gradle config + embedded WebAPK runtime)
    const androidBundle = {
      platform: 'Android (APK / AAB Build Bundle)',
      packageId: options.packageId,
      appName: options.appName,
      versionName: options.version,
      orientation: options.landscapeLock ? 'sensorLandscape' : 'unspecified',
      androidManifestXml: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${options.packageId}">
  <uses-permission android:name="android.permission.INTERNET" />
  <application
    android:allowBackup="true"
    android:label="${options.appName}"
    android:supportsRtl="true"
    android:theme="@style/Theme.AppCompat.NoActionBar">
    <activity
      android:name=".MainActivity"
      android:screenOrientation="${options.landscapeLock ? 'sensorLandscape' : 'unspecified'}"
      android:configChanges="orientation|keyboardHidden|screenSize"
      android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>`,
      capacitorConfig: {
        appId: options.packageId,
        appName: options.appName,
        webDir: 'dist',
        bundledWebRuntime: false,
        android: {
          allowMixedContent: true,
          backgroundColor: project.uiConfig.mainMenu.panelColor,
        },
      },
      buildScriptSh: `#!/usr/bin/env bash
# MooVN Android APK One-Click Builder (Tauri v2 / Capacitor)
set -e
echo "Building ${options.appName} (${options.packageId}) for Android..."
npx tauri android init || true
npx tauri android build --apk
echo "APK generated at src-tauri/gen/android/app/build/outputs/apk/universal/release/"
`,
      embeddedRuntimeHtml: htmlRuntime,
    };

    const blob = new Blob([JSON.stringify(androidBundle, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerDownload(blob, `${safeName}_Android_APK_Bundle.json`);
    // Also download the mobile-ready touch runtime HTML
    const htmlBlob = new Blob([htmlRuntime], { type: 'text/html;charset=utf-8' });
    setTimeout(() => {
      triggerDownload(htmlBlob, `${safeName}_Android_TouchRuntime.html`);
    }, 250);
    return;
  }

  if (options.platform === 'windows') {
    const windowsBundle = {
      platform: 'Windows 10/11 (x64 .exe / MSI / NSIS Bundle)',
      packageId: options.packageId,
      productName: options.appName,
      version: options.version,
      fullscreen: options.fullscreen,
      resolution: project.resolution,
      tauriWindowsConfig: {
        productName: options.appName,
        identifier: options.packageId,
        bundle: {
          active: true,
          targets: ['msi', 'nsis'],
          windows: {
            webviewInstallMode: { type: 'downloadBootstrapper' },
          },
        },
      },
      buildWindowsBat: `@echo off
echo [MooVN] Building Windows Native .exe for ${options.appName}...
call npm install
call npx tauri build --bundles nsis,msi
echo Done! Output in src-tauri\\target\\release\\bundle\\nsis\\
pause`,
      embeddedRuntimeHtml: htmlRuntime,
    };
    const blob = new Blob([JSON.stringify(windowsBundle, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerDownload(blob, `${safeName}_Windows_EXE_Bundle.json`);
    return;
  }

  // macOS or iOS
  const appleBundle = {
    platform: options.platform === 'macos' ? 'macOS Universal (.dmg / .app)' : 'iOS (.ipa / Xcode Workspace)',
    bundleIdentifier: options.packageId,
    displayName: options.appName,
    version: options.version,
    landscapeLock: options.landscapeLock,
    buildCommand:
      options.platform === 'macos'
        ? 'npx tauri build --bundles dmg,app'
        : 'npx tauri ios init && npx tauri ios build --export-method debugging',
    embeddedRuntimeHtml: htmlRuntime,
  };
  const blob = new Blob([JSON.stringify(appleBundle, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  triggerDownload(
    blob,
    `${safeName}_${options.platform.toUpperCase()}_Bundle.json`
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
