import { BackgroundPresetId, CharacterDef, SceneDef } from '../types/moovn';

export const BACKGROUND_PRESET_META: Record<
  BackgroundPresetId,
  {
    name: string;
    skyTop: string;
    skyBottom: string;
    accentColor: string;
    horizonColor: string;
    subtitle: string;
  }
> = {
  rainy_station: {
    name: '雨夜潮汐车站',
    skyTop: '#040b1a',
    skyBottom: '#0f284e',
    accentColor: '#38bdf8',
    horizonColor: '#1d4ed8',
    subtitle: '23:59 · Rainy Tidal Platform',
  },
  deep_sea_observatory: {
    name: '零度深海观测所',
    skyTop: '#020917',
    skyBottom: '#072a4f',
    accentColor: '#2dd4bf',
    horizonColor: '#0284c7',
    subtitle: '-3000m · Abyssal Glass Dome',
  },
  starlight_deck: {
    name: '星光号甲板',
    skyTop: '#05081c',
    skyBottom: '#132759',
    accentColor: '#60a5fa',
    horizonColor: '#3b82f6',
    subtitle: '00:00 · Starlight Horizon Deck',
  },
  blue_classroom: {
    name: '蔚蓝学园旧校舍',
    skyTop: '#081834',
    skyBottom: '#183b6b',
    accentColor: '#7dd3fc',
    horizonColor: '#2563eb',
    subtitle: '17:45 · Azure Dusk Classroom',
  },
  cyber_archive: {
    name: '星航记忆档案馆',
    skyTop: '#04091a',
    skyBottom: '#111c44',
    accentColor: '#818cf8',
    horizonColor: '#4f46e5',
    subtitle: 'Sector-07 · Memory Tape Archive',
  },
  dawn_harbor: {
    name: '蔚蓝黎明港湾',
    skyTop: '#0a1f44',
    skyBottom: '#1e4e8c',
    accentColor: '#fbbf24',
    horizonColor: '#38bdf8',
    subtitle: '05:30 · Dawn Break Harbor',
  },
};

export function generateSceneThumbnailDataUrl(
  scene: SceneDef,
  characters: CharacterDef[]
): string {
  const bgMeta = BACKGROUND_PRESET_META[scene.background.presetId] || BACKGROUND_PRESET_META.rainy_station;

  const charSpritesSvg = scene.characters
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((placement) => {
      const charDef = characters.find((c) => c.id === placement.characterId);
      if (!charDef) return '';
      const cx = (placement.x / 100) * 320;
      const cy = (placement.y / 100) * 180;
      return `
        <g transform="translate(${cx}, ${cy}) scale(${placement.scale * 0.65})" opacity="${placement.alpha}">
          <path d="M -28 70 Q -24 5 0 5 Q 24 5 28 70 Z" fill="${charDef.outfitColor}" stroke="${charDef.themeColor}" stroke-width="1.5"/>
          <circle cx="0" cy="-12" r="18" fill="#fde6d8" stroke="${charDef.themeColor}" stroke-width="1.2"/>
          <path d="M -19 -14 Q 0 -36 19 -14 Q 22 4 16 14 Q 12 -8 0 -10 Q -12 -8 -16 14 Q -22 4 -19 -14 Z" fill="${charDef.hairColor}"/>
          <circle cx="-6" cy="-11" r="2.5" fill="${charDef.eyeColor}"/>
          <circle cx="6" cy="-11" r="2.5" fill="${charDef.eyeColor}"/>
        </g>
      `;
    })
    .join('');

  const animFrameBadge = scene.background.isAnimated
    ? `<rect x="8" y="8" width="96" height="18" rx="4" fill="rgba(5,16,38,0.85)" stroke="#38bdf8" stroke-width="0.8"/>
       <circle cx="17" cy="17" r="3" fill="#38bdf8"/>
       <text x="24" y="20" fill="#bae6fd" font-size="9" font-family="sans-serif">动画开头帧 #001</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgMeta.skyTop}"/>
        <stop offset="100%" stop-color="${bgMeta.skyBottom}"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.7" cy="0.3" r="0.55">
        <stop offset="0%" stop-color="${bgMeta.accentColor}" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="${bgMeta.skyTop}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="320" height="180" fill="url(#sky)"/>
    <rect width="320" height="180" fill="url(#glow)"/>
    <circle cx="240" cy="48" r="26" fill="${bgMeta.accentColor}" opacity="0.22"/>
    <path d="M 0 135 Q 90 118 180 132 T 320 126 L 320 180 L 0 180 Z" fill="#061229" opacity="0.85"/>
    <line x1="0" y1="138" x2="320" y2="138" stroke="${bgMeta.accentColor}" stroke-width="1" stroke-opacity="0.45"/>
    ${charSpritesSvg}
    <rect x="0" y="142" width="320" height="38" fill="rgba(3, 7, 16, 0.88)"/>
    <line x1="0" y1="142" x2="320" y2="142" stroke="#1d4ed8" stroke-width="1.2"/>
    <text x="12" y="157" fill="#60a5fa" font-size="10" font-weight="bold" font-family="sans-serif">${escapeXml(
      scene.dialogue.speakerName || '旁白'
    )} · 场景 ${scene.globalNumber}</text>
    <text x="12" y="171" fill="#e2e8f0" font-size="9.5" font-family="sans-serif">${escapeXml(
      scene.dialogue.text.slice(0, 24)
    )}...</text>
    ${animFrameBadge}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
