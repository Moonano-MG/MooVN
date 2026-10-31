import type { NestedChildNode, SceneNode, ScriptLanguage } from '../types.ts';
import { getUnsupportedBranchIssue, type BranchSupportIssue } from './branchSupport.ts';

export type PreviewSupportIssue = BranchSupportIssue | {
  code: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED';
  message: string;
};

/**
 * This is NOT a script parser. It only proves that a source consists entirely
 * of whitespace and complete comments. Anything else, including malformed
 * comments, host declarations, string literals and API calls, must stop preview.
 * Rust supports nested block comments; the other supported languages do not.
 */
function isOnlyWhitespaceAndComments(source: string, language: ScriptLanguage | undefined): boolean {
  const isEcma = !language || language === 'javascript' || language === 'typescript';
  const isCSharp = language === 'csharp';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v' ||
        ((isEcma || isCSharp) && (ch === '\u2028' || ch === '\u2029')) ||
        (isCSharp && ch === '\u0085')) {
      i += 1;
      continue;
    }
    if (source.startsWith('//', i)) {
      i += 2;
      // C# also terminates line comments at U+0085. For C++/Rust, treating
      // Unicode separators conservatively as ends can only cause a stop.
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r' &&
             source[i] !== '\u2028' && source[i] !== '\u2029' &&
             (isEcma || source[i] !== '\u0085')) i += 1;
      continue;
    }
    if (source.startsWith('/*', i)) {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        if (language === 'rust' && source.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (source.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      if (depth !== 0) return false;
      continue;
    }
    return false;
  }
  return true;
}

function scriptIssue(location: string): PreviewSupportIssue {
  return {
    code: 'ERR_PREVIEW_SCRIPT_UNSUPPORTED',
    message: `${location}：预览不执行脚本、函数或桥接积木（包括 moovn.save.create）；状态、媒体和存档动作已暂停。台词仅供定位，代码已保留。`,
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
  if (node.type === 'function_call') return scriptIssue('函数调用节点');
  if (node.customScript && !isOnlyWhitespaceAndComments(node.customScript, node.scriptLanguage)) {
    return scriptIssue('自定义节点脚本');
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
