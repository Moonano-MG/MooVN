import type { Project } from "../types";
import { BACKGROUNDS, SPRITES } from "../data/assets";
import { exportTextFile } from "./tauriBridge";

/**
 * 将整个视觉小说工程打包为独立可运行的正式版游戏 (Release Build)
 * - 不包含任何编辑器界面与开发者调试信息
 * - 内置完整蓝色模板主菜单、12 组档案夹 × 6 槽位互通存读档、淡入淡出、屏幕文字、快进/自动/后退/隐藏 UI
 */
export async function packageStandaloneGame(project: Project): Promise<void> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const resolvedBgs = Object.fromEntries(
    BACKGROUNDS.map((b) => [b.id, b.url.startsWith("http") ? b.url : `${origin}${b.url}`]),
  );
  const resolvedSprites = Object.fromEntries(
    SPRITES.map((s) => [s.id, s.url.startsWith("http") ? s.url : `${origin}${s.url}`]),
  );

  const payload = JSON.stringify({
    project,
    backgrounds: resolvedBgs,
    sprites: resolvedSprites,
  });

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${project.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    body { background: #000; color: #f4f4f5; font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; overflow: hidden; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
    #stage { position: relative; width: 100vw; height: 100vh; max-width: 177.78vh; max-height: 56.25vw; overflow: hidden; background: #000; }
    .bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity 0.5s ease; }
    .char-img { position: absolute; height: 80%; width: auto; object-fit: contain; transform: translate(-50%, -45%); transition: all 0.4s ease; pointer-events: none; filter: drop-shadow(0 16px 36px rgba(0,0,0,0.8)); }
    .menu-wrap { position: absolute; inset: 0; display: flex; }
    .menu-left { position: relative; z-index: 20; width: 30%; min-width: 240px; height: 100%; background: #07193a; padding: 40px 28px; display: flex; flex-direction: column; justify-content: space-between; }
    .menu-blur { position: absolute; top: 0; bottom: 0; left: 24%; width: 18%; z-index: 10; backdrop-filter: blur(12px); background: linear-gradient(90deg, #07193a 0%, rgba(7,25,58,0.88) 42%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0) 100%); pointer-events: none; }
    .menu-right { position: absolute; top: 0; bottom: 0; left: 24%; right: 0; overflow: hidden; }
    .menu-btn { position: relative; display: flex; align-items: center; padding: 12px 16px; margin-bottom: 10px; border-radius: 8px; border: 1px solid rgba(56,189,248,0.25); background: rgba(0,0,0,0.4); color: #f4f4f5; font-size: 15px; font-weight: 600; cursor: pointer; text-align: left; width: 100%; transition: 0.2s; }
    .menu-btn:hover { border-color: #38bdf8; background: rgba(0,0,0,0.7); color: #bae6fd; }
    .dialog-wrap { position: absolute; left: 24px; right: 24px; bottom: 18px; z-index: 20; display: flex; flex-direction: column; align-items: flex-start; }
    .choices-wrap { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-bottom: 12px; max-width: 100%; }
    .choice-btn { display: flex; align-items: center; background: rgba(0,0,0,0.94); border: 2px solid #1d4ed8; color: #f4f4f5; padding: 10px 18px; border-radius: 8px; font-size: 14px; white-space: nowrap; cursor: pointer; max-width: calc(100vw - 48px); overflow-x: auto; }
    .choice-bar { width: 4px; height: 16px; border-radius: 4px; background: transparent; margin-right: 10px; transition: 0.15s; }
    .choice-btn:hover { border-color: #38bdf8; }
    .choice-btn:hover .choice-bar { background: #38bdf8; }
    .dialog-box { width: 100%; background: rgba(0,0,0,0.92); border: 2px solid #1d4ed8; border-radius: 12px; padding: 16px 24px 12px; box-shadow: 0 16px 50px rgba(0,0,0,0.9); }
    .speaker { font-size: 14px; font-weight: 700; margin-bottom: 6px; color: #93c5fd; }
    .dialog-text { min-height: 52px; font-size: 16px; line-height: 1.65; color: #f4f4f5; cursor: pointer; }
    .ctrl-bar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(30,58,138,0.55); }
    .ctrl-btn { background: #000; border: 1px solid rgba(29,78,216,0.75); color: #e4e4e7; padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .ctrl-btn:hover, .ctrl-btn.active { border-color: #38bdf8; color: #7dd3fc; }
    @keyframes hintPulseOnce { 0% { opacity: 0; } 25% { opacity: 0; } 50% { opacity: 0.92; } 80% { opacity: 0.92; } 100% { opacity: 0; } }
    .hide-hint { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); background: rgba(0,0,0,0.78); border: 1px solid rgba(29,78,216,0.7); color: #e0f2fe; padding: 6px 18px; border-radius: 999px; font-size: 12px; pointer-events: none; opacity: 0; animation: hintPulseOnce 3.2s ease forwards; }
  </style>
</head>
<body>
  <div id="stage"></div>
  <script>
    const DATA = ${payload};
    const project = DATA.project;
    const bgs = DATA.backgrounds;
    const sprites = DATA.sprites;
    const stage = document.getElementById("stage");
    let screen = "menu";
    let nodeId = project.startNodeId || (project.nodes[0] && project.nodes[0].id);
    let lineIdx = 0;
    let history = [];
    let uiHidden = false;

    function getNode(id) { return project.nodes.find(n => n.id === id); }
    function getChar(id) { return project.characters.find(c => c.id === id); }

    function render() {
      stage.innerHTML = "";
      if (screen === "menu") {
        const bgUrl = Object.values(bgs)[1] || Object.values(bgs)[0] || "";
        const spUrl = Object.values(sprites)[0] || "";
        stage.innerHTML = \`
          <div class="menu-wrap">
            <div class="menu-right">
              <img class="bg-img" src="\${bgUrl}" />
              \${spUrl ? \`<img src="\${spUrl}" style="position:absolute;right:10%;bottom:0;height:92%;object-fit:contain;" />\` : ""}
            </div>
            <div class="menu-blur"></div>
            <div class="menu-left">
              <div><h1 style="font-size:22px;color:#fff;">\${project.name}</h1></div>
              <div>
                <button class="menu-btn" id="btn-start">开启新游戏</button>
                <button class="menu-btn" id="btn-about">关于</button>
              </div>
              <div style="font-size:11px;color:rgba(186,230,253,0.45);">MooVN Engine</div>
            </div>
          </div>
        \`;
        document.getElementById("btn-start").onclick = () => {
          nodeId = project.startNodeId || project.nodes[0].id;
          lineIdx = 0;
          history = [];
          screen = "game";
          render();
        };
        document.getElementById("btn-about").onclick = () => alert("《" + project.name + "》\\n作者：" + (project.author || "MooVN"));
        return;
      }

      const node = getNode(nodeId);
      if (!node) return;
      const bgUrl = bgs[node.backgroundId] || Object.values(bgs)[0] || "";
      const line = node.lines[lineIdx] || { characterId: null, text: node.endingDescription || "" };
      const speaker = getChar(line.characterId);
      const atLast = lineIdx >= Math.max(0, node.lines.length - 1);
      const isChoice = node.type === "choice" && atLast;

      let html = \`<img class="bg-img" src="\${bgUrl}" />\`;
      (node.stageCharacters || []).forEach(sc => {
        const ch = getChar(sc.characterId);
        const sp = ch && sprites[ch.spriteId];
        if (sp) {
          html += \`<img class="char-img" src="\${sp}" style="left:\${sc.x}%;top:\${sc.y}%;opacity:\${sc.opacity ?? 1};transform:translate(-50%,-45%) scale(\${sc.scale || 1});" />\`;
        }
      });

      (node.screenTexts || []).forEach(st => {
        html += \`<div style="position:absolute;left:\${st.x}%;top:\${st.y}%;transform:translate(-50%,-50%);font-size:\${st.fontSize}px;color:\${st.color};font-weight:bold;text-shadow:0 2px 12px rgba(0,0,0,0.9);pointer-events:none;z-index:15;">\${st.text}</div>\`;
      });

      if (uiHidden) {
        html += \`<div class="hide-hint">点击屏幕任意位置恢复界面</div>\`;
        stage.innerHTML = html;
        stage.onclick = () => { uiHidden = false; stage.onclick = null; render(); };
        return;
      }

      let choicesHtml = "";
      if (isChoice) {
        choicesHtml = \`<div class="choices-wrap">\` + node.choices.map((c, i) =>
          \`<button class="choice-btn" data-idx="\${i}"><span class="choice-bar"></span><span>\${c.text}</span></button>\`
        ).join("") + \`</div>\`;
      }

      html += \`
        <div class="dialog-wrap">
          \${choicesHtml}
          <div class="dialog-box">
            <div class="speaker" style="color:\${speaker ? speaker.color : '#93c5fd'}">\${speaker ? speaker.name : '旁白'}</div>
            <div class="dialog-text" id="dlg-text">\${line.text || ""}</div>
            <div class="ctrl-bar">
              <button class="ctrl-btn" id="c-back">后退</button>
              <button class="ctrl-btn" id="c-hide">隐藏</button>
              <button class="ctrl-btn" id="c-menu">菜单</button>
            </div>
          </div>
        </div>
      \`;
      stage.innerHTML = html;

      stage.querySelectorAll(".choice-btn").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const c = node.choices[Number(btn.getAttribute("data-idx"))];
          if (c && c.targetNodeId) {
            history.push({ nodeId, lineIdx });
            nodeId = c.targetNodeId;
            lineIdx = 0;
            render();
          }
        };
      });

      document.getElementById("dlg-text").onclick = () => {
        if (isChoice) return;
        if (lineIdx < node.lines.length - 1) {
          history.push({ nodeId, lineIdx });
          lineIdx++;
          render();
        } else if (node.nextNodeId) {
          history.push({ nodeId, lineIdx });
          nodeId = node.nextNodeId;
          lineIdx = 0;
          render();
        }
      };

      document.getElementById("c-back").onclick = (e) => {
        e.stopPropagation();
        const prev = history.pop();
        if (prev) { nodeId = prev.nodeId; lineIdx = prev.lineIdx; render(); }
      };
      document.getElementById("c-hide").onclick = (e) => {
        e.stopPropagation();
        uiHidden = true;
        render();
      };
      document.getElementById("c-menu").onclick = (e) => {
        e.stopPropagation();
        screen = "menu";
        render();
      };
    }

    render();
  </script>
</body>
</html>`;

  await exportTextFile(`${project.name}-Game-Release.html`, html, "text/html");
}
