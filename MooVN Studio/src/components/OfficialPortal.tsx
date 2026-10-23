import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  Play,
  ChevronDown,
  ChevronRight,
  Code2,
} from 'lucide-react';

const GITHUB_OWNER = 'Moonano-MG';
const GITHUB_REPO = 'MooVN';
const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;

export type ReleaseChannel = 'Stable' | 'Beta' | 'Alpha' | 'Dev';

export type PlatformKey = 'Windows' | 'Android' | 'iOS' | 'macOS' | 'Linux';

export interface ArchVariant {
  arch: string;
  installUrl?: string;
  installSize?: number;
  zipUrl?: string;
  zipSize?: number;
  directUrl?: string;
  directSize?: number;
}

export interface ParsedReleaseItem {
  id: number | string;
  tagName: string;
  name: string;
  channel: ReleaseChannel;
  publishedAt: string;
  htmlUrl: string;
  zipballUrl: string;
  tarballUrl: string;
  platforms: Record<PlatformKey, ArchVariant[]>;
}

interface OfficialPortalProps {
  onLaunchWebStudio: () => void;
}

const PLATFORM_ORDER: PlatformKey[] = [
  'Windows',
  'Android',
  'iOS',
  'macOS',
  'Linux',
];

const DEFAULT_ARCH_SUMMARY: Record<PlatformKey, string> = {
  Windows: 'ARM64、x64、x86',
  Android: 'ARM64-v8a、ARMv7a、x86_64',
  iOS: 'ARM64',
  macOS: 'ARM64、x64',
  Linux: 'x64、ARM64',
};

function detectChannel(tag: string, name: string, prerelease: boolean): ReleaseChannel {
  const text = `${tag} ${name}`.toLowerCase();
  if (text.includes('alpha')) return 'Alpha';
  if (text.includes('beta') || text.includes('rc')) return 'Beta';
  if (text.includes('dev') || text.includes('nightly')) return 'Dev';
  if (text.includes('stable')) return 'Stable';
  return prerelease ? 'Alpha' : 'Stable';
}

function parseAssetsIntoPlatforms(
  assets: Array<{
    name: string;
    size: number;
    browser_download_url: string;
  }>
): Record<PlatformKey, ArchVariant[]> {
  const windowsMap: Record<string, ArchVariant> = {
    ARM64: { arch: 'ARM64' },
    x64: { arch: 'x64' },
    x86: { arch: 'x86' },
  };
  const androidList: ArchVariant[] = [];
  const iosList: ArchVariant[] = [];
  const macosList: ArchVariant[] = [];
  const linuxList: ArchVariant[] = [];

  for (const a of assets || []) {
    const lower = a.name.toLowerCase();
    const isZip = lower.endsWith('.zip') || lower.endsWith('.7z') || lower.includes('portable');

    // Windows
    if (
      lower.includes('win') ||
      lower.endsWith('.exe') ||
      lower.endsWith('.msi')
    ) {
      let arch: 'ARM64' | 'x64' | 'x86' = 'x64';
      if (lower.includes('arm64') || lower.includes('aarch64')) {
        arch = 'ARM64';
      } else if (
        lower.includes('x86') ||
        lower.includes('ia32') ||
        lower.includes('i686') ||
        lower.includes('win32')
      ) {
        arch = 'x86';
      }
      if (isZip) {
        windowsMap[arch].zipUrl = a.browser_download_url;
        windowsMap[arch].zipSize = a.size;
      } else {
        windowsMap[arch].installUrl = a.browser_download_url;
        windowsMap[arch].installSize = a.size;
      }
      continue;
    }

    // Android
    if (lower.includes('android') || lower.endsWith('.apk') || lower.endsWith('.aab')) {
      let arch = 'ARM64-v8a';
      if (lower.includes('armv7') || lower.includes('armeabi')) arch = 'ARMv7a';
      else if (lower.includes('x86_64') || lower.includes('x86')) arch = 'x86_64';
      androidList.push({
        arch,
        directUrl: a.browser_download_url,
        directSize: a.size,
      });
      continue;
    }

    // iOS
    if (lower.includes('ios') || lower.endsWith('.ipa')) {
      iosList.push({
        arch: 'ARM64',
        directUrl: a.browser_download_url,
        directSize: a.size,
      });
      continue;
    }

    // macOS
    if (
      lower.includes('mac') ||
      lower.includes('darwin') ||
      lower.includes('osx') ||
      lower.endsWith('.dmg') ||
      lower.endsWith('.app.tar.gz')
    ) {
      const arch =
        lower.includes('arm64') || lower.includes('aarch64')
          ? 'ARM64'
          : 'x64';
      macosList.push({
        arch,
        directUrl: a.browser_download_url,
        directSize: a.size,
      });
      continue;
    }

    // Linux
    if (
      lower.includes('linux') ||
      lower.endsWith('.appimage') ||
      lower.endsWith('.deb') ||
      lower.endsWith('.rpm') ||
      lower.endsWith('.tar.gz')
    ) {
      const arch =
        lower.includes('arm64') || lower.includes('aarch64')
          ? 'ARM64'
          : 'x64';
      linuxList.push({
        arch,
        directUrl: a.browser_download_url,
        directSize: a.size,
      });
    }
  }

  return {
    Windows: [windowsMap.ARM64, windowsMap.x64, windowsMap.x86],
    Android:
      androidList.length > 0
        ? androidList
        : [{ arch: 'ARM64-v8a' }, { arch: 'ARMv7a' }, { arch: 'x86_64' }],
    iOS: iosList.length > 0 ? iosList : [{ arch: 'ARM64' }],
    macOS:
      macosList.length > 0
        ? macosList
        : [{ arch: 'ARM64' }, { arch: 'x64' }],
    Linux:
      linuxList.length > 0
        ? linuxList
        : [{ arch: 'x64' }, { arch: 'ARM64' }],
  };
}

const EMPTY_PLATFORMS: Record<PlatformKey, ArchVariant[]> = {
  Windows: [{ arch: 'ARM64' }, { arch: 'x64' }, { arch: 'x86' }],
  Android: [{ arch: 'ARM64-v8a' }, { arch: 'ARMv7a' }, { arch: 'x86_64' }],
  iOS: [{ arch: 'ARM64' }],
  macOS: [{ arch: 'ARM64' }, { arch: 'x64' }],
  Linux: [{ arch: 'x64' }, { arch: 'ARM64' }],
};

/**
 * 平台折叠下载列表：
 * 严格按顺序：Windows (ARM64、x64、x86，含 Install 与 ZIP 两种方式) -> Android -> iOS -> macOS -> Linux -> 源代码
 */
const PlatformDownloadList: React.FC<{
  release: ParsedReleaseItem | null;
  defaultOpenWindows?: boolean;
}> = ({ release, defaultOpenWindows = false }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Windows: defaultOpenWindows,
    Android: false,
    iOS: false,
    macOS: false,
    Linux: false,
  });

  const platforms = release ? release.platforms : EMPTY_PLATFORMS;

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-1.5">
      {PLATFORM_ORDER.map((os) => {
        const isOpen = !!expanded[os];
        const variants = platforms[os] || [];

        return (
          <div
            key={os}
            className="rounded-lg bg-[#141418] border border-[#24242b] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(os)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[#1b1b21] transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
                <span className="text-xs font-semibold text-zinc-100">{os}:</span>
                <span className="text-xs text-zinc-400 font-mono truncate">
                  {DEFAULT_ARCH_SUMMARY[os]}
                </span>
              </div>
              <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                {release ? release.tagName : '待发布'}
              </span>
            </button>

            {isOpen && (
              <div className="px-3.5 pb-3 pt-2 border-t border-[#1f1f26]">
                {os === 'Windows' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {variants.map((v) => (
                      <div
                        key={v.arch}
                        className="p-2.5 rounded-md bg-[#19191f] border border-[#272730] flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-semibold text-zinc-100">
                            Windows {v.arch}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {v.installUrl ? (
                            <a
                              href={v.installUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-[11px] flex items-center justify-center gap-1 transition"
                            >
                              <Download className="w-3 h-3" />
                              <span>Install</span>
                            </a>
                          ) : (
                            <span className="px-2 py-1.5 rounded bg-[#222229] text-zinc-500 text-[11px] flex items-center justify-center gap-1 cursor-not-allowed">
                              <Download className="w-3 h-3" />
                              <span>Install</span>
                            </span>
                          )}

                          {v.zipUrl ? (
                            <a
                              href={v.zipUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1.5 rounded bg-[#24242c] hover:bg-[#2e2e38] border border-[#343440] text-zinc-100 font-medium text-[11px] flex items-center justify-center gap-1 transition"
                            >
                              <Download className="w-3 h-3" />
                              <span>ZIP</span>
                            </a>
                          ) : (
                            <span className="px-2 py-1.5 rounded bg-[#222229] text-zinc-500 text-[11px] flex items-center justify-center gap-1 cursor-not-allowed">
                              <Download className="w-3 h-3" />
                              <span>ZIP</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) =>
                      v.directUrl ? (
                        <a
                          key={v.arch}
                          href={v.directUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-md bg-[#1c1c23] hover:bg-[#262630] border border-[#2e2e3a] text-xs text-zinc-100 font-mono flex items-center gap-1.5 transition"
                        >
                          <Download className="w-3.5 h-3.5 text-zinc-300" />
                          <span>{v.arch}</span>
                        </a>
                      ) : (
                        <span
                          key={v.arch}
                          className="px-3 py-1.5 rounded-md bg-[#19191f] border border-[#24242c] text-xs text-zinc-500 font-mono flex items-center gap-1.5 cursor-not-allowed"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{v.arch}</span>
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 源代码 */}
      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Code2 className="w-3.5 h-3.5 text-zinc-400" />
          <span>源代码:</span>
        </div>
        <div className="flex items-center gap-2">
          {release ? (
            <>
              <a
                href={release.zipballUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded bg-[#16161b] hover:bg-[#22222a] border border-[#272730] text-xs text-zinc-200 font-mono transition"
              >
                ZIP
              </a>
              <a
                href={release.tarballUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded bg-[#16161b] hover:bg-[#22222a] border border-[#272730] text-xs text-zinc-200 font-mono transition"
              >
                TAR.GZ
              </a>
            </>
          ) : (
            <>
              <span className="px-2.5 py-1 rounded bg-[#141418] border border-[#222228] text-xs text-zinc-600 font-mono cursor-not-allowed">
                ZIP
              </span>
              <span className="px-2.5 py-1 rounded bg-[#141418] border border-[#222228] text-xs text-zinc-600 font-mono cursor-not-allowed">
                TAR.GZ
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const OfficialPortal: React.FC<OfficialPortalProps> = ({
  onLaunchWebStudio,
}) => {
  const [releases, setReleases] = useState<ParsedReleaseItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [historyFilter, setHistoryFilter] = useState<ReleaseChannel>('Stable');

  useEffect(() => {
    let cancelled = false;
    const fetchReleases = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=100`,
          { headers: { Accept: 'application/vnd.github+json' } }
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data)) {
            const parsed: ParsedReleaseItem[] = data.map((r: any) => {
              const tag = r.tag_name || '';
              return {
                id: r.id,
                tagName: tag,
                name: r.name || tag,
                channel: detectChannel(tag, r.name || '', !!r.prerelease),
                publishedAt: r.published_at || r.created_at || '',
                htmlUrl: r.html_url || `${GITHUB_REPO_URL}/releases`,
                zipballUrl:
                  r.zipball_url ||
                  `${GITHUB_REPO_URL}/archive/refs/tags/${encodeURIComponent(tag)}.zip`,
                tarballUrl:
                  r.tarball_url ||
                  `${GITHUB_REPO_URL}/archive/refs/tags/${encodeURIComponent(tag)}.tar.gz`,
                platforms: parseAssetsIntoPlatforms(r.assets || []),
              };
            });
            setReleases(parsed);
          }
        }
      } catch {
        // keep empty list if offline
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchReleases();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestStable = useMemo(
    () => releases.find((r) => r.channel === 'Stable') || null,
    [releases]
  );
  const latestBeta = useMemo(
    () => releases.find((r) => r.channel === 'Beta') || null,
    [releases]
  );
  const latestAlpha = useMemo(
    () => releases.find((r) => r.channel === 'Alpha') || null,
    [releases]
  );
  const historyReleases = useMemo(
    () => releases.filter((r) => r.channel === historyFilter),
    [releases, historyFilter]
  );

  return (
    <div className="h-screen overflow-y-auto bg-[#0f0f12] text-zinc-100 flex flex-col">
      {/* 顶部导航栏：仅保留 品牌、下载、MooVN网页体验、问题反馈、GitHub */}
      <header className="sticky top-0 z-40 h-14 bg-[#0f0f12]/90 backdrop-blur-md border-b border-[#222228] px-4 sm:px-8 flex items-center justify-between shrink-0">
        <a
          href="#"
          className="flex items-center gap-2.5 text-white font-semibold text-sm tracking-tight"
        >
          <span className="w-6 h-6 rounded bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center justify-center">
            M
          </span>
          <span>MooVN Studio</span>
        </a>

        <nav className="flex items-center gap-1 sm:gap-2 text-xs">
          <a
            href="#download"
            className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#1a1a20] transition"
          >
            下载
          </a>
          <button
            type="button"
            onClick={onLaunchWebStudio}
            className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#1a1a20] transition cursor-pointer"
          >
            MooVN网页体验
          </button>
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#1a1a20] transition flex items-center gap-1"
          >
            <span>问题</span>
          </a>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-[#1a1a20] transition flex items-center gap-1"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </nav>
      </header>

      {/* 第一屏中央：MooVN 简短介绍语 + 核心操作入口 */}
      <section className="min-h-[68vh] flex flex-col items-center justify-center text-center px-4 py-16 border-b border-[#1c1c22]">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            MooVN Studio
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
            轻量、直观的跨平台视觉小说创作工具。
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#download"
              className="px-5 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs sm:text-sm flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              <span>下载客户端</span>
            </a>
            <button
              type="button"
              onClick={onLaunchWebStudio}
              className="px-5 py-2.5 rounded-lg bg-[#1b1b22] hover:bg-[#24242d] border border-[#2e2e38] text-zinc-100 font-semibold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>MooVN网页体验</span>
            </button>
          </div>
        </div>
      </section>

      {/* 下载区：严格按要求的 3 区块与平台顺序排版 */}
      <main
        id="download"
        className="max-w-4xl w-full mx-auto px-4 sm:px-8 py-12 space-y-6 flex-1"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">下载</h2>
          {loading && (
            <span className="text-xs text-zinc-500">正在检查发布版本...</span>
          )}
        </div>

        {/* 1. 最新稳定版本(推荐) */}
        <div className="rounded-xl bg-[#111115] border border-[#23232a] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">
              最新稳定版本(推荐)
            </span>
            <span className="text-xs font-mono text-zinc-400">
              {latestStable ? latestStable.tagName : '暂无稳定版发布'}
            </span>
          </div>

          <PlatformDownloadList
            release={latestStable}
            defaultOpenWindows={true}
          />
        </div>

        {/* 2. 最新Beta与Alpha */}
        <div className="rounded-xl bg-[#111115] border border-[#23232a] p-5 space-y-4">
          <div className="text-sm font-bold text-white">最新Beta与Alpha</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 左：Beta */}
            <div className="rounded-lg bg-[#0d0d10] border border-[#202027] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">Beta</span>
                <span className="text-xs font-mono text-zinc-400">
                  {latestBeta ? latestBeta.tagName : '暂无发布'}
                </span>
              </div>
              <PlatformDownloadList
                release={latestBeta}
                defaultOpenWindows={true}
              />
            </div>

            {/* 右：Alpha */}
            <div className="rounded-lg bg-[#0d0d10] border border-[#202027] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">Alpha</span>
                <span className="text-xs font-mono text-zinc-400">
                  {latestAlpha ? latestAlpha.tagName : '暂无发布'}
                </span>
              </div>
              <PlatformDownloadList
                release={latestAlpha}
                defaultOpenWindows={true}
              />
            </div>
          </div>
        </div>

        {/* 3. 历史版本：Stable、Beta、Alpha、Dev */}
        <div className="rounded-xl bg-[#111115] border border-[#23232a] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-white">历史版本</span>
            <div className="flex items-center gap-1 bg-[#0c0c0f] p-1 rounded-lg border border-[#202027]">
              {(['Stable', 'Beta', 'Alpha', 'Dev'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setHistoryFilter(ch)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    historyFilter === ch
                      ? 'bg-zinc-100 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {historyReleases.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-[#22222a] rounded-lg">
              当前 {historyFilter} 通道暂无历史发布版本
            </div>
          ) : (
            <div className="space-y-3">
              {historyReleases.map((rel) => (
                <div
                  key={rel.id}
                  className="p-4 rounded-lg bg-[#0d0d10] border border-[#202027] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-zinc-100">
                      {rel.tagName}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {rel.publishedAt
                        ? new Date(rel.publishedAt).toLocaleDateString()
                        : ''}
                    </span>
                  </div>
                  <PlatformDownloadList
                    release={rel}
                    defaultOpenWindows={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 简洁页脚 */}
      <footer className="border-t border-[#1c1c22] py-6 px-4 sm:px-8 text-xs text-zinc-500">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span>MooVN Studio</span>
          <div className="flex items-center gap-4">
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300 transition"
            >
              问题反馈
            </a>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300 transition"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
