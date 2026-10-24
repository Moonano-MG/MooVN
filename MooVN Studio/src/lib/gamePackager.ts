import { VNProject, ExportPlatform, GamePerformanceConfig } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS, AUDIO_ASSETS } from '../data/assets';
import {
  DEFAULT_PERFORMANCE_CONFIG,
  buildChapterMsvnPackage,
} from './assetCompressionEngine';
import { writeFileToMountedMooVNFolder } from './workspaceManager';
import { escapeHtmlText } from './vnRuntimeCore';

export interface MultiPlatformBuildOptions {
  platform: ExportPlatform;
  packageId: string;
  appName: string;
  version: string;
  fullscreen: boolean;
  landscapeLock: boolean;
  outputDirectoryPath?: string;
  performanceConfig?: GamePerformanceConfig;
}

// ============================================================================
// Standard CRC32 & Pure-JS ZIP Archive Builder (Zero external dependencies)
// Produces real .zip archives containing playable game HTML, launcher scripts,
// and .msvn chapter packages.
// ============================================================================
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Bytes(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

export function createZipArchiveBlob(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const fileRecords: {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    offset: number;
  }[] = [];

  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content)
        : entry.content;
    const crc = crc32Bytes(dataBytes);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // UTF-8 flag
    view.setUint16(8, 0, true); // store method (0)
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, dataBytes.length, true);
    view.setUint32(22, dataBytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    fileRecords.push({ nameBytes, dataBytes, crc, offset });
    chunks.push(localHeader, dataBytes);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirStart = offset;
  let centralDirSize = 0;

  for (const rec of fileRecords) {
    const cdHeader = new Uint8Array(46 + rec.nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true); // central file header signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, 0x0800, true); // UTF-8
    view.setUint16(10, 0, true); // compression method: store
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, rec.crc, true);
    view.setUint32(20, rec.dataBytes.length, true);
    view.setUint32(24, rec.dataBytes.length, true);
    view.setUint16(28, rec.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, rec.offset, true);
    cdHeader.set(rec.nameBytes, 46);

    chunks.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, fileRecords.length, true);
  eocdView.setUint16(10, fileRecords.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, centralDirStart, true);
  eocdView.setUint16(20, 0, true);
  chunks.push(eocd);

  return new Blob(chunks, { type: 'application/zip' });
}

/**
 * Generates the standalone playable runtime HTML powered by MooVN Engine.
 * Supports:
 * - Static images (.png/.webp/.jpg), Animated GIF/APNG, and Video Character Animations (.mp4/.webm)
 * - 12-Tab Save/Load system (Auto, 快速, 1..0, 6 slots per tab)
 * - Dynamic .msvn Chapter Package loading at runtime
 * - Full branching, variables, affection, clues, history backlog, auto/skip
 */
export function buildStandaloneGameHtml(
  project: VNProject,
  platform: ExportPlatform = 'web'
): string {
  const safeJson = (val: unknown) =>
    JSON.stringify(val)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  const projectJson = safeJson(project);
  const bgJson = safeJson(BACKGROUND_ASSETS);
  const charJson = safeJson(CHARACTER_ASSETS);
  const audioJson = safeJson(AUDIO_ASSETS);
  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const ui = project.uiConfig;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="${escapeHtmlText(ui.mainMenu.panelColor)}" />
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
    @keyframes moovn-breathe { 0%,100%{transform:scaleY(1);} 50%{transform:scaleY(1.0075);} }
    @keyframes moovn-enter-fade { from{opacity:0;transform:translateY(14px);} to{opacity:1;transform:translateY(0);} }
    @keyframes moovn-cam-shake {
      0%{transform:translate3d(0,0,0);}
      20%{transform:translate3d(-7px,4px,0);}
      40%{transform:translate3d(6px,-5px,0);}
      60%{transform:translate3d(-4px,3px,0);}
      80%{transform:translate3d(2px,-2px,0);}
      100%{transform:translate3d(0,0,0);}
    }
    .motion-breathe { animation: moovn-breathe 4.2s ease-in-out infinite; transform-origin: bottom center; }
    .enter-once { animation: moovn-enter-fade 0.22s ease-out 1 forwards; }
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
      background: ${ui.mainMenu.panelColor};
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 48px 38px; position: relative; z-index: 3;
    }
    .menu-blur-bridge {
      position: absolute; top: 0; bottom: 0; left: 32%; width: 130px; z-index: 2;
      background: linear-gradient(90deg, ${ui.mainMenu.panelColor} 0%, ${ui.mainMenu.panelColor}cc 45%, transparent 100%);
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
      color: #fff; border-left-color: ${ui.mainMenu.accentColor};
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
      margin-bottom: 8px; letter-spacing: 0.04em;
    }
    .dlg-text {
      font-size: ${ui.dialogueBox.textFontSize}px;
      line-height: ${ui.dialogueBox.lineHeight};
      color: ${ui.dialogueBox.textColor};
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
      background: ${ui.choiceBox.bgColor};
      border: 1px solid ${ui.choiceBox.borderColor};
      color: ${ui.choiceBox.textColor};
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
      border-color: ${ui.choiceBox.hoverAccentColor}; color: #fff;
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
        <button class="hud-btn" onclick="triggerMsvnFileInput()">加载章节 (.msvn)</button>
      </div>
      <div class="hud-group">
        <button class="hud-btn" onclick="returnToTitle()">返回主菜单</button>
      </div>
    </div>

    <input type="file" id="msvn-file-input" accept=".msvn,.json" style="display:none" onchange="handleLoadMsvnFile(event)" />

    <!-- Main Menu -->
    <div id="main-menu">
      <div class="menu-left">
        <div>
          <div style="font-size:11px;letter-spacing:0.22em;color:${ui.mainMenu.accentColor};margin-bottom:10px;">${escapeHtmlText(ui.mainMenu.subtitleText)}</div>
          <h1 style="font-size:30px;font-weight:800;line-height:1.25;color:${ui.mainMenu.titleColor};">${escapeHtmlText(project.title)}</h1>
          <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Version ${escapeHtmlText(project.version)}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <button class="menu-btn" onclick="startNewGame()">开始游戏</button>
          <button class="menu-btn" onclick="openSaveModal('load')">读取存档</button>
          <button class="menu-btn" onclick="triggerMsvnFileInput()">加载章节包 (.msvn)</button>
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
    const AUDIO_ASSETS = ${audioJson};
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
    (PROJECT.variables || []).forEach(v => variables[v.key] = v.defaultValue);

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

    function fnv1aHex(str) {
      let h = 2166136261 >>> 0;
      const s = String(str || "");
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return h.toString(16).padStart(8, "0");
    }

    function resetGameSession() {
      historyStack = [];
      backlog = [];
      PROJECT.characters.forEach(c => affection[c.id] = c.initialAffection);
      (PROJECT.variables || []).forEach(v => variables[v.key] = v.defaultValue);
      showToast("已重置当前周目变量与状态");
    }

    function loadAllSaves() {
      try {
        return JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) || "{}");
      } catch (e) {
        return {};
      }
    }

    function persistSaveSlot(tabId, slotIdx) {
      const node = getNode(currentNodeId);
      if (!node) return;
      const line = (node.dialogues && node.dialogues[dlgIdx]) || node.dialogues[0] || { speakerName: "", text: "" };
      const ch = PROJECT.chapters.find(c => c.id === node.chapterId) || PROJECT.chapters[0];
      const all = loadAllSaves();
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
      } catch (e) {}
    }

    function showToast(msg) {
      const toastEl = document.getElementById("toast-banner");
      toastEl.textContent = msg;
      toastEl.style.display = "block";
      setTimeout(() => { toastEl.style.display = "none"; }, 2400);
    }

    function quickSave() {
      persistSaveSlot("quick", 0);
      showToast("已快速存档");
    }

    function quickLoad() {
      const all = loadAllSaves();
      const slot = all["quick-0"];
      if (!slot) { showToast("暂无快速存档记录"); return; }
      applyLoadedSlot(slot);
    }

    function applyLoadedSlot(slot) {
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
            persistSaveSlot(activeSaveTab, i);
            renderSaveModalContent();
            showToast("已写入存档槽位 #" + (i + 1));
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

    function triggerMsvnFileInput() {
      document.getElementById("msvn-file-input").click();
    }

    function handleLoadMsvnFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || "{}"));
          let loadedChapters = [];
          let loadedNodes = [];
          if (parsed.chapter && Array.isArray(parsed.nodes)) {
            loadedChapters = [parsed.chapter];
            loadedNodes = parsed.nodes;
          } else if (parsed.compressedPayload && parsed.compressedPayload.base64Data) {
            const bytes = Uint8Array.from(atob(parsed.compressedPayload.base64Data), c => c.charCodeAt(0));
            const rawJson = new TextDecoder().decode(bytes);
            const inner = JSON.parse(rawJson);
            if (inner.chapter) loadedChapters = [inner.chapter];
            if (Array.isArray(inner.nodes)) loadedNodes = inner.nodes;
          } else if (Array.isArray(parsed.chapters) && Array.isArray(parsed.nodes)) {
            loadedChapters = parsed.chapters;
            loadedNodes = parsed.nodes;
          }
          if (loadedNodes.length > 0) {
            loadedChapters.forEach(ch => {
              if (!PROJECT.chapters.some(c => c.id === ch.id)) PROJECT.chapters.push(ch);
            });
            loadedNodes.forEach(n => {
              const idx = PROJECT.nodes.findIndex(x => x.id === n.id);
              if (idx >= 0) PROJECT.nodes[idx] = n;
              else PROJECT.nodes.push(n);
            });
            currentNodeId = loadedNodes[0].id;
            dlgIdx = 0;
            document.getElementById("main-menu").style.display = "none";
            document.getElementById("dlg-wrap").style.display = "block";
            document.getElementById("top-hud").style.display = "flex";
            renderScene();
            showToast("已加载并跳转至章节包：" + (loadedChapters[0] ? loadedChapters[0].title : file.name));
          } else {
            showToast("未在文件中识别到有效章节节点");
          }
        } catch (err) {
          showToast("章节包解析失败");
        }
        e.target.value = "";
      };
      reader.readAsText(file);
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

      const bg = BG_ASSETS.find(b => b.id === node.backgroundId) || BG_ASSETS[0];
      const bgEl = document.getElementById("bg-layer");
      if (bg) bgEl.style.backgroundImage = "url('" + resolveUrl(bg.path) + "')";

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
        stWrap.style.cssText = \`position:absolute;left:\${Number(st.x)||50}%;top:\${Number(st.y)||50}%;transform:translate(-50%,-50%);text-align:\${st.align||'center'};width:84%;\`;
        const mainTextEl = document.createElement("div");
        mainTextEl.style.cssText = \`font-size:\${Number(st.fontSize)||28}px;font-weight:800;color:\${st.color||'#ffffff'};text-shadow:0 4px 24px rgba(0,0,0,0.85);white-space:pre-wrap;\`;
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
        const asset = CHAR_ASSETS.find(a => a.id === spriteId) || CHAR_ASSETS[0];
        const rawSrc = pl.mediaUrl || (prof && prof.mediaUrl) || (asset ? asset.path : "");
        const src = resolveUrl(rawSrc);
        const mediaType = pl.mediaType || (prof && prof.mediaType) || "image";
        const motion = pl.idleMotion === "breathe" || (prof && prof.idleMotion === "breathe") ? "breathe" : "none";

        const wrap = document.createElement("div");
        wrap.className = "char-actor-wrap enter-once";
        wrap.style.left = pl.x + "%";
        wrap.style.top = pl.y + "%";
        wrap.style.height = (76 * (pl.scale || 1)) + "vh";
        wrap.style.opacity = pl.opacity != null ? pl.opacity : 1;
        if (pl.flipX) wrap.style.transform = "translate(-50%, -50%) scaleX(-1)";

        if (isVideoUrl(src, mediaType)) {
          const vid = document.createElement("video");
          vid.className = "char-sprite" + (motion === "breathe" ? " motion-breathe" : "");
          vid.src = src;
          vid.autoplay = true;
          vid.loop = pl.videoLoop !== false;
          vid.muted = true;
          vid.playsInline = true;
          wrap.appendChild(vid);
        } else {
          const img = document.createElement("img");
          img.className = "char-sprite" + (motion === "breathe" ? " motion-breathe" : "");
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

/**
 * Exports a directly playable game package for Web, Android, iOS, Windows, or macOS.
 * NEVER outputs unplayable raw .json dumps!
 */
export function exportPlatformPackage(
  project: VNProject,
  options: MultiPlatformBuildOptions
): string {
  const perf =
    options.performanceConfig ||
    project.performanceConfig ||
    DEFAULT_PERFORMANCE_CONFIG;

  const htmlRuntime = buildStandaloneGameHtml(
    { ...project, performanceConfig: perf },
    options.platform
  );
  const safeName = (options.appName || project.title || 'MooVN_Game').replace(
    /[\\/:*?"<>|\s]+/g,
    '_'
  );

  // Build chapter .msvn files to bundle inside desktop ZIP packages
  const chapterEntries: ZipEntryInput[] = project.chapters.map((ch) => {
    const pkg = buildChapterMsvnPackage(project, ch.id, perf);
    return {
      path: `chapters/${safeName}_${ch.id}.msvn`,
      content: JSON.stringify(pkg, null, 2),
    };
  });

  if (options.platform === 'web') {
    const filename = `${safeName}_Web.html`;
    const blob = new Blob([htmlRuntime], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, filename);
    writeFileToMountedMooVNFolder(filename, htmlRuntime);
    return filename;
  }

  if (options.platform === 'android' || options.platform === 'ios') {
    const label = options.platform === 'android' ? 'Android' : 'iOS';
    const filename = `${safeName}_${label}.html`;
    const blob = new Blob([htmlRuntime], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, filename);
    writeFileToMountedMooVNFolder(filename, htmlRuntime);
    return filename;
  }

  if (options.platform === 'windows') {
    const launcherBat = `@echo off
chcp 65001 >nul
title ${options.appName || project.title}
set "GAME_HTML=%~dp0${safeName}.html"
where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --app="file:///%GAME_HTML:\\=/%" --window-size=${project.resolution.width},${project.resolution.height}
  exit
)
where chrome >nul 2>nul
if %errorlevel%==0 (
  start "" chrome --app="file:///%GAME_HTML:\\=/%" --window-size=${project.resolution.width},${project.resolution.height}
  exit
)
start "" "%GAME_HTML%"
`;
    const zipBlob = createZipArchiveBlob([
      { path: `Play_${safeName}.bat`, content: launcherBat },
      { path: `${safeName}.html`, content: htmlRuntime },
      ...chapterEntries,
    ]);
    const filename = `${safeName}_Windows.zip`;
    triggerDownload(zipBlob, filename);
    return filename;
  }

  // macOS playable archive
  const launcherCommand = `#!/bin/bash
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
open "$DIR/${safeName}.html"
`;
  const zipBlob = createZipArchiveBlob([
    { path: `Play_${safeName}.command`, content: launcherCommand },
    { path: `${safeName}.html`, content: htmlRuntime },
    ...chapterEntries,
  ]);
  const filename = `${safeName}_macOS.zip`;
  triggerDownload(zipBlob, filename);
  return filename;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
