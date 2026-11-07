import type { NestedChildNode, SceneNode } from '../types.ts';
import { getUnsupportedBranchIssue, type BranchSupportIssue } from './branchSupport.ts';
import { AUDIO_ASSETS } from '../data/assets.ts';
import { isOnlyWhitespaceAndComments, parsePreviewScript } from './previewScript.ts';

export type PreviewSupportIssue = BranchSupportIssue | {
  code: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED' | 'ERR_PREVIEW_AUDIO_UNSUPPORTED' | 'ERR_PREVIEW_SETTINGS_UNSUPPORTED';
  message: string;
};

function scriptIssue(location: string, detail = '不支持此脚本、函数或桥接积木'): PreviewSupportIssue {
  return {
    code: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED',
    message: `${location}：${detail}；状态、媒体和存档动作已暂停。台词仅供定位，代码已保留。`,
  };
}

/**
 * Check the actual preview capability before entry effects, saves, audio,
 * timers and advancement. This deliberately does not change code generation or
 * claim that scripts are executable in the HTML or native runtimes.
 */
export function getUnsupportedPreviewIssue(node: SceneNode): PreviewSupportIssue | null {
  const branchIssue = getUnsupportedBranchIssue(node);
  if (branchIssue) return branchIssue;
  // The built-in preview only synthesizes BGM/SFX note sequences. Do not
  // advance through voice actions or silently substitute a different asset.
  if (node.type === 'voice_play' || node.dialogues.some((line) => line.voiceAudioId)) {
    return { code: 'ERR_PREVIEW_AUDIO_UNSUPPORTED', message: '预览尚不支持语音或上传音频；已暂停并保留当前存档。' };
  }
  if ((node.type === 'sfx_play' && !node.sfxId) ||
      (node.sfxId && !AUDIO_ASSETS.some((asset) => asset.id === node.sfxId && asset.type === 'sfx'))) {
    return { code: 'ERR_PREVIEW_AUDIO_UNSUPPORTED', message: '音效未配置或不是可用的内置音效；已暂停并保留当前存档。' };
  }
  if (node.type !== 'bgm_stop' && ((node.type === 'bgm_play' && !node.bgmId) ||
      (node.bgmId && !AUDIO_ASSETS.some((asset) => asset.id === node.bgmId && asset.type === 'bgm')))) {
    return { code: 'ERR_PREVIEW_AUDIO_UNSUPPORTED', message: '背景音乐未配置或不是可用的内置 BGM；已暂停并保留当前存档。' };
  }
  if (node.type === 'game_settings_modify' && node.settingsActionConfig) {
    const config = node.settingsActionConfig;
    const unsupported = Object.entries(config).some(([key, value]) => value !== undefined && key !== 'textSpeedMs' && key !== 'openSettingsPanel');
    const invalidSpeed = config.textSpeedMs !== undefined &&
      (!Number.isInteger(config.textSpeedMs) || config.textSpeedMs < 10 || config.textSpeedMs > 80);
    if (unsupported || invalidSpeed) {
      return { code: 'ERR_PREVIEW_SETTINGS_UNSUPPORTED', message: '此设置节点包含未支持的参数或无效文字速度；预览已暂停并保留存档。' };
    }
  }
  if (node.type === 'function_call') return scriptIssue('函数调用节点');
  if (node.customScript) {
    const program = parsePreviewScript(node.customScript, node.scriptLanguage);
    if (!program.ok) return scriptIssue('自定义节点脚本', program.message);
    const hasOtherActions = [
      node.timedChoiceSeconds, node.defaultTimeoutTargetId, node.conditionRule,
      node.fadeConfig, node.screenTextConfig, node.cameraConfig, node.settingsActionConfig,
      node.loopConfig, node.logicConfig, node.waitDurationMs, node.toastMessage,
      node.unlockedClueTitle, node.unlockedClueDesc, node.targetExpressionCharId,
      node.targetExpressionSpriteId, node.affectionTargetCharId, node.affectionDelta,
      node.variableKey, node.variableValue, node.mediaAnimation, node.endingType, node.endingTitle,
    ].some((value) => value !== undefined);
    if ((program.say || program.saveName) && (node.type !== 'script' || hasOtherActions ||
        node.visualBlocks.length || node.childrenNodes?.length || node.elseChildrenNodes?.length || node.choices.length)) {
      return scriptIssue('自定义节点脚本', '支持的指令只能用于不含其他逻辑或积木动作的脚本节点');
    }
  }
  const visualScript = node.visualBlocks.find((block) => block.kind === 'call_bridge_script');
  if (visualScript) return scriptIssue(`脚本积木「${visualScript.id}」`);

  const pending = [...(node.childrenNodes || []), ...(node.elseChildrenNodes || [])];
  const seen = new WeakSet<NestedChildNode>();
  while (pending.length > 0) {
    const child = pending.pop()!;
    if (seen.has(child)) continue;
    seen.add(child);
    // Nested customCode is emitted by the JS/TS node compiler, regardless of
    // the parent file's selected language. Do not treat Rust nested comments as
    // safe JS/TS comments, and do not silently skip a nested script action.
    if (child.type === 'function_call' || child.type === 'script' ||
        (child.customCode && !isOnlyWhitespaceAndComments(child.customCode, 'typescript'))) {
      return scriptIssue(`嵌套节点「${child.id}」`);
    }
    pending.push(...(child.childrenNodes || []), ...(child.elseChildrenNodes || []));
  }
  return null;
}
