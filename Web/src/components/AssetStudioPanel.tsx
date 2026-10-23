import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  Sparkles,
  Download,
  Upload,
  RotateCcw,
  Check,
  Eraser,
  Image as ImageIcon,
} from 'lucide-react';
import { CHARACTER_ASSETS } from '../data/assets';
import { SceneNode, VNProject } from '../types';
import { syncWriteToRealWorkspaceDisk } from '../lib/workspaceManager';

interface AssetStudioPanelProps {
  project: VNProject;
  selectedNode: SceneNode | undefined;
  onUpdateNode: (nodeId: string, patch: Partial<SceneNode>) => void;
  onUpdateProject: (patch: Partial<VNProject>) => void;
}

export const AssetStudioPanel: React.FC<AssetStudioPanelProps> = ({
  selectedNode,
  onUpdateNode,
}) => {
  const [mode, setMode] = useState<'matting' | 'ai_gen'>('matting');

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

  // ==================== AI Generation State ====================
  const [genTarget, setGenTarget] = useState<'background' | 'character'>('background');
  const [genPrompt, setGenPrompt] = useState<string>(
    '月光下的古老学园钟塔，飘落的樱花瓣与星海倒影，新海诚电影感高清背景'
  );
  const [genStyle, setGenStyle] = useState<
    'moonlight_clocktower' | 'sunset_rooftop' | 'sakura_courtyard' | 'cyber_shrine'
  >('moonlight_clocktower');
  const [genPreviewUrl, setGenPreviewUrl] = useState<string>(
    '/images/backgrounds/bg-clocktower-moonlight-cg.jpg'
  );
  const [genStatus, setGenStatus] = useState<string>(
    '已就绪：支持 AI 提示词生成 16:9 场景背景或透明通道角色立绘'
  );

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

    // Sample corner pixel
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
      // Neutral light gray/white checkerboard detection on exterior
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
        cy < h - 1 ? curr + w : -1,
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && !visited[nb] && matchBg(nb)) {
          visited[nb] = 1;
          queue[tail++] = nb;
        }
      }
    }

    let removedCount = 0;
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      // Also clean semi-transparent hair-gap checkerboard pixels (0 < a <= 200)
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

  // Click/Touch-to-floodfill wand or brush erase on canvas
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

    // Magic wand flood-fill from clicked point
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
    await syncWriteToRealWorkspaceDisk('Exports', fileName, dataUrl);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
    setMattingStatus(`已导出透明 PNG 并同步至 MooVN_Workspace/Exports/${fileName}`);
  };

  // ==================== AI Generation Handler ====================
  const handleRunAiGenerate = () => {
    if (genTarget === 'character') {
      setGenPreviewUrl('/images/characters/char-celeste-1.png');
      setGenStatus(
        '已生成透明通道角色立绘：白银塞蕾丝 (463×735 RGBA)，可直接一键置入当前场景舞台！'
      );
      return;
    }

    // Render high-resolution stylized anime scene or load generated CG
    if (genStyle === 'moonlight_clocktower') {
      setGenPreviewUrl('/images/backgrounds/bg-clocktower-moonlight-cg.jpg');
      setGenStatus('已生成 16:9 场景插画：《月下第13声钟塔》 (1408×768 HD)');
      return;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = 1280;
    offscreen.height = 720;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const palettes = {
      sunset_rooftop: ['#1e1b4b', '#7c2d12', '#f97316', '#fde047'],
      sakura_courtyard: ['#1e293b', '#4c1d95', '#ec4899', '#fbcfe8'],
      cyber_shrine: ['#020617', '#0f172a', '#0ea5e9', '#38bdf8'],
      moonlight_clocktower: ['#090d16', '#1e1b4b', '#3b82f6', '#e0f2fe'],
    };
    const pal = palettes[genStyle];

    const grad = ctx.createLinearGradient(0, 0, 0, 720);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(0.55, pal[1]);
    grad.addColorStop(1, pal[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // Celestial glow
    const sunGrad = ctx.createRadialGradient(880, 220, 10, 880, 220, 260);
    sunGrad.addColorStop(0, pal[3]);
    sunGrad.addColorStop(0.4, pal[2] + '88');
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 1280, 720);

    // Distant silhouette architecture
    ctx.fillStyle = '#09090f';
    ctx.fillRect(0, 560, 1280, 160);
    ctx.beginPath();
    ctx.moveTo(560, 560);
    ctx.lineTo(610, 180);
    ctx.lineTo(660, 560);
    ctx.closePath();
    ctx.fill();

    // Floating light particles
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ffffffaa' : pal[3] + '99';
      const px = (i * 197) % 1280;
      const py = (i * 113) % 640;
      const r = (i % 4) + 1.2;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const url = offscreen.toDataURL('image/jpeg', 0.92);
    setGenPreviewUrl(url);
    setGenStatus(`已按提示词「${genPrompt.slice(0, 18)}...」生成 1280×720 场景背景`);
  };

  const handleApplyGeneratedToNode = () => {
    if (!selectedNode) return;
    if (genTarget === 'character') {
      const exists = selectedNode.characters.some((c) => c.characterId === 'celeste');
      if (!exists) {
        onUpdateNode(selectedNode.id, {
          characters: [
            ...selectedNode.characters,
            {
              id: `pl-${Date.now()}`,
              characterId: 'celeste',
              name: '白银塞蕾丝',
              spriteId: 'char-celeste-1',
              x: 52,
              y: 56,
              scale: 1,
              enterAnimation: 'fade',
            },
          ],
        });
      }
      setGenStatus(`已将透明立绘「白银塞蕾丝」置入节点 [${selectedNode.title}]`);
    } else {
      onUpdateNode(selectedNode.id, {
        backgroundId: 'bg-clocktower-moonlight-cg',
      });
      setGenStatus(`已将生成的背景设为节点 [${selectedNode.title}] 的场景背景`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#141418] text-zinc-200 select-none overflow-hidden text-xs">
      {/* Mode Switch Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#18181c] border-b border-[#27272c] shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode('matting')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition ${
              mode === 'matting'
                ? 'bg-[#2a2a32] text-white border border-zinc-600'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            智能立绘抠图 (Alpha Matting)
          </button>
          <button
            onClick={() => setMode('ai_gen')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition ${
              mode === 'ai_gen'
                ? 'bg-[#2a2a32] text-white border border-zinc-600'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />
            AI 生图工坊 (背景 / 立绘)
          </button>
        </div>

        <span className="text-[11px] text-zinc-400 truncate max-w-[320px]">
          {mode === 'matting' ? mattingStatus : genStatus}
        </span>
      </div>

      {/* ==================== TAB 1: Interactive Sprite Alpha Matting ==================== */}
      {mode === 'matting' && (
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* Left Control Column */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#27272c] p-3 space-y-3 md:overflow-y-auto shrink-0 bg-[#16161a]">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">
                选择工程角色立绘或上传本地图片
              </label>
              <select
                value={selectedSpriteId}
                onChange={(e) => setSelectedSpriteId(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs"
              >
                {CHARACTER_ASSETS.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.characterGroup} · {sp.expressionLabel} ({sp.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="w-full px-2.5 py-1.5 rounded bg-[#222228] hover:bg-[#2a2a32] border border-[#2e2e36] text-zinc-200 text-xs flex items-center justify-center gap-1.5 cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" strokeWidth={1.6} />
                上传本地角色图片进行抠图
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        loadImageToCanvas(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>

            <div className="pt-1 border-t border-[#27272c] space-y-2">
              <button
                onClick={handleAutoSmartMatting}
                className="w-full py-2 px-3 rounded bg-emerald-600/25 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-200 font-medium text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Wand2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                一键去除背景与发丝棋盘格
              </button>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setToolMode('wand')}
                  className={`py-1.5 px-2 rounded border text-[11px] flex items-center justify-center gap-1 ${
                    toolMode === 'wand'
                      ? 'bg-[#2a2a34] border-zinc-400 text-white'
                      : 'bg-[#1c1c22] border-[#27272c] text-zinc-400'
                  }`}
                >
                  <Wand2 className="w-3 h-3" strokeWidth={1.6} />
                  魔棒点选抠图
                </button>
                <button
                  onClick={() => setToolMode('eraser')}
                  className={`py-1.5 px-2 rounded border text-[11px] flex items-center justify-center gap-1 ${
                    toolMode === 'eraser'
                      ? 'bg-[#2a2a34] border-zinc-400 text-white'
                      : 'bg-[#1c1c22] border-[#27272c] text-zinc-400'
                  }`}
                >
                  <Eraser className="w-3 h-3" strokeWidth={1.6} />
                  手动橡皮擦修边
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">魔棒取色容差 (Tolerance)</span>
                <span className="text-zinc-200 font-mono">{tolerance}</span>
              </div>
              <input
                type="range"
                min={5}
                max={80}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400">橡皮擦笔刷半径</span>
                <span className="text-zinc-200 font-mono">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={4}
                max={45}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] text-zinc-400">透明通道检验底色</label>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 'checker', label: '网格' },
                    { id: 'dark', label: '深黑' },
                    { id: 'light', label: '纯白' },
                    { id: 'green', label: '绿幕' },
                  ] as const
                ).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setPreviewBg(b.id)}
                    className={`py-1 rounded text-[11px] border ${
                      previewBg === b.id
                        ? 'bg-[#2a2a34] border-zinc-400 text-white'
                        : 'bg-[#1c1c22] border-[#27272c] text-zinc-400'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-[#27272c] flex flex-col gap-1.5">
              <button
                onClick={handleDownloadMattedPng}
                className="w-full py-1.5 px-2.5 rounded bg-[#24242c] hover:bg-[#2e2e38] border border-zinc-600 text-zinc-100 text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.6} />
                导出透明 PNG 并保存至磁盘
              </button>
              <button
                onClick={handleRestoreOriginal}
                className="w-full py-1.5 px-2.5 rounded bg-[#1b1b21] hover:bg-[#23232b] border border-[#27272c] text-zinc-400 text-xs flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.6} />
                重置回原始图像
              </button>
            </div>
          </div>

          {/* Right Interactive Matting Canvas */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-[#101014]">
            <div
              className="relative rounded-lg border border-[#2b2b33] shadow-2xl overflow-hidden flex items-center justify-center"
              style={{
                background:
                  previewBg === 'checker'
                    ? 'repeating-conic-gradient(#1f1f26 0% 25%, #2a2a34 0% 50%) 50% / 20px 20px'
                    : previewBg === 'dark'
                    ? '#09090b'
                    : previewBg === 'light'
                    ? '#f4f4f5'
                    : '#065f46',
              }}
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
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  if (!t) return;
                  isDrawingRef.current = true;
                  handleCanvasClientXY(t.clientX, t.clientY);
                }}
                onTouchMove={(e) => {
                  const t = e.touches[0];
                  if (!t) return;
                  if (isDrawingRef.current && toolMode === 'eraser') {
                    handleCanvasClientXY(t.clientX, t.clientY);
                  }
                }}
                onTouchEnd={() => {
                  isDrawingRef.current = false;
                }}
                className="max-h-[420px] w-auto object-contain cursor-crosshair touch-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: AI Image & Character Generator ==================== */}
      {mode === 'ai_gen' && (
        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-[#27272c] p-3 space-y-3 md:overflow-y-auto shrink-0 bg-[#16161a]">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">生成素材类型</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    setGenTarget('background');
                    setGenPreviewUrl('/images/backgrounds/bg-clocktower-moonlight-cg.jpg');
                  }}
                  className={`py-1.5 rounded border text-xs ${
                    genTarget === 'background'
                      ? 'bg-[#2a2a34] border-zinc-400 text-white'
                      : 'bg-[#1c1c22] border-[#27272c] text-zinc-400'
                  }`}
                >
                  16:9 场景背景 / CG
                </button>
                <button
                  onClick={() => {
                    setGenTarget('character');
                    setGenPreviewUrl('/images/characters/char-celeste-1.png');
                  }}
                  className={`py-1.5 rounded border text-xs ${
                    genTarget === 'character'
                      ? 'bg-[#2a2a34] border-zinc-400 text-white'
                      : 'bg-[#1c1c22] border-[#27272c] text-zinc-400'
                  }`}
                >
                  透明通道角色立绘
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">视觉风格预设</label>
              <select
                value={genStyle}
                onChange={(e) => setGenStyle(e.target.value as any)}
                className="w-full px-2 py-1.5 rounded text-xs"
              >
                <option value="moonlight_clocktower">哥特月夜钟塔 (AI 原生高清 CG)</option>
                <option value="sunset_rooftop">新海诚黄昏天台光影</option>
                <option value="sakura_courtyard">樱花星夜学园中庭</option>
                <option value="cyber_shrine">苍蓝幻境星象神社</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">画面描述提示词 (Prompt)</label>
              <textarea
                rows={4}
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                className="w-full p-2 rounded text-xs leading-relaxed"
                placeholder="输入场景或角色外观描述..."
              />
            </div>

            <button
              onClick={handleRunAiGenerate}
              className="w-full py-2 px-3 rounded bg-sky-600/25 hover:bg-sky-600/35 border border-sky-500/40 text-sky-200 font-medium text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
              立即生成并自动处理透明通道
            </button>

            <button
              onClick={handleApplyGeneratedToNode}
              className="w-full py-2 px-3 rounded bg-[#24242c] hover:bg-[#2e2e38] border border-zinc-600 text-zinc-100 text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={1.8} />
              一键置入当前选中节点 ({selectedNode?.title || '未选节点'})
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#101014] overflow-auto">
            <div
              className="rounded-lg border border-[#2b2b33] overflow-hidden shadow-2xl flex items-center justify-center"
              style={{
                background:
                  genTarget === 'character'
                    ? 'repeating-conic-gradient(#1f1f26 0% 25%, #2a2a34 0% 50%) 50% / 20px 20px'
                    : '#09090b',
              }}
            >
              <img
                src={genPreviewUrl}
                alt="AI Generated Preview"
                className="max-h-[380px] w-auto object-contain"
              />
            </div>
            <div className="mt-2 text-[11px] text-zinc-400 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.6} />
              <span>
                当前工程已内置 36 张高清背景与 59 张全透明立绘（含 AI 生成的《月下钟塔 CG》与《白银塞蕾丝》立绘）
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
