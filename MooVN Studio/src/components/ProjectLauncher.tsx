import React, { useState, useRef } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  Play,
  Settings,
  Download,
  Upload,
  Check,
  Sparkles,
  FileCode,
  HardDrive,
} from 'lucide-react';
import {
  MooVNSystemSettings,
  SavedProjectMeta,
  VNProject,
} from '../types';
import {
  createBlankVNProject,
  deleteSavedProject,
  exportSettingsFileJson,
  getPlatformDefaultPaths,
  loadSavedProjectsList,
  loadSystemSettings,
  pickDeviceMooVNFolder,
  saveProjectToWorkspace,
  saveSystemSettings,
} from '../lib/workspaceManager';
import { exportProjectAsMpvn, parseMpvnProject } from '../lib/mpvnFormat';

interface ProjectLauncherProps {
  onOpenProject: (project: VNProject) => void;
  onClose?: () => void;
  canClose?: boolean;
}

export const ProjectLauncher: React.FC<ProjectLauncherProps> = ({
  onOpenProject,
  onClose,
  canClose = false,
}) => {
  const [tab, setTab] = useState<'projects' | 'create' | 'workspace'>('projects');
  const [projects, setProjects] = useState<SavedProjectMeta[]>(() => loadSavedProjectsList());
  const [settings, setSettings] = useState<MooVNSystemSettings>(() => loadSystemSettings());
  const [notice, setNotice] = useState<string | null>(null);

  // Create project form
  const [newTitle, setNewTitle] = useState('新视觉小说项目');
  const [newAuthor, setNewAuthor] = useState('独立制作组');
  const [resolutionStr, setResolutionStr] = useState('1920x1080');
  const [customSaveDir, setCustomSaveDir] = useState(settings.projectsDirectoryPath);

  const importProjectInputRef = useRef<HTMLInputElement | null>(null);
  const importSettingsInputRef = useRef<HTMLInputElement | null>(null);

  const updateSettings = (patch: Partial<MooVNSystemSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSystemSettings(next);
      return next;
    });
  };

  const handleMountDeviceFolder = async () => {
    const res = await pickDeviceMooVNFolder();
    if (res) {
      if (res.loadedSettings) {
        setSettings(res.loadedSettings);
        setCustomSaveDir(res.loadedSettings.projectsDirectoryPath);
      }
      if (res.loadedProjects.length > 0) {
        for (const p of res.loadedProjects) {
          await saveProjectToWorkspace(p);
        }
        setProjects(loadSavedProjectsList());
      }
      setNotice(`已挂载设备 MooVN Studio 文件夹：${res.folderName}`);
    } else {
      setNotice('当前环境可通过下方路径框或导入 .mpvn 按钮管理本地 MooVN Studio 项目');
    }
  };

  const handleCreateProject = async () => {
    const [w, h] = resolutionStr.split('x').map(Number);
    const safeName = (newTitle || 'NewProject').replace(/[\\/:*?"<>|\s]+/g, '_');
    const fullPath = `${customSaveDir}/${safeName}.mpvn`;

    const proj = createBlankVNProject({
      title: newTitle || '新视觉小说项目',
      author: newAuthor || '独立开发者',
      width: w || 1920,
      height: h || 1080,
      projectPath: fullPath,
    });

    await saveProjectToWorkspace(proj, fullPath);
    setProjects(loadSavedProjectsList());
    onOpenProject(proj);
  };

  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const res = parseMpvnProject(String(reader.result));
      if (res.ok && res.project) {
        await saveProjectToWorkspace(res.project);
        setProjects(loadSavedProjectsList());
        onOpenProject(res.project);
      } else {
        setNotice(res.error || '项目文件解析失败，请确认格式为 .mpvn (MooVN Studio 项目文件)');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportSettingsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as MooVNSystemSettings;
        if (parsed && parsed.workspaceRootPath) {
          saveSystemSettings(parsed);
          setSettings(parsed);
          setCustomSaveDir(parsed.projectsDirectoryPath);
          setNotice('已导入并应用 settings.moovn.json 设置文件');
        }
      } catch {
        setNotice('设置文件格式无效');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSwitchPlatformPreset = (
    plat: MooVNSystemSettings['platform']
  ) => {
    const paths = getPlatformDefaultPaths(plat);
    updateSettings({
      platform: plat,
      ...paths,
    });
    setCustomSaveDir(paths.projectsDirectoryPath);
    setNotice(`已切换为 ${plat.toUpperCase()} 默认专属文件位置`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0e0e11] text-zinc-200 flex flex-col select-none overflow-hidden">
      <input
        ref={importProjectInputRef}
        type="file"
        accept=".mpvn,.json,.moovn.json"
        className="hidden"
        onChange={handleImportProjectFile}
      />
      <input
        ref={importSettingsInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportSettingsFile}
      />

      {/* Top Header */}
      <div className="h-12 px-6 bg-[#141417] border-b border-[#27272c] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-white">
              MooVN Studio
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[#27272c] text-zinc-300 text-[10px] font-mono">
              .mpvn 项目中心
            </span>
          </div>

          <div className="flex items-center bg-[#1a1a1f] p-0.5 rounded-md border border-[#27272c] text-xs">
            {(
              [
                ['projects', '本地项目 (.mpvn)'],
                ['create', '创建新项目'],
                ['workspace', '专属路径与设置文件'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  tab === id
                    ? 'bg-zinc-200 text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleMountDeviceFolder}
            className="px-2.5 py-1.5 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-xs flex items-center gap-1.5"
            title="选择设备上已经保存的 MooVN Studio 文件夹"
          >
            <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
            选择设备文件夹
          </button>

          <button
            onClick={() => importProjectInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.6} />
            导入 .mpvn 项目
          </button>

          {canClose && onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-medium"
            >
              返回编辑器
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto">
        {notice && (
          <div className="mb-4 px-3 py-2 rounded-md bg-[#1c1c20] border border-[#2e2e36] text-xs text-zinc-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
              {notice}
            </span>
            <button
              onClick={() => setNotice(null)}
              className="text-zinc-500 hover:text-zinc-300 text-[11px]"
            >
              关闭
            </button>
          </div>
        )}

        {/* TAB 1: Project List */}
        {tab === 'projects' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-zinc-400">
                当前工作目录：<span className="font-mono text-zinc-200">{settings.projectsDirectoryPath}</span>
              </div>
              <button
                onClick={() => setTab('create')}
                className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-medium flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
                新建空白项目
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {projects.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-lg bg-[#161619] border border-[#27272c] hover:border-zinc-500 transition flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100 truncate">
                        {item.title}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#222227] text-zinc-400 text-[10px] font-mono">
                        v{item.version}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400 font-mono truncate">
                      {item.path}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500">
                      <span>{item.chaptersCount} 章节</span>
                      <span>{item.nodesCount} 节点</span>
                      <span>作者：{item.author}</span>
                      <span>更新：{item.updatedAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setProjects(deleteSavedProject(item.id))}
                      className="icon-btn"
                      title="移除项目"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
                    </button>

                    <button
                      onClick={() => onOpenProject(item.projectData)}
                      className="px-4 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-xs flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" strokeWidth={1.6} />
                      打开项目
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: Create New Project */}
        {tab === 'create' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="p-4 rounded-lg bg-[#1e1e24] border border-zinc-600 text-left space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">
                  创建全新空白项目 (.mpvn)
                </span>
                <FileCode className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.6} />
              </div>
              <div className="text-[11px] text-zinc-400 leading-relaxed">
                创建干净的初始章节与场景节点，从零搭建原创剧本、自定义界面与章节包（或者点击右上角「导入 .mpvn 项目」载入已有项目文件）。
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#161619] border border-[#27272c] space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">项目名称</div>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">创作者 / 团队</div>
                  <input
                    type="text"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">画布标准分辨率</div>
                  <select
                    value={resolutionStr}
                    onChange={(e) => setResolutionStr(e.target.value)}
                    className="w-full px-2.5 py-1.5"
                  >
                    <option value="1920x1080">1920 × 1080 (1080p 标准 16:9)</option>
                    <option value="1280x720">1280 × 720 (720p 轻量 16:9)</option>
                    <option value="2560x1440">2560 × 1440 (2K 超清 16:9)</option>
                  </select>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">项目保存文件夹路径</div>
                  <input
                    type="text"
                    value={customSaveDir}
                    onChange={(e) => setCustomSaveDir(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleCreateProject}
                  className="px-5 py-2 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
                  创建并打开项目
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MooVN Exclusive Directory & Unified Settings File */}
        {tab === 'workspace' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-[#161619] border border-[#27272c] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-zinc-300" strokeWidth={1.6} />
                  <span className="font-medium text-zinc-100">
                    MooVN 专属文件位置（按操作系统自动预设，可自由修改）
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {(['windows', 'android', 'macos', 'ios', 'web'] as const).map((plat) => (
                    <button
                      key={plat}
                      onClick={() => handleSwitchPlatformPreset(plat)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                        settings.platform === plat
                          ? 'bg-zinc-200 text-zinc-950 border-zinc-200 font-semibold'
                          : 'bg-[#1c1c20] border-[#27272c] text-zinc-400'
                      }`}
                    >
                      {plat.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">专属工作区根目录 (Workspace Root)</div>
                  <input
                    type="text"
                    value={settings.workspaceRootPath}
                    onChange={(e) => updateSettings({ workspaceRootPath: e.target.value })}
                    className="w-full px-2.5 py-1.5 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">项目默认保存路径 (Projects Dir)</div>
                  <input
                    type="text"
                    value={settings.projectsDirectoryPath}
                    onChange={(e) => updateSettings({ projectsDirectoryPath: e.target.value })}
                    className="w-full px-2.5 py-1.5 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">游戏默认导出路径 (Exports Dir)</div>
                  <input
                    type="text"
                    value={settings.exportOutputDirectoryPath}
                    onChange={(e) =>
                      updateSettings({ exportOutputDirectoryPath: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 font-mono text-[11px]"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 mb-1">流式解压缓存目录 (Cache Dir)</div>
                  <input
                    type="text"
                    value={settings.cacheDirectoryPath}
                    onChange={(e) => updateSettings({ cacheDirectoryPath: e.target.value })}
                    className="w-full px-2.5 py-1.5 font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* Unified Editor + Game Settings File (settings.moovn.json) */}
            <div className="p-4 rounded-lg bg-[#161619] border border-[#27272c] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-zinc-300" strokeWidth={1.6} />
                  <span className="font-medium text-zinc-100">
                    统一设置文件 ({settings.settingsFilePath})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => importSettingsInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-[11px] flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" strokeWidth={1.6} />
                    导入设置文件
                  </button>
                  <button
                    onClick={() => exportSettingsFileJson(settings)}
                    className="px-2.5 py-1 rounded bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-[11px] flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" strokeWidth={1.6} />
                    保存 settings.moovn.json
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>默认文字打字速度</span>
                    <span>{settings.defaultGameSettings.textSpeedMs}ms/字</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    value={settings.defaultGameSettings.textSpeedMs}
                    onChange={(e) =>
                      updateSettings({
                        defaultGameSettings: {
                          ...settings.defaultGameSettings,
                          textSpeedMs: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>默认 BGM 音量</span>
                    <span>{settings.defaultGameSettings.bgmVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.defaultGameSettings.bgmVolume}
                    onChange={(e) =>
                      updateSettings({
                        defaultGameSettings: {
                          ...settings.defaultGameSettings,
                          bgmVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>自动保存间隔</span>
                    <span>{settings.editorConfig.autoSaveIntervalSec}秒</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={settings.editorConfig.autoSaveIntervalSec}
                    onChange={(e) =>
                      updateSettings({
                        editorConfig: {
                          ...settings.editorConfig,
                          autoSaveIntervalSec: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
