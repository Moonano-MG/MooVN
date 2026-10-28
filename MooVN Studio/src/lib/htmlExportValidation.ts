import type { SceneNode, VNProject } from '../types.ts';
import { BACKGROUND_ASSETS, CHARACTER_ASSETS } from '../data/assets.ts';

export interface HtmlExportIssue {
  nodeId?: string;
  nodeTitle?: string;
  message: string;
}

/**
 * HTML currently implements a small, deliberately conservative subset. Inspect
 * every node, including unreachable nodes: a project edit can make one reachable
 * later and we must not silently publish a different story.
 */
export function validateStandaloneHtmlProject(project: VNProject, allowWorkspaceReferences = true): HtmlExportIssue[] {
  const issues: HtmlExportIssue[] = [];
  const ids = new Set(project.nodes.map((node) => node.id));
  const backgrounds = new Set(BACKGROUND_ASSETS.map((asset) => asset.id));
  const sprites = new Set(CHARACTER_ASSETS.map((asset) => asset.id));
  const issue = (node: SceneNode | undefined, message: string) => issues.push({
    nodeId: node?.id, nodeTitle: node?.title, message,
  });
  if (!project.nodes.length || !ids.has(project.startNodeId)) issue(undefined, '入口节点不存在。');
  if (ids.size !== project.nodes.length) issue(undefined, '节点 ID 重复。');
  if (project.uiConfig.mainMenu.backgroundId && !backgrounds.has(project.uiConfig.mainMenu.backgroundId)) {
    issue(undefined, '主菜单背景不是可打包的内置素材。');
  }
  if (project.uiConfig.mainMenu.showHeroCharacter) issue(undefined, 'HTML 主菜单角色尚未实现。');

  for (const node of project.nodes) {
    if (!['dialogue', 'narration', 'choice'].includes(node.type)) {
      issue(node, `节点类型 ${node.type} 尚未完整实现（包括条件分支、结束、脚本和特效）。`);
    }
    if (!node.dialogues.length) issue(node, '至少需要一条台词，空节点在预览与 HTML 中行为不同。');
    if (node.nextNodeId && !ids.has(node.nextNodeId)) issue(node, `下一节点 ${node.nextNodeId} 不存在。`);
    if (node.backgroundId && !backgrounds.has(node.backgroundId)) issue(node, `背景 ${node.backgroundId} 无法打包。`);
    if (node.backgroundId && node.transition !== 'none') issue(node, `背景过渡 ${node.transition} 尚未实现。`);
    if (node.bgmId || node.sfxId || node.dialogues.some((line) => line.voiceAudioId)) issue(node, 'HTML 播放器尚不能播放工程音频或语音。');
    if (node.weatherEffect && node.weatherEffect !== 'none') issue(node, `天气 ${node.weatherEffect} 尚未实现。`);
    if (node.colorFilter && node.colorFilter !== 'none') issue(node, `滤镜 ${node.colorFilter} 尚未完成一致性验收。`);
    if (node.conditionRule) issue(node, '条件语义尚未在三端对齐，条件节点不能导出。');
    if (node.customScript?.trim() || node.visualBlocks.length) issue(node, '自定义脚本或视觉积木未由 HTML 执行。');
    if (node.childrenNodes?.length || node.elseChildrenNodes?.length) issue(node, '嵌套节点尚未由 HTML 执行。');
    if (node.screenTextConfig || node.cameraConfig || node.fadeConfig || node.settingsActionConfig || node.loopConfig || node.logicConfig || node.mediaAnimation) {
      issue(node, '屏幕文字、镜头、过渡、设置、循环或媒体动作尚未完整实现。');
    }
    if (node.toastMessage || node.unlockedClueTitle || node.variableKey || node.affectionTargetCharId || node.targetExpressionCharId) {
      issue(node, '节点动作或状态修改尚未完整实现。');
    }
    if (node.type === 'choice' && !node.choices.length) issue(node, '选项节点没有选项。');
    if (node.type !== 'choice' && node.choices.length) issue(node, '仅选项节点可以携带选项。');
    for (const choice of node.choices) {
      if (!choice.targetNodeId || !ids.has(choice.targetNodeId)) issue(node, `选项「${choice.text}」的目标节点不存在。`);
      if (choice.conditionExpr?.trim()) issue(node, `选项「${choice.text}」的条件表达式尚未支持。`);
    }
    for (const line of node.dialogues) {
      if (line.charAction && line.charAction !== 'none') issue(node, `台词「${line.id}」的角色动作尚未实现。`);
      if (line.expressionSpriteId && !sprites.has(line.expressionSpriteId)) issue(node, `表情素材 ${line.expressionSpriteId} 无法打包。`);
    }
    for (const placement of node.characters) {
      const profile = project.characters.find((character) => character.id === placement.characterId);
      if (!profile) { issue(node, `角色 ${placement.characterId} 不存在。`); continue; }
      const media = placement.mediaUrl || profile.mediaUrl || '';
      if (!media && !sprites.has(placement.spriteId)) issue(node, `角色素材 ${placement.spriteId} 无法打包。`);
      if (media && !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(media) &&
          !(allowWorkspaceReferences && /^moovn-asset:\/\//i.test(media))) {
        issue(node, '角色媒体不是已嵌入的图片；远程、视频、临时或未加载的素材 URL 尚不支持。');
      }
      if (placement.mediaType === 'video' || profile.mediaType === 'video') issue(node, '视频角色尚未完成 HTML 导出验收。');
      if (Object.keys(placement.layerTextures || profile.layerTextures || {}).length) issue(node, '分层角色动画尚未在 HTML 中实现。');
      if ((placement.idleMotion || profile.idleMotion) === 'breathe') issue(node, '旧整图呼吸已下线，HTML 不提供该动作。');
      if (placement.enterAnimation && placement.enterAnimation !== 'none') issue(node, `角色入场动作 ${placement.enterAnimation} 尚未实现。`);
      if (placement.highlight) issue(node, '角色高亮尚未完成 HTML 一致性验收。');
    }
  }
  return issues;
}

export function assertStandaloneHtmlSupported(project: VNProject): void {
  // The low-level builder must never emit unresolved workspace-only URLs.
  // The UI can first allow references, hydrate them, then call the builder.
  const issues = validateStandaloneHtmlProject(project, false);
  if (issues.length) {
    const first = issues.slice(0, 5).map((item) => `${item.nodeTitle || '工程'}${item.nodeId ? ` (${item.nodeId})` : ''}：${item.message}`).join('\n');
    throw new Error(`HTML 导出已阻止：发现 ${issues.length} 项未支持或无效的内容。\n${first}`);
  }
}
