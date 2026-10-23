import { useState, useEffect } from 'react';

export type UILanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';

export interface LanguageOption {
  id: UILanguage;
  label: string;
  shortLabel: string;
  nativeName: string;
}

export const SUPPORTED_UI_LANGUAGES: LanguageOption[] = [
  { id: 'zh-CN', label: '简体中文 (Simplified Chinese)', shortLabel: '简中', nativeName: '简体中文' },
  { id: 'zh-TW', label: '繁體中文 (Traditional Chinese)', shortLabel: '繁中', nativeName: '繁體中文' },
  { id: 'en-US', label: 'English (US)', shortLabel: 'EN', nativeName: 'English' },
  { id: 'ja-JP', label: '日本語 (Japanese)', shortLabel: '日本語', nativeName: '日本語' },
];

const UI_LANG_STORAGE_KEY = 'moovn_studio_ui_lang_v1';

const DICT: Record<UILanguage, Record<string, string>> = {
  'zh-CN': {
    'menu.portal': '官网',
    'menu.project': '项目',
    'menu.undo': '撤销 (Ctrl+Z)',
    'menu.redo': '重做 (Ctrl+Y)',
    'menu.layout': '布局',
    'menu.language': '语言',
    'menu.run': '运行',
    'menu.export': '导出',
    'menu.settings': '设置',
    'menu.resetLayout': '重置默认分栏布局',
    'menu.presetLayouts': '预设分栏布局',
    'menu.windowStatus': '窗口状态',
    'menu.dock': '停靠',
    'menu.float': '漂浮',
    'panel.explorer': '章节与素材库',
    'panel.node_library': '节点库 (56类)',
    'panel.canvas': '2D 流程图画布',
    'panel.stage': '16:9 场景舞台',
    'panel.ts_code': '多语言引擎脚本',
    'panel.yaml_code': 'YAML 章节脚本',
    'panel.inspector': '节点属性检查器',
    'panel.asset_studio': 'AI 素材工坊',
    'panel.ui_customizer': '游戏 UI 定制器',
    'panel.ai_agent': 'AI 助手',
    'panel.terminal': '引擎终端与编译',
    'launcher.webBadge': 'Web 工作台 (无本地路径模式)',
    'launcher.localBadge': '.mpvn 本地项目中心',
    'launcher.webSubtitle': '像 Web 版 VS Code 一样工作：直接导入本地 .mpvn 文件，或重新创建一个新视觉小说项目',
    'launcher.importTitle': '导入本地项目文件 (.mpvn)',
    'launcher.importDesc': '从您的设备选择已有的 .mpvn 工程文件直接载入工作台编辑',
    'launcher.importBtn': '选择本地 .mpvn 文件导入',
    'launcher.createTitle': '重新创建一个新项目',
    'launcher.createDesc': '在内存中初始化全新视觉小说工程，随时可导出为 .mpvn 文件',
    'launcher.createBtn': '立即创建并进入工作台',
    'launcher.backToEditor': '返回当前工作台',
    'settings.title': 'MooVN Studio 系统与引擎设置',
    'settings.tab.language': '语言设置 (Language)',
    'settings.tab.engine': 'MooVN Engine 多语言与渲染器',
    'settings.tab.game': '游戏运行与流式解压',
    'settings.tab.workspace': '本地文件夹与路径',
    'portal.openWebEditor': '在线启动 MooVN Web 编辑器',
    'portal.downloadClient': '客户端与源码下载',
  },
  'zh-TW': {
    'menu.portal': '官網',
    'menu.project': '專案',
    'menu.undo': '復原 (Ctrl+Z)',
    'menu.redo': '重做 (Ctrl+Y)',
    'menu.layout': '佈局',
    'menu.language': '語言',
    'menu.run': '執行',
    'menu.export': '匯出',
    'menu.settings': '設定',
    'menu.resetLayout': '重置預設分欄佈局',
    'menu.presetLayouts': '預設分欄佈局',
    'menu.windowStatus': '視窗狀態',
    'menu.dock': '停靠',
    'menu.float': '懸浮',
    'panel.explorer': '章節與素材庫',
    'panel.node_library': '節點庫 (56類)',
    'panel.canvas': '2D 流程圖畫布',
    'panel.stage': '16:9 場景舞台',
    'panel.ts_code': '多語言引擎腳本',
    'panel.yaml_code': 'YAML 章節腳本',
    'panel.inspector': '節點屬性檢查器',
    'panel.asset_studio': 'AI 素材工坊',
    'panel.ui_customizer': '遊戲 UI 定制器',
    'panel.ai_agent': 'AI 助手',
    'panel.terminal': '引擎終端與編譯',
    'launcher.webBadge': 'Web 工作台 (無本機路徑模式)',
    'launcher.localBadge': '.mpvn 本機專案中心',
    'launcher.webSubtitle': '如同 Web 版 VS Code：直接匯入本機 .mpvn 檔案，或重新建立一個新視覺小說專案',
    'launcher.importTitle': '匯入本機專案檔案 (.mpvn)',
    'launcher.importDesc': '從您的裝置選擇已有的 .mpvn 工程檔案直接載入工作台編輯',
    'launcher.importBtn': '選擇本機 .mpvn 檔案匯入',
    'launcher.createTitle': '重新建立一個新專案',
    'launcher.createDesc': '在記憶體中初始化全新視覺小說工程，隨時可匯出為 .mpvn 檔案',
    'launcher.createBtn': '立即建立並進入工作台',
    'launcher.backToEditor': '返回目前工作台',
    'settings.title': 'MooVN Studio 系統與引擎設定',
    'settings.tab.language': '語言設定 (Language)',
    'settings.tab.engine': 'MooVN Engine 多語言與渲染器',
    'settings.tab.game': '遊戲執行與串流解壓',
    'settings.tab.workspace': '本機資料夾與路徑',
    'portal.openWebEditor': '線上啟動 MooVN Web 編輯器',
    'portal.downloadClient': '用戶端與原始碼下載',
  },
  'en-US': {
    'menu.portal': 'Portal',
    'menu.project': 'Project',
    'menu.undo': 'Undo (Ctrl+Z)',
    'menu.redo': 'Redo (Ctrl+Y)',
    'menu.layout': 'Layout',
    'menu.language': 'Language',
    'menu.run': 'Run',
    'menu.export': 'Export',
    'menu.settings': 'Settings',
    'menu.resetLayout': 'Reset Default Layout',
    'menu.presetLayouts': 'Layout Presets',
    'menu.windowStatus': 'Panels',
    'menu.dock': 'Dock',
    'menu.float': 'Float',
    'panel.explorer': 'Chapters & Assets',
    'panel.node_library': 'Node Library (56)',
    'panel.canvas': '2D Flow Canvas',
    'panel.stage': '16:9 Scene Stage',
    'panel.ts_code': 'Polyglot Engine Script',
    'panel.yaml_code': 'YAML Chapter Script',
    'panel.inspector': 'Node Inspector',
    'panel.asset_studio': 'AI Asset Studio',
    'panel.ui_customizer': 'Game UI Customizer',
    'panel.ai_agent': 'AI Copilot',
    'panel.terminal': 'Engine Terminal',
    'launcher.webBadge': 'Web Workbench (Pathless VS Code Web Mode)',
    'launcher.localBadge': '.mpvn Project Hub',
    'launcher.webSubtitle': 'Works like VS Code for the Web: import a local .mpvn file from your device, or create a brand-new project in memory',
    'launcher.importTitle': 'Import Local Project (.mpvn)',
    'launcher.importDesc': 'Pick an existing .mpvn project file from your device to open immediately',
    'launcher.importBtn': 'Import Local .mpvn File',
    'launcher.createTitle': 'Create a New Project',
    'launcher.createDesc': 'Initialize a fresh visual novel project in memory and export as .mpvn anytime',
    'launcher.createBtn': 'Create & Enter Workbench',
    'launcher.backToEditor': 'Return to Workbench',
    'settings.title': 'MooVN Studio System & Engine Settings',
    'settings.tab.language': 'Language Settings',
    'settings.tab.engine': 'MooVN Engine & Renderer',
    'settings.tab.game': 'Game & Stream Defaults',
    'settings.tab.workspace': 'Local Workspace Paths',
    'portal.openWebEditor': 'Launch MooVN Web Editor',
    'portal.downloadClient': 'Client & Source Downloads',
  },
  'ja-JP': {
    'menu.portal': '公式サイト',
    'menu.project': 'プロジェクト',
    'menu.undo': '元に戻す (Ctrl+Z)',
    'menu.redo': 'やり直し (Ctrl+Y)',
    'menu.layout': 'レイアウト',
    'menu.language': '言語',
    'menu.run': '実行',
    'menu.export': 'エクスポート',
    'menu.settings': '設定',
    'menu.resetLayout': 'デフォルト配置に戻す',
    'menu.presetLayouts': 'プリセット配置',
    'menu.windowStatus': 'パネル状態',
    'menu.dock': 'ドック',
    'menu.float': 'フロート',
    'panel.explorer': '章・アセット管理',
    'panel.node_library': 'ノードライブラリ (56種)',
    'panel.canvas': '2D フローキャンバス',
    'panel.stage': '16:9 シーンステージ',
    'panel.ts_code': '多言語エンジンスクリプト',
    'panel.yaml_code': 'YAML 章スクリプト',
    'panel.inspector': 'プロパティ検査',
    'panel.asset_studio': 'AI アセット工房',
    'panel.ui_customizer': 'ゲーム UI カスタマイズ',
    'panel.ai_agent': 'AI アシスタント',
    'panel.terminal': 'エンジンの端末',
    'launcher.webBadge': 'Web ワークベンチ (Web版 VS Code モード)',
    'launcher.localBadge': '.mpvn ローカル管理',
    'launcher.webSubtitle': 'Web版 VS Code のようにローカルの .mpvn ファイルをインポートするか、新規プロジェクトを作成します',
    'launcher.importTitle': 'ローカル .mpvn ファイルをインポート',
    'launcher.importDesc': '端末内の .mpvn プロジェクトファイルを選択して直接編集を開始します',
    'launcher.importBtn': '.mpvn ファイルを選択して開く',
    'launcher.createTitle': '新規プロジェクトを作成',
    'launcher.createDesc': 'メモリ上に新しいノベルプロジェクトを作成し、いつでも .mpvn として保存可能',
    'launcher.createBtn': '新規作成してエディタへ',
    'launcher.backToEditor': 'エディタに戻る',
    'settings.title': 'MooVN Studio システム・エンジン設定',
    'settings.tab.language': '言語設定 (Language)',
    'settings.tab.engine': 'MooVN Engine 多言語・レンダラー',
    'settings.tab.game': 'ゲーム実行・ストリーム展開',
    'settings.tab.workspace': 'ローカル保存パス設定',
    'portal.openWebEditor': 'MooVN Web エディタを起動',
    'portal.downloadClient': 'クライアント・ソースコード',
  },
};

let currentLang: UILanguage = (() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(UI_LANG_STORAGE_KEY) as UILanguage | null;
    if (saved && saved in DICT) return saved;
  }
  return 'zh-CN';
})();

const listeners = new Set<(lang: UILanguage) => void>();

export function getUILanguage(): UILanguage {
  return currentLang;
}

export function setUILanguage(lang: UILanguage): void {
  if (!(lang in DICT)) return;
  currentLang = lang;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }
  listeners.forEach((fn) => fn(lang));
}

export function tUI(key: string, fallback?: string): string {
  return DICT[currentLang]?.[key] || DICT['zh-CN']?.[key] || fallback || key;
}

export function useUILanguage() {
  const [lang, setLangState] = useState<UILanguage>(currentLang);

  useEffect(() => {
    const handler = (next: UILanguage) => setLangState(next);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    lang,
    setLang: setUILanguage,
    t: (key: string, fallback?: string) =>
      DICT[lang]?.[key] || DICT['zh-CN']?.[key] || fallback || key,
  };
}
