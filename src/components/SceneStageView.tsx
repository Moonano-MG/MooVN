import React, { useRef, useState } from 'react';
import {
  UserPlus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal,
  Sparkles,
  Smile,
  Type,
} from 'lucide-react';
import { SceneNode, CharacterPlacement, CharacterProfile, GameUIConfig } from '../types';
import {
  getBackgroundById,
  getCharacterById,
  CHARACTER_ASSETS,
  BACKGROUND_ASSETS,
} from '../data/assets';
import { getNodeMeta } from '../data/nodeRegistry';

interface SceneStageViewProps {
  node: SceneNode;
  characters: CharacterProfile[];
  uiConfig: GameUIConfig;
  selectedDialogueIndex: number;
  onSelectDialogueIndex: (idx: number) => void;
  selectedCharacterPlacementId: string | null;
  onSelectCharacterPlacement: (id: string | null) => void;
  onUpdateNode: (updater: (n: SceneNode) => SceneNode) => void;
  onAddCharacter: (charId: string) => void;
  onUpdateCharacter: (placementId: string, patch: Partial<CharacterPlacement>) => void;
  onRemoveCharacter: (placementId: string) => void;
}

export const SceneStageView: React.FC<SceneStageViewProps> = ({
  node,
  characters,
  uiConfig,
  selectedDialogueIndex,
  onSelectDialogueIndex,
  selectedCharacterPlacementId,
  onSelectCharacterPlacement,
  onUpdateNode,
  onAddCharacter,
  onUpdateCharacter,
  onRemoveCharacter,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [draggingCharId, setDraggingCharId] = useState<string | null>(null);
  const [draggingScreenText, setDraggingScreenText] = useState(false);

  const bg = getBackgroundById(node.backgroundId);
  const currentDialogue = node.dialogues[selectedDialogueIndex] || node.dialogues[0];
  const nodeMeta = getNodeMeta(node.type);

  const handleStageMouseMove = (e: React.MouseEvent) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.min(92, Math.max(8, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

    if (draggingCharId) {
      onUpdateCharacter(draggingCharId, { x, y });
    } else if (draggingScreenText && node.screenTextConfig) {
      onUpdateNode((prev) => ({
        ...prev,
        screenTextConfig: {
          ...prev.screenTextConfig!,
          x,
          y,
        },
      }));
    }
  };

  const handleStageMouseUp = () => {
    setDraggingCharId(null);
    setDraggingScreenText(false);
  };

  const selectedPlacement = node.characters.find(
    (c) => c.id === selectedCharacterPlacementId
  );

  // Find all expression sprites belonging to the selected character's group
  const selectedCharGroupSprites = selectedPlacement
    ? CHARACTER_ASSETS.filter((a) => {
        const currentAsset = getCharacterById(selectedPlacement.spriteId);
        return a.characterGroup === currentAsset.characterGroup;
      })
    : [];

  return (
    <div className="flex flex-col h-full bg-[#141418] select-none overflow-hidden">
      {/* Stage Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#1f1f23] border-b border-[#2b2b30] shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{ background: nodeMeta.badgeBg, color: nodeMeta.badgeText }}
          >
            [{nodeMeta.categoryLabel}] {nodeMeta.title}
          </span>

          {/* Background Selector (35 backgrounds) */}
          <select
            value={node.backgroundId}
            onChange={(e) =>
              onUpdateNode((prev) => ({ ...prev, backgroundId: e.target.value }))
            }
            className="bg-[#252529] border border-[#3c3c42] rounded px-2 py-1 text-[11px] text-slate-200 max-w-[190px]"
            title="切换当前场景背景"
          >
            {BACKGROUND_ASSETS.map((b) => (
              <option key={b.id} value={b.id}>
                [{b.category}] {b.name}
              </option>
            ))}
          </select>

          {/* Add Character Buttons (7 Heroines/Heroes) */}
          <div className="flex items-center gap-1 pl-1 border-l border-[#333338]">
            {characters.map((char) => (
              <button
                key={char.id}
                onClick={() => onAddCharacter(char.id)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#252529] hover:bg-[#2f2f37] border border-[#383840] text-[11px] text-slate-200 transition"
                title={`添加 ${char.name} 到舞台`}
              >
                <UserPlus className="w-3 h-3" style={{ color: char.color }} />
                <span>{char.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Character Expression & Scale Quick Controls */}
        {selectedPlacement && (
          <div className="flex items-center gap-2 bg-[#252529] border border-[#3c3c42] rounded px-2.5 py-1">
            <Smile className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] text-white font-semibold">
              {selectedPlacement.name} 差分:
            </span>
            <select
              value={selectedPlacement.spriteId}
              onChange={(e) => {
                const sp = CHARACTER_ASSETS.find((a) => a.id === e.target.value);
                onUpdateCharacter(selectedPlacement.id, {
                  spriteId: e.target.value,
                  expressionLabel: sp?.expressionLabel,
                });
              }}
              className="bg-[#18181b] border border-[#3c3c42] rounded px-2 py-0.5 text-[11px] text-amber-300 font-medium"
            >
              {selectedCharGroupSprites.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.expressionLabel} ({sp.name})
                </option>
              ))}
            </select>

            <input
              type="range"
              min="0.6"
              max="1.45"
              step="0.05"
              value={selectedPlacement.scale}
              onChange={(e) =>
                onUpdateCharacter(selectedPlacement.id, {
                  scale: parseFloat(e.target.value),
                })
              }
              className="w-16 accent-[#007acc]"
              title="立绘缩放"
            />
            <button
              onClick={() =>
                onUpdateCharacter(selectedPlacement.id, {
                  flipX: !selectedPlacement.flipX,
                })
              }
              className={`p-1 rounded ${
                selectedPlacement.flipX ? 'bg-[#007acc] text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="水平镜像翻转"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRemoveCharacter(selectedPlacement.id)}
              className="p-1 text-rose-400 hover:bg-rose-500/20 rounded"
              title="从舞台移除立绘"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main 16:9 Stage Viewport */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          ref={stageRef}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onClick={() => onSelectCharacterPlacement(null)}
          className="relative w-full max-w-[960px] aspect-video rounded-lg overflow-hidden shadow-2xl border border-[#2e2e36] bg-slate-950"
        >
          {/* Background Layer */}
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-500"
            style={{
              backgroundImage: `url(${bg.path})`,
              filter:
                node.colorFilter === 'sepia'
                  ? 'sepia(0.75)'
                  : node.colorFilter === 'grayscale'
                  ? 'grayscale(0.92)'
                  : node.colorFilter === 'night_blue'
                  ? 'brightness(0.72) hue-rotate(195deg)'
                  : 'none',
              transform: node.cameraConfig
                ? `scale(${node.cameraConfig.zoom || 1}) translate(${
                    node.cameraConfig.offsetX || 0
                  }%, ${node.cameraConfig.offsetY || 0}%)`
                : 'none',
            }}
          />

          {/* Weather Overlay */}
          {node.weatherEffect && node.weatherEffect !== 'none' && (
            <div className="absolute top-2.5 right-2.5 z-20 px-2 py-0.5 rounded bg-black/60 border border-white/15 text-[10px] text-sky-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>粒子: {node.weatherEffect}</span>
            </div>
          )}

          {/* Character Sprites Layer (Transparent RGBA PNGs) */}
          {node.characters.map((pl) => {
            const activeSpriteId =
              currentDialogue?.speakerId === pl.characterId &&
              currentDialogue?.expressionSpriteId
                ? currentDialogue.expressionSpriteId
                : pl.spriteId;
            const sprite = getCharacterById(activeSpriteId);
            const isSelected = pl.id === selectedCharacterPlacementId;

            return (
              <div
                key={pl.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectCharacterPlacement(pl.id);
                  setDraggingCharId(pl.id);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  left: `${pl.x}%`,
                  top: `${pl.y}%`,
                  transform: `translate(-50%, -50%) scale(${pl.scale}) ${
                    pl.flipX ? 'scaleX(-1)' : ''
                  }`,
                  opacity: pl.opacity ?? 1,
                }}
                className={`absolute cursor-move transition-shadow ${
                  isSelected ? 'z-20 ring-2 ring-[#007acc] rounded-lg' : 'z-10'
                }`}
              >
                <img
                  src={sprite.path}
                  alt={pl.name}
                  draggable={false}
                  className="h-[310px] w-auto object-contain pointer-events-none select-none drop-shadow-[0_14px_28px_rgba(0,0,0,0.68)]"
                />
                {isSelected && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#007acc] text-white text-[10px] font-bold whitespace-nowrap shadow">
                    {pl.name} · {sprite.expressionLabel} ({pl.x}%, {pl.y}%)
                  </div>
                )}
              </div>
            );
          })}

          {/* Screen Free Text Layer (`屏幕文字` 节点可直接在舞台拖拽位置) */}
          {node.screenTextConfig && (
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggingScreenText(true);
              }}
              style={{
                left: `${node.screenTextConfig.x}%`,
                top: `${node.screenTextConfig.y}%`,
                transform: 'translate(-50%, -50%)',
                textAlign: node.screenTextConfig.align,
              }}
              className="absolute z-30 cursor-move px-4 py-2 rounded border border-dashed border-fuchsia-400/60 bg-black/35 backdrop-blur-[2px] max-w-[85%]"
              title="按住鼠标可直接在画面上拖拽屏幕文字位置"
            >
              <div className="flex items-center justify-center gap-1 text-[9px] text-fuchsia-300 mb-1">
                <Type className="w-3 h-3" />
                <span>
                  屏幕文字 ({node.screenTextConfig.x}%, {node.screenTextConfig.y}%) — 可拖拽
                </span>
              </div>
              <div
                style={{
                  fontSize: `${Math.round(node.screenTextConfig.fontSize * 0.72)}px`,
                  color: node.screenTextConfig.color,
                }}
                className="font-extrabold tracking-wide drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] whitespace-pre-wrap"
              >
                {node.screenTextConfig.text}
              </div>
              {node.screenTextConfig.subText && (
                <div className="text-[10px] tracking-[0.2em] text-slate-300 mt-1">
                  {node.screenTextConfig.subText}
                </div>
              )}
            </div>
          )}

          {/* Live Customizable In-Game Dialogue Box Preview */}
          <div
            style={{
              bottom: `${Math.round(uiConfig.dialogueBox.bottomOffset * 0.65)}px`,
              width: `${uiConfig.dialogueBox.widthPercent}%`,
              minHeight: `${Math.round(uiConfig.dialogueBox.heightPx * 0.68)}px`,
              padding: `${Math.round(uiConfig.dialogueBox.paddingPx * 0.75)}px`,
              backgroundColor: uiConfig.dialogueBox.bgColor,
              opacity: uiConfig.dialogueBox.bgOpacity,
              borderColor: uiConfig.dialogueBox.borderColor,
              borderWidth: `${uiConfig.dialogueBox.borderWidth}px`,
              borderStyle: 'solid',
              borderRadius: `${uiConfig.dialogueBox.borderRadius}px`,
            }}
            className="absolute left-1/2 -translate-x-1/2 z-25 backdrop-blur-md shadow-2xl flex flex-col justify-between"
          >
            <div>
              {currentDialogue && (
                <div
                  style={{
                    fontSize: `${Math.round(uiConfig.dialogueBox.speakerFontSize * 0.8)}px`,
                    color: currentDialogue.speakerColor || '#38bdf8',
                  }}
                  className="font-bold mb-1"
                >
                  {currentDialogue.speakerName}
                </div>
              )}
              <p
                style={{
                  fontSize: `${Math.round(uiConfig.dialogueBox.textFontSize * 0.8)}px`,
                  color: uiConfig.dialogueBox.textColor,
                  lineHeight: uiConfig.dialogueBox.lineHeight,
                }}
                className="line-clamp-2"
              >
                {currentDialogue?.text || '（当前节点无台词）'}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <button
                  disabled={selectedDialogueIndex <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDialogueIndex(Math.max(0, selectedDialogueIndex - 1));
                  }}
                  className="p-0.5 rounded bg-white/5 hover:bg-white/15 disabled:opacity-30 text-white"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span>
                  台词 {selectedDialogueIndex + 1} / {node.dialogues.length}
                </span>
                <button
                  disabled={selectedDialogueIndex >= node.dialogues.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDialogueIndex(
                      Math.min(node.dialogues.length - 1, selectedDialogueIndex + 1)
                    );
                  }}
                  className="p-0.5 rounded bg-white/5 hover:bg-white/15 disabled:opacity-30 text-white"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {uiConfig.dialogueBox.visibleControls.back && (
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">后退</span>
                )}
                {uiConfig.dialogueBox.visibleControls.auto && (
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">自动</span>
                )}
                {uiConfig.dialogueBox.visibleControls.skip && (
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">快进</span>
                )}
                {uiConfig.dialogueBox.visibleControls.hide && (
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">隐藏</span>
                )}
                {uiConfig.dialogueBox.visibleControls.settings && (
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">设置</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
