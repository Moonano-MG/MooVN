import { useState, useEffect } from 'react';
import { PanelId } from '../types';

export type UILanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';

export interface LanguageOption {
  id: UILanguage;
  label: string;
  nativeName: string;
}

export const SUPPORTED_UI_LANGUAGES: LanguageOption[] = [
  { id: 'zh-CN', label: '简体中文', nativeName: '简体中文' },
  { id: 'zh-TW', label: '繁體中文', nativeName: '繁體中文' },
  { id: 'en-US', label: 'English', nativeName: 'English' },
  { id: 'ja-JP', label: '日本語', nativeName: '日本語' },
];

const UI_LANGUAGE_STORAGE_KEY = 'moovn_ui_language_v1';

const DICTIONARY: Record<UILanguage, Record<string, string>> = {
  'zh-CN': {
    // MenuBar
    'menu.portal': '官网',
    'menu.project': '项目',
    'menu.undo': '撤销',
    'menu.redo': '重做',
    'menu.layout': '窗口与布局',
    'menu.settings': '设置',
    'menu.run': '运行预览',
    'menu.export': '导出',
    'layout.presets': '分栏布局预设',
    'layout.quad': '四象限分栏',
    'layout.col4': '四列并排',
    'layout.cst': '画布+舞台+终端',
    'layout.std': '标准三栏',
    'layout.railPos': '窗口选项栏位置',
    'layout.pos.left': '左侧栏',
    'layout.pos.right': '右侧栏',
    'layout.pos.top': '顶部栏',
    'layout.pos.bottom': '底部栏',
    'layout.windows': '窗口列表与位置调整 (可上下移动顺序或自由停靠)',
    'layout.dock': '停靠',
    'layout.float': '悬浮',
    'layout.reset': '重置默认布局',
    // Panels
    'panel.explorer': '章节与大纲',
    'panel.node_library': '节点库',
    'panel.canvas': '节点画布',
    'panel.stage': '舞台预览',
    'panel.ui_customizer': '游戏 UI 定制',
    'panel.ts_code': '脚本编辑器',
    'panel.yaml_code': 'YAML 剧本',
    'panel.inspector': '属性检查器',
    'panel.characters': '角色管理',
    'panel.ai_agent': 'AI 助手',
    'panel.terminal': '终端控制台',
    'panel.asset_studio': '素材工坊',
    'panel.settings': '系统设置',
    // Launcher
    'launcher.openLocal': '打开本地 .mpvn 项目',
    'launcher.openLocalDesc': '从设备选择已有的 .mpvn 工程文件载入编辑',
    'launcher.selectFile': '选择 .mpvn 文件',
    'launcher.createNew': '新建空白项目',
    'launcher.createNewDesc': '设置项目名称与作者，从零开始搭建视觉小说',
    'launcher.projectName': '项目名称',
    'launcher.author': '作者 / 团队',
    'launcher.createBtn': '创建并进入编辑器',
    'launcher.enterCurrent': '继续当前项目',
    // Settings
    'settings.title': '设置',
    'settings.tab.general': '通用与界面',
    'settings.tab.game': '游戏默认参数',
    'settings.tab.workspace': '本地工作区路径',
    'settings.language': '界面语言 (Language)',
    'settings.save': '保存设置',
    'settings.cancel': '取消',
  },
  'zh-TW': {
    'menu.portal': '官網',
    'menu.project': '專案',
    'menu.undo': '復原',
    'menu.redo': '重做',
    'menu.layout': '視窗與佈局',
    'menu.settings': '設定',
    'menu.run': '執行預覽',
    'menu.export': '匯出',
    'layout.presets': '分欄佈局預設',
    'layout.quad': '四象限分欄',
    'layout.col4': '四列並排',
    'layout.cst': '畫布+舞台+終端',
    'layout.std': '標準三欄',
    'layout.railPos': '視窗選項欄位置',
    'layout.pos.left': '左側欄',
    'layout.pos.right': '右側欄',
    'layout.pos.top': '頂部欄',
    'layout.pos.bottom': '底部欄',
    'layout.windows': '視窗列表與位置調整',
    'layout.dock': '停靠',
    'layout.float': '懸浮',
    'layout.reset': '重設預設佈局',
    'panel.explorer': '章節與大綱',
    'panel.node_library': '節點庫',
    'panel.canvas': '節點畫布',
    'panel.stage': '舞台預覽',
    'panel.ui_customizer': '遊戲 UI 定制',
    'panel.ts_code': '腳本編輯器',
    'panel.yaml_code': 'YAML 劇本',
    'panel.inspector': '屬性檢查器',
    'panel.characters': '角色管理',
    'panel.ai_agent': 'AI 助手',
    'panel.terminal': '終端控制台',
    'panel.asset_studio': '素材工坊',
    'panel.settings': '系統設定',
    'launcher.openLocal': '開啟本機 .mpvn 專案',
    'launcher.openLocalDesc': '從裝置選擇現有的 .mpvn 專案檔案載入編輯',
    'launcher.selectFile': '選擇 .mpvn 檔案',
    'launcher.createNew': '新建空白專案',
    'launcher.createNewDesc': '設定專案名稱與作者，從零開始建立視覺小說',
    'launcher.projectName': '專案名稱',
    'launcher.author': '作者 / 團隊',
    'launcher.createBtn': '建立並進入編輯器',
    'launcher.enterCurrent': '繼續目前專案',
    'settings.title': '設定',
    'settings.tab.general': '一般與介面',
    'settings.tab.game': '遊戲預設參數',
    'settings.tab.workspace': '本機工作區路徑',
    'settings.language': '介面語言 (Language)',
    'settings.save': '儲存設定',
    'settings.cancel': '取消',
  },
  'en-US': {
    'menu.portal': 'Website',
    'menu.project': 'Project',
    'menu.undo': 'Undo',
    'menu.redo': 'Redo',
    'menu.layout': 'Window & Layout',
    'menu.settings': 'Settings',
    'menu.run': 'Run Game',
    'menu.export': 'Export',
    'layout.presets': 'Layout Presets',
    'layout.quad': '2x2 Grid',
    'layout.col4': '4 Columns',
    'layout.cst': 'Canvas + Stage + Terminal',
    'layout.std': 'Standard IDE',
    'layout.railPos': 'Window Bar Position',
    'layout.pos.left': 'Left',
    'layout.pos.right': 'Right',
    'layout.pos.top': 'Top',
    'layout.pos.bottom': 'Bottom',
    'layout.windows': 'Windows & Dock Order',
    'layout.dock': 'Dock',
    'layout.float': 'Float',
    'layout.reset': 'Reset Layout',
    'panel.explorer': 'Chapters',
    'panel.node_library': 'Node Library',
    'panel.canvas': 'Node Canvas',
    'panel.stage': 'Stage Preview',
    'panel.ui_customizer': 'Game UI',
    'panel.ts_code': 'Script Editor',
    'panel.yaml_code': 'YAML Data',
    'panel.inspector': 'Inspector',
    'panel.characters': 'Characters',
    'panel.ai_agent': 'AI Chat',
    'panel.terminal': 'Terminal',
    'panel.asset_studio': 'Asset Studio',
    'panel.settings': 'Settings',
    'launcher.openLocal': 'Open Local .mpvn Project',
    'launcher.openLocalDesc': 'Load an existing .mpvn project file from your device',
    'launcher.selectFile': 'Select .mpvn File',
    'launcher.createNew': 'New Blank Project',
    'launcher.createNewDesc': 'Set project title and author to start from scratch',
    'launcher.projectName': 'Project Name',
    'launcher.author': 'Author / Team',
    'launcher.createBtn': 'Create & Open Editor',
    'launcher.enterCurrent': 'Continue Current Project',
    'settings.title': 'Settings',
    'settings.tab.general': 'General & UI',
    'settings.tab.game': 'Game Defaults',
    'settings.tab.workspace': 'Workspace Path',
    'settings.language': 'Interface Language',
    'settings.save': 'Save Settings',
    'settings.cancel': 'Cancel',
  },
  'ja-JP': {
    'menu.portal': '公式サイト',
    'menu.project': 'プロジェクト',
    'menu.undo': '元に戻す',
    'menu.redo': 'やり直し',
    'menu.layout': 'ウィンドウと配置',
    'menu.settings': '設定',
    'menu.run': 'ゲーム実行',
    'menu.export': '書き出し',
    'layout.presets': 'レイアウトプリセット',
    'layout.quad': '4分割グリッド',
    'layout.col4': '4列並列',
    'layout.cst': 'キャンバス+ステージ+端末',
    'layout.std': '標準3ペイン',
    'layout.railPos': 'ウィンドウバーの位置',
    'layout.pos.left': '左端',
    'layout.pos.right': '右端',
    'layout.pos.top': '上端',
    'layout.pos.bottom': '下端',
    'layout.windows': 'ウィンドウ一覧とドック位置調整',
    'layout.dock': 'ドック',
    'layout.float': 'フロート',
    'layout.reset': 'レイアウト初期化',
    'panel.explorer': 'チャプター構成',
    'panel.node_library': 'ノード一覧',
    'panel.canvas': 'ノードキャンバス',
    'panel.stage': 'ステージプレビュー',
    'panel.ui_customizer': 'ゲームUI設定',
    'panel.ts_code': 'スクリプトエディタ',
    'panel.yaml_code': 'YAMLデータ',
    'panel.inspector': 'インスペクタ',
    'panel.characters': 'キャラクター管理',
    'panel.ai_agent': 'AIアシスタント',
    'panel.terminal': 'ターミナル',
    'panel.asset_studio': 'アセット工房',
    'panel.settings': '設定',
    'launcher.openLocal': 'ローカル .mpvn を開く',
    'launcher.openLocalDesc': '端末内の .mpvn プロジェクトファイルを読み込みます',
    'launcher.selectFile': '.mpvn ファイルを選択',
    'launcher.createNew': '新規プロジェクト作成',
    'launcher.createNewDesc': 'タイトルと制作者を設定して新規作成します',
    'launcher.projectName': 'プロジェクト名',
    'launcher.author': '制作者',
    'launcher.createBtn': '作成してエディタを開く',
    'launcher.enterCurrent': '現在のプロジェクトを続ける',
    'settings.title': '設定',
    'settings.tab.general': '一般・言語・表示',
    'settings.tab.game': 'ゲーム既定値',
    'settings.tab.workspace': 'ワークスペースパス',
    'settings.language': '表示言語 (Language)',
    'settings.save': '保存する',
    'settings.cancel': 'キャンセル',
  },
};

type Listener = (lang: UILanguage) => void;
const listeners = new Set<Listener>();

export function getUILanguage(): UILanguage {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const saved = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) as UILanguage | null;
    if (saved && DICTIONARY[saved]) return saved;
  } catch {
    // ignore
  }
  return 'zh-CN';
}

export function setUILanguage(lang: UILanguage): void {
  if (!DICTIONARY[lang]) return;
  try {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn(lang));
}

export function translateUI(key: string, lang: UILanguage = getUILanguage()): string {
  return DICTIONARY[lang]?.[key] ?? DICTIONARY['zh-CN']?.[key] ?? key;
}

export function getLocalizedPanelTitle(
  panelId: PanelId,
  lang: UILanguage = getUILanguage()
): string {
  return translateUI(`panel.${panelId}`, lang);
}

export function useUILanguage() {
  const [lang, setLangState] = useState<UILanguage>(getUILanguage);

  useEffect(() => {
    const handler: Listener = (next) => setLangState(next);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return {
    lang,
    setLang: setUILanguage,
    t: (key: string) => translateUI(key, lang),
    tPanel: (panelId: PanelId) => getLocalizedPanelTitle(panelId, lang),
  };
}
