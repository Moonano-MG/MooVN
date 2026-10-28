import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  Globe,
  HelpCircle,
  Monitor,
  Smartphone,
  Apple,
  Terminal,
  Code2,
  FileArchive,
  Layers,
  Sparkles,
  Maximize2,
  X,
  Cpu,
  Workflow,
} from 'lucide-react';

interface OfficialPortalProps {
  onEnterStudio?: () => void;
}

const EDITOR_SCREENSHOTS = [
  {
    id: 'workbench',
    title: '多维分栏创作工作台',
    badge: '可视化节点 + 实时舞台 + 脚本同步',
    src: '/screenshots/editor-workbench.png',
    desc: '在一个窗口内同时编排剧情节点画布、预览 16:9 场景舞台立绘演出、调节角色好感度属性并实时生成多语言脚本。',
    highlights: ['自由拖拽与多向分栏布局', '角色立绘与差分表情实时舞台预览', '好感度与自定义属性检查器'],
  },
  {
    id: 'nodes',
    title: '凹槽逻辑积木与 55 类专用节点',
    badge: '9 大色系分类 · 多层循环与条件嵌套',
    src: '/screenshots/editor-nodes-scratch.png',
    desc: '内置 9 大色系 55 种视觉小说专用节点，支持重复执行循环、条件判断分支等凹槽容器的多层嵌套与可视化连线。',
    highlights: ['55 种视觉小说叙事与演出节点', '支持多层循环与条件分支容器嵌套', '支持独立游戏包、章节包与工程导出'],
  },
  {
    id: 'stage',
    title: '16:9 蓝色经典视觉小说舞台与分支交互',
    badge: '高清立绘合成 · 选项分支 · 存档系统',
    src: '/screenshots/editor-stage-preview.png',
    desc: '内置 16:9 蓝色经典游戏界面模板，支持多角色透明立绘叠加、左上方单行自适应分支选项、自动/快进与多页签存档。',
    highlights: ['16:9 响应式蓝色经典对话框模板', '多角色立绘位置拖拽与滤镜特效', '多文件夹页签存档与读档界面'],
  },
];

export const OfficialPortal: React.FC<OfficialPortalProps> = () => {
  const repoUrl = 'https://github.com/Moonano-MG/MooVN';
  const branchTreeUrl = 'https://github.com/Moonano-MG/MooVN/tree/v0.1.0-dev';
  const sourceZipUrl =
    'https://codeload.github.com/Moonano-MG/MooVN/zip/refs/heads/v0.1.0-dev';

  const [activeShotIndex, setActiveShotIndex] = useState(0);
  const [lightboxShot, setLightboxShot] = useState<(typeof EDITOR_SCREENSHOTS)[0] | null>(null);
  const windowsArchs = [
    {
      arch: 'x64',
      desc: '64位主流桌面处理器 (Intel / AMD)',
    },
    {
      arch: 'ARM64',
      desc: 'ARM64 架构设备 (Snapdragon X / Windows on ARM)',
    },
    {
      arch: 'x86',
      desc: '32位传统桌面处理器兼容架构',
    },
  ];

  const activeShot = EDITOR_SCREENSHOTS[activeShotIndex] || EDITOR_SCREENSHOTS[0];

  return (
    <div className="min-h-screen bg-[#050c1a] text-slate-100 flex flex-col selection:bg-sky-500 selection:text-white relative overflow-x-hidden">
      {/* Rich Blue Ambient Background Layers */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[980px] h-[520px] rounded-full bg-gradient-to-b from-blue-600/25 via-sky-500/12 to-transparent blur-3xl" />
        <div className="absolute top-[38%] -left-48 w-[560px] h-[560px] rounded-full bg-blue-700/15 blur-3xl" />
        <div className="absolute top-[55%] -right-48 w-[620px] h-[620px] rounded-full bg-sky-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(56, 189, 248, 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.16) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-sky-400/20 bg-[#071226]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-blue-700 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-blue-600/35 ring-1 ring-sky-300/40">
              M
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-white group-hover:text-sky-300 transition-colors">
                MooVN Studio
              </span>
              <span className="text-[10px] text-sky-300/80 font-medium hidden sm:inline">
                跨平台视觉小说创作工作台
              </span>
            </div>
          </a>

          <nav className="flex items-center gap-2 sm:gap-3 text-sm">
            <a
              href="#intro"
              className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-blue-500/15 transition-colors"
            >
              介绍
            </a>
            <a
              href="#download"
              className="px-3 py-1.5 rounded-lg text-slate-200 hover:text-white hover:bg-blue-500/15 transition-colors"
            >
              下载
            </a>
            <a
              href="/studio.html"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold transition-all shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>MooVN网页体验</span>
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1">
        {/* Hero Center Section */}
        <section className="relative overflow-hidden py-16 sm:py-24 px-4 sm:px-6 border-b border-sky-400/15">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/15 border border-sky-400/30 text-sky-300 text-xs font-medium mb-6 shadow-inner shadow-sky-400/10">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>可视化节点编排 · 实时立绘舞台 · 多语言脚本编辑 · HTML5 导出</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
              <span className="bg-gradient-to-r from-white via-sky-200 to-blue-400 bg-clip-text text-transparent">
                MooVN Studio
              </span>
            </h1>

            <p className="text-base sm:text-xl text-blue-100/85 max-w-2xl mx-auto leading-relaxed mb-10">
              面向视觉小说与互动叙事创作者的跨平台集成开发工作台。
              <br className="hidden sm:inline" />
              支持可视化节点与场景预览；当前游戏导出为 HTML5 单文件，原生安装包尚未实现。
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="#download"
                className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-semibold text-sm flex items-center gap-2.5 shadow-xl shadow-blue-600/35 ring-1 ring-sky-300/40 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>立即下载</span>
              </a>

              <a
                href="/studio.html"
                target="_blank"
                rel="noopener noreferrer"
                className="px-7 py-3.5 rounded-xl bg-[#0d1f3d]/90 hover:bg-[#132c54] border border-sky-400/35 text-sky-100 font-semibold text-sm flex items-center gap-2.5 shadow-lg shadow-blue-950/50 transition-all cursor-pointer"
              >
                <Globe className="w-4 h-4 text-sky-400" />
                <span>MooVN网页体验</span>
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
              </a>

              <a
                href="#intro"
                className="px-6 py-3.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 border border-blue-400/25 text-blue-200 font-medium text-sm flex items-center gap-2 transition-colors"
              >
                <Layers className="w-4 h-4 text-sky-400" />
                <span>了解工作台特性</span>
              </a>
            </div>
          </div>
        </section>

        {/* Introduction & Real Editor Screenshots Section (Above Download Interface) */}
        <section
          id="intro"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-b border-sky-400/15"
        >
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-xs font-semibold mb-3">
              <Layers className="w-3.5 h-3.5" />
              <span>工作台核心特性与实机界面</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              为什么选择 MooVN Studio 创作视觉小说
            </h2>
            <p className="text-sm sm:text-base text-blue-200/75 max-w-2xl mx-auto">
              将流程图节点连线、多层循环与条件凹槽积木、实时场景舞台和脚本编译器融为一体，让剧本创作与演出编排直观高效。
            </p>
          </div>

          {/* 3 Blue Feature Pillar Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
            <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0c1d3b]/90 to-[#081326]/90 p-6 shadow-lg shadow-blue-950/40">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/35 flex items-center justify-center text-sky-300 mb-4">
                <Workflow className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">
                可视化剧情节点与凹槽积木
              </h3>
              <p className="text-xs text-blue-100/75 leading-relaxed">
                涵盖流程控制、循环与条件、叙事对话、屏幕演出、角色好感度、镜头特效、音频配音等 9 大分类 55 种专用节点，支持多层循环与分支容器嵌套。
              </p>
            </div>

            <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0c1d3b]/90 to-[#081326]/90 p-6 shadow-lg shadow-blue-950/40">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/35 flex items-center justify-center text-sky-300 mb-4">
                <Monitor className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">
                16:9 实时舞台与蓝色经典模板
              </h3>
              <p className="text-xs text-blue-100/75 leading-relaxed">
                在编辑器内直接拖拽角色立绘坐标、切换表情差分、预览天气粒子与转场动画，内置经典蓝色对话框与多页签存档界面。
              </p>
            </div>

            <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0c1d3b]/90 to-[#081326]/90 p-6 shadow-lg shadow-blue-950/40">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/35 flex items-center justify-center text-sky-300 mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">
                脚本编辑与 HTML5 导出
              </h3>
              <p className="text-xs text-blue-100/75 leading-relaxed">
                编辑器提供多种脚本语言与 YAML 视图。游戏可导出为 HTML5 单文件；原生安装包导出尚未实现。
              </p>
            </div>
          </div>

          {/* Interactive Editor Screenshot Showcase */}
          <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-b from-[#0b1b36] to-[#071124] p-4 sm:p-6 shadow-2xl shadow-blue-950/60">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
                  MooVN Studio 编辑器实机截图
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                  {activeShot.title}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {EDITOR_SCREENSHOTS.map((shot, idx) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => setActiveShotIndex(idx)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      idx === activeShotIndex
                        ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'bg-[#102447] text-blue-200 hover:text-white hover:bg-[#16305e] border border-sky-400/20'
                    }`}
                  >
                    {idx + 1}. {shot.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Featured Screenshot Frame */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8">
                <div
                  onClick={() => setLightboxShot(activeShot)}
                  className="group relative rounded-xl overflow-hidden border border-sky-400/35 bg-[#050b16] shadow-xl cursor-zoom-in"
                >
                  <img
                    src={activeShot.src}
                    alt={activeShot.title}
                    className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                  <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-[#071226]/90 border border-sky-400/40 text-sky-200 text-xs font-medium flex items-center gap-1.5 backdrop-blur-md">
                    <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>点击放大查看高清截图</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                <div className="rounded-xl border border-sky-400/25 bg-[#0d1f3d]/70 p-5">
                  <div className="inline-block px-2.5 py-1 rounded-md bg-sky-500/20 border border-sky-400/30 text-sky-300 text-[11px] font-semibold mb-3">
                    {activeShot.badge}
                  </div>
                  <h4 className="text-base font-bold text-white mb-2">
                    {activeShot.title}
                  </h4>
                  <p className="text-xs text-blue-100/80 leading-relaxed mb-4">
                    {activeShot.desc}
                  </p>
                  <ul className="space-y-2">
                    {activeShot.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-xs text-sky-200"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href="/studio.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all"
                >
                  <Globe className="w-4 h-4" />
                  <span>进入 MooVN Studio Web 编辑器</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Thumbnail Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-sky-400/15">
              {EDITOR_SCREENSHOTS.map((shot, idx) => (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => setActiveShotIndex(idx)}
                  className={`text-left rounded-xl overflow-hidden border transition-all cursor-pointer flex flex-col ${
                    idx === activeShotIndex
                      ? 'border-sky-400 ring-2 ring-sky-400/35 bg-[#10254a]'
                      : 'border-sky-400/20 bg-[#09162d] hover:border-sky-400/50 opacity-85 hover:opacity-100'
                  }`}
                >
                  <img
                    src={shot.src}
                    alt={shot.title}
                    className="w-full h-32 object-cover object-top border-b border-sky-400/20"
                  />
                  <div className="p-3">
                    <div className="text-xs font-bold text-white truncate">
                      {shot.title}
                    </div>
                    <div className="text-[11px] text-sky-300/80 truncate mt-0.5">
                      {shot.badge}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Download Section */}
        <section id="download" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-sky-400/30 text-sky-300 text-xs font-semibold mb-3">
                <Download className="w-3.5 h-3.5" />
                <span>平台发布状态与源码</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                下载 MooVN Studio
              </h2>
              <p className="text-sm text-blue-200/75">
                各平台安装包尚未发布，可下载源码或使用在线工作台。
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* 1. Windows (ARM64, x64, x86 with Install & ZIP) */}
            <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-b from-[#0b1c38]/95 to-[#071226]/95 p-6 shadow-xl shadow-blue-950/50">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-sky-400/35 flex items-center justify-center text-sky-300">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Windows</h3>
                  <p className="text-xs text-blue-200/75">
                    安装包与便携包尚未发布。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {windowsArchs.map((item) => (
                  <div
                    key={item.arch}
                    className="rounded-xl border border-sky-400/25 bg-[#0d2142]/75 p-4 flex flex-col justify-between hover:border-sky-400/50 transition-colors"
                  >
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-base font-bold text-white">
                          Windows {item.arch}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/35 text-sky-300 text-[11px] font-mono">
                          {item.arch}
                        </span>
                      </div>
                      <p className="text-xs text-blue-200/70">{item.desc}</p>
                    </div>

                    <button type="button" disabled className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 text-xs cursor-not-allowed">暂未发布</button>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Android -> 3. iOS -> 4. macOS -> 5. Linux -> 6. 源代码 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Android */}
              <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0b1c38]/90 to-[#071226]/90 p-5 flex flex-col justify-between hover:border-sky-400/50 transition-colors">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center text-emerald-300 mb-3">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">Android</h3>
                  <p className="text-xs text-blue-200/70 mb-4">
                    该平台安装包尚未发布。
                  </p>
                </div>
                <button type="button" disabled className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 text-xs font-semibold cursor-not-allowed">暂未发布</button>
              </div>

              {/* iOS */}
              <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0b1c38]/90 to-[#071226]/90 p-5 flex flex-col justify-between hover:border-sky-400/50 transition-colors">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 flex items-center justify-center text-sky-300 mb-3">
                    <Apple className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">iOS</h3>
                  <p className="text-xs text-blue-200/70 mb-4">
                    该平台安装包尚未发布。
                  </p>
                </div>
                <button type="button" disabled className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 text-xs font-semibold cursor-not-allowed">暂未发布</button>
              </div>

              {/* macOS */}
              <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0b1c38]/90 to-[#071226]/90 p-5 flex flex-col justify-between hover:border-sky-400/50 transition-colors">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-400/35 flex items-center justify-center text-blue-300 mb-3">
                    <Apple className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">macOS</h3>
                  <p className="text-xs text-blue-200/70 mb-4">
                    该平台安装包尚未发布。
                  </p>
                </div>
                <button type="button" disabled className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 text-xs font-semibold cursor-not-allowed">暂未发布</button>
              </div>

              {/* Linux */}
              <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-b from-[#0b1c38]/90 to-[#071226]/90 p-5 flex flex-col justify-between hover:border-sky-400/50 transition-colors">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300 mb-3">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">Linux</h3>
                  <p className="text-xs text-blue-200/70 mb-4">
                    该平台安装包尚未发布。
                  </p>
                </div>
                <button type="button" disabled className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 text-xs font-semibold cursor-not-allowed">暂未发布</button>
              </div>

              {/* 源代码 */}
              <div className="rounded-2xl border border-sky-400/35 bg-gradient-to-b from-[#0f254a] to-[#091730] p-5 flex flex-col justify-between hover:border-sky-400/60 transition-colors">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 mb-3">
                    <Code2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">源代码</h3>
                  <p className="text-xs text-blue-200/75 mb-4">
                    获取完整工程源码压缩包与 GitHub 仓库分支
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <a
                    href={sourceZipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    <span>下载源码 ZIP</span>
                  </a>
                  <a
                    href={branchTreeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-3 py-1.5 rounded-lg bg-[#12284e] hover:bg-[#183463] border border-sky-400/25 text-sky-200 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <span>浏览 GitHub 仓库</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Lightbox Modal for Screenshots */}
      {lightboxShot && (
        <div
          onClick={() => setLightboxShot(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-5xl w-full rounded-2xl border border-sky-400/40 bg-[#071226] overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-3.5 border-b border-sky-400/25 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">
                  {lightboxShot.title}
                </h4>
                <p className="text-xs text-sky-300/80">{lightboxShot.badge}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxShot(null)}
                className="p-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-sky-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={lightboxShot.src}
              alt={lightboxShot.title}
              className="w-full h-auto block"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-sky-400/20 bg-[#040914] py-8 px-4 sm:px-6 text-xs text-blue-200/60">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-xs">
              M
            </div>
            <span className="text-blue-100/80 font-medium">MooVN Studio</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#intro" className="hover:text-sky-300 transition-colors">
              介绍
            </a>
            <a href="#download" className="hover:text-sky-300 transition-colors">
              下载
            </a>
            <a
              href="/studio.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-300 transition-colors flex items-center gap-1"
            >
              <span>MooVN网页体验</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`${repoUrl}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-300 transition-colors"
            >
              问题反馈
            </a>
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-sky-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
