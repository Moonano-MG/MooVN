import React, { useRef, useState } from 'react';
import {
  Trash2,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal,
  UserPlus,
} from 'lucide-react';
import { SceneNode, CharacterPlacement, CharacterProfile, GameUIConfig } from '../types';
import {
  getBackgroundById,
  getCharacterById,
  CHARACTER_ASSETS,
  BACKGROUND_ASSETS,
} from '../data/assets';

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

  const selectedCharGroupSprites = selectedPlacement
    ? CHARACTER_ASSETS.filter((a) => {
        const currentAsset = getCharacterById(selectedPlacement.spriteId);
        return a.characterGroup === currentAsset.characterGroup;
      })
    : [];

  return (
    <div className="flex flex-col h-full bg-[#111113] select-none overflow-hidden">
      {/* Compact Monochrome Toolbar */}
      <div className="h-10 px-3 bg-[#161619] border-b border-[#27272c] flex items-center justify-between gap-2 shrink-0 text-xs">
        <div className="flex items-center gap-2">
          <select
            value={node.backgroundId}
            onChange={(e) =>
              onUpdateNode((prev) => ({ ...prev, backgroundId: e.target.value }))
            }
            className="px-2 py-1 max-w-[180px]"
            title="场景背景"
          >
            {BACKGROUND_ASSETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.6} />
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onAddCharacter(e.target.value);
                  e.target.value = '';
                }
              }}
              className="px-2 py-1 w-28"
            >
              <option value="" disabled>
                + 添加角色
              </option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Character Inline Controls */}
        {selectedPlacement && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">{selectedPlacement.name}</span>
            <select
              value={selectedPlacement.spriteId}
              onChange={(e) => {
                const sp = CHARACTER_ASSETS.find((a) => a.id === e.target.value);
                onUpdateCharacter(selectedPlacement.id, {
                  spriteId: e.target.value,
                  expressionLabel: sp?.expressionLabel,
                });
              }}
              className="px-2 py-1"
              title="切换表情差分"
            >
              {selectedCharGroupSprites.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.expressionLabel}
                </option>
              ))}
            </select>

            <div className="w-20">
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
                title="缩放比例"
              />
            </div>

            <button
              onClick={() =>
                onUpdateCharacter(selectedPlacement.id, {
                  flipX: !selectedPlacement.flipX,
                })
              }
              className={`icon-btn ${selectedPlacement.flipX ? 'active' : ''}`}
              title="水平翻转"
            >
              <FlipHorizontal className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
            <button
              onClick={() => onRemoveCharacter(selectedPlacement.id)}
              className="icon-btn"
              title="移除立绘"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            </button>
          </div>
        )}
      </div>

      {/* 16:9 Stage Canvas */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          ref={stageRef}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onClick={() => onSelectCharacterPlacement(null)}
          className="relative w-full max-w-[960px] aspect-video rounded-lg overflow-hidden shadow-2xl border border-[#27272c] bg-black"
        >
          {/* Background */}
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

          {/* Characters */}
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
                className={`absolute cursor-move ${
                  isSelected ? 'z-20 ring-1 ring-zinc-200 rounded' : 'z-10'
                }`}
              >
                <img
                  src={sprite.path}
                  alt={pl.name}
                  draggable={false}
                  className="h-[310px] w-auto object-contain pointer-events-none select-none drop-shadow-[0_14px_28px_rgba(0,0,0,0.68)]"
                />
              </div>
            );
          })}

          {/* Draggable Screen Text */}
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
              className="absolute z-30 cursor-move px-4 py-2 rounded border border-dashed border-zinc-400/60 bg-black/40 max-w-[85%]"
              title="拖拽调整屏幕文字坐标"
            >
              <div
                style={{
                  fontSize: `${Math.round(node.screenTextConfig.fontSize * 0.72)}px`,
                  color: node.screenTextConfig.color,
                }}
                className="font-bold tracking-wide drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] whitespace-pre-wrap"
              >
                {node.screenTextConfig.text}
              </div>
            </div>
          )}

          {/* Dialogue Box Preview */}
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
                {currentDialogue?.text || ''}
              </p>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[10px] text-zinc-400">
              <div className="flex items-center gap-1">
                <button
                  disabled={selectedDialogueIndex <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDialogueIndex(Math.max(0, selectedDialogueIndex - 1));
                  }}
                  className="icon-btn !w-5 !h-5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.6} />
                </button>
                <span className="font-mono">
                  {selectedDialogueIndex + 1}/{node.dialogues.length}
                </span>
                <button
                  disabled={selectedDialogueIndex >= node.dialogues.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDialogueIndex(
                      Math.min(node.dialogues.length - 1, selectedDialogueIndex + 1)
                    );
                  }}
                  className="icon-btn !w-5 !h-5"
                >
                  <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.6} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
