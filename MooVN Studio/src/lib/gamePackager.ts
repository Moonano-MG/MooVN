import type { VNProject, BackgroundAsset, CharacterSpriteAsset } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets';
import { escapeHtmlText } from './vnRuntimeCore';

export interface StandaloneAssetCatalog {
  backgrounds: BackgroundAsset[];
  characters: CharacterSpriteAsset[];
}

/** Embed only built-in images actually referenced by this project, not links to the editor host. */
export async function createStandaloneAssetCatalog(project: VNProject): Promise<StandaloneAssetCatalog> {
  const backgrounds = new Set<string>();
  const sprites = new Set<string>();
  if (project.uiConfig.mainMenu.backgroundId) backgrounds.add(project.uiConfig.mainMenu.backgroundId);
  if (project.uiConfig.mainMenu.heroCharacterSpriteId) sprites.add(project.uiConfig.mainMenu.heroCharacterSpriteId);
  for (const node of project.nodes) {
    if (node.backgroundId) backgrounds.add(node.backgroundId);
    if (node.targetExpressionSpriteId) sprites.add(node.targetExpressionSpriteId);
    for (const placement of node.characters) if (placement.spriteId) sprites.add(placement.spriteId);
    for (const line of node.dialogues) if (line.expressionSpriteId) sprites.add(line.expressionSpriteId);
  }
  const urlCache = new Map<string, Promise<string>>();
  const embedded = (path: string) => {
    let result = urlCache.get(path);
    if (!result) {
      result = (async () => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`ERR_EXPORT_ASSET: 无法读取 ${path} (${response.status})`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error(`ERR_EXPORT_ASSET: ${path} 不是可用图片`);
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error || new Error(`ERR_EXPORT_ASSET: 无法打包 ${path}`));
          reader.readAsDataURL(blob);
        });
      })();
      urlCache.set(path, result);
    }
    return result;
  };
  const usedBackgrounds = BACKGROUND_ASSETS.filter((item) => backgrounds.has(item.id));
  const usedCharacters = CHARACTER_ASSETS.filter((item) => sprites.has(item.id));
  return {
    backgrounds: await Promise.all(usedBackgrounds.map(async (item) => ({ ...item, path: await embedded(item.path) }))),
    characters: await Promise.all(usedCharacters.map(async (item) => ({ ...item, path: await embedded(item.path) }))),
  };
}

/**
 * Generates a standalone HTML player. Native installers and runtime chapter
 * imports are not provided by this exporter.
 */
export function buildStandaloneGameHtml(
  project: VNProject,
  catalog?: StandaloneAssetCatalog
): string {
  const safeJson = (val: unknown) =>
    JSON.stringify(val)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  const projectJson = safeJson(project);
  const bgJson = safeJson(catalog?.backgrounds ?? BACKGROUND_ASSETS);
  const charJson = safeJson(catalog?.characters ?? CHARACTER_ASSETS);
  const originUrl = '';
  const ui = project.uiConfig;
  // CSS and style attributes are a different context from HTML text or JSON.
  // Reject untrusted values instead of interpolating them into a <style> block.
  const color = (value: string): string => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`ERR_EXPORT_COLOR: 无效颜色 ${value}`);
    return value;
  };
  const numeric = (value: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('ERR_EXPORT_NUMBER: 无效界面数值');
    return value;
  };
  const colors = {
    panel: color(ui.mainMenu.panelColor), accent: color(ui.mainMenu.accentColor), title: color(ui.mainMenu.titleColor),
    dialogueBg: color(ui.dialogueBox.bgColor), dialogueBorder: color(ui.dialogueBox.borderColor), dialogueText: color(ui.dialogueBox.textColor),
    choiceBg: color(ui.choiceBox.bgColor), choiceBorder: color(ui.choiceBox.borderColor), choiceText: color(ui.choiceBox.textColor),
    choiceAccent: color(ui.choiceBox.hoverAccentColor),
  };
  for (const value of [ui.dialogueBox.bottomOffset, ui.dialogueBox.widthPercent, ui.dialogueBox.heightPx,
    ui.dialogueBox.paddingPx, ui.dialogueBox.bgOpacity, ui.dialogueBox.borderWidth, ui.dialogueBox.borderRadius,
    ui.dialogueBox.speakerFontSize, ui.dialogueBox.textFontSize, ui.dialogueBox.lineHeight,
    ui.choiceBox.borderRadius, ui.choiceBox.fontSize]) numeric(value);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="${escapeHtmlText(colors.panel)}" />
  <title>${escapeHtmlText(project.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-tap-highlight-color: transparent; }
    body, html {
      width: 100%; height: 100%; overflow: hidden;
      background: #030712; color: #f8fafc;
      font-family: "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    #app { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #040916; }
    .layer-bg {
      position: absolute; inset: 0;
      background-size: cover; background-position: center;
      transition: background-image 0.45s ease, transform 0.55s ease, filter 0.45s ease;
    }
    .layer-chars { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .char-actor-wrap {
      position: absolute; transform: translate(-50%, -50%);
      height: 78vh; display: flex; align-items: flex-end; justify-content: center;
      transition: left 0.35s ease, top 0.35s ease, transform 0.35s ease, opacity 0.3s ease;
    }
    .char-sprite {
      height: 100%; width: auto; object-fit: contain;
      filter: drop-shadow(0 16px 32px rgba(0,0,0,0.68));
      transform-origin: bottom center;
    }
    @keyframes moovn-cam-shake {
      0%{transform:translate3d(0,0,0);}
      20%{transform:translate3d(-7px,4px,0);}
      40%{transform:translate3d(6px,-5px,0);}
      60%{transform:translate3d(-4px,3px,0);}
      80%{transform:translate3d(2px,-2px,0);}
      100%{transform:translate3d(0,0,0);}
    }
    .cam-shake-once { animation: moovn-cam-shake 0.42s ease-out 1 forwards; }

    #screen-text-layer { position: absolute; inset: 0; z-index: 22; pointer-events: none; display: none; }
    #cinematic-top, #cinematic-bottom { position: absolute; left: 0; right: 0; height: 10vh; background: #000; z-index: 21; display: none; }
    #cinematic-top { top: 0; }
    #cinematic-bottom { bottom: 0; }

    /* Top HUD Bar */
    #top-hud {
      position: absolute; top: 12px; left: 16px; right: 16px; z-index: 32;
      display: none; align-items: center; justify-content: space-between; pointer-events: none;
    }
    .hud-group { display: flex; gap: 6px; pointer-events: auto; flex-wrap: wrap; }
    .hud-btn {
      background: rgba(10, 18, 36, 0.82); border: 1px solid rgba(148, 163, 184, 0.25);
      color: #e2e8f0; font-size: 12px; padding: 5px 11px; border-radius: 6px;
      cursor: pointer; backdrop-filter: blur(8px); transition: all 0.15s;
    }
    .hud-btn:hover { border-color: #38bdf8; color: #fff; background: rgba(14, 116, 144, 0.45); }

    /* Main Menu */
    #main-menu { position: absolute; inset: 0; z-index: 40; display: flex; }
    .menu-left {
      width: 35%; min-width: 280px; max-width: 440px; height: 100%;
      background: ${colors.panel};
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 48px 38px; position: relative; z-index: 3;
    }
    .menu-blur-bridge {
      position: absolute; top: 0; bottom: 0; left: 32%; width: 130px; z-index: 2;
      background: linear-gradient(90deg, ${colors.panel} 0%, ${colors.panel}cc 45%, transparent 100%);
      backdrop-filter: blur(10px); pointer-events: none;
    }
    .menu-right { flex: 1; height: 100%; position: relative; overflow: hidden; }
    .menu-btn {
      width: 100%; text-align: left; background: transparent;
      border: none; border-left: 3px solid transparent;
      color: #cbd5e1; font-size: 17px; font-weight: 600;
      padding: 12px 16px; cursor: pointer; letter-spacing: 0.06em;
      transition: all 0.18s ease;
    }
    .menu-btn:hover {
      color: #fff; border-left-color: ${colors.accent};
      background: linear-gradient(90deg, rgba(56,189,248,0.18), transparent);
      padding-left: 24px;
    }

    /* Dialogue Box */
    #dlg-wrap {
      position: absolute; left: 50%; transform: translateX(-50%);
      bottom: ${ui.dialogueBox.bottomOffset}px;
      width: ${ui.dialogueBox.widthPercent}%;
      max-width: 1180px; z-index: 25;
    }
    .dlg-box {
      position: relative;
      min-height: ${ui.dialogueBox.heightPx}px;
      padding: ${ui.dialogueBox.paddingPx}px ${ui.dialogueBox.paddingPx + 6}px 46px ${ui.dialogueBox.paddingPx + 6}px;
      background: ${colors.dialogueBg};
      opacity: ${ui.dialogueBox.bgOpacity};
      border: ${ui.dialogueBox.borderWidth}px solid ${colors.dialogueBorder};
      border-radius: ${ui.dialogueBox.borderRadius}px;
      backdrop-filter: ${ui.dialogueBox.backdropBlur ? 'blur(16px)' : 'none'};
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.72);
      cursor: pointer;
    }
    .speaker-name {
      font-size: ${ui.dialogueBox.speakerFontSize}px; font-weight: 700;
      margin-bottom: 8px; letter-spacing: 0.04em;
    }
    .dlg-text {
      font-size: ${ui.dialogueBox.textFontSize}px;
      line-height: ${ui.dialogueBox.lineHeight};
      color: ${colors.dialogueText};
      white-space: pre-wrap;
    }
    .dlg-controls {
      position: absolute; right: 16px; bottom: 10px;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .ctrl-btn {
      background: rgba(15, 29, 58, 0.82);
      border: 1px solid rgba(148, 163, 184, 0.25);
      color: #cbd5e1; font-size: 12px; padding: 4px 10px;
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
      bottom: ${ui.choiceBox.position === 'screen_center' ? 'auto' : `${ui.dialogueBox.bottomOffset + ui.dialogueBox.heightPx + 16}px`};
      display: none; flex-direction: column; gap: 10px; z-index: 30;
      max-width: 92vw;
    }
    .choice-item {
      position: relative;
      background: ${colors.choiceBg};
      border: 1px solid ${colors.choiceBorder};
      color: ${colors.choiceText};
      padding: 11px 22px 11px 24px;
      border-radius: ${ui.choiceBox.borderRadius}px;
      font-size: ${ui.choiceBox.fontSize}px;
      line-height: 1.45;
      cursor: pointer; text-align: left;
      white-space: normal; word-break: break-word; height: auto; max-width: 92vw;
      box-shadow: 0 10px 26px rgba(0,0,0,0.55);
      transition: all 0.18s ease;
    }
    .choice-item:hover {
      background: rgba(18, 43, 84, 0.96);
      border-color: ${colors.choiceAccent}; color: #fff;
      transform: translateX(4px);
    }

    /* Modal Overlay (Save/Load & Backlog & Chapters) */
    #modal-overlay {
      position: absolute; inset: 0; z-index: 50; background: rgba(3, 7, 18, 0.86);
      backdrop-filter: blur(12px); display: none; align-items: center; justify-content: center; padding: 20px;
    }
    .modal-card {
      width: 100%; max-width: 860px; max-height: 86vh; background: #0b1324;
      border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px;
      display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.8);
    }
    .modal-header {
      padding: 12px 18px; background: #070d19; border-bottom: 1px solid rgba(148,163,184,0.18);
      display: flex; align-items: center; justify-content: space-between;
    }
    .save-tabs {
      display: flex; gap: 4px; padding: 8px 16px; background: #091020;
      border-bottom: 1px solid rgba(148,163,184,0.15); overflow-x: auto;
    }
    .save-tab-btn {
      padding: 4px 12px; border-radius: 6px; border: 1px solid transparent;
      background: #111c33; color: #94a3b8; font-size: 12px; cursor: pointer;
    }
    .save-tab-btn.active { background: #0284c7; color: #fff; font-weight: 600; }
    .save-grid {
      padding: 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; overflow-y: auto;
    }
    .save-slot {
      padding: 12px; border-radius: 8px; background: #101b30;
      border: 1px solid rgba(148,163,184,0.2); cursor: pointer; transition: all 0.15s;
    }
    .save-slot:hover { border-color: #38bdf8; background: #152542; }

    #restore-hint {
      position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%);
      padding: 8px 20px; border-radius: 999px;
      background: rgba(6, 15, 34, 0.82); border: 1px solid rgba(56,189,248,0.3);
      color: #e2e8f0; font-size: 13px; pointer-events: none;
      opacity: 0; transition: opacity 0.65s ease; z-index: 35;
    }
    #toast-banner {
      position: absolute; top: 54px; left: 50%; transform: translateX(-50%);
      padding: 9px 22px; border-radius: 999px;
      background: rgba(7, 20, 43, 0.92); border: 1px solid #38bdf8;
      color: #f8fafc; font-size: 13px; font-weight: 600;
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

    <!-- Top HUD -->
    <div id="top-hud">
      <div class="hud-group">
        <button class="hud-btn" onclick="openSaveModal('save')">存档</button>
        <button class="hud-btn" onclick="openSaveModal('load')">读档</button>
        <button class="hud-btn" onclick="quickSave()">快速存档</button>
        <button class="hud-btn" onclick="quickLoad()">快速读档</button>
        <button class="hud-btn" onclick="openBacklogModal()">历史记录</button>
      </div>
      <div class="hud-group">
        <button class="hud-btn" onclick="returnToTitle()">返回主菜单</button>
      </div>
    </div>

    <!-- Main Menu -->
    <div id="main-menu">
      <div class="menu-left">
        <div>
          <div style="font-size:11px;letter-spacing:0.22em;color:${colors.accent};margin-bottom:10px;">${escapeHtmlText(ui.mainMenu.subtitleText)}</div>
          <h1 style="font-size:30px;font-weight:800;line-height:1.25;color:${colors.title};">${escapeHtmlText(project.title)}</h1>
          <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Version ${escapeHtmlText(project.version)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button class="menu-btn" onclick="startNewGame()">开始游戏</button>
          <button class="menu-btn" onclick="openSaveModal('load')">读取存档</button>
          <button class="menu-btn" onclick="resetGameSession()">重置进度</button>
        </div>
        <div style="font-size:11px;color:#64748b;">MooVN Runtime</div>
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
          <button class="ctrl-btn" onclick="openSaveModal(\'save\')">存档</button>
          <button class="ctrl-btn" onclick="openSaveModal(\'load\')">读档</button>
          ${ui.dialogueBox.visibleControls.hide ? '<button class="ctrl-btn" onclick="hideUI()">隐藏</button>' : ''}
        </div>
      </div>
    </div>

    <!-- Modal Overlay -->
    <div id="modal-overlay" onclick="closeModal()">
      <div class="modal-card" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span id="modal-title" style="font-weight:700;font-size:14px;">存档管理</span>
          <button class="hud-btn" onclick="closeModal()">关闭</button>
        </div>
        <div id="modal-tabs" class="save-tabs"></div>
        <div id="modal-body" class="save-grid"></div>
      </div>
    </div>

    <div id="restore-hint">点击屏幕任意位置恢复界面</div>
  </div>

  <script>
    const PROJECT = ${projectJson};
    const BG_ASSETS = ${bgJson};
    const CHAR_ASSETS = ${charJson};
    const ORIGIN = "${originUrl}";
    const SAVE_STORAGE_KEY = "moovn_standalone_saves_" + PROJECT.id;
    const SAVE_TABS = ["auto", "quick", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

    let currentNodeId = PROJECT.startNodeId || (PROJECT.nodes[0] && PROJECT.nodes[0].id);
    let dlgIdx = 0;
    let historyStack = [];
    let backlog = [];
    let affection = {};
    let variables = {};
    PROJECT.characters.forEach(c => affection[c.id] = c.initialAffection);
    (PROJECT.variables || []).forEach(v => variables[v.key] = v.value);

    let fullText = "";
    let typedText = "";
    let typingTimer = null;
    let autoTimer = null;
    let isAuto = false;
    let isSkip = false;
    let uiHidden = false;
    let activeModalMode = "save";
    let activeSaveTab = "1";

    function escHtml(raw) {
      return String(raw == null ? "" : raw)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function resetGameSession() {
      historyStack = [];
      backlog = [];
      PROJECT.characters.forEach(c => affection[c.id] = c.initialAffection);
      (PROJECT.variables || []).forEach(v => variables[v.key] = v.value);
      showToast("已重置当前周目变量与状态");
    }

    function loadAllSaves() {
      try {
        const saves = JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) || "{}");
        if (!saves || typeof saves !== "object" || Array.isArray(saves)) throw new Error("invalid save data");
        return saves;
      } catch (e) {
        showToast("存档读取失败，请检查浏览器存储权限或损坏的数据");
        return null;
      }
    }

    function persistSaveSlot(tabId, slotIdx) {
      const node = getNode(currentNodeId);
      if (!node) return false;
      const line = (node.dialogues && node.dialogues[dlgIdx]) || (node.dialogues && node.dialogues[0]) || { speakerName: "", text: "" };
      const ch = PROJECT.chapters.find(c => c.id === node.chapterId) || PROJECT.chapters[0];
      const all = loadAllSaves();
      if (!all) return false;
      const key = tabId + "-" + slotIdx;
      all[key] = {
        slotKey: key,
        tabId,
        slotIndex: slotIdx,
        savedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        chapterTitle: ch ? ch.title : "第 1 章",
        nodeId: node.id,
        nodeTitle: node.title,
        dialogueIndex: dlgIdx,
        speakerName: line.speakerName || "",
        textPreview: line.text || "",
        affection: Object.assign({}, affection),
        variables: Object.assign({}, variables)
      };
      try {
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(all));
        return true;
      } catch (e) {
        showToast("存档写入失败，请检查浏览器存储权限或空间");
        return false;
      }
    }

    function showToast(msg) {
      const toastEl = document.getElementById("toast-banner");
      toastEl.textContent = msg;
      toastEl.style.display = "block";
      setTimeout(() => { toastEl.style.display = "none"; }, 2400);
    }

    function quickSave() {
      if (persistSaveSlot("quick", 0)) showToast("已快速存档");
    }

    function quickLoad() {
      const all = loadAllSaves();
      if (!all) return;
      const slot = all["quick-0"];
      if (!slot) { showToast("暂无快速存档记录"); return; }
      applyLoadedSlot(slot);
    }

    function applyLoadedSlot(slot) {
      const node = PROJECT.nodes.find(n => n.id === slot.nodeId);
      if (!node || !Number.isInteger(slot.dialogueIndex) || slot.dialogueIndex < 0 ||
          slot.dialogueIndex >= Math.max(1, (node.dialogues || []).length) ||
          !slot.affection || typeof slot.affection !== "object" || Array.isArray(slot.affection) ||
          !slot.variables || typeof slot.variables !== "object" || Array.isArray(slot.variables)) {
        showToast("存档数据无效或对应节点不存在");
        return;
      }
      currentNodeId = slot.nodeId;
      dlgIdx = slot.dialogueIndex || 0;
      affection = Object.assign({}, slot.affection || affection);
      variables = Object.assign({}, slot.variables || variables);
      document.getElementById("main-menu").style.display = "none";
      document.getElementById("dlg-wrap").style.display = "block";
      document.getElementById("top-hud").style.display = "flex";
      closeModal();
      renderScene();
      showToast("已读取存档：" + slot.chapterTitle);
    }

    function openSaveModal(mode) {
      activeModalMode = mode;
      document.getElementById("modal-title").textContent = mode === "save" ? "保存进度" : "读取进度";
      document.getElementById("modal-overlay").style.display = "flex";
      renderSaveModalContent();
    }

    function renderSaveModalContent() {
      const tabsEl = document.getElementById("modal-tabs");
      tabsEl.style.display = "flex";
      tabsEl.innerHTML = "";
      SAVE_TABS.forEach(tab => {
        const btn = document.createElement("button");
        btn.className = "save-tab-btn" + (activeSaveTab === tab ? " active" : "");
        btn.textContent = tab === "auto" ? "Auto" : tab === "quick" ? "快速" : "夹 " + tab;
        btn.onclick = () => { activeSaveTab = tab; renderSaveModalContent(); };
        tabsEl.appendChild(btn);
      });

      const bodyEl = document.getElementById("modal-body");
      bodyEl.style.gridTemplateColumns = "repeat(2, 1fr)";
      bodyEl.innerHTML = "";
      const all = loadAllSaves();
      if (!all) return;
      for (let i = 0; i < 6; i++) {
        const key = activeSaveTab + "-" + i;
        const slot = all[key];
        const card = document.createElement("div");
        card.className = "save-slot";
        if (slot) {
          card.innerHTML = \`
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#38bdf8;margin-bottom:4px;">
              <span>#\${i + 1} · \${escHtml(slot.chapterTitle)}</span>
              <span style="color:#64748b;">\${escHtml(slot.savedAt)}</span>
            </div>
            <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">\${escHtml(slot.nodeTitle)}</div>
            <div style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${slot.speakerName ? escHtml(slot.speakerName) + "：" : ""}\${escHtml(slot.textPreview)}</div>
          \`;
        } else {
          card.innerHTML = \`
            <div style="font-size:11px;color:#64748b;margin-bottom:6px;">槽位 #\${i + 1}</div>
            <div style="font-size:12px;color:#475569;padding:12px 0;">-- 空白存档槽位 --</div>
          \`;
        }
        card.onclick = () => {
          if (activeModalMode === "save") {
            if (persistSaveSlot(activeSaveTab, i)) {
              renderSaveModalContent();
              showToast("已写入存档槽位 #" + (i + 1));
            }
          } else if (slot) {
            applyLoadedSlot(slot);
          }
        };
        bodyEl.appendChild(card);
      }
    }

    function openBacklogModal() {
      document.getElementById("modal-title").textContent = "对话历史记录";
      document.getElementById("modal-tabs").style.display = "none";
      const bodyEl = document.getElementById("modal-body");
      bodyEl.style.gridTemplateColumns = "1fr";
      bodyEl.innerHTML = backlog.length === 0
        ? '<div style="color:#64748b;padding:20px;">暂无历史对话记录</div>'
        : backlog.slice(-40).map(item => \`
          <div style="padding:10px 14px;border-radius:8px;background:#101b30;border:1px solid rgba(148,163,184,0.15);">
            <div style="font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:3px;">\${escHtml(item.speaker || "旁白")}</div>
            <div style="font-size:13px;color:#e2e8f0;">\${escHtml(item.text)}</div>
          </div>
        \`).join("");
      document.getElementById("modal-overlay").style.display = "flex";
    }

    function closeModal() {
      document.getElementById("modal-overlay").style.display = "none";
    }

    function resolveUrl(p) {
      if (!p) return "";
      if (p.startsWith("http") || p.startsWith("data:") || p.startsWith("blob:")) return p;
      return ORIGIN ? (ORIGIN + p) : p;
    }

    function isVideoUrl(url, mediaType) {
      if (mediaType === "video") return true;
      if (!url) return false;
      const l = url.toLowerCase();
      return l.startsWith("data:video/") || /\\.(mp4|webm|mov|ogv)(\\?|#|$)/i.test(l);
    }

    const menuBg = BG_ASSETS.find(b => b.id === PROJECT.uiConfig.mainMenu.backgroundId);
    if (menuBg) {
      document.getElementById("menu-kv").style.backgroundImage = "url('" + resolveUrl(menuBg.path) + "')";
      document.getElementById("menu-kv").style.backgroundSize = "cover";
      document.getElementById("menu-kv").style.backgroundPosition = "center";
    }

    function getNode(id) {
      return PROJECT.nodes.find(n => n.id === id) || PROJECT.nodes[0];
    }

    function startNewGame() {
      currentNodeId = PROJECT.startNodeId || (PROJECT.nodes[0] && PROJECT.nodes[0].id);
      dlgIdx = 0;
      document.getElementById("main-menu").style.display = "none";
      document.getElementById("dlg-wrap").style.display = "block";
      document.getElementById("top-hud").style.display = "flex";
      persistSaveSlot("auto", 0);
      renderScene();
    }

    function returnToTitle() {
      document.getElementById("main-menu").style.display = "flex";
      document.getElementById("dlg-wrap").style.display = "none";
      document.getElementById("top-hud").style.display = "none";
      document.getElementById("choice-overlay").style.display = "none";
    }

    function renderScene() {
      const node = getNode(currentNodeId);
      if (!node) return;

      if (node.customScript && /moovn(?:\.save:|::save::)create/i.test(node.customScript)) {
        persistSaveSlot("auto", 0);
      }

      const bg = BG_ASSETS.find(b => b.id === node.backgroundId);
      const bgEl = document.getElementById("bg-layer");
      bgEl.style.backgroundImage = bg ? "url('" + resolveUrl(bg.path) + "')" : "none";

      bgEl.style.filter = node.colorFilter === 'sepia' ? 'sepia(0.75)' : node.colorFilter === 'grayscale' ? 'grayscale(0.9)' : 'none';
      const cam = node.cameraConfig;
      bgEl.style.transform = cam ? \`scale(\${cam.zoom || 1}) translate(\${cam.offsetX || 0}%, \${cam.offsetY || 0}%)\` : 'none';

      if (node.toastMessage) showToast(node.toastMessage);

      const stLayer = document.getElementById("screen-text-layer");
      const topBar = document.getElementById("cinematic-top");
      const botBar = document.getElementById("cinematic-bottom");
      if (node.screenTextConfig) {
        const st = node.screenTextConfig;
        stLayer.style.display = "block";
        stLayer.style.background = st.bgOverlay === 'dim' ? 'rgba(2,6,23,0.68)' : st.bgOverlay === 'black' ? '#020617' : 'transparent';
        topBar.style.display = st.bgOverlay === 'cinematic_bars' ? 'block' : 'none';
        botBar.style.display = st.bgOverlay === 'cinematic_bars' ? 'block' : 'none';
        stLayer.innerHTML = "";
        const stWrap = document.createElement("div");
        stWrap.style.position = "absolute";
        stWrap.style.left = (Number(st.x) || 50) + "%";
        stWrap.style.top = (Number(st.y) || 50) + "%";
        stWrap.style.transform = "translate(-50%,-50%)";
        stWrap.style.textAlign = st.align || "center";
        stWrap.style.width = "84%";
        const mainTextEl = document.createElement("div");
        mainTextEl.style.fontSize = (Number(st.fontSize) || 28) + "px";
        mainTextEl.style.fontWeight = "800";
        mainTextEl.style.color = st.color || "#ffffff";
        mainTextEl.style.textShadow = "0 4px 24px rgba(0,0,0,0.85)";
        mainTextEl.style.whiteSpace = "pre-wrap";
        mainTextEl.textContent = st.text || "";
        stWrap.appendChild(mainTextEl);
        if (st.subText) {
          const subTextEl = document.createElement("div");
          subTextEl.style.cssText = "font-size:13px;letter-spacing:0.24em;color:#94a3b8;margin-top:10px;";
          subTextEl.textContent = st.subText;
          stWrap.appendChild(subTextEl);
        }
        stLayer.appendChild(stWrap);
      } else {
        stLayer.style.display = "none";
        topBar.style.display = "none";
        botBar.style.display = "none";
      }

      const line = (node.dialogues && node.dialogues[dlgIdx]) || { speakerName: "旁白", speakerColor: "#94a3b8", text: "" };
      backlog.push({ speaker: line.speakerName, text: line.text });

      // Characters Layer (supports Static Image, GIF/APNG, and MP4/WebM Video Animations!)
      const charLayer = document.getElementById("char-layer");
      charLayer.innerHTML = "";
      (node.characters || []).forEach(pl => {
        const prof = (PROJECT.characters || []).find(c => c.id === pl.characterId);
        let spriteId = pl.spriteId;
        if (line.speakerId === pl.characterId && line.expressionSpriteId) {
          spriteId = line.expressionSpriteId;
        }
        const asset = CHAR_ASSETS.find(a => a.id === spriteId);
        const rawSrc = pl.mediaUrl || (prof && prof.mediaUrl) || (asset ? asset.path : "");
        const src = resolveUrl(rawSrc);
        const mediaType = pl.mediaType || (prof && prof.mediaType) || "image";
        const wrap = document.createElement("div");
        wrap.className = "char-actor-wrap";
        wrap.style.left = pl.x + "%";
        wrap.style.top = pl.y + "%";
        wrap.style.height = (76 * (pl.scale || 1)) + "vh";
        wrap.style.opacity = pl.opacity != null ? pl.opacity : 1;
        if (pl.flipX) wrap.style.transform = "translate(-50%, -50%) scaleX(-1)";

        if (isVideoUrl(src, mediaType)) {
          const vid = document.createElement("video");
          vid.className = "char-sprite";
          vid.src = src;
          vid.autoplay = true;
          vid.loop = pl.videoLoop !== false;
          vid.muted = true;
          vid.playsInline = true;
          wrap.appendChild(vid);
        } else {
          const img = document.createElement("img");
          img.className = "char-sprite";
          img.src = src;
          wrap.appendChild(img);
        }
        charLayer.appendChild(wrap);
      });

      const spEl = document.getElementById("speaker-name");
      spEl.textContent = line.speakerName || "";
      spEl.style.color = line.speakerColor || "#38bdf8";

      startTyping(line.text || "");
      renderChoices(node);
    }

    function startTyping(text) {
      clearInterval(typingTimer);
      clearTimeout(autoTimer);
      fullText = text;
      const textEl = document.getElementById("dlg-text");
      if (isSkip) {
        typedText = fullText;
        textEl.textContent = fullText;
        autoTimer = setTimeout(advanceStep, 140);
        return;
      }
      typedText = "";
      textEl.textContent = "";
      let i = 0;
      typingTimer = setInterval(() => {
        i++;
        typedText = fullText.slice(0, i);
        textEl.textContent = typedText;
        if (i >= fullText.length) {
          clearInterval(typingTimer);
          if (isAuto) {
            autoTimer = setTimeout(advanceStep, 1600);
          }
        }
      }, 24);
    }

    function renderChoices(node) {
      const box = document.getElementById("choice-overlay");
      box.innerHTML = "";
      const isLastLine = dlgIdx >= ((node.dialogues ? node.dialogues.length : 1) - 1);
      if ((node.type === "choice" || node.type === "timed_choice" || (node.choices && node.choices.length > 0)) && isLastLine && node.choices && node.choices.length > 0) {
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
            if (ch.setVarKey) {
              variables[ch.setVarKey] = ch.setVarValue;
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
      if (!node) return;
      if (node.dialogues && dlgIdx < node.dialogues.length - 1) {
        historyStack.push({ nodeId: currentNodeId, dlgIdx });
        dlgIdx++;
        renderScene();
        return;
      }
      if (node.choices && node.choices.length > 0) return;
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
      if (isAuto && typedText.length >= fullText.length) {
        autoTimer = setTimeout(advanceStep, 1200);
      }
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
      document.getElementById("top-hud").style.display = "none";
      const hint = document.getElementById("restore-hint");
      setTimeout(() => { if (uiHidden) hint.style.opacity = "1"; }, 450);
      setTimeout(() => { hint.style.opacity = "0"; }, 2400);
    }

    document.getElementById("app").addEventListener("click", () => {
      if (uiHidden) {
        uiHidden = false;
        document.getElementById("dlg-wrap").style.display = "block";
        document.getElementById("top-hud").style.display = "flex";
        renderChoices(getNode(currentNodeId));
      }
    });
  </script>
</body>
</html>`;
}
