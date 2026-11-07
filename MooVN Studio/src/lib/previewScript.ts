import type { SceneNode, ScriptLanguage } from '../types.ts';

/**
 * A deliberately small declarative preview language, not a JavaScript runtime.
 * A whole program must validate before any of its actions may be applied.
 */
export type PreviewScriptResult =
  | { ok: true; say: { speaker: string; text: string } | null; saveName: string | null }
  | { ok: false; message: string };

export function isPreviewScriptSlotName(value: string): boolean {
  // This also avoids the native engine's lossy filename mapping for this subset.
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/** Consume only language-appropriate whitespace and complete comments. */
function skipTrivia(source: string, start: number, language: ScriptLanguage | undefined): number | null {
  const ecma = !language || language === 'javascript' || language === 'typescript';
  const csharp = language === 'csharp';
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v' ||
        ((ecma || csharp) && (ch === '\u2028' || ch === '\u2029')) ||
        (csharp && ch === '\u0085')) {
      i++;
    } else if (source.startsWith('//', i)) {
      i += 2;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r' &&
             source[i] !== '\u2028' && source[i] !== '\u2029' &&
             (ecma || source[i] !== '\u0085')) i++;
    } else if (source.startsWith('/*', i)) {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        if (language === 'rust' && source.startsWith('/*', i)) { depth++; i += 2; }
        else if (source.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth !== 0) return null;
    } else {
      break;
    }
  }
  return i;
}

/** Used for nested code, which remains unsupported even when top-level calls work. */
export function isOnlyWhitespaceAndComments(source: string, language: ScriptLanguage | undefined): boolean {
  return skipTrivia(source, 0, language) === source.length;
}

/**
 * Accept at most one text.say followed by at most one save.create. Arguments
 * are double-quoted JSON string literals, never expressions. Semicolons are
 * required between calls. Other languages only accept empty/comment-only input.
 */
export function parsePreviewScript(source: string, language?: ScriptLanguage): PreviewScriptResult {
  const fail = (message: string): PreviewScriptResult => ({ ok: false, message });
  if (source.length > 1_000_000) return fail('脚本超过大小限制');
  let i = 0;
  let say: { speaker: string; text: string } | null = null;
  let saveName: string | null = null;
  const skip = (): boolean => {
    const next = skipTrivia(source, i, language);
    if (next === null) return false;
    i = next;
    return true;
  };
  const take = (token: string): boolean => {
    if (!skip() || !source.startsWith(token, i)) return false;
    i += token.length;
    return true;
  };
  const stringLiteral = (): string | null => {
    if (!skip() || source[i] !== '"') return null;
    const start = i++;
    let escaped = false;
    while (i < source.length) {
      const ch = source[i++];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') {
        try {
          const value: unknown = JSON.parse(source.slice(start, i));
          return typeof value === 'string' ? value : null;
        } catch { return null; }
      }
    }
    return null;
  };

  while (true) {
    if (!skip()) return fail('注释未闭合');
    if (i === source.length) return { ok: true, say, saveName };
    if (language && language !== 'javascript' && language !== 'typescript') {
      return fail('预览只支持 JS/TS 的这两条指令');
    }
    if (!take('moovn') || !take('.') || !skip()) return fail('不支持宿主语句或其他指令');
    if (source.startsWith('text', i)) {
      i += 4;
      if (!take('.') || !take('say') || !take('(')) return fail('不支持的 text 指令');
      const speaker = stringLiteral();
      if (speaker === null || !take(',')) return fail('text.say 需要两个双引号字符串');
      const text = stringLiteral();
      if (text === null || !take(')') || speaker.length > 4096 || text.length > 1_000_000) {
        return fail('text.say 参数无效');
      }
      if (say || saveName) return fail('每个脚本节点最多一条 text.say，且必须在存档前');
      say = { speaker, text };
    } else if (source.startsWith('save', i)) {
      i += 4;
      if (!take('.') || !take('create') || !take('(')) return fail('不支持的 save 指令');
      const name = stringLiteral();
      if (name === null || !take(')') || !isPreviewScriptSlotName(name)) {
        return fail('存档名须为 1–64 位英文字母、数字、下划线或连字符');
      }
      if (saveName) return fail('每个脚本节点最多一条 save.create');
      saveName = name;
    } else {
      return fail('不支持的 MooVN 指令');
    }
    if (!skip()) return fail('注释未闭合');
    if (i === source.length) return { ok: true, say, saveName };
    if (source[i] !== ';') return fail('指令之间必须使用分号');
    i++;
  }
}

/** Produce a display-only view; never edit the authored node or its dialogues. */
export function resolvePreviewScriptNode(node: SceneNode, program: PreviewScriptResult): SceneNode {
  if (node.type !== 'script' || !program.ok || !program.say) return node;
  return {
    ...node,
    dialogues: [{
      id: 'preview-script-say', speakerId: 'preview-script-speaker',
      speakerName: program.say.speaker, speakerColor: '#38bdf8', text: program.say.text,
    }],
  };
}
