import React, { useRef, useState, useEffect } from 'react';
import {
  Trash2,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal,
  UserPlus,
  Plus,
  Film,
} from 'lucide-react';
import {
  SceneNode,
  CharacterPlacement,
  CharacterProfile,
  GameUIConfig,
  CharacterIdleMotion,
} from '../types';
import {
  getBackgroundById,
  getCharacterById,
  CHARACTER_ASSETS,
  BACKGROUND_ASSETS,
} from '../data/assets';
import { CharacterMediaRenderer, isVideoMediaSource } from './CharacterMediaRenderer';

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
  compactMobile?: boolean;
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
  compactMobile = false,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [draggingCharId, setDraggingCharId] = useState<string | null>(null);
  const [draggingScreenText, setDraggingScreenText] = useState(false);

  const bg = getBackgroundById(node.backgroundId);
  const currentDialogue = node.dialogues[selectedDialogueIndex] || node.dialogues[0];

  const updateDragFromClientXY = (clientX: number, clientY: number) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.min(95, Math.max(5, Math.round(((clientX - rect.left) / rect.width) * 100)));
    const y = Math.min(92, Math.max(8, Math.round(((clientY - rect.top) / rect.height) * 100)));

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

  useEffect(() => {
    if (!draggingCharId && !draggingScreenText) return;
    const onWinTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        updateDragFromClientXY(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onWinTouchEnd = () => {
      setDraggingCharId(null);
      setDraggingScreenText(false);
    };
    window.addEventListener('touchmove', onWinTouchMove, { passive: false });
    window.addEventListener('touchend', onWinTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onWinTouchMove);
      window.removeEventListener('touchend', onWinTouchEnd);
    };
  }, [draggingCharId, draggingScreenText]);

  const handleStageMouseMove = (e: React.MouseEvent) => {
    updateDragFromClientXY(e.clientX, e.clientY);
  };

  const handleStageTouchMove = (e: React.TouchEvent) => {
    if (!draggingCharId && !draggingScreenText) return;
    const t = e.touches[0];
    if (!t) return;
    updateDragFromClientXY(t.clientX, t.clientY);
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
    <div
      className={`flex flex-col ${
        compactMobile ? 'h-auto' : 'h-full'
      } bg-[#111113] select-none overflow-y-auto sm:overflow-hidden`}
    >
      {/* Responsive Wrapping Stage Toolbar */}
      <div className="min-h-10 py-1.5 px-3 bg-[#161619] border-b border-[#27272c] flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <select
            value={node.backgroundId}
            onChange={(e) =>
              onUpdateNode((prev) => ({ ...prev, backgroundId: e.target.value }))
            }
            className="px-2 py-1 max-w-[145px] sm:max-w-[180px]"
            title="场景背景"
          >
            {BACKGROUND_ASSETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5 text-zinc-400 hidden sm:inline" strokeWidth={1.6} />
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onAddCharacter(e.target.value);
                  e.target.value = '';
                }
              }}
              className="px-2 py-1 w-24 sm:w-28"
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

          <select
            value={node.weatherEffect || 'none'}
            onChange={(e) =>
              onUpdateNode((prev) => ({
                ...prev,
                weatherEffect: e.target.value as any,
              }))
            }
            className="px-2 py-1 w-22 sm:w-24"
            title="天气粒子特效"
          >
            <option value="none">无天气</option>
            <option value="sakura">樱花飘落</option>
            <option value="rain">细雨连绵</option>
            <option value="snow">冬雪纷飞</option>
            <option value="fireflies">夏夜流萤</option>
            <option value="sunset_glow">黄昏光尘</option>
          </select>

          <select
            value={node.colorFilter || 'none'}
            onChange={(e) =>
              onUpdateNode((prev) => ({
                ...prev,
                colorFilter: e.target.value as any,
              }))
            }
            className="px-2 py-1 w-22 sm:w-24"
            title="画面色彩滤镜"
          >
            <option value="none">原色滤镜</option>
            <option value="sepia">旧日怀旧</option>
            <option value="grayscale">黑白回忆</option>
            <option value="night_blue">深蓝夜幕</option>
            <option value="dream_bloom">梦境柔光</option>
          </select>
        </div>

        {/* Selected Character Inline Controls */}
        {selectedPlacement && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sky-300 font-semibold">{selectedPlacement.name}</span>
            <select
              value={selectedPlacement.spriteId}
              onChange={(e) => {
                const sp = CHARACTER_ASSETS.find((a) => a.id === e.target.value);
                onUpdateCharacter(selectedPlacement.id, {
                  spriteId: e.target.value,
                  expressionLabel: sp?.expressionLabel,
                  mediaUrl: undefined,
                  mediaType: 'image',
                });
              }}
              className="px-2 py-1"
              title="切换角色差分立绘"
            >
              {selectedCharGroupSprites.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.expressionLabel}
                </option>
              ))}
            </select>

            <select
              value={selectedPlacement.idleMotion === 'breathe' ? 'breathe' : 'none'}
              onChange={(e) =>
                onUpdateCharacter(selectedPlacement.id, {
                  idleMotion: e.target.value as CharacterIdleMotion,
                })
              }
              className="px-2 py-1"
              title="角色分层呼吸开关（默认仅表情切换+眨眼+口型联动）"
            >
              <option value="none">默认（静态差分 + 眨眼/口型）</option>
              <option value="breathe">启用微呼吸 (Body ScaleY ≤ 1.008)</option>
            </select>

            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime,.gif,.apng,.webp,.mp4,.webm,.mov"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file || !selectedPlacement) return;
                const isVid =
                  file.type.startsWith('video/') ||
                  /\.(mp4|webm|mov|ogv)$/i.test(file.name);
                const isAnimImg = /\.(gif|apng|webp)$/i.test(file.name);
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = String(reader.result || '');
                  onUpdateCharacter(selectedPlacement.id, {
                    mediaUrl: dataUrl,
                    mediaType: isVid
                      ? 'video'
                      : isAnimImg
                      ? 'animated_image'
                      : 'image',
                    videoLoop: true,
                    expressionLabel: file.name,
                  });
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="px-2 py-1 rounded bg-[#22222a] hover:bg-[#2c2c36] border border-[#32323e] text-zinc-200 flex items-center gap-1"
              title="导入角色图片、GIF动图或 MP4/WebM 视频动画"
            >
              <Film className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.6} />
              <span>导入图片/视频动画</span>
            </button>

            {isVideoMediaSource(
              selectedPlacement.mediaUrl,
              selectedPlacement.mediaType
            ) && (
              <select
                value={selectedPlacement.chromaKeyColor || 'none'}
                onChange={(e) =>
                  onUpdateCharacter(selectedPlacement.id, {
                    chromaKeyColor: e.target.value,
                  })
                }
                className="px-2 py-1"
                title="视频动画背景抠像透明"
              >
                <option value="none">原生透明视频 (WebM)</option>
                <option value="#00ff00">绿幕抠像透明</option>
                <option value="#000000">黑底抠像透明</option>
                <option value="#0000ff">蓝幕抠像透明</option>
              </select>
            )}

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
      <div className="sm:flex-1 flex flex-col items-center justify-center p-2.5 sm:p-4 overflow-hidden shrink-0">
        <div
          ref={stageRef}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onTouchMove={handleStageTouchMove}
          onTouchEnd={handleStageMouseUp}
          onClick={() => onSelectCharacterPlacement(null)}
          className="relative w-full max-w-[960px] aspect-video rounded-lg overflow-hidden shadow-2xl border border-[#27272c] bg-black touch-none"
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

          {/* Characters (Supports Static Images, GIF/WebP Animations, and MP4/WebM Video Sprites!) */}
          {node.characters.map((pl) => {
            const charProfile = characters.find((c) => c.id === pl.characterId);
            const activeSpriteId =
              currentDialogue?.speakerId === pl.characterId &&
              currentDialogue?.expressionSpriteId
                ? currentDialogue.expressionSpriteId
                : pl.spriteId;
            const sprite = getCharacterById(activeSpriteId);
            const mediaSrc = pl.mediaUrl || charProfile?.mediaUrl || sprite.path;
            const mediaType = pl.mediaType || charProfile?.mediaType || sprite.mediaType || 'image';
            const idleMotion = pl.idleMotion || charProfile?.idleMotion || 'none';
            const chromaKeyColor = pl.chromaKeyColor || charProfile?.chromaKeyColor;
            const isSpeaking = currentDialogue?.speakerId === pl.characterId;
            const isSelected = pl.id === selectedCharacterPlacementId;

            return (
              <div
                key={pl.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectCharacterPlacement(pl.id);
                  setDraggingCharId(pl.id);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  onSelectCharacterPlacement(pl.id);
                  setDraggingCharId(pl.id);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  left: `${pl.x}%`,
                  top: `${pl.y}%`,
                  height: '78%',
                  transform: `translate(-50%, -50%) scale(${pl.scale}) ${
                    pl.flipX ? 'scaleX(-1)' : ''
                  }`,
                  opacity: pl.opacity ?? 1,
                }}
                className={`absolute cursor-move ${
                  isSelected ? 'z-20 ring-2 ring-sky-400 rounded' : 'z-10'
                }`}
              >
                <CharacterMediaRenderer
                  mediaUrl={mediaSrc}
                  alt={pl.name}
                  mediaType={
                    mediaType === 'video' || mediaType === 'animated_image'
                      ? mediaType
                      : 'static'
                  }
                  videoLoop={pl.videoLoop ?? charProfile?.videoLoop ?? true}
                  videoPlaybackRate={pl.videoPlaybackRate ?? charProfile?.videoPlaybackRate ?? 1}
                  chromaKeyColor={chromaKeyColor}
                  idleMotion={idleMotion === 'breathe' ? 'breathe' : 'none'}
                  isTalking={isSpeaking}
                  className="h-full w-auto object-contain pointer-events-none select-none drop-shadow-[0_14px_28px_rgba(0,0,0,0.68)]"
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
              onTouchStart={(e) => {
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

          {/* Dialogue Box Preview (Responsive height on mobile & desktop) */}
          <div
            style={{
              bottom: '4%',
              width: `${uiConfig.dialogueBox.widthPercent}%`,
              backgroundColor: uiConfig.dialogueBox.bgColor,
              opacity: uiConfig.dialogueBox.bgOpacity,
              borderColor: uiConfig.dialogueBox.borderColor,
              borderWidth: `${uiConfig.dialogueBox.borderWidth}px`,
              borderStyle: 'solid',
              borderRadius: `${uiConfig.dialogueBox.borderRadius}px`,
            }}
            className="absolute left-1/2 -translate-x-1/2 z-25 backdrop-blur-md shadow-2xl flex flex-col justify-between p-2 sm:p-3.5 min-h-[30%] sm:min-h-[110px]"
          >
            <div onClick={(e) => e.stopPropagation()} className="space-y-0.5 sm:space-y-1">
              {currentDialogue && (
                <input
                  type="text"
                  value={currentDialogue.speakerName}
                  onChange={(e) =>
                    onUpdateNode((prev) => ({
                      ...prev,
                      dialogues: prev.dialogues.map((d, idx) =>
                        idx === selectedDialogueIndex
                          ? { ...d, speakerName: e.target.value }
                          : d
                      ),
                    }))
                  }
                  style={{
                    color: currentDialogue.speakerColor || '#38bdf8',
                  }}
                  className="!bg-transparent !border-none font-bold text-xs sm:text-sm px-0 py-0 w-full focus:outline-none"
                />
              )}
              <textarea
                rows={2}
                value={currentDialogue?.text || ''}
                onChange={(e) =>
                  onUpdateNode((prev) => ({
                    ...prev,
                    dialogues: prev.dialogues.map((d, idx) =>
                      idx === selectedDialogueIndex
                        ? { ...d, text: e.target.value }
                        : d
                    ),
                  }))
                }
                style={{
                  color: uiConfig.dialogueBox.textColor,
                }}
                placeholder="在此直接编辑当前台词..."
                className="w-full !bg-transparent !border-none text-[11px] sm:text-xs px-0 py-0 resize-none focus:outline-none leading-snug"
              />
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[10px] text-zinc-400">
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
                  {selectedDialogueIndex + 1}/{Math.max(1, node.dialogues.length)}
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

      {!compactMobile && (
        <div className="sm:hidden p-3 space-y-3 border-t border-[#26262e] bg-[#141418]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200">
              角色与台词控制
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateNode((prev) => ({
                  ...prev,
                  dialogues: [
                    ...prev.dialogues,
                    {
                      id: `dlg-${Date.now()}`,
                      speakerId: currentDialogue?.speakerId || 'custom',
                      speakerName: currentDialogue?.speakerName || '星野 雪奈',
                      speakerColor: currentDialogue?.speakerColor || '#38bdf8',
                      text: '新台词内容...',
                    },
                  ],
                }))
              }
              className="px-2 py-1 rounded bg-sky-600 text-white text-[11px] font-semibold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>新增台词</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {node.characters.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => onSelectCharacterPlacement(pl.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  pl.id === selectedCharacterPlacementId
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                    : 'bg-[#1c1c22] border-[#2e2e38] text-zinc-300'
                }`}
              >
                {pl.name} (X:{pl.x}% Y:{pl.y}%)
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
