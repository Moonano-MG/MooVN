/** 启动兜底：把致命错误显示在页面上，避免静默白屏 */
export function installBootGuard(label: string): void {
  const show = (title: string, detail: string) => {
    console.error(`[MooVN:${label}]`, title, detail);
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#020617;color:#dcebff;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;' +
      'font:14px/1.8 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:32px;text-align:center';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:20px;font-weight:700;letter-spacing:0.1em;color:#7ecbff';
    const d = document.createElement('pre');
    d.textContent = detail.slice(0, 900);
    d.style.cssText = 'max-width:860px;max-height:55vh;overflow:auto;background:rgba(255,255,255,0.06);padding:14px 18px;border-radius:10px;white-space:pre-wrap;word-break:break-all;text-align:left';
    const tip = document.createElement('div');
    tip.textContent = '请刷新重试，或将以下信息反馈给开发者';
    tip.style.cssText = 'color:#8aa5c8;font-size:12px';
    el.append(t, d, tip);
    document.body.appendChild(el);
  };

  window.addEventListener('error', (e) => {
    show('MooVN 启动出错', `${e.message}\n${e.filename ?? ''}:${e.lineno ?? ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error;
    show('MooVN 初始化失败', r?.stack ?? String(r));
  });
}
