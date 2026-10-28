import { importAsset } from '../lib/assetStore';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Wand2,
  Layers,
  Download,
  Upload,
  RotateCcw,
  Check,
  Eraser,
  AlertTriangle,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { CHARACTER_ASSETS } from '../data/assets';
import type { AvatarLayerTextureMap, SceneNode, VNProject } from '../types';
import {
  ALL_AVATAR_LAYER_IDS,
  AvatarLayerId,
  isLive2DBackendRegistered,
  newImageAvatar,
} from '../lib/avatarSystem';
import { CharacterMediaRenderer } from './CharacterMediaRenderer';

interface AssetStudioPanelProps {
  project: VNProject;
  selectedNode: SceneNode | undefined;
  motionLevel?: 'off' | 'subtle' | 'full';
  onUpdateNode: (nodeId: string, patch: Partial<SceneNode>) => void;
  onUpdateProject: (patch: Partial<VNProject>) => void;
}

const LAYER_LABELS: Record<AvatarLayerId, { label: string; requiredForL1?: boolean }> = {
  hair_back: { label: '后发层 (hair_back)' },
  body: { label: '身体素体层 (body)' },
  eyes_open: { label: '睁眼层 (eyes_open)' },
  eyes_closed: { label: '闭眼层 (eyes_closed)', requiredForL1: true },
  mouth_neutral: { label: '闭合口型 (mouth_neutral)' },
  mouth_talk_a: { label: '微张口型 (mouth_talk_a)', requiredForL1: true },
  mouth_talk_b: { label: '张开口型 (mouth_talk_b)' },
  brow_neutral: { label: '默认眉型 (brow_neutral)' },
  brow_angry: { label: '生气眉型 (brow_angry)' },
  brow_sad: { label: '悲伤眉型 (brow_sad)' },
  blush: { label: '脸红差分 (blush)' },
  hair_front: { label: '前发层 (hair_front)' },
};

export const AssetStudioPanel: React.FC<AssetStudioPanelProps> = ({
  project,
  selectedNode,
  motionLevel = 'subtle',
  onUpdateNode,
  onUpdateProject,
}) => {
  const [mode, setMode] = useState<'matting' | 'layered_avatar'>('matting');

  // ==================== Matting State ====================
  const [selectedSpriteId, setSelectedSpriteId] = useState<string>(
    CHARACTER_ASSETS[0]?.id || 'char-yukina-1'
  );
  const [tolerance, setTolerance] = useState<number>(32);
  const [brushSize, setBrushSize] = useState<number>(14);
  const [toolMode, setToolMode] = useState<'wand' | 'eraser'>('wand');
  const [previewBg, setPreviewBg] = useState<'checker' | 'dark' | 'light' | 'green'>('checker');
  const [mattingStatus, setMattingStatus] = useState<string>(
    '点击画面背景可使用魔棒连通抠图，或点击「一键去除背景与棋盘格」'
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);
  const isDrawingRef = useRef<boolean>(false);

  // ==================== L1 Layered Avatar Rigging State ====================
  const [selectedCharId, setSelectedCharId] = useState<string>(
    project.characters[0]?.id || ''
  );
  const [testTalking, setTestTalking] = useState<boolean>(false);
  const [testBlink, setTestBlink] = useState<boolean>(true);
  const [layerUploadStatus, setLayerUploadStatus] = useState<string>('');

  const selectedCharacter = useMemo(
    () =>
      project.characters.find((c) => c.id === selectedCharId) ||
      project.characters[0] ||
      null,
    [project.characters, selectedCharId]
  );

  const avatarDiagnostic = useMemo(() => {
    const baseTex =
      selectedCharacter?.mediaUrl ||
      CHARACTER_ASSETS.find((a) => a.id === selectedCharacter?.spriteId)?.path ||
      CHARACTER_ASSETS[0]?.path ||
      '';
    const inst = newImageAvatar({
      baseTexture: baseTex,
      layerTextures: selectedCharacter?.layerTextures,
    });
    const level = inst.getCapabilityLevel();
    const warnings = inst.getMissingLayerWarnings();
    const hasL1 = inst.hasLayeredParts();
    inst.release();
    return { baseTex, level, warnings, hasL1 };
  }, [selectedCharacter]);

  // Load selected sprite into canvas
  const loadImageToCanvas = (url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      originalImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setMattingStatus(`已加载图像 (${img.width}×${img.height})，可一键智能抠图或点击背景取色`);
    };
    img.onerror = () => {
      setMattingStatus('图像加载失败，请检查文件格式或路径');
    };
    img.src = url;
  };

  useEffect(() => {
    const found = CHARACTER_ASSETS.find((s) => s.id === selectedSpriteId);
    if (found) {
      loadImageToCanvas(found.path);
    }
  }, [selectedSpriteId]);

  // One-click smart alpha matting (flood-fill border + remove semi-transparent halo/checkerboard)
  const handleAutoSmartMatting = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width: w, height: h, data } = imgData;

    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];
    const bgA = data[3];

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    const matchBg = (idx: number) => {
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const a = data[p + 3];
      if (a <= 200) return true;
      if (bgA > 20) {
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        if (diff <= tolerance * 2.4) return true;
      }
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (maxC - minC <= 12 && maxC >= 185) return true;
      return false;
    };

    for (let x = 0; x < w; x++) {
      const top = x;
      const bot = (h - 1) * w + x;
      if (!visited[top] && matchBg(top)) {
        visited[top] = 1;
        queue[tail++] = top;
      }
      if (!visited[bot] && matchBg(bot)) {
        visited[bot] = 1;
        queue[tail++] = bot;
      }
    }
    for (let y = 0; y < h; y++) {
      const l = y * w;
      const r = y * w + (w - 1);
      if (!visited[l] && matchBg(l)) {
        visited[l] = 1;
        queue[tail++] = l;
      }
      if (!visited[r] && matchBg(r)) {
        visited[r] = 1;
        queue[tail++] = r;
      }
    }

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % w;
      const cy = (curr / w) | 0;
      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr - w + w * 2 : -1,
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && nb < w * h && !visited[nb] && matchBg(nb)) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
    }

    let removedCount = 0;
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      if (visited[i] || (data[p + 3] > 0 && data[p + 3] <= 200)) {
        data[p] = 0;
        data[p + 1] = 0;
        data[p + 2] = 0;
        data[p + 3] = 0;
        removedCount++;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    setMattingStatus(`智能抠图完成：已清理 ${removedCount.toLocaleString()} 个背景与发丝残留像素`);
  };

  const handleCanvasClientXY = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const startX = Math.floor((clientX - rect.left) * scaleX);
    const startY = Math.floor((clientY - rect.top) * scaleY);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (toolMode === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(startX, startY, brushSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { width: w, height: h, data } = imgData;
    if (startX < 0 || startX >= w || startY < 0 || startY >= h) return;

    const startIdx = startY * w + startX;
    const targetR = data[startIdx * 4];
    const targetG = data[startIdx * 4 + 1];
    const targetB = data[startIdx * 4 + 2];
    const targetA = data[startIdx * 4 + 3];
    if (targetA === 0) return;

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    queue[tail++] = startIdx;

    const match = (idx: number) => {
      const p = idx * 4;
      if (data[p + 3] === 0) return false;
      const diff =
        Math.abs(data[p] - targetR) +
        Math.abs(data[p + 1] - targetG) +
        Math.abs(data[p + 2] - targetB);
      return diff <= tolerance * 3;
    };

    let cleared = 0;
    while (head < tail) {
      const curr = queue[head++];
      const p = curr * 4;
      data[p] = 0;
      data[p + 1] = 0;
      data[p + 2] = 0;
      data[p + 3] = 0;
      cleared++;

      const cx = curr % w;
      const cy = (curr / w) | 0;
      const nbs = [
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1,
      ];
      for (const nb of nbs) {
        if (nb >= 0 && !visited[nb] && match(nb)) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    setMattingStatus(`魔棒取色抠图：已移除连通区域 ${cleared.toLocaleString()} 像素`);
  };

  const handleRestoreOriginal = () => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImageDataRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(originalImageDataRef.current, 0, 0);
    setMattingStatus('已恢复原图');
  };

  const handleDownloadMattedPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const fileName = `${selectedSpriteId}-matted.png`;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
    setMattingStatus(`已发起透明 PNG 下载：${fileName}`);
  };

  const handleUpdateCharacterLayer = (layerId: AvatarLayerId, dataUrl: string | undefined) => {
    if (!selectedCharacter) return;
    const nextLayers: AvatarLayerTextureMap = {
      ...(selectedCharacter.layerTextures || {}),
    };
    if (dataUrl) {
      nextLayers[layerId] = dataUrl;
    } else {
      delete nextLayers[layerId];
    }

    const nextChars = project.characters.map((c) =>
      c.id === selectedCharacter.id ? { ...c, layerTextures: nextLayers } : c
    );
    onUpdateProject({ characters: nextChars });

    if (selectedNode) {
      const hasCharOnStage = selectedNode.characters.some(
        (pl) => pl.characterId === selectedCharacter.id
      );
      if (hasCharOnStage) {
        onUpdateNode(selectedNode.id, {
          characters: selectedNode.characters.map((pl) =>
            pl.characterId === selectedCharacter.id
              ? { ...pl, layerTextures: nextLayers }
              : pl
          ),
        });
      }
    }
    setLayerUploadStatus(
      dataUrl
        ? `已为「${selectedCharacter.name}」绑定图层 ${layerId}`
        : `已移除「${selectedCharacter.name}」的图层 ${layerId}`
    );
  };

  const bgPreviewStyle =
    previewBg === 'checker'
      ? {
          backgroundImage:
            'linear-gradient(45deg, #2a2a32 25%, transparent 25%), linear-gradient(-45deg, #2a2a32 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a32 75%), linear-gradient(-45deg, transparent 75%, #2a2a32 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
          backgroundColor: '#1b1b21',
        }
      : previewBg === 'dark'
      ? { backgroundColor: '#0c0c10' }
      : previewBg === 'light'
      ? { backgroundColor: '#f4f4f6' }
      : { backgroundColor: '#16a34a' };

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-zinc-200 text-xs select-none overflow-hidden">
      {/* Top Mode Switcher */}
      <div className="p-2.5 border-b border-[#27272c] flex items-center justify-between gap-2 shrink-0">
        <div className="grid grid-cols-2 gap-1 bg-[#121215] p-1 rounded-lg border border-[#27272c] w-full">
          <button
            type="button"
            onClick={() => setMode('matting')}
            className={`py-1.5 px-2 rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'matting'
                ? 'bg-sky-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">智能抠图去底</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('layered_avatar')}
            className={`py-1.5 px-2 rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors ${
              mode === 'layered_avatar'
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">L0/L1 分层立绘装配</span>
          </button>
        </div>
      </div>

      {mode === 'matting' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Source Selector & Upload */}
          <div className="space-y-1.5">
            <label className="block text-[11px] text-zinc-400 font-medium">
              选择内置立绘或上传本地图片
            </label>
            <div className="flex gap-1.5">
              <select
                value={selectedSpriteId}
                onChange={(e) => setSelectedSpriteId(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded bg-[#121215] border border-[#2e2e36] text-xs"
              >
                {CHARACTER_ASSETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.expressionLabel}
                  </option>
                ))}
              </select>
              <label className="px-2.5 py-1.5 rounded bg-[#23232b] hover:bg-[#2c2c36] border border-[#343442] cursor-pointer flex items-center gap-1 shrink-0">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>导入</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 15 * 1024 * 1024) {
                      setMattingStatus('图片超过 15 MB 上限，请压缩后再导入');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        loadImageToCanvas(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {/* Tool Controls */}
          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#121215] border border-[#27272c]">
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>容差阈值</span>
                <span className="font-mono text-sky-400">{tolerance}</span>
              </div>
              <input
                type="range"
                min={4}
                max={80}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>橡皮擦半径</span>
                <span className="font-mono text-sky-400">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={2}
                max={48}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <button
              type="button"
              onClick={() => setToolMode('wand')}
              className={`py-1 px-2 rounded border text-[11px] flex items-center justify-center gap-1 ${
                toolMode === 'wand'
                  ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                  : 'bg-[#1a1a20] border-[#2c2c34] text-zinc-400'
              }`}
            >
              <Wand2 className="w-3 h-3" />
              <span>魔棒连通取色</span>
            </button>
            <button
              type="button"
              onClick={() => setToolMode('eraser')}
              className={`py-1 px-2 rounded border text-[11px] flex items-center justify-center gap-1 ${
                toolMode === 'eraser'
                  ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                  : 'bg-[#1a1a20] border-[#2c2c34] text-zinc-400'
              }`}
            >
              <Eraser className="w-3 h-3" />
              <span>手动透明橡皮</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleAutoSmartMatting}
              className="flex-1 py-1.5 px-2.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center justify-center gap-1.5"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>一键去除背景与棋盘格</span>
            </button>
            <button
              type="button"
              onClick={handleRestoreOriginal}
              className="py-1.5 px-2.5 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#343442] text-zinc-300 flex items-center gap-1"
              title="还原原图"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>还原</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadMattedPng}
              className="py-1.5 px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
              title="导出透明 PNG"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出 PNG</span>
            </button>
          </div>

          {/* Canvas Preview */}
          <div
            className="relative rounded-lg border border-[#2e2e36] overflow-hidden flex items-center justify-center min-h-[240px] max-h-[360px]"
            style={bgPreviewStyle}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={(e) => {
                isDrawingRef.current = true;
                handleCanvasClientXY(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                if (isDrawingRef.current && toolMode === 'eraser') {
                  handleCanvasClientXY(e.clientX, e.clientY);
                }
              }}
              onMouseUp={() => {
                isDrawingRef.current = false;
              }}
              onMouseLeave={() => {
                isDrawingRef.current = false;
              }}
              className="max-h-[340px] w-auto object-contain cursor-crosshair"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>底色预览：</span>
            <div className="flex gap-1">
              {(['checker', 'dark', 'light', 'green'] as const).map((bgKey) => (
                <button
                  key={bgKey}
                  type="button"
                  onClick={() => setPreviewBg(bgKey)}
                  className={`px-2 py-0.5 rounded border ${
                    previewBg === bgKey
                      ? 'border-sky-500 text-sky-300 bg-sky-500/10'
                      : 'border-[#2c2c34] text-zinc-400'
                  }`}
                >
                  {bgKey === 'checker'
                    ? '棋盘格'
                    : bgKey === 'dark'
                    ? '深色'
                    : bgKey === 'light'
                    ? '浅色'
                    : '绿幕'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2 rounded bg-[#121215] border border-[#27272c] text-[11px] text-zinc-300">
            {mattingStatus}
          </div>
        </div>
      ) : (
        /* ==================== L0 / L1 Layered Avatar Inspector & Binder ==================== */
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Character Selector & Level Badge */}
          <div className="p-2.5 rounded-lg bg-[#121215] border border-[#27272c] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-zinc-400 font-medium">
                目标角色配置
              </label>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  avatarDiagnostic.level === 'L1_LAYERED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {avatarDiagnostic.level === 'L1_LAYERED'
                  ? 'L1 分层动态立绘 (已激活)'
                  : 'L0 单图静态立绘'}
              </span>
            </div>

            <select
              value={selectedCharacter?.id || ''}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[#18181c] border border-[#2e2e36] text-xs"
            >
              {project.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.titleRole})
                </option>
              ))}
            </select>

            {/* Honest Missing Layer Warnings (`GPT-17`) */}
            {avatarDiagnostic.warnings.length > 0 && (
              <div className="p-2 rounded bg-amber-950/40 border border-amber-500/40 space-y-1 text-[11px] text-amber-200">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>未绑定分层差分贴图（假开关已禁用）</span>
                </div>
                {avatarDiagnostic.warnings.map((w, idx) => (
                  <div key={idx} className="text-[10px] text-amber-200/90 pl-5">
                    • {w}
                  </div>
                ))}
              </div>
            )}

            {/* Honest Live2D SDK status (`GPT-16`, `Kimi 2B`) */}
            <div className="flex items-center justify-between pt-1 border-t border-[#232329] text-[10px] text-zinc-400">
              <span>L3 Live2D / Spine 骨骼后端：</span>
              <span className="text-zinc-500">
                {isLive2DBackendRegistered()
                  ? '已注册 Live2D SDK'
                  : '未接入 Cubism SDK (已禁用，不伪造降级)'}
              </span>
            </div>
          </div>

          {/* Live Stage Preview Box */}
          {selectedCharacter && (
            <div className="p-2.5 rounded-lg bg-[#121215] border border-[#27272c] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">
                  实时分层预览
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!selectedCharacter.layerTextures?.eyes_closed}
                    onClick={() => setTestBlink((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[10px] border flex items-center gap-1 ${
                      !selectedCharacter.layerTextures?.eyes_closed
                        ? 'opacity-40 cursor-not-allowed border-zinc-700 text-zinc-500'
                        : testBlink
                        ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                        : 'border-zinc-700 text-zinc-400'
                    }`}
                    title={
                      selectedCharacter.layerTextures?.eyes_closed
                        ? '切换随机眨眼 (2~6s)'
                        : '需先绑定 eyes_closed 图层才可启用眨眼'
                    }
                  >
                    <Eye className="w-3 h-3" />
                    <span>眨眼</span>
                  </button>
                  <button
                    type="button"
                    disabled={!selectedCharacter.layerTextures?.mouth_talk_a}
                    onClick={() => setTestTalking((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[10px] border flex items-center gap-1 ${
                      !selectedCharacter.layerTextures?.mouth_talk_a
                        ? 'opacity-40 cursor-not-allowed border-zinc-700 text-zinc-500'
                        : testTalking
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                        : 'border-zinc-700 text-zinc-400'
                    }`}
                    title={
                      selectedCharacter.layerTextures?.mouth_talk_a
                        ? '测试 120ms 文本口型联动'
                        : '需先绑定 mouth_talk_a 图层才可测试口型'
                    }
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>测试说话口型</span>
                  </button>
                </div>
              </div>

              <div className="h-52 rounded border border-[#27272c] bg-[#0d0d11] flex items-end justify-center overflow-hidden p-2">
                <CharacterMediaRenderer
                  mediaUrl={avatarDiagnostic.baseTex}
                  alt={selectedCharacter.name}
                  layerTextures={selectedCharacter.layerTextures}
                  blinkEnabled={testBlink}
                  isTalking={testTalking}
                  motionLevel={motionLevel}
                  className="h-48 w-auto"
                />
              </div>
            </div>
          )}

          {/* Layer Texture Binding List */}
          {selectedCharacter && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-300">
                图层贴图槽位绑定 ({ALL_AVATAR_LAYER_IDS.length} 层)
              </div>
              <div className="space-y-1.5">
                {ALL_AVATAR_LAYER_IDS.map((layerId) => {
                  const meta = LAYER_LABELS[layerId];
                  const boundUrl = selectedCharacter.layerTextures?.[layerId];
                  return (
                    <div
                      key={layerId}
                      className="p-2 rounded bg-[#121215] border border-[#27272c] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-zinc-200 truncate">
                            {meta.label}
                          </span>
                          {meta.requiredForL1 && (
                            <span className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 text-[9px]">
                              L1 关键层
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {boundUrl ? '已绑定透明图层贴图' : '未绑定'}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <label className="px-2 py-1 rounded bg-[#23232b] hover:bg-[#2d2d37] border border-[#343442] text-[10px] cursor-pointer flex items-center gap-1">
                          <Upload className="w-3 h-3 text-sky-400" />
                          <span>{boundUrl ? '替换' : '绑定 PNG'}</span>
                          <input
                            type="file"
                            accept="image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              try {
                                handleUpdateCharacterLayer(layerId, await importAsset(file));
                              } catch (error: unknown) {
                                setLayerUploadStatus(error instanceof Error ? error.message : String(error));
                              }
                            }}
                          />
                        </label>
                        {boundUrl && (
                          <button
                            type="button"
                            onClick={() => handleUpdateCharacterLayer(layerId, undefined)}
                            className="px-2 py-1 rounded bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-[10px]"
                          >
                            解绑
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {layerUploadStatus && (
            <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-200 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>{layerUploadStatus}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
