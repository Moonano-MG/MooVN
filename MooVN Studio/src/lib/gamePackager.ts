import type { VNProject, BackgroundAsset, CharacterSpriteAsset } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets.ts';
import { escapeHtmlText } from './vnRuntimeCore.ts';
import { CHARACTER_WIDTH_PERCENT } from './characterPlacement.ts';
import { assertStandaloneHtmlSupported } from './htmlExportValidation.ts';
import { createReadHistory } from './readHistory.ts';

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
        const response = await fetch(path, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
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
  // The HTML player does not execute custom scripts; validation must reject them
  // rather than guessing actions from their source text.
  assertStandaloneHtmlSupported(project);
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
      position: absolute; width: ${CHARACTER_WIDTH_PERCENT}%; transform-origin: bottom center;
      transition: left 0.35s ease, top 0.35s ease, transform 0.35s ease, opacity 0.3s ease;
    }
    .char-sprite {
      display: block; width: 100%; height: auto;
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
    #read-warning {
      position: absolute; top: 96px; left: 50%; transform: translateX(-50%);
      width: min(90%, 640px); padding: 8px 12px; border: 1px solid #fbbf24;
      border-radius: 8px; background: rgba(69, 26, 3, 0.96); color: #fef3c7;
      font-size: 12px; z-index: 39; display: none; pointer-events: none;
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
    <div id="toast-banner" role="status" aria-live="polite"></div>
    <div id="read-warning" role="status" aria-live="polite"></div>

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
          <p style="font-size:12px;color:#94a3b8;">开始新周目不会删除手动存档。</p>
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
          ${ui.dialogueBox.visibleControls.auto ? '<button class="ctrl-btn" id="btn-auto" aria-pressed="false" onclick="toggleAuto()">自动</button>' : ''}
          ${ui.dialogueBox.visibleControls.skip ? '<button class="ctrl-btn" id="btn-skip" aria-pressed="false" onclick="toggleSkip()">快进</button>' : ''}
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
    // This same self-contained factory is used by the editor preview.
    const createReadHistory = ${createReadHistory.toString()};
    const readHistory = createReadHistory(() => window.localStorage, "moovn_standalone_read_" + PROJECT.id);
    const MAX_SAVE_ROOT_CHARS = 16 * 1024 * 1024;
    const SAVE_TABS = ["auto", "quick", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

    let currentNodeId = PROJECT.startNodeId || (PROJECT.nodes[0] && PROJECT.nodes[0].id);
    let dlgIdx = 0;
    let historyStack = [];
    let backlog = [];
    // Null-prototype records safely support arbitrary user-defined variable IDs.
    let affection = Object.create(null);
    let variables = Object.create(null);
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
    let toastTimer = null;

    // All runtime/project data is assigned as text, never interpolated into HTML.
    function appendText(parent, tag, text, css) {
      const element = document.createElement(tag);
      element.style.cssText = css;
      element.textContent = String(text == null ? "" : text);
      parent.appendChild(element);
      return element;
    }

    function copyRecord(record) {
      return Object.assign(Object.create(null), record);
    }

    function isRecord(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function isStateRecord(value, numericOnly) {
      if (!isRecord(value)) return false;
      return Object.entries(value).every(([key, item]) =>
        key.length <= 4096 && (typeof item === "number" ? Number.isFinite(item) :
          !numericOnly && (typeof item === "boolean" || (typeof item === "string" && item.length <= 1000000)))
      );
    }

    // Existing, unversioned HTML saves are accepted if complete. Unknown future
    // fields/versions are retained and protected from accidental replacement.
    const SAVE_FIELDS = new Set(["formatVersion", "slotKey", "tabId", "slotIndex", "savedAt", "chapterTitle", "nodeId", "nodeTitle", "dialogueIndex", "speakerName", "textPreview", "affection", "variables"]);
    function isValidSaveSlot(slot, key) {
      if (!isRecord(slot) || Object.keys(slot).some(field => !SAVE_FIELDS.has(field)) ||
          (slot.formatVersion !== undefined && slot.formatVersion !== 1) ||
          !SAVE_TABS.includes(slot.tabId) || !Number.isInteger(slot.slotIndex) || slot.slotIndex < 0 || slot.slotIndex > 5 ||
          slot.slotKey !== key || key !== slot.tabId + "-" + slot.slotIndex ||
          ![slot.savedAt, slot.chapterTitle, slot.nodeId, slot.nodeTitle, slot.speakerName, slot.textPreview].every(value => typeof value === "string" && value.length <= 1000000) ||
          !isStateRecord(slot.affection, true) || !isStateRecord(slot.variables, false)) return false;
      const node = getNode(slot.nodeId);
      return Boolean(node && Number.isInteger(slot.dialogueIndex) && slot.dialogueIndex >= 0 &&
        slot.dialogueIndex < (node.dialogues || []).length);
    }

    function updatePlaybackButtons() {
      const auto = document.getElementById("btn-auto");
      const skip = document.getElementById("btn-skip");
      auto?.classList.toggle("active", isAuto);
      skip?.classList.toggle("active", isSkip);
      auto?.setAttribute("aria-pressed", String(isAuto));
      skip?.setAttribute("aria-pressed", String(isSkip));
    }

    function stopPlaybackModes() {
      clearTimeout(autoTimer);
      autoTimer = null;
      isAuto = false;
      isSkip = false;
      updatePlaybackButtons();
    }

    function resetSessionState() {
      clearInterval(typingTimer);
      stopPlaybackModes();
      historyStack = [];
      backlog = [];
      affection = Object.create(null);
      variables = Object.create(null);
      PROJECT.characters.forEach(c => affection[c.id] = c.initialAffection);
      (PROJECT.variables || []).forEach(v => variables[v.key] = v.value);
      uiHidden = false;
      document.getElementById("restore-hint").style.opacity = "0";
    }

    function captureHistory() {
      // renderScene records the displayed line; save the prior backlog so that
      // returning to this snapshot does not retain later lines or duplicate it.
      return { nodeId: currentNodeId, dlgIdx, affection: copyRecord(affection), variables: copyRecord(variables), backlog: backlog.slice(0, -1) };
    }

    function loadAllSaves() {
      try {
        const raw = localStorage.getItem(SAVE_STORAGE_KEY);
        if (raw !== null && raw.length > MAX_SAVE_ROOT_CHARS) throw new Error("save data too large");
        const saves = raw === null ? Object.create(null) : JSON.parse(raw);
        if (!isRecord(saves)) throw new Error("invalid save data");
        return { raw, saves };
      } catch (e) {
        showToast("存档读取失败，请检查浏览器存储权限或损坏的数据；原数据未覆盖");
        return null;
      }
    }

    function persistSaveSlot(tabId, slotIdx) {
      const node = getNode(currentNodeId);
      if (!node || !isStateRecord(affection, true) || !isStateRecord(variables, false)) {
        showToast("当前状态无效，未覆盖存档");
        return false;
      }
      const line = node.dialogues && node.dialogues[dlgIdx];
      if (!line) { showToast("台词位置无效，未覆盖存档"); return false; }
      const ch = PROJECT.chapters.find(c => c.id === node.chapterId) || PROJECT.chapters[0];
      const loaded = loadAllSaves();
      if (!loaded) return false;
      const key = tabId + "-" + slotIdx;
      if (Object.prototype.hasOwnProperty.call(loaded.saves, key) && !isValidSaveSlot(loaded.saves[key], key)) {
        showToast("存档槽 " + key + " 损坏或版本不支持，原数据未覆盖");
        return false;
      }
      const slot = {
        formatVersion: 1,
        slotKey: key, tabId, slotIndex: slotIdx,
        savedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
        chapterTitle: ch ? ch.title : "第 1 章",
        nodeId: node.id, nodeTitle: node.title, dialogueIndex: dlgIdx,
        speakerName: line.speakerName || "", textPreview: (line.text || "").slice(0, 300),
        affection: copyRecord(affection), variables: copyRecord(variables)
      };
      if (!isValidSaveSlot(slot, key)) { showToast("当前状态无法保存，原数据未覆盖"); return false; }
      loaded.saves[key] = slot;
      try {
        const encoded = JSON.stringify(loaded.saves);
        if (encoded.length > MAX_SAVE_ROOT_CHARS) {
          showToast("存档数据超出大小限制，原数据未覆盖");
          return false;
        }
        if (localStorage.getItem(SAVE_STORAGE_KEY) !== loaded.raw) {
          showToast("存档已在其他窗口更改，未覆盖新数据；请重试");
          return false;
        }
        localStorage.setItem(SAVE_STORAGE_KEY, encoded);
        return true;
      } catch (e) {
        showToast("存档写入失败，请检查浏览器存储权限或空间；原数据未覆盖");
        return false;
      }
    }

    function showToast(msg) {
      const toastEl = document.getElementById("toast-banner");
      toastEl.textContent = msg;
      toastEl.style.display = "block";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.style.display = "none"; }, 2400);
    }

    function quickSave() {
      if (persistSaveSlot("quick", 0)) showToast("已快速存档");
    }

    function quickLoad() {
      const loaded = loadAllSaves();
      if (!loaded) return;
      if (!Object.prototype.hasOwnProperty.call(loaded.saves, "quick-0")) { showToast("暂无快速存档记录"); return; }
      applyLoadedSlot(loaded.saves["quick-0"], "quick-0");
    }

    function applyLoadedSlot(slot, key) {
      if (!isValidSaveSlot(slot, key)) {
        showToast("存档槽损坏或版本不支持，或对应节点不存在；原数据未修改");
        return;
      }
      resetSessionState();
      currentNodeId = slot.nodeId;
      dlgIdx = slot.dialogueIndex;
      affection = copyRecord(slot.affection);
      variables = copyRecord(slot.variables);
      document.getElementById("main-menu").style.display = "none";
      document.getElementById("dlg-wrap").style.display = "block";
      document.getElementById("top-hud").style.display = "flex";
      closeModal();
      renderScene();
      showToast("已读取存档：" + slot.chapterTitle);
    }

    function openSaveModal(mode) {
      stopPlaybackModes();
      activeModalMode = mode;
      document.getElementById("modal-title").textContent = mode === "save" ? "保存进度" : "读取进度";
      document.getElementById("modal-overlay").style.display = "flex";
      renderSaveModalContent();
    }

    function renderSaveModalContent() {
      const tabsEl = document.getElementById("modal-tabs");
      tabsEl.style.display = "flex";
      tabsEl.replaceChildren();
      SAVE_TABS.forEach(tab => {
        const btn = document.createElement("button");
        btn.className = "save-tab-btn" + (activeSaveTab === tab ? " active" : "");
        btn.textContent = tab === "auto" ? "Auto" : tab === "quick" ? "快速" : "夹 " + tab;
        btn.onclick = () => { activeSaveTab = tab; renderSaveModalContent(); };
        tabsEl.appendChild(btn);
      });

      const bodyEl = document.getElementById("modal-body");
      bodyEl.style.gridTemplateColumns = "repeat(2, 1fr)";
      bodyEl.replaceChildren();
      const loaded = loadAllSaves();
      if (!loaded) return;
      for (let i = 0; i < 6; i++) {
        const key = activeSaveTab + "-" + i;
        const hasSlot = Object.prototype.hasOwnProperty.call(loaded.saves, key);
        const slot = loaded.saves[key];
        const valid = hasSlot && isValidSaveSlot(slot, key);
        const card = document.createElement("div");
        card.className = "save-slot";
        if (hasSlot && !valid) {
          appendText(card, "div", "槽位 #" + (i + 1) + " 损坏或版本不支持；原数据已保留", "font-size:12px;color:#fbbf24;padding:12px 0;");
        } else if (valid) {
          const heading = document.createElement("div");
          heading.style.cssText = "display:flex;justify-content:space-between;font-size:11px;color:#38bdf8;margin-bottom:4px;";
          appendText(heading, "span", "#" + (i + 1) + " · " + (slot.chapterTitle || ""), "");
          appendText(heading, "span", slot.savedAt, "color:#64748b;");
          card.appendChild(heading);
          appendText(card, "div", slot.nodeTitle, "font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;");
          appendText(card, "div", (slot.speakerName ? slot.speakerName + "：" : "") + (slot.textPreview || ""), "font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;");
        } else {
          appendText(card, "div", "槽位 #" + (i + 1), "font-size:11px;color:#64748b;margin-bottom:6px;");
          appendText(card, "div", "-- 空白存档槽位 --", "font-size:12px;color:#475569;padding:12px 0;");
        }
        card.onclick = () => {
          if (activeModalMode === "save") {
            if (persistSaveSlot(activeSaveTab, i)) {
              renderSaveModalContent();
              showToast("已写入存档槽位 #" + (i + 1));
            }
          } else if (hasSlot) {
            const latest = loadAllSaves();
            if (latest) applyLoadedSlot(latest.saves[key], key);
          }
        };
        bodyEl.appendChild(card);
      }
    }

    function openBacklogModal() {
      stopPlaybackModes();
      document.getElementById("modal-title").textContent = "对话历史记录";
      document.getElementById("modal-tabs").style.display = "none";
      const bodyEl = document.getElementById("modal-body");
      bodyEl.style.gridTemplateColumns = "1fr";
      bodyEl.replaceChildren();
      if (backlog.length === 0) {
        appendText(bodyEl, "div", "暂无历史对话记录", "color:#64748b;padding:20px;");
      } else {
        backlog.slice(-40).forEach(item => {
          const card = document.createElement("div");
          card.style.cssText = "padding:10px 14px;border-radius:8px;background:#101b30;border:1px solid rgba(148,163,184,0.15);";
          appendText(card, "div", item.speaker || "旁白", "font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:3px;");
          appendText(card, "div", item.text, "font-size:13px;color:#e2e8f0;");
          bodyEl.appendChild(card);
        });
      }
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
      return PROJECT.nodes.find(n => n.id === id) || null;
    }

    function atChoice(node) {
      return Boolean(node && node.choices && node.choices.length > 0 &&
        dlgIdx === (node.dialogues || []).length - 1);
    }

    function currentReadStatus() {
      const node = getNode(currentNodeId);
      const line = node && node.dialogues && node.dialogues[dlgIdx];
      return line ? readHistory.hasRead(node.id, dlgIdx, line)
        : { read: false, error: "当前节点没有可记录的台词，快进已停用。" };
    }

    function setReadWarning(message) {
      const warning = document.getElementById("read-warning");
      warning.textContent = message || "";
      warning.style.display = message ? "block" : "none";
    }

    function stopSkip(message, persistent) {
      clearTimeout(autoTimer);
      isSkip = false;
      updatePlaybackButtons();
      if (persistent) setReadWarning(message);
      else if (message) showToast(message);
    }

    function markCurrentRead() {
      const node = getNode(currentNodeId);
      const line = node && node.dialogues && node.dialogues[dlgIdx];
      if (!line) return;
      const result = readHistory.markRead(node.id, dlgIdx, line);
      if (!result.ok) stopSkip(result.error, true);
      else setReadWarning(null);
    }

    function startNewGame() {
      resetSessionState();
      currentNodeId = PROJECT.startNodeId || (PROJECT.nodes[0] && PROJECT.nodes[0].id);
      dlgIdx = 0;
      closeModal();
      document.getElementById("main-menu").style.display = "none";
      document.getElementById("dlg-wrap").style.display = "block";
      document.getElementById("top-hud").style.display = "flex";
      renderScene();
      persistSaveSlot("auto", 0);
    }

    function returnToTitle() {
      clearInterval(typingTimer);
      stopPlaybackModes();
      uiHidden = false;
      document.getElementById("main-menu").style.display = "flex";
      document.getElementById("dlg-wrap").style.display = "none";
      document.getElementById("top-hud").style.display = "none";
      document.getElementById("choice-overlay").style.display = "none";
    }

    function renderScene() {
      const node = getNode(currentNodeId);
      if (!node) { showToast("剧情节点不存在，无法继续"); return; }

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
        stLayer.replaceChildren();
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
      charLayer.replaceChildren();
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
        wrap.style.opacity = pl.opacity != null ? pl.opacity : 1;
        wrap.style.transform = "translate(-50%, -100%) scale(" + pl.scale + ")" + (pl.flipX ? " scaleX(-1)" : "");

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

      if (isSkip) {
        const status = currentReadStatus();
        if (!status.read || atChoice(node)) {
          stopSkip(status.error || (atChoice(node) ? "已到选项，快进已暂停。" : "已到未读剧情，快进已停止。"), Boolean(status.error));
        }
      }
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
      box.replaceChildren();
      const isLastLine = dlgIdx >= ((node.dialogues ? node.dialogues.length : 1) - 1);
      if ((node.type === "choice" || node.type === "timed_choice" || (node.choices && node.choices.length > 0)) && isLastLine && node.choices && node.choices.length > 0) {
        box.style.display = "flex";
        node.choices.forEach(ch => {
          const btn = document.createElement("button");
          btn.className = "choice-item";
          btn.textContent = ch.text;
          btn.onclick = (e) => {
            e.stopPropagation();
            const nextAffection = ch.affectionCharacterId && ch.affectionDelta
              ? (affection[ch.affectionCharacterId] || 0) + ch.affectionDelta : null;
            if ((nextAffection !== null && !Number.isFinite(nextAffection)) || !getNode(ch.targetNodeId)) {
              showToast("选项状态或目标无效，未执行跳转");
              return;
            }
            if (typedText === fullText) markCurrentRead();
            if (isSkip) stopSkip();
            historyStack.push(captureHistory());
            if (nextAffection !== null) affection[ch.affectionCharacterId] = nextAffection;
            if (ch.setVarKey !== undefined && ch.setVarValue !== undefined) variables[ch.setVarKey] = ch.setVarValue;
            currentNodeId = ch.targetNodeId;
            dlgIdx = 0;
            renderScene();
            persistSaveSlot("auto", 0);
          };
          box.appendChild(btn);
        });
      } else {
        box.style.display = "none";
      }
    }

    function advanceStep() {
      if (uiHidden || document.getElementById("modal-overlay").style.display === "flex" ||
          document.getElementById("main-menu").style.display !== "none") return;
      const node = getNode(currentNodeId);
      if (!node) return;
      if (isSkip) {
        // Recheck immediately before every advance, not only when enabling skip.
        const status = currentReadStatus();
        if (!status.read || atChoice(node)) {
          stopSkip(status.error || (atChoice(node) ? "已到选项，快进已暂停。" : "已到未读剧情，快进已停止。"), Boolean(status.error));
          return;
        }
      }
      if (typedText.length < fullText.length && !isSkip) {
        clearInterval(typingTimer);
        typedText = fullText;
        document.getElementById("dlg-text").textContent = fullText;
        if (isAuto) autoTimer = setTimeout(advanceStep, 1600);
        return;
      }
      if (atChoice(node)) return;
      if (!isSkip) markCurrentRead();
      if (node.dialogues && dlgIdx < node.dialogues.length - 1) {
        historyStack.push(captureHistory());
        dlgIdx++;
        renderScene();
        persistSaveSlot("auto", 0);
        return;
      }
      if (node.nextNodeId) {
        historyStack.push(captureHistory());
        currentNodeId = node.nextNodeId;
        dlgIdx = 0;
        renderScene();
        persistSaveSlot("auto", 0);
      } else if (isSkip) {
        stopSkip("剧情已到末尾，快进已停止。");
      }
    }

    function stepBack() {
      if (historyStack.length === 0) return;
      stopPlaybackModes();
      const prev = historyStack.pop();
      currentNodeId = prev.nodeId;
      dlgIdx = prev.dlgIdx;
      affection = copyRecord(prev.affection);
      variables = copyRecord(prev.variables);
      backlog = prev.backlog.slice();
      renderScene();
      persistSaveSlot("auto", 0);
    }

    function toggleAuto() {
      clearTimeout(autoTimer);
      isAuto = !isAuto;
      if (isAuto) isSkip = false;
      updatePlaybackButtons();
      if (isAuto && typedText.length >= fullText.length) autoTimer = setTimeout(advanceStep, 1600);
    }

    function toggleSkip() {
      clearTimeout(autoTimer);
      if (isSkip) { stopSkip(); return; }
      isAuto = false;
      const status = currentReadStatus();
      const choice = atChoice(getNode(currentNodeId));
      if (!status.error) setReadWarning(null);
      if (!status.read || choice) {
        stopSkip(status.error || (choice ? "已到选项，快进已暂停。" : "当前剧情尚未读过，不能快进。"), Boolean(status.error));
        return;
      }
      isSkip = true;
      updatePlaybackButtons();
      advanceStep();
    }

    function hideUI() {
      stopPlaybackModes();
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
