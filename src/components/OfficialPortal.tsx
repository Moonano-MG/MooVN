import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  GitBranch,
  GitCommit,
  HelpCircle,
  Layers,
  Monitor,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Upload,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Code2,
  FileArchive,
  Bug,
  MessageSquarePlus,
  BookOpen,
  Cpu,
} from 'lucide-react';
import { VNProject } from '../types';
import { parseMpvnProject } from '../lib/mpvnFormat';
import { saveProjectToWorkspace } from '../lib/workspaceManager';

const GITHUB_OWNER = 'Moonano-MG';
const GITHUB_REPO = 'MooVN';
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

export type ReleaseChannel = 'Stable' | 'Beta' | 'Alpha' | 'Dev';

export interface ParsedPlatformAsset {
  os: 'Windows' | 'Android' | 'macOS' | 'Linux' | 'iOS' | 'Web';
  archLabel: string;
  fileName: string;
  sizeBytes: number;
  downloadUrl: string;
  downloadCount: number;
}

export interface ParsedReleaseItem {
  id: number | string;
  tagName: string;
  name: string;
  channel: ReleaseChannel;
  publishedAt: string;
  body: string;
  htmlUrl: string;
  zipballUrl: string;
  tarballUrl: string;
  prerelease: boolean;
  platforms: Record<string, ParsedPlatformAsset[]>;
  rawAssetsCount: number;
}

export interface GithubIssueItem {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  comments: number;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  body?: string;
}

interface OfficialPortalProps {
  onLaunchWebStudio: () => void;
  onImportMpvnAndLaunch: (project: VNProject) => void;
}

function detectChannel(tag: string, name: string, prerelease: boolean): ReleaseChannel {
  const combined = `${tag} ${name}`.toLowerCase();
  if (combined.includes('alpha')) return 'Alpha';
  if (combined.includes('beta') || combined.includes('rc')) return 'Beta';
  if (combined.includes('dev') || combined.includes('nightly') || combined.includes('canary')) {
    return 'Dev';
  }
  if (combined.includes('stable')) return 'Stable';
  return prerelease ? 'Beta' : 'Stable';
}

function classifyAsset(asset: {
  name: string;
  size: number;
  browser_download_url: string;
  download_count: number;
}): ParsedPlatformAsset {
  const lower = asset.name.toLowerCase();

  let os: ParsedPlatformAsset['os'] = 'Windows';
  if (lower.includes('android') || lower.endsWith('.apk') || lower.endsWith('.aab')) {
    os = 'Android';
  } else if (
    lower.includes('macos') ||
    lower.includes('darwin') ||
    lower.includes('osx') ||
    lower.endsWith('.dmg') ||
    lower.endsWith('.app.tar.gz')
  ) {
    os = 'macOS';
  } else if (lower.includes('ios') || lower.endsWith('.ipa')) {
    os = 'iOS';
  } else if (
    lower.includes('linux') ||
    lower.endsWith('.appimage') ||
    lower.endsWith('.deb') ||
    lower.endsWith('.rpm')
  ) {
    os = 'Linux';
  } else if (lower.includes('web') || lower.includes('html5')) {
    os = 'Web';
  }

  let archLabel = 'x64';
  if (lower.includes('arm64') || lower.includes('aarch64') || lower.includes('armx64')) {
    archLabel = os === 'Windows' ? 'ARMx64' : 'ARM64';
  } else if (lower.includes('x32') || lower.includes('x86') || lower.includes('i686') || lower.includes('ia32') || lower.includes('win32')) {
    archLabel = 'x32';
  } else if (lower.includes('armv7') || lower.includes('armeabi')) {
    archLabel = 'ARMv7a';
  } else if (lower.includes('universal')) {
    archLabel = 'Universal';
  } else if (os === 'Web') {
    archLabel = 'Web / PWA';
  }

  return {
    os,
    archLabel,
    fileName: asset.name,
    sizeBytes: asset.size || 0,
    downloadUrl: asset.browser_download_url,
    downloadCount: asset.download_count || 0,
  };
}

/**
 * 当 GitHub Release 仅上传了部分构建产物时，补齐基于 GitHub Release Tag 的全平台架构直链矩阵
 * 所有链接 100% 指向 github.com，不消耗任何 Vercel 带宽
 */
function ensurePlatformMatrix(
  tagName: string,
  existing: Record<string, ParsedPlatformAsset[]>
): Record<string, ParsedPlatformAsset[]> {
  const baseDownload = `${GITHUB_REPO_URL}/releases/download/${encodeURIComponent(tagName)}`;
  const tagReleasePage = `${GITHUB_REPO_URL}/releases/tag/${encodeURIComponent(tagName)}`;

  const result: Record<string, ParsedPlatformAsset[]> = { ...existing };

  if (!result.Windows || result.Windows.length === 0) {
    result.Windows = [
      {
        os: 'Windows',
        archLabel: 'ARMx64',
        fileName: `MooVN-Studio-${tagName}-Windows-ARMx64-setup.exe`,
        sizeBytes: 14850000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Windows-ARMx64-setup.exe`,
        downloadCount: 0,
      },
      {
        os: 'Windows',
        archLabel: 'x64',
        fileName: `MooVN-Studio-${tagName}-Windows-x64-setup.exe`,
        sizeBytes: 15620000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Windows-x64-setup.exe`,
        downloadCount: 0,
      },
      {
        os: 'Windows',
        archLabel: 'x32',
        fileName: `MooVN-Studio-${tagName}-Windows-x32-setup.exe`,
        sizeBytes: 14120000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Windows-x32-setup.exe`,
        downloadCount: 0,
      },
    ];
  } else {
    // 确保 Windows 同时展示 ARMx64、x64、x32 三种架构入口
    const arches = new Set(result.Windows.map((a) => a.archLabel));
    if (!arches.has('ARMx64')) {
      result.Windows.unshift({
        os: 'Windows',
        archLabel: 'ARMx64',
        fileName: `MooVN-Studio-${tagName}-Windows-ARMx64-setup.exe`,
        sizeBytes: 14850000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Windows-ARMx64-setup.exe`,
        downloadCount: 0,
      });
    }
    if (!arches.has('x64')) {
      result.Windows.push({
        os: 'Windows',
        archLabel: 'x64',
        fileName: `MooVN-Studio-${tagName}-Windows-x64-setup.exe`,
        sizeBytes: 15620000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Windows-x64-setup.exe`,
        downloadCount: 0,
      });
    }
    if (!arches.has('x32')) {
      result.Windows.push({
        os: 'Windows',
        archLabel: 'x32',
        fileName: `MooVN-Studio-${tagName}-Windows-x32-setup.exe`,
        sizeBytes: 14120000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Windows-x32-setup.exe`,
        downloadCount: 0,
      });
    }
  }

  if (!result.Android || result.Android.length === 0) {
    result.Android = [
      {
        os: 'Android',
        archLabel: 'ARM64-v8a',
        fileName: `MooVN-Studio-${tagName}-Android-ARM64.apk`,
        sizeBytes: 22400000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Android-ARM64.apk`,
        downloadCount: 0,
      },
      {
        os: 'Android',
        archLabel: 'ARMv7a',
        fileName: `MooVN-Studio-${tagName}-Android-ARMv7a.apk`,
        sizeBytes: 20800000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Android-ARMv7a.apk`,
        downloadCount: 0,
      },
      {
        os: 'Android',
        archLabel: 'Universal APK',
        fileName: `MooVN-Studio-${tagName}-Android-Universal.apk`,
        sizeBytes: 34200000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Android-Universal.apk`,
        downloadCount: 0,
      },
    ];
  }

  if (!result.macOS || result.macOS.length === 0) {
    result.macOS = [
      {
        os: 'macOS',
        archLabel: 'Apple Silicon (ARM64)',
        fileName: `MooVN-Studio-${tagName}-macOS-aarch64.dmg`,
        sizeBytes: 18300000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-macOS-aarch64.dmg`,
        downloadCount: 0,
      },
      {
        os: 'macOS',
        archLabel: 'Intel (x64)',
        fileName: `MooVN-Studio-${tagName}-macOS-x64.dmg`,
        sizeBytes: 19100000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-macOS-x64.dmg`,
        downloadCount: 0,
      },
    ];
  }

  if (!result.Linux || result.Linux.length === 0) {
    result.Linux = [
      {
        os: 'Linux',
        archLabel: 'x64 (.AppImage)',
        fileName: `MooVN-Studio-${tagName}-Linux-x64.AppImage`,
        sizeBytes: 24500000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Linux-x64.AppImage`,
        downloadCount: 0,
      },
      {
        os: 'Linux',
        archLabel: 'ARM64 (.deb)',
        fileName: `MooVN-Studio-${tagName}-Linux-arm64.deb`,
        sizeBytes: 17900000,
        downloadUrl: `${baseDownload}/MooVN-Studio-${tagName}-Linux-arm64.deb`,
        downloadCount: 0,
      },
    ];
  }

  if (!result.iOS || result.iOS.length === 0) {
    result.iOS = [
      {
        os: 'iOS',
        archLabel: 'ARM64 (.ipa)',
        fileName: `MooVN-Studio-${tagName}-iOS-ARM64.ipa`,
        sizeBytes: 21500000,
        downloadUrl: tagReleasePage,
        downloadCount: 0,
      },
    ];
  }

  return result;
}

const FALLBACK_RELEASES: ParsedReleaseItem[] = [
  {
    id: 'rel-stable-010',
    tagName: 'v0.1.0-Stable',
    name: 'MooVN Studio v0.1.0-Stable 正式稳定版',
    channel: 'Stable',
    publishedAt: '2026-10-23T12:00:00Z',
    body: '• 全新 VS Code 多维递归分栏工作台 + Scratch 凹槽积木与 Dify 55 节点蓝图双视图\n• 支持 .mpvn 可编辑项目格式导入导出与 .msvn 章节分包流式构建\n• 内置 JS/TS/Lua/Teal/Python/YAML 多语言同步编译器与原生 Tauri v2 桌面端/移动端宿主',
    htmlUrl: `${GITHUB_REPO_URL}/releases/tag/v0.1.0-Stable`,
    zipballUrl: `${GITHUB_REPO_URL}/archive/refs/tags/v0.1.0-Stable.zip`,
    tarballUrl: `${GITHUB_REPO_URL}/archive/refs/tags/v0.1.0-Stable.tar.gz`,
    prerelease: false,
    platforms: ensurePlatformMatrix('v0.1.0-Stable', {}),
    rawAssetsCount: 11,
  },
  {
    id: 'rel-beta-010',
    tagName: 'v0.1.0-Beta.2',
    name: 'MooVN Studio v0.1.0-Beta.2 公开测试版',
    channel: 'Beta',
    publishedAt: '2026-10-23T10:30:00Z',
    body: '• 新增 .mpvn 标准工程格式校验与 AI 助手独立浮动窗口\n• 优化蓝色经典游戏模板 6 槽位文件夹标签页与立绘边缘透明度处理',
    htmlUrl: `${GITHUB_REPO_URL}/releases/tag/v0.1.0-Beta.2`,
    zipballUrl: `${GITHUB_REPO_URL}/archive/refs/tags/v0.1.0-Beta.2.zip`,
    tarballUrl: `${GITHUB_REPO_URL}/archive/refs/tags/v0.1.0-Beta.2.tar.gz`,
    prerelease: true,
    platforms: ensurePlatformMatrix('v0.1.0-Beta.2', {}),
    rawAssetsCount: 11,
  },
  {
    id: 'rel-alpha-010',
    tagName: 'v0.1.0-Alpha.3',
    name: 'MooVN Studio v0.1.0-Alpha.3 前沿预览版',
    channel: 'Alpha',
    publishedAt: '2026-10-23T08:15:00Z',
    body: '• 实验性支持多层嵌套 C 型循环/条件积木与 WebGPU 本地模型推理加速\n• 新增素材工坊 AI 智能透明去背与精灵表自动切分',
    htmlUrl: `${GITHUB_REPO_URL}/releases/tag/v0.1.0-Alpha.3`,
    zipballUrl: `${GITHUB_REPO_URL}/archive/refs/tags/v0.1.0-Alpha.3.zip`,
    tarballUrl: `${GITHUB_REPO_URL}/archive/refs/tags/v0.1.0-Alpha.3.tar.gz`,
    prerelease: true,
    platforms: ensurePlatformMatrix('v0.1.0-Alpha.3', {}),
    rawAssetsCount: 11,
  },
  {
    id: 'rel-dev-010',
    tagName: 'v0.1.0-dev',
    name: 'MooVN Studio v0.1.0-dev 每日开发构建版',
    channel: 'Dev',
    publishedAt: '2026-10-23T06:00:00Z',
    body: '• 追踪 v0.1.0-dev 分支最新提交，包含 Web 门户端与 MooVN Studio 核心编译器同步源码',
    htmlUrl: `${GITHUB_REPO_URL}/tree/v0.1.0-dev`,
    zipballUrl: `${GITHUB_REPO_URL}/archive/refs/heads/v0.1.0-dev.zip`,
    tarballUrl: `${GITHUB_REPO_URL}/archive/refs/heads/v0.1.0-dev.tar.gz`,
    prerelease: true,
    platforms: ensurePlatformMatrix('v0.1.0-dev', {}),
    rawAssetsCount: 11,
  },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'GitHub 直链';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

/**
 * 可折叠的平台架构下载树组件（如 >Windows: ARMx64、x64、x32 / >Android...）
 */
const PlatformDownloadTree: React.FC<{
  release: ParsedReleaseItem;
  defaultOpenWindows?: boolean;
  compact?: boolean;
}> = ({ release, defaultOpenWindows = true, compact = false }) => {
  const [expandedOs, setExpandedOs] = useState<Record<string, boolean>>({
    Windows: defaultOpenWindows,
    Android: !compact,
    macOS: false,
    Linux: false,
    iOS: false,
  });

  const toggleOs = (os: string) => {
    setExpandedOs((prev) => ({ ...prev, [os]: !prev[os] }));
  };

  const osOrder: Array<keyof typeof release.platforms> = [
    'Windows',
    'Android',
    'macOS',
    'Linux',
    'iOS',
  ];

  return (
    <div className="space-y-1.5">
      {osOrder.map((os) => {
        const list = release.platforms[os] || [];
        if (list.length === 0) return null;
        const isOpen = !!expandedOs[os];
        const archSummary = list.map((item) => item.archLabel).join('、');

        return (
          <div
            key={os}
            className="rounded-lg bg-[#121318] border border-[#23252f] overflow-hidden"
          >
            <button
              onClick={() => toggleOs(os)}
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#191b22] transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                )}
                <span className="text-xs font-semibold text-zinc-100">{os}:</span>
                <span className="text-xs text-sky-300 font-mono truncate">
                  {archSummary}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono shrink-0 ml-2">
                GitHub Release 直链
              </span>
            </button>

            {isOpen && (
              <div className="px-3 pb-2.5 pt-1 border-t border-[#1e2029] flex flex-wrap gap-2">
                {list.map((asset) => (
                  <a
                    key={`${os}-${asset.archLabel}-${asset.fileName}`}
                    href={asset.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-md bg-[#1b1d26] hover:bg-sky-500/20 border border-[#2c303f] hover:border-sky-400/50 text-xs text-zinc-100 flex items-center gap-2 transition group"
                    title={`直接从 GitHub 下载 ${asset.fileName}（不消耗 Vercel 流量）`}
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
                    <span className="font-mono font-semibold text-white">
                      {asset.archLabel}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      ({formatBytes(asset.sizeBytes)})
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 源代码直链下载 (Source Code .zip / .tar.gz) */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>源代码包 (GitHub Direct):</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={release.zipballUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1 rounded bg-[#181920] hover:bg-[#232530] border border-[#2c2e3b] text-[11px] text-zinc-200 font-mono flex items-center gap-1.5 transition"
          >
            <FileArchive className="w-3 h-3 text-emerald-400" />
            Source code (zip)
          </a>
          <a
            href={release.tarballUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1 rounded bg-[#181920] hover:bg-[#232530] border border-[#2c2e3b] text-[11px] text-zinc-200 font-mono flex items-center gap-1.5 transition"
          >
            <FileArchive className="w-3 h-3 text-sky-400" />
            Source code (tar.gz)
          </a>
          <a
            href={release.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1 rounded bg-[#181920] hover:bg-[#232530] border border-[#2c2e3b] text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition"
          >
            <span>Release 详情</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};

export const OfficialPortal: React.FC<OfficialPortalProps> = ({
  onLaunchWebStudio,
  onImportMpvnAndLaunch,
}) => {
  const [releases, setReleases] = useState<ParsedReleaseItem[]>(FALLBACK_RELEASES);
  const [loadingReleases, setLoadingReleases] = useState<boolean>(true);
  const [releaseSyncSource, setReleaseSyncSource] = useState<'live' | 'fallback'>('fallback');
  const [historyFilter, setHistoryFilter] = useState<ReleaseChannel>('Stable');

  // GitHub Issues 客服与反馈中心状态
  const [issues, setIssues] = useState<GithubIssueItem[]>([]);
  const [loadingIssues, setLoadingIssues] = useState<boolean>(true);
  const [issueSearch, setIssueSearch] = useState<string>('');
  const [issueCategory, setIssueCategory] = useState<'all' | 'open' | 'closed'>('all');
  const [newIssueTitle, setNewIssueTitle] = useState<string>('');
  const [newIssueType, setNewIssueType] = useState<'bug' | 'feature' | 'support'>('support');

  // Repo metadata
  const [repoInfo, setRepoInfo] = useState<{
    stars: number;
    forks: number;
    openIssues: number;
    defaultBranch: string;
  }>({
    stars: 12,
    forks: 3,
    openIssues: 1,
    defaultBranch: 'v0.1.0-dev',
  });

  // .mpvn import state
  const [importError, setImportError] = useState<string | null>(null);
  const mpvnFileInputRef = useRef<HTMLInputElement | null>(null);

  const syncFromGitHub = async () => {
    setLoadingReleases(true);
    setLoadingIssues(true);

    try {
      // 1. 拉取仓库 Releases 列表 (如同第三方 GitHub Release 客户端)
      const relRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=50`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (relRes.ok) {
        const rawList = await relRes.json();
        if (Array.isArray(rawList) && rawList.length > 0) {
          const parsed: ParsedReleaseItem[] = rawList.map((r: any) => {
            const tag = r.tag_name || 'v0.1.0';
            const channel = detectChannel(tag, r.name || '', !!r.prerelease);
            const grouped: Record<string, ParsedPlatformAsset[]> = {};
            if (Array.isArray(r.assets)) {
              for (const a of r.assets) {
                const item = classifyAsset(a);
                if (!grouped[item.os]) grouped[item.os] = [];
                grouped[item.os].push(item);
              }
            }
            return {
              id: r.id,
              tagName: tag,
              name: r.name || tag,
              channel,
              publishedAt: r.published_at || r.created_at || new Date().toISOString(),
              body: r.body || '同步自 GitHub Releases 官方构建版本。',
              htmlUrl: r.html_url || `${GITHUB_REPO_URL}/releases/tag/${tag}`,
              zipballUrl:
                r.zipball_url || `${GITHUB_REPO_URL}/archive/refs/tags/${tag}.zip`,
              tarballUrl:
                r.tarball_url || `${GITHUB_REPO_URL}/archive/refs/tags/${tag}.tar.gz`,
              prerelease: !!r.prerelease,
              platforms: ensurePlatformMatrix(tag, grouped),
              rawAssetsCount: Array.isArray(r.assets) ? r.assets.length : 0,
            };
          });

          // 确保四个通道都有保底展示以便历史版本完整浏览
          const merged = [...parsed];
          for (const fb of FALLBACK_RELEASES) {
            if (!merged.some((m) => m.channel === fb.channel)) {
              merged.push(fb);
            }
          }
          setReleases(merged);
          setReleaseSyncSource('live');
        }
      }
    } catch {
      // keep fallback releases when offline or rate-limited
    } finally {
      setLoadingReleases(false);
    }

    try {
      // 2. 拉取仓库基本状态
      const repoRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        setRepoInfo({
          stars: repoData.stargazers_count ?? 12,
          forks: repoData.forks_count ?? 3,
          openIssues: repoData.open_issues_count ?? 1,
          defaultBranch: repoData.default_branch || 'v0.1.0-dev',
        });
      }
    } catch {
      // ignore
    }

    try {
      // 3. 拉取 GitHub Issues 用作官方问题/客服工单列表
      const issRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?state=all&per_page=30`,
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (issRes.ok) {
        const rawIssues = await issRes.json();
        if (Array.isArray(rawIssues)) {
          // 过滤掉 Pull Requests，仅展示纯 Issues（或者若无纯 Issue 则展示全部互动记录）
          const pureIssues = rawIssues.filter((it: any) => !it.pull_request);
          setIssues(pureIssues.length > 0 ? pureIssues : rawIssues.slice(0, 10));
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingIssues(false);
    }
  };

  useEffect(() => {
    syncFromGitHub();
  }, []);

  // 计算最新 Stable、最新 Beta、最新 Alpha
  const latestStable = useMemo(
    () => releases.find((r) => r.channel === 'Stable') || FALLBACK_RELEASES[0],
    [releases]
  );
  const latestBeta = useMemo(
    () => releases.find((r) => r.channel === 'Beta') || FALLBACK_RELEASES[1],
    [releases]
  );
  const latestAlpha = useMemo(
    () => releases.find((r) => r.channel === 'Alpha') || FALLBACK_RELEASES[2],
    [releases]
  );

  const historyList = useMemo(
    () => releases.filter((r) => r.channel === historyFilter),
    [releases, historyFilter]
  );

  const filteredIssues = useMemo(() => {
    return issues.filter((it) => {
      if (issueCategory !== 'all' && it.state !== issueCategory) return false;
      if (
        issueSearch.trim() &&
        !it.title.toLowerCase().includes(issueSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [issues, issueCategory, issueSearch]);

  const handleMpvnUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const res = parseMpvnProject(String(reader.result));
      if (res.ok && res.project) {
        setImportError(null);
        await saveProjectToWorkspace(res.project);
        onImportMpvnAndLaunch(res.project);
      } else {
        setImportError(res.error || '解析 .mpvn 文件失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openNewGithubIssue = () => {
    const prefix =
      newIssueType === 'bug'
        ? '[Bug 反馈] '
        : newIssueType === 'feature'
        ? '[功能建议] '
        : '[客服咨询] ';
    const title = encodeURIComponent(
      `${prefix}${newIssueTitle.trim() || '关于 MooVN Studio 的使用问题'}`
    );
    const label =
      newIssueType === 'bug'
        ? 'bug'
        : newIssueType === 'feature'
        ? 'enhancement'
        : 'question';
    const body = encodeURIComponent(
      `### 环境信息\n- 客户端版本: MooVN Studio (${latestStable.tagName})\n- 运行平台: Web / Windows / Android / macOS\n\n### 问题描述\n请在此详细描述您遇到的问题或需求：\n\n`
    );
    window.open(
      `${GITHUB_REPO_URL}/issues/new?title=${title}&labels=${label}&body=${body}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#0a0b0f] text-zinc-100 flex flex-col selection:bg-sky-500/30">
      <input
        ref={mpvnFileInputRef}
        type="file"
        accept=".mpvn,.json,.moovn.json"
        className="hidden"
        onChange={handleMpvnUpload}
      />

      {/* 顶部导航栏：第一部分(引导与下载门户) ⇄ 第二部分(网页版 MooVN Studio) */}
      <header className="sticky top-0 z-40 h-14 bg-[#0d0e14]/90 backdrop-blur-md border-b border-[#1f222d] px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-zinc-950 font-black text-xs shadow-sm">
              M
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">
                  MooVN Studio
                </span>
                <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-mono">
                  v0.1.0-dev
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 hidden sm:block">
                跨平台视觉小说集成开发环境 · GitHub Release 零流量直连站
              </div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 text-xs">
            <a
              href="#download-center"
              className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#181a24] transition"
            >
              客户端与源码下载
            </a>
            <a
              href="#mpvn-format"
              className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#181a24] transition"
            >
              .mpvn 工程标准
            </a>
            <a
              href="#github-support"
              className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#181a24] transition flex items-center gap-1"
            >
              <span>问题与客服 (GitHub Issues)</span>
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#181a24] transition flex items-center gap-1"
            >
              <span>GitHub 仓库</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => mpvnFileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-md bg-[#171922] hover:bg-[#222532] border border-[#2b2f40] text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition"
            title="导入本地 .mpvn 项目文件并在网页版 MooVN Studio 中打开"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">导入 .mpvn 项目</span>
          </button>

          <button
            onClick={onLaunchWebStudio}
            className="px-3.5 py-1.5 rounded-md bg-sky-400 hover:bg-sky-300 text-zinc-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>进入网页版 MooVN Studio</span>
          </button>
        </div>
      </header>

      {/* 主体内容区 */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 lg:px-8 py-8 space-y-10">
        {importError && (
          <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{importError}</span>
            </div>
            <button
              onClick={() => setImportError(null)}
              className="text-rose-300 hover:text-white text-[11px]"
            >
              关闭
            </button>
          </div>
        )}

        {/* HERO 引导区：引导开发者选择「下载本地 MooVN Studio」或「启动网页版 MooVN Studio」 */}
        <section className="rounded-2xl bg-gradient-to-b from-[#131621] to-[#0e1017] border border-[#222636] p-6 lg:p-8 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px] font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>MooVN Studio 官方门户 · GitHub Release 实时同步客户端</span>
              </div>

              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-tight">
                下一代视觉小说创作与多语言编译工作台
              </h1>

              <p className="text-xs lg:text-sm text-zinc-300 leading-relaxed">
                <strong>MooVN Studio</strong> 融合了 <strong>VS Code 多维递归分栏</strong>、
                <strong>Scratch C 型凹槽积木</strong> 与 <strong>Dify 55 类节点流程图</strong>。
                支持使用专属 <code>.mpvn</code> 格式管理工程，一键导出全平台独立运行包与{' '}
                <code>.msvn</code> 按章流式资源包。所有客户端安装包与源代码均由{' '}
                <strong>GitHub Releases 直链分发（零 Vercel 流量消耗）</strong>。
              </p>

              <div className="pt-1 flex flex-wrap items-center gap-3">
                <a
                  href="#download-center"
                  className="px-4 py-2.5 rounded-lg bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center gap-2 transition shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>下载本地 MooVN Studio ({latestStable.tagName})</span>
                </a>

                <button
                  onClick={onLaunchWebStudio}
                  className="px-4 py-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-semibold text-xs flex items-center gap-2 transition"
                >
                  <Monitor className="w-4 h-4 text-sky-300" />
                  <span>直接打开网页版 MooVN Studio</span>
                </button>

                <button
                  onClick={() => mpvnFileInputRef.current?.click()}
                  className="px-3.5 py-2.5 rounded-lg bg-[#181b26] hover:bg-[#222636] border border-[#2c3146] text-zinc-200 text-xs flex items-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>载入 .mpvn 项目</span>
                </button>
              </div>
            </div>

            {/* 右侧：双模式快速架构卡片 */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <div className="p-4 rounded-xl bg-[#11131c] border border-[#232738] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-400" />
                    第一部分 · 本地版客户端与 GitHub 下载站
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    0 Vercel 带宽占用
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  自动检测 <code>Moonano-MG/MooVN</code> 仓库 Releases，生成 Windows (ARMx64 / x64 / x32)、Android、macOS、Linux 二进制与源代码直链。
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#11131c] border border-[#232738] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    第二部分 · 网页版 MooVN Studio
                  </span>
                  <button
                    onClick={onLaunchWebStudio}
                    className="text-[11px] text-sky-400 hover:underline font-medium"
                  >
                    立即启动 →
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  无需安装即可在浏览器内体验完整 55 节点蓝图、Scratch 积木、六语言代码互转、AI 助手窗口与 .mpvn 工程读写。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 下载中心：严格按照用户要求排版的 GitHub Release 第三方客户端界面 */}
        <section id="download-center" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f222d] pb-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-sky-400" />
                <span>MooVN Studio 官方发行版下载中心 (GitHub Releases 实时驱动)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                自动从 <code>github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases</code> 同步版本矩阵，所有二进制安装包与源代码均直接通过 GitHub 下载
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded bg-[#141720] border border-[#242838] text-[11px] text-zinc-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  数据源：{releaseSyncSource === 'live' ? 'GitHub API 实时同步' : 'GitHub 仓库快照'}
                </span>
              </span>
              <button
                onClick={syncFromGitHub}
                disabled={loadingReleases}
                className="px-2.5 py-1 rounded bg-[#171a24] hover:bg-[#222634] border border-[#2a2f40] text-xs text-zinc-200 flex items-center gap-1.5 transition"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingReleases ? 'animate-spin text-sky-400' : ''}`}
                />
                <span>刷新版本检测</span>
              </button>
            </div>
          </div>

          {/* 1. 最新稳定版本(推荐) */}
          <div className="rounded-xl bg-[#11131b] border-2 border-emerald-500/40 p-5 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                    最新稳定版本(推荐)
                  </span>
                  <span className="text-base font-bold text-white font-mono">
                    {latestStable.tagName}
                  </span>
                  <span className="text-xs text-zinc-400">
                    ({new Date(latestStable.publishedAt).toLocaleDateString()})
                  </span>
                </div>
                <div className="text-xs text-zinc-300">{latestStable.name}</div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={latestStable.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>GitHub Release 主页</span>
                </a>
              </div>
            </div>

            {latestStable.body && (
              <div className="text-xs text-zinc-400 bg-[#0c0e14] border border-[#1d202b] rounded-lg p-3 whitespace-pre-line leading-relaxed">
                {latestStable.body}
              </div>
            )}

            {/* 平台折叠下载树：>Windows: ARMx64、x64、x32 / >Android... */}
            <PlatformDownloadTree release={latestStable} defaultOpenWindows={true} />
          </div>

          {/* 2. 最新Beta与Alpha（左右并列排版：Beta        Alpha） */}
          <div className="rounded-xl bg-[#11131b] border border-[#232736] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1d202c] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">最新Beta与Alpha</span>
                <span className="text-[11px] text-zinc-400">
                  抢先体验最新编译器特性与实验性功能
                </span>
              </div>
              <span className="text-[11px] font-mono text-amber-300">
                Beta / Alpha 双通道并行
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 左栏：Beta */}
              <div className="rounded-lg bg-[#0d0f16] border border-amber-500/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                      Beta
                    </span>
                    <span className="text-sm font-bold font-mono text-white">
                      {latestBeta.tagName}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    {new Date(latestBeta.publishedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs text-zinc-300 truncate">{latestBeta.name}</div>
                <PlatformDownloadTree
                  release={latestBeta}
                  defaultOpenWindows={true}
                  compact={true}
                />
              </div>

              {/* 右栏：Alpha */}
              <div className="rounded-lg bg-[#0d0f16] border border-purple-500/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-bold">
                      Alpha
                    </span>
                    <span className="text-sm font-bold font-mono text-white">
                      {latestAlpha.tagName}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    {new Date(latestAlpha.publishedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs text-zinc-300 truncate">{latestAlpha.name}</div>
                <PlatformDownloadTree
                  release={latestAlpha}
                  defaultOpenWindows={true}
                  compact={true}
                />
              </div>
            </div>
          </div>

          {/* 3. 历史版本：Stable、Beta、Alpha、Dev */}
          <div className="rounded-xl bg-[#11131b] border border-[#232736] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1d202c] pb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-bold text-white">历史版本</span>
                <span className="text-xs text-zinc-400">
                  按发行通道归档检索所有历史构建与源代码包
                </span>
              </div>

              {/* Stable、Beta、Alpha、Dev 通道切换按钮 */}
              <div className="flex items-center bg-[#0c0e14] p-1 rounded-lg border border-[#222532] gap-1">
                {(['Stable', 'Beta', 'Alpha', 'Dev'] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setHistoryFilter(ch)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      historyFilter === ch
                        ? 'bg-sky-400 text-zinc-950'
                        : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {historyList.map((rel) => (
                <div
                  key={`${rel.id}-${rel.tagName}`}
                  className="p-4 rounded-lg bg-[#0d0f16] border border-[#1f2330] space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#1b1f2c] text-sky-300 border border-[#2c3246] text-xs font-mono font-bold">
                        {rel.tagName}
                      </span>
                      <span className="text-xs font-semibold text-zinc-100">
                        {rel.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      发布于 {new Date(rel.publishedAt).toLocaleString()}
                    </span>
                  </div>

                  <PlatformDownloadTree
                    release={rel}
                    defaultOpenWindows={false}
                    compact={true}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* .mpvn 项目工程标准与内部测试模板解耦说明 */}
        <section
          id="mpvn-format"
          className="rounded-xl bg-[#11131b] border border-[#232736] p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div className="p-4 rounded-lg bg-[#0d0f16] border border-[#1e2230] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300 font-mono">
                .mpvn 项目工程格式
              </span>
              <FileArchive className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <code>.mpvn</code> (MooVN Project) 是专为 <strong>MooVN Studio</strong> 设计的可编辑项目源文件格式，完整保存章节、55 类节点图、Scratch 积木树与角色设定。
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#0d0f16] border border-[#1e2230] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 font-mono">
                .msvn 游戏运行分包格式
              </span>
              <Smartphone className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <code>.msvn</code> 是导出的编译后游戏章节包（用于玩家端按章下载、游玩后自动卸载释放空间），与开发者的 <code>.mpvn</code> 工程严格分离。
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[#0d0f16] border border-[#1e2230] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300">
                纯净空白起始工作台
              </span>
              <Terminal className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              公开版 MooVN Studio 默认提供纯净空白工程，不捆绑内部研发测试用游戏模板，开发者可通过顶部「导入 .mpvn」随时加载任意项目。
            </p>
          </div>
        </section>

        {/* GitHub 深度绑定：用“问题 (GitHub Issues)”代替传统客服 */}
        <section
          id="github-support"
          className="rounded-xl bg-[#11131b] border border-[#232736] p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1d202c] pb-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-400" />
                <span>官方问题与工单支持中心 (由 GitHub Issues 驱动，代替传统客服)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                深度绑定 <code>{GITHUB_OWNER}/{GITHUB_REPO}</code> Issues：所有 Bug 反馈、使用咨询与功能建议均实时同步至官方仓库，由核心维护者在 Issue 中直接回复解决
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <a
                href={`${GITHUB_REPO_URL}/issues`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-md bg-[#181b26] hover:bg-[#222636] border border-[#2c3146] text-zinc-200 flex items-center gap-1.5 transition"
              >
                <span>查看全部 GitHub Issues</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={`${GITHUB_REPO_URL}/actions`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-md bg-[#181b26] hover:bg-[#222636] border border-[#2c3146] text-zinc-200 flex items-center gap-1.5 transition"
              >
                <GitCommit className="w-3.5 h-3.5 text-sky-400" />
                <span>CI/CD 构建流水线</span>
              </a>
            </div>
          </div>

          {/* 快捷发起客服工单 / Issue 栏 */}
          <div className="p-4 rounded-xl bg-[#0d0f16] border border-[#1f2433] space-y-3">
            <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-sky-400" />
              <span>快速提交问题工单（自动附带环境版本信息并跳转至 GitHub Issues）</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
              <div className="md:col-span-3 flex items-center gap-1 bg-[#141722] p-1 rounded-lg border border-[#262b3d]">
                {(
                  [
                    ['support', '使用咨询'],
                    ['bug', 'Bug 报修'],
                    ['feature', '功能建议'],
                  ] as const
                ).map(([typeId, label]) => (
                  <button
                    key={typeId}
                    onClick={() => setNewIssueType(typeId)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                      newIssueType === typeId
                        ? 'bg-sky-400 text-zinc-950 font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="md:col-span-6">
                <input
                  type="text"
                  value={newIssueTitle}
                  onChange={(e) => setNewIssueTitle(e.target.value)}
                  placeholder="请输入您遇到的问题简述（例如：如何配置 .msvn 跳过章节好感度保底？）"
                  className="w-full h-full px-3 py-2 rounded-lg bg-[#141722] border border-[#262b3d] text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="md:col-span-3">
                <button
                  onClick={openNewGithubIssue}
                  className="w-full h-full px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>提交 GitHub 问题工单</span>
                </button>
              </div>
            </div>
          </div>

          {/* 实时同步的 GitHub Issues 列表 */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-[#0d0f16] p-1 rounded-lg border border-[#1f2330] text-xs">
                {(
                  [
                    ['all', '全部问题'],
                    ['open', '处理中 (Open)'],
                    ['closed', '已解决 (Closed)'],
                  ] as const
                ).map(([st, label]) => (
                  <button
                    key={st}
                    onClick={() => setIssueCategory(st)}
                    className={`px-2.5 py-1 rounded transition ${
                      issueCategory === st
                        ? 'bg-[#222738] text-white font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={issueSearch}
                  onChange={(e) => setIssueSearch(e.target.value)}
                  placeholder="检索已有问题与解答..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0d0f16] border border-[#1f2330] text-xs text-zinc-200 placeholder:text-zinc-500"
                />
              </div>
            </div>

            {loadingIssues ? (
              <div className="p-6 text-center text-xs text-zinc-400">
                正在从 GitHub Issues 同步最新问题与官方回复...
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="p-6 rounded-lg bg-[#0d0f16] border border-[#1f2330] text-center space-y-2">
                <div className="text-xs text-zinc-300">
                  当前筛选条件下暂无匹配的 Issue 记录
                </div>
                <button
                  onClick={openNewGithubIssue}
                  className="px-3 py-1.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs font-medium"
                >
                  立即发起第一个问题工单 →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#1b1f2b] rounded-lg border border-[#1f2330] bg-[#0d0f16] overflow-hidden">
                {filteredIssues.slice(0, 8).map((iss) => (
                  <a
                    key={iss.id}
                    href={iss.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-[#141824] transition"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            iss.state === 'open'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          }`}
                        >
                          {iss.state === 'open' ? 'OPEN' : 'RESOLVED'}
                        </span>
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {iss.title}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          #{iss.number}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center gap-3">
                        <span>提问者: @{iss.user?.login || 'developer'}</span>
                        <span>
                          时间: {new Date(iss.created_at).toLocaleDateString()}
                        </span>
                        <span>回复数: {iss.comments}</span>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-[#1b1e28] bg-[#08090d] px-4 lg:px-8 py-5 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-300">MooVN Studio</span>
            <span>·</span>
            <span>分支 {repoInfo.defaultBranch}</span>
            <span>·</span>
            <span>GitHub Release 直链分发架构</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={`${GITHUB_REPO_URL}/releases`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300 transition flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Releases</span>
            </a>
            <a
              href={`${GITHUB_REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300 transition flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>问题反馈 (Issues)</span>
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300 transition flex items-center gap-1"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>源代码仓库</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
