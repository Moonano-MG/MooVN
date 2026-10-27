import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Play,
  Square,
  FolderTree,
  FileCode,
  Check,
} from 'lucide-react';
import { SceneNode, StoryChapter, WorkflowNodeType, NodeCategory } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS, AUDIO_ASSETS } from '../data/assets';
import { NODE_CATEGORIES, NODE_REGISTRY, getNodeMeta, isUnsupportedNode } from '../data/nodeRegistry';
import { soundEngine } from '../lib/soundEngine';
import { useUILanguage } from '../lib/i18n';

interface LeftPanelProps {
  chapters: StoryChapter[];
  nodes: SceneNode[];
  startNodeId: string;
  selectedNodeId: string;
  selectedChapterId: string;
  defaultTab?: 'chapters' | 'nodes' | 'assets';
  onSelectChapter: (chapterId: string) => void;
  onSelectNode: (id: string) => void;
  onAddChapter: () => void;
  onAddNode: (type: WorkflowNodeType) => void;
  onAssignBackground: (bgId: string) => void;
  onAssignBgm: (bgmId: string) => void;
  onAddCharacterToStage: (charId: string) => void;
  onOpenYamlTab: (chapterId: string) => void;
  onOpenTsTab: () => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  chapters,
  nodes,
  startNodeId,
  selectedNodeId,
  selectedChapterId,
  defaultTab = 'nodes',
  onSelectChapter,
  onSelectNode,
  onAddChapter,
  onAddNode,
  onAssignBackground,
  onAssignBgm,
  onAddCharacterToStage,
  onOpenYamlTab,
  onOpenTsTab,
}) => {
  const { t } = useUILanguage();
  const [mainTab, setMainTab] = useState<'chapters' | 'nodes' | 'assets'>(defaultTab);
  const [assetSubTab, setAssetSubTab] = useState<'bg' | 'char' | 'audio'>('bg');
  const [showRootTree, setShowRootTree] = useState(false);

  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    chapters.forEach((c) => (map[c.id] = true));
    return map;
  });

  // Node library collapsible categories
  const [openCategories, setOpenCategories] = useState<Record<NodeCategory, boolean>>({
    control: true,
    loop_logic: true,
    narrative: true,
    screen_text: true,
    character: true,
    visual: false,
    audio: false,
    ui: false,
    script: false,
  });

  // Asset category filters
  const bgCategories = Array.from(new Set(BACKGROUND_ASSETS.map((b) => b.category)));
  const [selectedBgCat, setSelectedBgCat] = useState<string>(bgCategories[0] || '学园·晴日');

  const charGroups = Array.from(new Set(CHARACTER_ASSETS.map((c) => c.characterGroup)));
  const [selectedCharGroup, setSelectedCharGroup] = useState<string>(charGroups[0] || '星野雪奈');

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const handleToggleAudio = (audioId: string) => {
    if (playingAudioId === audioId) {
      soundEngine.stopBgm();
      setPlayingAudioId(null);
    } else {
      const asset = AUDIO_ASSETS.find((a) => a.id === audioId);
      if (asset) {
        soundEngine.playBgm(asset);
        setPlayingAudioId(audioId);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#161619] text-zinc-300 select-none overflow-hidden">
      {/* Primary Sidebar Navigation Tabs */}
      <div className="grid grid-cols-3 border-b border-[#27272c] bg-[#141417] shrink-0 text-xs">
        {(
          [
            ['nodes', t('left.tabNodes')],
            ['chapters', t('left.tabChapters')],
            ['assets', t('left.tabAssets')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMainTab(id)}
            className={`py-2 font-medium border-b-2 transition ${
              mainTab === id
                ? 'border-zinc-200 text-white bg-[#161619]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ==================== TAB 1: CATEGORIZED NODE LIBRARY (节点库) ==================== */}
      {mainTab === 'nodes' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {NODE_CATEGORIES.map((cat) => {
            const catNodes = NODE_REGISTRY.filter((n) => n.category === cat.id);
            const isOpen = !!openCategories[cat.id];

            return (
              <div
                key={cat.id}
                style={{ borderColor: `${cat.color}45` }}
                className="rounded-md border bg-[#17171c] overflow-hidden"
              >
                <button
                  onClick={() =>
                    setOpenCategories((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
                  }
                  style={{
                    backgroundColor: isOpen ? `${cat.color}18` : 'transparent',
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-[#222227] transition"
                >
                  <div className="flex items-center gap-1.5">
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
                    )}
                    <span
                      style={{ backgroundColor: cat.color }}
                      className="w-2 h-2 rounded-full"
                    />
                    <span style={{ color: cat.color }}>{cat.label}</span>
                  </div>
                  <span
                    style={{
                      backgroundColor: `${cat.color}25`,
                      color: cat.color,
                    }}
                    className="px-1.5 py-0.2 rounded text-[10px] font-mono"
                  >
                    {catNodes.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="p-1.5 pt-1 grid grid-cols-2 gap-1">
                    {catNodes.map((meta) => (
                      <button
                        key={meta.type}
                        disabled={isUnsupportedNode(meta.type)}
                        onClick={() => onAddNode(meta.type)}
                        style={{
                          backgroundColor: meta.badgeBg,
                          borderColor: `${meta.accentColor}55`,
                          borderLeftWidth: '3px',
                          borderLeftColor: meta.accentColor,
                        }}
                        className="flex items-center justify-between px-2 py-1.5 rounded border hover:brightness-125 text-left transition group"
                        title={`${meta.title}：${meta.description}`}
                      >
                        <span
                          style={{ color: meta.badgeText }}
                          className="text-[11px] font-medium truncate"
                        >
                          {meta.title}{isUnsupportedNode(meta.type) ? '（未实现）' : ''}
                        </span>
                        <Plus
                          style={{ color: meta.accentColor }}
                          className="w-3 h-3 shrink-0"
                          strokeWidth={1.8}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== TAB 2: CHAPTERS & ROOT TREE (章节) ==================== */}
      {mainTab === 'chapters' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-[#27272c] flex items-center justify-between">
            <button
              onClick={() => setShowRootTree((v) => !v)}
              className={`icon-btn ${showRootTree ? 'active' : ''}`}
              title="切换显示完整项目根目录树"
            >
              <FolderTree className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
            <button
              onClick={onAddChapter}
              className="icon-btn"
              title="新建章节"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {showRootTree && (
              <div className="mb-2 pb-2 border-b border-[#27272c] space-y-0.5 text-[11px] font-mono text-zinc-400">
                <div className="px-2 py-0.5 text-zinc-300 font-semibold">
                  工程文件索引 ({chapters.length} 章节 / {nodes.length} 节点)
                </div>
                <div className="pl-3 space-y-0.5">
                  {chapters.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => {
                        onSelectChapter(ch.id);
                        onOpenYamlTab(ch.id);
                      }}
                      className="px-2 py-0.5 text-zinc-300 hover:bg-[#27272c] rounded cursor-pointer truncate"
                      title="点击在脚本编辑器中查看章节 YAML"
                    >
                      scenes/{ch.yamlFileName || `${ch.id}.yaml`}
                    </div>
                  ))}
                  <div
                    onClick={onOpenTsTab}
                    className="px-2 py-0.5 text-sky-300 hover:bg-[#27272c] rounded cursor-pointer truncate"
                    title="点击打开多语言脚本视图"
                  >
                    scripts/scene_runtime.ts
                  </div>
                </div>
              </div>
            )}

            {chapters.map((ch) => {
              const chNodes = nodes.filter((n) => n.chapterId === ch.id);
              const isExp = !!expandedChapters[ch.id];
              const isCurrent = ch.id === selectedChapterId;

              return (
                <div key={ch.id} className="rounded overflow-hidden">
                  <div
                    onClick={() => {
                      onSelectChapter(ch.id);
                      setExpandedChapters((prev) => ({ ...prev, [ch.id]: !prev[ch.id] }));
                    }}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition ${
                      isCurrent
                        ? 'bg-[#27272c] text-white'
                        : 'hover:bg-[#202025] text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isExp ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-500" strokeWidth={1.6} />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-500" strokeWidth={1.6} />
                      )}
                      <span className="truncate text-xs font-medium">{ch.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChapter(ch.id);
                        onOpenYamlTab(ch.id);
                      }}
                      className="icon-btn !w-5 !h-5"
                      title={`查看 ${ch.yamlFileName}`}
                    >
                      <FileCode className="w-3 h-3" strokeWidth={1.6} />
                    </button>
                  </div>

                  {isExp && (
                    <div className="pl-4 pr-1 py-1 space-y-0.5">
                      {chNodes.map((node) => {
                        const meta = getNodeMeta(node.type);
                        const isSel = node.id === selectedNodeId;
                        return (
                          <div
                            key={node.id}
                            onClick={() => onSelectNode(node.id)}
                            style={{
                              borderLeftWidth: '3px',
                              borderLeftColor: meta.accentColor,
                              backgroundColor: isSel ? `${meta.accentColor}28` : undefined,
                            }}
                            className={`flex items-center justify-between px-2 py-1 rounded-r cursor-pointer text-[11px] transition ${
                              isSel
                                ? 'text-white font-semibold'
                                : 'text-zinc-300 hover:bg-[#202025] hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                style={{
                                  backgroundColor: meta.badgeBg,
                                  color: meta.badgeText,
                                }}
                                className="px-1 py-0.2 rounded text-[9px] font-medium shrink-0"
                              >
                                {meta.categoryLabel}
                              </span>
                              <span className="truncate">{node.title}</span>
                            </div>
                            {node.id === startNodeId && (
                              <span
                                style={{ backgroundColor: meta.accentColor }}
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                title="起始节点"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TAB 3: CATEGORIZED ASSETS (素材) ==================== */}
      {mainTab === 'assets' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-type Switch */}
          <div className="p-2 border-b border-[#27272c] grid grid-cols-3 gap-1 shrink-0">
            {(
              [
                ['bg', '背景'],
                ['char', '立绘'],
                ['audio', '音频'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setAssetSubTab(id)}
                className={`py-1 rounded text-[11px] font-medium transition ${
                  assetSubTab === id
                    ? 'bg-[#27272c] text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 3A. Categorized Backgrounds */}
          {assetSubTab === 'bg' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-2 py-1.5 border-b border-[#27272c] flex flex-wrap gap-1 shrink-0">
                {bgCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedBgCat(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] transition ${
                      selectedBgCat === cat
                        ? 'bg-zinc-200 text-zinc-950 font-semibold'
                        : 'bg-[#202025] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
                {BACKGROUND_ASSETS.filter((b) => b.category === selectedBgCat).map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => onAssignBackground(bg.id)}
                    className="group rounded-md overflow-hidden bg-[#1c1c20] border border-[#27272c] hover:border-zinc-500 text-left transition flex flex-col"
                    title={`点击应用背景：${bg.name}`}
                  >
                    <div className="h-16 w-full overflow-hidden">
                      <img
                        src={bg.path}
                        alt={bg.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    </div>
                    <div className="px-1.5 py-1 text-[10px] text-zinc-300 truncate">
                      {bg.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3B. Categorized Character Expression Sprites */}
          {assetSubTab === 'char' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-2 py-1.5 border-b border-[#27272c] flex flex-wrap gap-1 shrink-0">
                {charGroups.map((grp) => (
                  <button
                    key={grp}
                    onClick={() => setSelectedCharGroup(grp)}
                    className={`px-2 py-0.5 rounded text-[10px] transition ${
                      selectedCharGroup === grp
                        ? 'bg-zinc-200 text-zinc-950 font-semibold'
                        : 'bg-[#202025] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
                {CHARACTER_ASSETS.filter((c) => c.characterGroup === selectedCharGroup).map(
                  (sp) => (
                    <button
                      key={sp.id}
                      onClick={() => onAddCharacterToStage(sp.id)}
                      className="group rounded-md bg-[#1c1c20] border border-[#27272c] hover:border-zinc-500 p-1.5 flex flex-col items-center transition"
                      title={`添加 ${sp.name} 至舞台`}
                    >
                      <div className="h-24 w-full flex items-center justify-center overflow-hidden">
                        <img
                          src={sp.path}
                          alt={sp.name}
                          className="h-full w-auto object-contain group-hover:scale-105 transition"
                        />
                      </div>
                      <span className="mt-1 text-[10px] text-zinc-300 truncate">
                        {sp.expressionLabel}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* 3C. Audio List */}
          {assetSubTab === 'audio' && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {AUDIO_ASSETS.map((aud) => {
                const isPlaying = playingAudioId === aud.id;
                return (
                  <div
                    key={aud.id}
                    className="px-2.5 py-2 rounded-md bg-[#1c1c20] border border-[#27272c] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-zinc-200 truncate">{aud.name}</div>
                      <div className="text-[10px] text-zinc-500">{aud.duration}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleAudio(aud.id)}
                        className="icon-btn"
                        title={isPlaying ? '停止' : '试听'}
                      >
                        {isPlaying ? (
                          <Square className="w-3 h-3" strokeWidth={1.6} />
                        ) : (
                          <Play className="w-3 h-3" strokeWidth={1.6} />
                        )}
                      </button>
                      {aud.type === 'bgm' && (
                        <button
                          onClick={() => onAssignBgm(aud.id)}
                          className="icon-btn"
                          title="应用为当前节点BGM"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={1.6} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
