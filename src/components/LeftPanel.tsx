import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Image as ImageIcon,
  Music,
  Volume2,
  Square,
  ChevronRight,
  ChevronDown,
  Plus,
  UserPlus,
  FolderTree,
} from 'lucide-react';
import { SceneNode, StoryChapter } from '../types';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS, AUDIO_ASSETS } from '../data/assets';
import { getNodeMeta } from '../data/nodeRegistry';
import { soundEngine } from '../lib/soundEngine';

interface LeftPanelProps {
  chapters: StoryChapter[];
  nodes: SceneNode[];
  startNodeId: string;
  selectedNodeId: string;
  selectedChapterId: string;
  onSelectChapter: (chapterId: string) => void;
  onSelectNode: (id: string) => void;
  onAddChapter: () => void;
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
  onSelectChapter,
  onSelectNode,
  onAddChapter,
  onAssignBackground,
  onAssignBgm,
  onAddCharacterToStage,
  onOpenYamlTab,
  onOpenTsTab,
}) => {
  const [subTab, setSubTab] = useState<'files' | 'backgrounds' | 'characters' | 'audio'>('files');
  const [showFullRootTree, setShowFullRootTree] = useState(false);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    chapters.forEach((c) => (map[c.id] = true));
    return map;
  });
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [selectedCharGroup, setSelectedCharGroup] = useState<string>('全部');

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  const charGroups = ['全部', ...Array.from(new Set(CHARACTER_ASSETS.map((c) => c.characterGroup)))];
  const filteredSprites =
    selectedCharGroup === '全部'
      ? CHARACTER_ASSETS
      : CHARACTER_ASSETS.filter((c) => c.characterGroup === selectedCharGroup);

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-[#cccccc] select-none overflow-hidden">
      {/* Sub-navigation */}
      <div className="grid grid-cols-4 border-b border-[#2b2b30] bg-[#1f1f23] shrink-0 text-[11px]">
        {(
          [
            ['files', '章节与工程'],
            ['backgrounds', `背景(${BACKGROUND_ASSETS.length})`],
            ['characters', `立绘(${CHARACTER_ASSETS.length})`],
            ['audio', `音频(${AUDIO_ASSETS.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`py-2 font-medium border-b-2 transition ${
              subTab === id
                ? 'border-[#007acc] text-white bg-[#18181b]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. FILES & CHAPTER TREE */}
      {subTab === 'files' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[#2b2b30] flex items-center justify-between text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={showFullRootTree}
                onChange={(e) => setShowFullRootTree(e.target.checked)}
                className="accent-[#007acc]"
              />
              <FolderTree className="w-3.5 h-3.5 text-sky-400" />
              <span>完整项目根目录树</span>
            </label>
            <button
              onClick={onAddChapter}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#007acc] hover:bg-[#1f8ad2] text-white text-[10px]"
            >
              <Plus className="w-3 h-3" />
              新章节
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
            {showFullRootTree && (
              <div className="mb-2 pb-2 border-b border-[#2b2b30] space-y-1 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-slate-300">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>/ (Project Root)</span>
                </div>
                <div className="pl-5 space-y-0.5">
                  <div className="flex items-center gap-1.5 py-0.5">
                    <FileCode className="w-3 h-3 text-sky-400" />
                    <span>package.json</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-0.5">
                    <FileCode className="w-3 h-3 text-emerald-400" />
                    <span>MOOVN_AI_SPEC.md</span>
                  </div>
                  <div
                    onClick={onOpenTsTab}
                    className="flex items-center gap-1.5 py-0.5 text-sky-300 hover:underline cursor-pointer"
                  >
                    <FileCode className="w-3 h-3" />
                    <span>src/runtime/storyEngine.ts</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-0.5">
                    <Folder className="w-3 h-3 text-amber-400" />
                    <span>.github/workflows/build.yml</span>
                  </div>
                </div>
              </div>
            )}

            {chapters.map((ch) => {
              const chNodes = nodes.filter((n) => n.chapterId === ch.id);
              const isExp = !!expandedChapters[ch.id];
              const isCurrentCh = ch.id === selectedChapterId;

              return (
                <div key={ch.id} className="rounded overflow-hidden">
                  <div
                    onClick={() => {
                      onSelectChapter(ch.id);
                      toggleChapter(ch.id);
                    }}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition ${
                      isCurrentCh
                        ? 'bg-[#094771]/45 text-white'
                        : 'hover:bg-[#2a2d2e] text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isExp ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      )}
                      <FileText className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span className="truncate font-medium text-[11px]">{ch.title}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChapter(ch.id);
                        onOpenYamlTab(ch.id);
                      }}
                      className="px-1.5 py-0.5 rounded bg-[#252529] hover:bg-[#007acc] text-[9px] font-mono text-slate-300 hover:text-white shrink-0"
                    >
                      {ch.yamlFileName}
                    </button>
                  </div>

                  {isExp && (
                    <div className="pl-5 pr-1 py-1 space-y-0.5">
                      {chNodes.map((node) => {
                        const meta = getNodeMeta(node.type);
                        const isSel = node.id === selectedNodeId;
                        return (
                          <div
                            key={node.id}
                            onClick={() => onSelectNode(node.id)}
                            className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-[11px] transition ${
                              isSel
                                ? 'bg-[#007acc] text-white'
                                : 'text-slate-400 hover:bg-[#2a2d2e] hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="px-1 py-0.2 rounded text-[9px] font-bold shrink-0"
                                style={{
                                  background: isSel ? 'rgba(255,255,255,0.2)' : meta.badgeBg,
                                  color: isSel ? '#fff' : meta.badgeText,
                                }}
                              >
                                {meta.categoryLabel}
                              </span>
                              <span className="truncate">{node.title}</span>
                            </div>
                            {node.id === startNodeId && (
                              <span className="text-[9px] text-emerald-300 font-bold shrink-0">
                                入口
                              </span>
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

      {/* 2. BACKGROUNDS GALLERY (35 HD scenes) */}
      {subTab === 'backgrounds' && (
        <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-2 gap-2">
          {BACKGROUND_ASSETS.map((bg) => (
            <button
              key={bg.id}
              onClick={() => onAssignBackground(bg.id)}
              className="group rounded-lg overflow-hidden bg-[#202024] border border-[#2b2b30] hover:border-[#007acc] text-left transition flex flex-col"
            >
              <div className="h-20 w-full overflow-hidden relative">
                <img
                  src={bg.path}
                  alt={bg.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-1 right-1 px-1.5 py-0.2 rounded bg-black/70 text-[9px] text-sky-300">
                  {bg.timeOfDay || bg.category}
                </span>
              </div>
              <div className="p-1.5 text-[10px] font-medium text-slate-200 truncate">
                {bg.name}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 3. CHARACTERS & EXPRESSIONS GALLERY (58 RGBA Sprites across 7 characters) */}
      {subTab === 'characters' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-[#2b2b30] flex flex-wrap gap-1 shrink-0">
            {charGroups.map((grp) => (
              <button
                key={grp}
                onClick={() => setSelectedCharGroup(grp)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                  selectedCharGroup === grp
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#252529] text-slate-400 hover:text-white'
                }`}
              >
                {grp}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-2 gap-2">
            {filteredSprites.map((sp) => (
              <div
                key={sp.id}
                onClick={() => onAddCharacterToStage(sp.id)}
                className="group rounded-lg bg-[#202024] border border-[#2b2b30] hover:border-[#007acc] p-2 flex flex-col items-center cursor-pointer transition"
                title="点击添加该表情立绘到当前场景舞台"
              >
                <div className="h-28 w-full flex items-center justify-center overflow-hidden">
                  <img
                    src={sp.path}
                    alt={sp.name}
                    className="h-full w-auto object-contain group-hover:scale-105 transition"
                  />
                </div>
                <div className="mt-1.5 w-full flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-white truncate">{sp.name}</span>
                  <UserPlus className="w-3 h-3 text-sky-400 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. AUDIO ASSETS */}
      {subTab === 'audio' && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {AUDIO_ASSETS.map((aud) => {
            const isPlaying = playingAudioId === aud.id;
            return (
              <div
                key={aud.id}
                className="p-2.5 rounded-lg bg-[#202024] border border-[#2b2b30] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white truncate">{aud.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {aud.type.toUpperCase()} · {aud.duration}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggleAudio(aud.id)}
                    className="p-1.5 rounded bg-[#252529] hover:bg-[#323238] text-sky-400"
                    title="试听音频"
                  >
                    {isPlaying ? (
                      <Square className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {aud.type === 'bgm' && (
                    <button
                      onClick={() => onAssignBgm(aud.id)}
                      className="px-2 py-1 rounded bg-[#007acc] hover:bg-[#1f8ad2] text-white text-[10px]"
                    >
                      设为BGM
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
