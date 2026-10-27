import { newId } from '../lib/ids';
import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { NestedChildNode, WorkflowNodeType, NodeCategory } from '../types';
import { getNodeMeta, NODE_CATEGORIES, NODE_REGISTRY, isUnsupportedNode } from '../data/nodeRegistry';

interface ScratchBlockTreeProps {
  blocks: NestedChildNode[];
  onChange: (nextBlocks: NestedChildNode[]) => void;
  compact?: boolean;
}

const DEFAULT_PARAMS_BY_TYPE: Partial<
  Record<WorkflowNodeType, Record<string, string | number | boolean>>
> = {
  repeat_loop: { repeatCount: 3 },
  while_loop: { conditionExpr: 'ctx.vars.clueCount < 5' },
  for_each_loop: { collectionTarget: 'characters', iteratorVar: 'char' },
  if_else_container: { conditionExpr: 'ctx.vars.flag == true' },
  parallel_container: { mode: 'Promise.all' },
  try_catch_container: { catchVar: 'err' },
  math_operation: { targetVar: 'clueCount', mathOp: '+=', operandValue: 1 },
  string_format: {
    targetVar: 'statusText',
    formatTemplate: '第 ${loopDay} 日 · 线索 ${clueCount}',
  },
  array_operation: {
    targetVar: 'inventory',
    arrayAction: 'push',
    operandValue: '',
  },
  set_variable: { targetVar: 'flag', value: true },
  break_continue: { mode: 'break' },
  function_call: { functionName: 'onEvent', functionArgs: 'ctx' },
  dialogue: { speaker: '旁白', text: '' },
  narration: { text: '' },
  screen_text: { text: '', x: 50, y: 45, fontSize: 32 },
  char_enter: { charId: '', x: 35, y: 55, anim: 'fade' },
  char_move: { charId: '', x: 60, y: 55, durationMs: 600 },
  char_expression: { charId: '', spriteId: '' },
  affection_change: { charId: '', delta: 10 },
  bg_switch: { bgId: '', transition: 'dissolve' },
  fade: { target: 'screen', direction: 'in', durationMs: 800 },
  camera_pan_zoom: { zoom: 1.25, offsetX: 0, offsetY: 0 },
  camera_shake: { intensity: 'medium', durationMs: 450 },
  screen_flash: { color: '#ffffff', durationMs: 300 },
  weather_particles: { effect: 'sakura' },
  color_filter: { filter: 'sepia' },
  bgm_play: { bgmId: '' },
  sfx_play: { sfxId: '' },
  wait_timer: { durationMs: 800 },
  popup_toast: { message: '' },
};

export function createDefaultScratchChild(type: WorkflowNodeType): NestedChildNode {
  const meta = getNodeMeta(type);
  const baseParams = DEFAULT_PARAMS_BY_TYPE[type] || { value: meta.title };
  return {
    id: newId('sb'),
    type,
    title: meta.title,
    params: { ...baseParams },
    childrenNodes: meta.isContainer
      ? [
          {
            id: newId('sb-inner'),
            type: 'dialogue',
            title: '角色对白',
            params: { speaker: '旁白', text: '' },
          },
        ]
      : undefined,
    elseChildrenNodes: meta.hasDualSlots ? [] : undefined,
  };
}

/**
 * 真实 Scratch 凹凸拼图积木与 C 型多重嵌套容器组件
 */
export const ScratchBlockTree: React.FC<ScratchBlockTreeProps> = ({
  blocks,
  onChange,
  compact = false,
}) => {
  const [openAddSlotId, setOpenAddSlotId] = useState<string | null>(null);
  const [selectedAddCat, setSelectedAddCat] = useState<NodeCategory>('loop_logic');

  const updateBlockAtList = (
    list: NestedChildNode[],
    idx: number,
    updater: (item: NestedChildNode) => NestedChildNode
  ): NestedChildNode[] => list.map((item, i) => (i === idx ? updater(item) : item));

  const removeBlockAtList = (
    list: NestedChildNode[],
    idx: number
  ): NestedChildNode[] => list.filter((_, i) => i !== idx);

  const moveBlockInList = (
    list: NestedChildNode[],
    idx: number,
    dir: -1 | 1
  ): NestedChildNode[] => {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return list;
    const copy = [...list];
    const [removed] = copy.splice(idx, 1);
    copy.splice(target, 0, removed);
    return copy;
  };

  // Render inline pill inputs inside a Scratch block header
  const renderInlineBlockParams = (
    block: NestedChildNode,
    onUpdateParam: (k: string, v: string | number | boolean) => void
  ) => {
    const entries = Object.entries(block.params);
    if (entries.length === 0) {
      return <span className="opacity-90">{block.title}</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-bold tracking-tight mr-0.5">{block.title}</span>
        {entries.map(([k, v]) => (
          <label
            key={k}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 bg-black/30 border border-white/25 rounded-full px-2 py-0.5 text-[10px] text-white shadow-inner"
          >
            <span className="text-white/70 font-mono text-[9px]">{k}:</span>
            <input
              type={typeof v === 'number' ? 'number' : 'text'}
              value={String(v)}
              onChange={(e) =>
                onUpdateParam(
                  k,
                  typeof v === 'number'
                    ? Number(e.target.value)
                    : e.target.value
                )
              }
              style={{
                width:
                  typeof v === 'number'
                    ? '42px'
                    : `${Math.min(130, Math.max(48, String(v).length * 9))}px`,
              }}
              className="!bg-transparent !border-none !p-0 !m-0 text-[10px] font-mono text-white focus:outline-none text-center"
            />
          </label>
        ))}
      </div>
    );
  };

  // Categorized Scratch Block Picker Popover
  const renderAddPopover = (
    slotKey: string,
    onPickType: (type: WorkflowNodeType) => void
  ) => {
    if (openAddSlotId !== slotKey) return null;
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-1 p-2 rounded-lg bg-[#18181f] border border-zinc-600 shadow-2xl space-y-1.5 z-40 relative"
      >
        <div className="flex flex-wrap gap-1 pb-1 border-b border-zinc-700/80">
          {NODE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedAddCat(cat.id)}
              style={{
                backgroundColor:
                  selectedAddCat === cat.id ? cat.color : `${cat.color}22`,
                color: selectedAddCat === cat.id ? '#09090b' : cat.color,
              }}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold transition"
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
          {NODE_REGISTRY.filter((n) => n.category === selectedAddCat).map(
            (meta) => (
              <button
                key={meta.type}
                        disabled={isUnsupportedNode(meta.type)}
                onClick={() => {
                  onPickType(meta.type);
                  setOpenAddSlotId(null);
                }}
                style={{
                  backgroundColor: meta.accentColor,
                  color: '#09090b',
                }}
                className="px-2 py-1 rounded text-[10px] font-bold text-left flex items-center justify-between hover:brightness-110 transition shadow-sm"
              >
                <span className="truncate">{meta.title}{isUnsupportedNode(meta.type) ? '（未实现）' : ''}</span>
                {meta.isContainer && (
                  <span className="px-1 rounded bg-black/25 text-white text-[8px]">
                    C型槽
                  </span>
                )}
              </button>
            )
          )}
        </div>
      </div>
    );
  };

  const renderBlockStack = (
    list: NestedChildNode[],
    onUpdateStack: (next: NestedChildNode[]) => void,
    slotKeyPrefix: string
  ): React.ReactNode => {
    return (
      <div className="space-y-0.5">
        {list.map((block, idx) => {
          const meta = getNodeMeta(block.type);
          const isContainer = Boolean(meta.isContainer);
          const hasDual = Boolean(meta.hasDualSlots);
          const color = meta.accentColor;

          const handleParamChange = (
            k: string,
            v: string | number | boolean
          ) => {
            onUpdateStack(
              updateBlockAtList(list, idx, (item) => ({
                ...item,
                params: { ...item.params, [k]: v },
              }))
            );
          };

          if (isContainer) {
            const innerSlotKey = `${slotKeyPrefix}-${block.id}-main`;
            const elseSlotKey = `${slotKeyPrefix}-${block.id}-else`;
            return (
              <div
                key={block.id}
                onClick={(e) => e.stopPropagation()}
                className="relative select-none"
              >
                {/* C-Block Top Arm with Scratch Puzzle Notch */}
                <div
                  style={{
                    backgroundColor: color,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                  }}
                  className="relative rounded-t-md rounded-br-md px-2.5 py-1.5 text-zinc-950 font-semibold text-[11px] flex items-center justify-between gap-1.5 shadow"
                >
                  {/* Top Puzzle Notch Cutout Indicator */}
                  <div className="absolute -top-1 left-4 w-4 h-1.5 rounded-b bg-black/35" />

                  <div className="min-w-0 flex-1">
                    {renderInlineBlockParams(block, handleParamChange)}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {!compact && (
                      <>
                        <button
                          onClick={() =>
                            onUpdateStack(moveBlockInList(list, idx, -1))
                          }
                          className="p-0.5 rounded hover:bg-black/20 text-zinc-950"
                          title="上移积木"
                        >
                          <ArrowUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          onClick={() =>
                            onUpdateStack(moveBlockInList(list, idx, 1))
                          }
                          className="p-0.5 rounded hover:bg-black/20 text-zinc-950"
                          title="下移积木"
                        >
                          <ArrowDown className="w-2.5 h-2.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        onUpdateStack(removeBlockAtList(list, idx))
                      }
                      className="p-0.5 rounded hover:bg-black/20 text-zinc-950"
                      title="移除此容器积木"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* C-Block Indented Mouth (Left Spine + Inner Nested Stack) */}
                <div
                  style={{ borderLeftColor: color }}
                  className="border-l-[12px] pl-2 py-1.5 bg-black/25 rounded-r space-y-1"
                >
                  {(block.childrenNodes || []).length === 0 ? (
                    <div className="px-2 py-1 rounded border border-dashed border-zinc-600 text-[10px] text-zinc-400">
                      空槽：点击下方「+ 嵌入积木」添加内部节点
                    </div>
                  ) : (
                    renderBlockStack(
                      block.childrenNodes || [],
                      (nextInner) =>
                        onUpdateStack(
                          updateBlockAtList(list, idx, (item) => ({
                            ...item,
                            childrenNodes: nextInner,
                          }))
                        ),
                      innerSlotKey
                    )
                  )}

                  <button
                    onClick={() =>
                      setOpenAddSlotId(
                        openAddSlotId === innerSlotKey ? null : innerSlotKey
                      )
                    }
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-zinc-200 flex items-center gap-1 transition"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    嵌入积木
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  {renderAddPopover(innerSlotKey, (pickedType) => {
                    onUpdateStack(
                      updateBlockAtList(list, idx, (item) => ({
                        ...item,
                        childrenNodes: [
                          ...(item.childrenNodes || []),
                          createDefaultScratchChild(pickedType),
                        ],
                      }))
                    );
                  })}
                </div>

                {/* Optional Dual Slot ('否则 / ELSE' or '异常捕获 / CATCH') */}
                {hasDual && (
                  <>
                    <div
                      style={{ backgroundColor: color }}
                      className="px-2.5 py-1 text-[10px] font-bold text-zinc-950"
                    >
                      {block.type === 'try_catch_container'
                        ? '捕获异常 (catch)'
                        : '否则 (else)'}
                    </div>
                    <div
                      style={{ borderLeftColor: color }}
                      className="border-l-[12px] pl-2 py-1.5 bg-black/25 rounded-r space-y-1"
                    >
                      {renderBlockStack(
                        block.elseChildrenNodes || [],
                        (nextElse) =>
                          onUpdateStack(
                            updateBlockAtList(list, idx, (item) => ({
                              ...item,
                              elseChildrenNodes: nextElse,
                            }))
                          ),
                        elseSlotKey
                      )}
                      <button
                        onClick={() =>
                          setOpenAddSlotId(
                            openAddSlotId === elseSlotKey ? null : elseSlotKey
                          )
                        }
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] text-zinc-200 flex items-center gap-1 transition"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        向否则槽嵌入积木
                      </button>
                      {renderAddPopover(elseSlotKey, (pickedType) => {
                        onUpdateStack(
                          updateBlockAtList(list, idx, (item) => ({
                            ...item,
                            elseChildrenNodes: [
                              ...(item.elseChildrenNodes || []),
                              createDefaultScratchChild(pickedType),
                            ],
                          }))
                        );
                      })}
                    </div>
                  </>
                )}

                {/* C-Block Bottom Closing Foot */}
                <div
                  style={{ backgroundColor: color }}
                  className="h-3 rounded-b-md relative shadow"
                >
                  <div
                    style={{ backgroundColor: color }}
                    className="absolute -bottom-1 left-4 w-4 h-1.5 rounded-b"
                  />
                </div>
              </div>
            );
          }

          // Standard Interlocking Scratch Stack Block
          return (
            <div
              key={block.id}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: color,
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px rgba(0,0,0,0.35)',
              }}
              className="relative rounded-md px-2.5 py-1.5 text-zinc-950 font-semibold text-[11px] flex items-center justify-between gap-1.5 select-none"
            >
              {/* Top Notch & Bottom Puzzle Tab */}
              <div className="absolute -top-0.5 left-4 w-4 h-1 rounded-b bg-black/30" />
              <div
                style={{ backgroundColor: color }}
                className="absolute -bottom-1 left-4 w-4 h-1.5 rounded-b z-10"
              />

              <div className="min-w-0 flex-1">
                {renderInlineBlockParams(block, handleParamChange)}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {!compact && (
                  <>
                    <button
                      onClick={() =>
                        onUpdateStack(moveBlockInList(list, idx, -1))
                      }
                      className="p-0.5 rounded hover:bg-black/20 text-zinc-950"
                      title="上移积木"
                    >
                      <ArrowUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() =>
                        onUpdateStack(moveBlockInList(list, idx, 1))
                      }
                      className="p-0.5 rounded hover:bg-black/20 text-zinc-950"
                      title="下移积木"
                    >
                      <ArrowDown className="w-2.5 h-2.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onUpdateStack(removeBlockAtList(list, idx))}
                  className="p-0.5 rounded hover:bg-black/20 text-zinc-950"
                  title="删除积木"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const rootSlotKey = 'root-scratch-slot';

  return (
    <div className="space-y-1.5">
      {renderBlockStack(blocks, onChange, 'root')}

      <div className="pt-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenAddSlotId(openAddSlotId === rootSlotKey ? null : rootSlotKey);
          }}
          className="px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[11px] font-medium flex items-center gap-1 transition"
        >
          <Plus className="w-3 h-3" />
          添加积木 / 嵌套容器 (多重添加)
          <ChevronDown className="w-3 h-3" />
        </button>

        {renderAddPopover(rootSlotKey, (pickedType) => {
          onChange([...blocks, createDefaultScratchChild(pickedType)]);
        })}
      </div>
    </div>
  );
};
