import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Play,
  Settings,
  Download,
  Upload,
  Info,
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
  IS_WEB_EDITION,
  createBlankVNProject,
  createSampleVNProject,
  deleteSavedProject,
  exportSettingsFileJson,
  loadSavedProjectsList,
  makeImportedProjectCopy,
  migrateLegacyRecentProjects,
  loadSystemSettings,
  openSavedProject,
  refreshWorkspacePaths,
  saveProjectToWorkspace,
  saveSystemSettings,
} from '../lib/workspaceManager';
import { parseMpvnProject } from '../lib/mpvnFormat';
import { getLatestDraft, type ProjectSnapshot } from '../lib/projectStorage';
import { useUILanguage } from '../lib/i18n';
import { newId } from '../lib/ids';

interface ProjectLauncherProps {
  onOpenProject: (project: VNProject, savedStorage?: 'file' | 'browser', requireManualSave?: boolean) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  canClose?: boolean;
}

export const ProjectLauncher: React.FC<ProjectLauncherProps> = ({
  onOpenProject,
  onClose,
  onOpenSettings,
  canClose = false,
}) => {
  const { t } = useUILanguage();
  const [tab, setTab] = useState<'projects' | 'create' | 'workspace'>(
    IS_WEB_EDITION ? 'create' : 'projects'
  );
  const [projects, setProjects] = useState<SavedProjectMeta[]>(() => loadSavedProjectsList());
  const [settings, setSettings] = useState<MooVNSystemSettings>(() => loadSystemSettings());
  const [notice, setNotice] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [draft, setDraft] = useState<ProjectSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    if (!IS_WEB_EDITION) {
      refreshWorkspacePaths().then((paths) => {
        if (active) setSettings((prev) => ({ ...prev, ...paths }));
      }).catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : String(error));
      });
    }
    migrateLegacyRecentProjects().then((list) => {
      if (active) setProjects(list);
    }).catch((error: unknown) => {
      if (active) setNotice(`旧工程迁移失败，原记录未删除：${error instanceof Error ? error.message : String(error)}`);
    });
    getLatestDraft().then((snapshot) => {
      if (active && snapshot) setDraft(snapshot);
    }).catch((error: unknown) => {
      if (active) setNotice(`无法读取恢复草稿：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, []);

  const handleRestoreDraft = () => {
    if (!draft) return;
    const parsed = parseMpvnProject(JSON.stringify(draft.project));
    if (!parsed.ok || !parsed.project) {
      setNotice(parsed.error || '草稿校验失败');
      return;
    }
    if (window.confirm('将以未保存状态打开此草稿，不会覆盖已有工程文件。继续吗？')) {
      // Restore as a separate unsaved copy; automatic saving must not replace the source.
      onOpenProject({ ...parsed.project, id: newId('recovered'), projectPath: undefined }, undefined, true);
    }
  };

  const handleOpenSavedProject = async (item: SavedProjectMeta) => {
    try {
      const result = await openSavedProject(item);
      if (!result.ok || !result.project) {
        setNotice(result.error || '读取工程失败');
        return;
      }
      if (result.recoveredFromBackup) {
        window.alert('工程主文件无法读取，已从备份或旧缓存恢复；请检查内容后手动保存。');
      }
      if (result.migrated) {
        window.alert(`已将旧工程迁移至 1.1 脚底锚点（${result.migratedPlacements || 0} 处使用约 39% 的偏移）。请检查位置后手动保存；源文件在保存前不会改写。`);
      }
      if (result.integrity === 'legacy-unchecked') {
        window.alert('旧工程没有文件校验信息，无法判断是否损坏。请检查内容后手动保存；源文件在保存前不会改写。');
      }
      const needsReview = Boolean(result.recoveredFromBackup || result.migrated || result.integrity === 'legacy-unchecked');
      onOpenProject(result.project, needsReview ? undefined : IS_WEB_EDITION ? 'browser' : 'file', needsReview);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  // Create project form
  const [newTitle, setNewTitle] = useState('新视觉小说项目');
  const [newAuthor, setNewAuthor] = useState('独立制作组');
  const [resolutionStr, setResolutionStr] = useState('1920x1080');

  const importProjectInputRef = useRef<HTMLInputElement | null>(null);
  const importSettingsInputRef = useRef<HTMLInputElement | null>(null);

  const loadMpvnFileObject = (file: File) => {
    if (file.size > 16 * 1024 * 1024) {
      setNotice('ERR_FILE_TOO_LARGE: 工程文件超过 16 MiB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseMpvnProject(String(reader.result));
      if (res.ok && res.project) {
        if (res.integrity === 'legacy-unchecked') {
          window.alert('旧工程没有文件校验信息，无法判断是否损坏。导入后请检查内容并另存。');
        }
        if (res.migrated) {
          window.alert(`已将旧工程迁移至 1.1 脚底锚点（${res.migratedPlacements || 0} 处使用约 39% 的偏移）。请检查位置后手动保存。`);
        }
        // Imported files are independent copies, including their storage identity.
        onOpenProject(makeImportedProjectCopy(res.project), undefined, true);
      } else {
        setNotice(res.error || '项目文件解析失败');
      }
    };
    reader.onerror = () => setNotice('ERR_FILE_READ: 无法读取工程文件');
    reader.readAsText(file);
  };

  const updateSettings = (patch: Partial<MooVNSystemSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSystemSettings(next);
      return next;
    });
  };

  const handleCreateProject = async () => {
    const [w, h] = resolutionStr.split('x').map(Number);
    const safeName = (newTitle || 'NewProject').replace(/[\\/:*?"<>|\s]+/g, '_');
    const proj = createBlankVNProject({
      title: newTitle || '新视觉小说项目',
      author: newAuthor || '独立开发者',
      width: w || 1920,
      height: h || 1080,
      projectPath: '',
    });
    proj.projectPath = `${safeName}-${proj.id.slice(-8)}.mpvn`;
    if (!IS_WEB_EDITION) {
      const result = await saveProjectToWorkspace(proj);
      if (!result.ok) {
        setNotice(`保存失败 (${result.code})：${result.error}`);
        return;
      }
      setProjects(loadSavedProjectsList());
      onOpenProject(result.project, 'file');
      return;
    }
    onOpenProject(proj);
  };

  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadMpvnFileObject(file);
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
          setNotice('已导入并应用 settings.moovn.json 设置文件');
        }
      } catch {
        setNotice('设置文件格式无效');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[600] bg-[#0e0e11] text-zinc-200 flex flex-col select-none overflow-hidden">
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
              {IS_WEB_EDITION ? 'MooVN Web' : 'MooVN Studio'}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-[#27272c] text-zinc-300 text-[10px] font-mono">
              {IS_WEB_EDITION ? t('launcher.webBadge') : t('launcher.localBadge')}
            </span>
          </div>

          {!IS_WEB_EDITION && (
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
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-1.5 rounded bg-[#1c1c20] hover:bg-[#27272c] border border-[#27272c] text-zinc-200 text-xs flex items-center gap-1.5"
              title={t('menu.settings')}
            >
              <Settings className="w-3.5 h-3.5" strokeWidth={1.6} />
              {t('menu.settings')}
            </button>
          )}


          <button
            onClick={() => importProjectInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 text-xs font-medium flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.6} />
            {t('launcher.importBtn')}
          </button>

          {canClose && onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-medium"
            >
              {t('launcher.backToEditor')}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto">
        {notice && (
          <div role="status" className="mb-4 px-3 py-2 rounded-md bg-[#1c1c20] border border-[#2e2e36] text-xs text-zinc-200 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" strokeWidth={1.8} />
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

        {draft && (
          <div className="mb-4 p-3 rounded border border-amber-500/50 bg-amber-950/30 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
            <span>发现浏览器恢复草稿：{draft.project.title} · {new Date(draft.updatedAt).toLocaleString()}</span>
            <button type="button" onClick={handleRestoreDraft} className="px-3 py-2 border border-amber-400 rounded">恢复草稿（不覆盖文件）</button>
          </div>
        )}
        {IS_WEB_EDITION && projects.length > 0 && (
          <div className="mb-4 p-3 rounded border border-[#27272c] text-xs">
            <div className="mb-2 text-zinc-300">浏览器中保存的工程（清除浏览器数据会丢失）</div>
            {projects.map((item) => <button key={item.id} type="button" onClick={() => void handleOpenSavedProject(item)} className="mr-2 mb-2 px-3 py-2 rounded border border-[#3c3c46]">{item.title}</button>)}
          </div>
        )}
        {/* Browser projects and desktop projects use separate storage backends. */}
        {IS_WEB_EDITION ? (
          <div className="max-w-4xl mx-auto space-y-6 py-4">
            <div className="p-4 rounded-xl bg-[#16161b] border border-[#27272f] flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" strokeWidth={1.7} />
                  <span>{t('launcher.webBadge')}</span>
                </div>
                <div className="text-xs text-zinc-400 leading-relaxed">
                  {t('launcher.webSubtitle')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Card 1: Import Local .mpvn File */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) loadMpvnFileObject(file);
                }}
                onClick={() => importProjectInputRef.current?.click()}
                className={`p-6 rounded-xl border-2 border-dashed cursor-pointer transition flex flex-col items-center justify-center text-center gap-3 min-h-[260px] ${
                  isDragOver
                    ? 'border-sky-400 bg-sky-500/10'
                    : 'border-[#2e2e38] bg-[#161619] hover:border-sky-400/60 hover:bg-[#1a1a20]'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <Upload className="w-6 h-6" strokeWidth={1.7} />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    {t('launcher.importTitle')}
                  </div>
                  <div className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                    {t('launcher.importDesc')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    importProjectInputRef.current?.click();
                  }}
                  className="mt-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.8} />
                  {t('launcher.importBtn')}
                </button>
              </div>

              {/* Card 2: Create Brand-New Project in Memory (No Local Path Input) */}
              <div className="p-6 rounded-xl bg-[#161619] border border-[#27272c] flex flex-col justify-between gap-4 min-h-[260px]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      {t('launcher.createTitle')}
                    </span>
                    <FileCode className="w-4 h-4 text-sky-400" strokeWidth={1.7} />
                  </div>
                  <div className="text-xs text-zinc-400 leading-relaxed">
                    {t('launcher.createDesc')}
                  </div>

                  <div className="space-y-2.5 pt-1 text-xs">
                    <div>
                      <div className="text-[10px] text-zinc-500 mb-1">项目名称</div>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-2.5 py-1.5"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <div className="text-[10px] text-zinc-500 mb-1">创作者 / 团队</div>
                        <input
                          type="text"
                          value={newAuthor}
                          onChange={(e) => setNewAuthor(e.target.value)}
                          className="w-full px-2.5 py-1.5"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 mb-1">画布标准分辨率</div>
                        <select
                          value={resolutionStr}
                          onChange={(e) => setResolutionStr(e.target.value)}
                          className="w-full px-2.5 py-1.5"
                        >
                          <option value="1920x1080">1920 × 1080 (1080p)</option>
                          <option value="1280x720">1280 × 720 (720p)</option>
                          <option value="2560x1440">2560 × 1440 (2K)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleCreateProject}
                    className="w-full py-2.5 rounded-lg bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
                    {t('launcher.createBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenProject(createSampleVNProject())}
                    className="w-full py-2 rounded-lg bg-[#222229] hover:bg-[#2b2b34] border border-[#32323d] text-zinc-200 font-medium text-xs flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3 h-3 text-sky-400" strokeWidth={1.8} />
                    <span>打开入门示例工程</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* TAB 1: Project List */}
        {tab === 'projects' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-zinc-400">
                当前工作目录：<span className="font-mono text-zinc-200">{settings.projectsDirectoryPath}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenProject(createSampleVNProject())}
                  className="px-3 py-1.5 rounded bg-[#222229] hover:bg-[#2b2b34] border border-[#32323d] text-zinc-200 text-xs font-medium flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.8} />
                  打开入门示例工程
                </button>
                <button
                  onClick={() => setTab('create')}
                  className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-white text-zinc-950 text-xs font-medium flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
                  新建空白项目
                </button>
              </div>
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
                      onClick={() => void handleOpenSavedProject(item)}
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
                    value={settings.projectsDirectoryPath}
                    readOnly
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
              <div className="flex items-center gap-2"><HardDrive className="w-4 h-4" />本地工作区路径</div>
              <p className="text-amber-300">由系统应用数据目录提供；自定义目录尚未实现。</p>
              {[
                ['工作区根目录', settings.workspaceRootPath],
                ['项目目录', settings.projectsDirectoryPath],
                ['导出目录', settings.exportOutputDirectoryPath],
                ['缓存目录', settings.cacheDirectoryPath],
              ].map(([label, value]) => (
                <label key={label} className="block text-zinc-400">{label}
                  <input readOnly value={value} className="w-full px-2.5 py-1.5 font-mono text-[11px]" />
                </label>
              ))}
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
          </>
        )}
      </div>
    </div>
  );
};
