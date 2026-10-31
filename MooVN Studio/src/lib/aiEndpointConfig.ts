import type { AiAgentConfig, SceneNode, VNProject } from '../types.ts';
import { validateSafeAiProxyEndpoint } from './devServerSecurity.ts';

export const AI_CONFIG_STORAGE_KEY = 'moovn_ai_agent_endpoint_v5';
type ConfigStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_AI_CONFIG: AiAgentConfig = {
  provider: 'openai_compatible',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  enableThinking: false,
  thinkingBudgetTokens: 2048,
  autoExecuteWorkflow: false,
  allowScriptEdit: true,
  allowProjectSettingsEdit: false,
  customSystemPrompt: '你是 MooVN Studio 的视觉小说 AI 助手。Agent 模式可在用户确认后提出工程操作；纯问答模式只回答问题。',
};

export function redactKnownSecret(value: string, secrets: string[]): string {
  let result = value;
  for (const original of secrets) {
    const secret = original.trim();
    if (!secret) continue;
    result = result.split(secret).join('[已隐藏]');
    // An unpaired surrogate cannot have a valid URL encoding; the raw value
    // was already redacted above.
    let component: string;
    let uri: string;
    try { component = encodeURIComponent(secret); uri = encodeURI(secret); } catch { continue; }
    for (const encoded of new Set([component, uri, encodeURIComponent(component)])) {
      if (encoded === secret || !encoded.includes('%')) continue;
      const escaped = encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), '[已隐藏]');
    }
  }
  return result;
}

/** Compare a known key against URL text, including repeatedly percent-encoded paths. */
export function endpointContainsKnownSecret(endpoint: string, secret: string): boolean {
  const key = secret.trim();
  if (!key) return false;
  let candidate = endpoint;
  const decoder = new TextDecoder();
  while (true) {
    if (candidate.includes(key)) return true;
    // Decode valid escape runs even if a different part of the path contains
    // malformed escapes; an unrelated '%' must not hide the known key.
    const decoded = candidate.replace(/(?:%[\da-f]{2})+/gi, (run) => {
      const bytes = run.match(/[\da-f]{2}/gi)?.map((pair) => parseInt(pair, 16)) || [];
      return decoder.decode(new Uint8Array(bytes));
    });
    if (decoded === candidate) return false;
    candidate = decoded;
  }
}

/** Persist only a validated endpoint and never persist the session key. */
export function saveAiEndpointConfig(storage: ConfigStorage, cfg: AiAgentConfig): string | null {
  const validation = validateSafeAiProxyEndpoint('openai_compatible', cfg.baseUrl);
  if (!validation.ok || !validation.normalizedUrl) {
    return `${validation.error || '接口地址无效'} 未保存此地址。`;
  }
  if (endpointContainsKnownSecret(validation.normalizedUrl, cfg.apiKey)) {
    return '接口地址包含当前会话密钥，未保存此地址。';
  }
  const modelName = redactKnownSecret(cfg.modelName, [cfg.apiKey]);
  const prompt = redactKnownSecret(cfg.customSystemPrompt || '', [cfg.apiKey]);
  try {
    storage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify({
      baseUrl: validation.normalizedUrl,
      modelName,
      temperature: Number.isFinite(cfg.temperature) ? Math.min(1.5, Math.max(0, cfg.temperature)) : DEFAULT_AI_CONFIG.temperature,
      customSystemPrompt: prompt,
    }));
  } catch {
    return '无法保存接口设置或清除旧密钥，设置仅在本次会话生效。请检查浏览器存储权限。';
  }
  if (modelName !== cfg.modelName || prompt !== (cfg.customSystemPrompt || '')) {
    return '模型名称或提示词含当前会话密钥，已在保存内容中隐藏；请从这些字段移除密钥。';
  }
  return null;
}

/** Old records may contain a key or an unsafe URL; scrub them rather than reusing them. */
export function loadAiEndpointConfig(
  storage: ConfigStorage,
  sessionKey: string
): { config: AiAgentConfig; warning: string | null; needsScrubbing: boolean } {
  const fallback = { ...DEFAULT_AI_CONFIG, apiKey: sessionKey };
  let raw: string | null;
  try { raw = storage.getItem(AI_CONFIG_STORAGE_KEY); }
  catch { return { config: fallback, warning: '读取接口设置失败。本次使用默认值；请检查并清理旧的浏览器存储。', needsScrubbing: false }; }
  if (raw === null) return { config: fallback, warning: null, needsScrubbing: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    const values = parsed as Record<string, unknown>;
    const legacyKey = typeof values.apiKey === 'string' ? values.apiKey : '';
    const savedUrl = typeof values.baseUrl === 'string' ? values.baseUrl : DEFAULT_AI_CONFIG.baseUrl;
    const validUrl = validateSafeAiProxyEndpoint('openai_compatible', savedUrl);
    const unsafeUrl = !validUrl.ok || !validUrl.normalizedUrl ||
      [legacyKey, sessionKey].some((secret) => endpointContainsKnownSecret(savedUrl, secret));
    const sourceModel = typeof values.modelName === 'string' ? values.modelName : DEFAULT_AI_CONFIG.modelName;
    const sourcePrompt = typeof values.customSystemPrompt === 'string' ? values.customSystemPrompt : DEFAULT_AI_CONFIG.customSystemPrompt || '';
    const modelName = redactKnownSecret(sourceModel, [legacyKey, sessionKey]);
    const customSystemPrompt = redactKnownSecret(sourcePrompt, [legacyKey, sessionKey]);
    const config: AiAgentConfig = {
      ...fallback,
      baseUrl: unsafeUrl ? DEFAULT_AI_CONFIG.baseUrl : validUrl.normalizedUrl!,
      modelName,
      customSystemPrompt,
      temperature: typeof values.temperature === 'number' && Number.isFinite(values.temperature)
        ? Math.min(1.5, Math.max(0, values.temperature)) : DEFAULT_AI_CONFIG.temperature,
    };
    const allowedKeys = new Set(['baseUrl', 'modelName', 'temperature', 'customSystemPrompt']);
    const needsScrubbing = Object.keys(values).some((key) => !allowedKeys.has(key)) || unsafeUrl ||
      sourceModel !== modelName || sourcePrompt !== customSystemPrompt;
    return {
      config,
      needsScrubbing,
      warning: needsScrubbing ? '旧接口配置含不安全内容，正在尝试清理。' : null,
    };
  } catch {
    // Invalid JSON cannot be used safely and may still contain plaintext keys.
    return { config: fallback, warning: '旧接口配置损坏，正在尝试重置。', needsScrubbing: true };
  }
}

/** Project details are included only after the creator explicitly opts in to Agent context. */
export function buildAiProjectContext(
  project: VNProject,
  node: SceneNode | undefined,
  mode: 'agent' | 'chat',
  shareProject: boolean
): string {
  if (mode !== 'agent' || !shareProject) return '';
  return `\n创作者已同意共享以下工程摘要：${JSON.stringify({
    project: { id: project.id, title: project.title, chapters: project.chapters.length, nodes: project.nodes.length },
    currentNode: node ? {
      id: node.id, title: node.title, type: node.type,
      dialogues: node.dialogues.map(({ id, speakerId, speakerName, text }) => ({ id, speakerId, speakerName, text })),
      characters: node.characters.map(({ id, characterId, name, spriteId }) => ({ placementId: id, characterId, name, spriteId })),
    } : null,
    characters: project.characters.map(({ id, name, spriteId, expressions }) => ({
      id, name, spriteId, expressions: expressions?.map(({ label, spriteId: expressionSpriteId }) => ({ label, spriteId: expressionSpriteId })),
    })),
  })}`;
}

/** Provider response bodies can echo credentials or project text; do not display them. */
export function aiHttpFailureMessage(status: number): string {
  return `HTTP ${status}：服务商拒绝请求，请检查服务地址、模型和密钥。`;
}
