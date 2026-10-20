/**
 * 安全表达式求值器（用于条件分支 / 选项显示条件 / setvar）
 * 支持语法：
 *   数字、单双引号字符串、true/false、标识符（映射到变量表）
 *   + - * / %、比较 (== != > >= < <=)、逻辑 (&& || !)、括号
 * 标识符解析：先查 vars 表（含 "yuki.affection" 点路径），再查内置变量。
 */

export interface EvalContext {
  vars: Record<string, unknown>;
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

const OPERATORS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '+', '-', '*', '/', '%', '!', '(', ')'];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ t: 'num', v: parseFloat(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < input.length && input[j] !== c) {
        if (input[j] === '\\') {
          s += input[j + 1] ?? '';
          j += 2;
        } else {
          s += input[j];
          j++;
        }
      }
      tokens.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_\u4e00-\u9fff]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_.\u4e00-\u9fff]/.test(input[j])) j++;
      tokens.push({ t: 'id', v: input.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => input.startsWith(o, i));
    if (op) {
      tokens.push({ t: 'op', v: op });
      i += op.length;
      continue;
    }
    throw new Error(`条件表达式包含无法识别的字符: "${c}"`);
  }
  return tokens;
}

/** 递归下降解析求值 */
class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private ctx: EvalContext
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private eatOp(v: string): boolean {
    const tk = this.peek();
    if (tk && tk.t === 'op' && tk.v === v) {
      this.pos++;
      return true;
    }
    return false;
  }
  private expectOp(v: string): void {
    if (!this.eatOp(v)) throw new Error(`条件表达式缺少 "${v}"`);
  }

  parse(): unknown {
    const v = this.or();
    if (this.pos !== this.tokens.length) throw new Error('条件表达式存在多余内容');
    return v;
  }

  private or(): unknown {
    let left = this.and();
    while (this.eatOp('||')) {
      const right = this.and();
      left = truthy(left) || truthy(right);
    }
    return left;
  }
  private and(): unknown {
    let left = this.cmp();
    while (this.eatOp('&&')) {
      const right = this.cmp();
      left = truthy(left) && truthy(right);
    }
    return left;
  }
  private cmp(): unknown {
    let left = this.add();
    for (;;) {
      const tk = this.peek();
      if (tk && tk.t === 'op' && ['==', '!=', '>', '>=', '<', '<='].includes(tk.v)) {
        this.pos++;
        const right = this.add();
        switch (tk.v) {
          case '==': left = left === right; break;
          case '!=': left = left !== right; break;
          case '>': left = num(left) > num(right); break;
          case '>=': left = num(left) >= num(right); break;
          case '<': left = num(left) < num(right); break;
          case '<=': left = num(left) <= num(right); break;
        }
      } else return left;
    }
  }
  private add(): unknown {
    let left = this.mul();
    for (;;) {
      if (this.eatOp('+')) {
        const right = this.mul();
        left = typeof left === 'string' || typeof right === 'string'
          ? str(left) + str(right)
          : num(left) + num(right);
      } else if (this.eatOp('-')) {
        const right = this.mul();
        left = num(left) - num(right);
      } else return left;
    }
  }
  private mul(): unknown {
    let left = this.unary();
    for (;;) {
      if (this.eatOp('*')) left = num(left) * num(this.unary());
      else if (this.eatOp('/')) left = num(left) / num(this.unary());
      else if (this.eatOp('%')) left = num(left) % num(this.unary());
      else return left;
    }
  }
  private unary(): unknown {
    if (this.eatOp('!')) return !truthy(this.unary());
    if (this.eatOp('-')) return -num(this.unary());
    return this.primary();
  }
  private primary(): unknown {
    const tk = this.peek();
    if (!tk) throw new Error('条件表达式意外结束');
    if (tk.t === 'num' || tk.t === 'str') {
      this.pos++;
      return tk.v;
    }
    if (tk.t === 'id') {
      this.pos++;
      if (tk.v === 'true') return true;
      if (tk.v === 'false') return false;
      if (this.eatOp('(')) throw new Error('条件表达式不支持函数调用');
      return resolveIdent(tk.v, this.ctx);
    }
    if (tk.t === 'op' && tk.v === '(') {
      this.pos++;
      const v = this.or();
      this.expectOp(')');
      return v;
    }
    throw new Error(`条件表达式存在意外符号: ${JSON.stringify(tk)}`);
  }
}

function truthy(v: unknown): boolean {
  return Boolean(v);
}
function num(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`期望数字，得到: ${String(v)}`);
  return n;
}
function str(v: unknown): string {
  return String(v);
}

export function resolveIdent(id: string, ctx: EvalContext): unknown {
  if (id in ctx.vars) return ctx.vars[id];
  // 点路径逐级查找
  const parts = id.split('.');
  let cur: unknown = ctx.vars;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      console.warn(`[MooVN] 条件中的变量未定义: ${id}（按 false/0 处理）`);
      return undefined;
    }
  }
  return cur;
}

/** 求值条件表达式，出错时返回 false 并打印警告 */
export function evalCondition(expr: string, ctx: EvalContext): boolean {
  try {
    return truthy(new Parser(tokenize(expr), ctx).parse());
  } catch (err) {
    console.warn(`[MooVN] 条件求值失败: "${expr}" ->`, err);
    return false;
  }
}
