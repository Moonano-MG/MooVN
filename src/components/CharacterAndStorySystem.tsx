import React, { useState } from 'react';
import {
  ChapterDef,
  CharacterDef,
  CustomAttribute,
  EditorTheme,
  EndingDef,
  SceneDef,
  StorylineDef,
} from '../types/moovn';

interface CharacterAndStorySystemProps {
  theme: EditorTheme;
  characters: CharacterDef[];
  chapters: ChapterDef[];
  scenes: SceneDef[];
  storylines: StorylineDef[];
  endings: EndingDef[];
  onChangeCharacters: React.Dispatch<React.SetStateAction<CharacterDef[]>>;
  onChangeChapters: React.Dispatch<React.SetStateAction<ChapterDef[]>>;
  onChangeStorylines: React.Dispatch<React.SetStateAction<StorylineDef[]>>;
  onChangeEndings: React.Dispatch<React.SetStateAction<EndingDef[]>>;
  onJumpToScene: (sceneId: string) => void;
}

export const CharacterAndStorySystem: React.FC<CharacterAndStorySystemProps> = ({
  theme,
  characters,
  chapters,
  scenes,
  storylines,
  endings,
  onChangeCharacters,
  onChangeChapters,
  onChangeStorylines,
  onChangeEndings,
  onJumpToScene,
}) => {
  const isDark = theme === 'dark';
  const [subTab, setSubTab] = useState<'characters' | 'chapters_endings'>('characters');
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || 'char_shizuki');
  const [newAttrKey, setNewAttrKey] = useState<string>('');
  const [newAttrLabel, setNewAttrLabel] = useState<string>('');
  const [newAttrType, setNewAttrType] = useState<'number' | 'string' | 'boolean'>('number');
  const [newAttrValue, setNewAttrValue] = useState<string>('50');

  const selectedChar = characters.find((c) => c.id === selectedCharId) || characters[0];

  const handleAddCharacter = () => {
    const id = `char_custom_${Date.now().toString().slice(-4)}`;
    const newChar: CharacterDef = {
      id,
      name: `新角色 #${characters.length + 1}`,
      roleTitle: '观测站特派员',
      themeColor: '#38bdf8',
      hairColor: '#93c5fd',
      eyeColor: '#0284c7',
      outfitColor: '#1e293b',
      bio: '新创建的视觉小说角色，支持好感度与无限自定义属性扩展。',
      initialAffection: 20,
      affection: 20,
      maxAffection: 100,
      expressions: ['normal', 'smile', 'shy', 'surprised', 'sad', 'serious'],
      customAttributes: [
        { key: 'courage', label: '勇气值', type: 'number', value: 60 },
        { key: 'title_badge', label: '专属称号', type: 'string', value: '新星观测者' },
      ],
    };
    onChangeCharacters((prev) => [...prev, newChar]);
    setSelectedCharId(id);
  };

  const handleAddCustomAttribute = () => {
    if (!selectedChar || !newAttrLabel.trim()) return;
    const key = newAttrKey.trim() || `attr_${Date.now().toString().slice(-4)}`;
    const parsedVal: number | string | boolean =
      newAttrType === 'number'
        ? Number(newAttrValue) || 0
        : newAttrType === 'boolean'
        ? newAttrValue === 'true'
        : newAttrValue;

    const attr: CustomAttribute = {
      key,
      label: newAttrLabel.trim(),
      type: newAttrType,
      value: parsedVal,
    };

    onChangeCharacters((prev) =>
      prev.map((c) =>
        c.id === selectedChar.id
          ? { ...c, customAttributes: [...c.customAttributes, attr] }
          : c
      )
    );
    setNewAttrKey('');
    setNewAttrLabel('');
    setNewAttrValue('50');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: isDark ? '#090d16' : '#f8fafc',
        color: isDark ? '#e2e8f0' : '#0f172a',
        overflow: 'hidden',
      }}
    >
      {/* Top Sub-Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: isDark ? '#0f172a' : '#ffffff',
          borderBottom: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
        }}
      >
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setSubTab('characters')}
            style={{
              padding: '7px 16px',
              background: subTab === 'characters' ? '#0284c7' : 'transparent',
              color: subTab === 'characters' ? '#fff' : isDark ? '#94a3b8' : '#475569',
              border: `1px solid ${subTab === 'characters' ? '#38bdf8' : isDark ? '#334155' : '#cbd5e1'}`,
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            👤 角色系统（好感度 + 自定义属性）
          </button>
          <button
            onClick={() => setSubTab('chapters_endings')}
            style={{
              padding: '7px 16px',
              background: subTab === 'chapters_endings' ? '#0284c7' : 'transparent',
              color: subTab === 'chapters_endings' ? '#fff' : isDark ? '#94a3b8' : '#475569',
              border: `1px solid ${subTab === 'chapters_endings' ? '#38bdf8' : isDark ? '#334155' : '#cbd5e1'}`,
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🌿 章节系统 · 多剧情线与多结局路由
          </button>
        </div>

        {subTab === 'characters' && (
          <button
            onClick={handleAddCharacter}
            style={{
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + 新建角色
          </button>
        )}
      </div>

      {/* SUBTAB 1: 角色系统 (好感度 & 自定义属性) */}
      {subTab === 'characters' && selectedChar && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Left Character List */}
          <div
            style={{
              width: 260,
              borderRight: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              padding: 14,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {characters.map((ch) => {
              const isSelected = ch.id === selectedChar.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedCharId(ch.id)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: isSelected
                      ? isDark
                        ? '#1e293b'
                        : '#e0f2fe'
                      : isDark
                      ? '#111827'
                      : '#ffffff',
                    border: `1.5px solid ${
                      isSelected ? ch.themeColor : isDark ? '#1e293b' : '#cbd5e1'
                    }`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ch.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 7px',
                        borderRadius: 10,
                        background: `${ch.themeColor}22`,
                        color: ch.themeColor,
                        fontWeight: 700,
                      }}
                    >
                      ♥ {ch.affection}/{ch.maxAffection}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
                    {ch.roleTitle}
                  </div>
                  {/* Affection bar */}
                  <div
                    style={{
                      marginTop: 8,
                      height: 5,
                      borderRadius: 3,
                      background: isDark ? '#090d16' : '#e2e8f0',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (ch.affection / ch.maxAffection) * 100)}%`,
                        height: '100%',
                        background: ch.themeColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Character Detail & Custom Attributes Editor */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                background: isDark ? '#111827' : '#ffffff',
                border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                borderRadius: 10,
                padding: 18,
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 12px 0', color: selectedChar.themeColor }}>
                  角色基础信息与配色
                </h3>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    角色姓名
                  </label>
                  <input
                    type="text"
                    value={selectedChar.name}
                    onChange={(e) =>
                      onChangeCharacters((prev) =>
                        prev.map((c) =>
                          c.id === selectedChar.id ? { ...c, name: e.target.value } : c
                        )
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                      background: isDark ? '#090d16' : '#f8fafc',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    角色头衔 / 身份
                  </label>
                  <input
                    type="text"
                    value={selectedChar.roleTitle}
                    onChange={(e) =>
                      onChangeCharacters((prev) =>
                        prev.map((c) =>
                          c.id === selectedChar.id ? { ...c, roleTitle: e.target.value } : c
                        )
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                      background: isDark ? '#090d16' : '#f8fafc',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    人物传记设定
                  </label>
                  <textarea
                    rows={3}
                    value={selectedChar.bio}
                    onChange={(e) =>
                      onChangeCharacters((prev) =>
                        prev.map((c) =>
                          c.id === selectedChar.id ? { ...c, bio: e.target.value } : c
                        )
                      )
                    }
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                      background: isDark ? '#090d16' : '#f8fafc',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Affection System Controls */}
              <div>
                <h3 style={{ margin: '0 0 12px 0', color: '#ec4899' }}>
                  ♥ 角色好感度系统 (Affection System)
                </h3>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span>当前好感度 (实时影响剧情分支与结局)</span>
                    <strong style={{ color: '#ec4899' }}>
                      {selectedChar.affection} / {selectedChar.maxAffection}
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={selectedChar.maxAffection}
                    value={selectedChar.affection}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChangeCharacters((prev) =>
                        prev.map((c) =>
                          c.id === selectedChar.id ? { ...c, affection: val } : c
                        )
                      );
                    }}
                    style={{ width: '100%', accentColor: '#ec4899' }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span>开启新游戏时的初始好感度</span>
                    <strong style={{ color: '#38bdf8' }}>{selectedChar.initialAffection}</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={selectedChar.maxAffection}
                    value={selectedChar.initialAffection}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      onChangeCharacters((prev) =>
                        prev.map((c) =>
                          c.id === selectedChar.id ? { ...c, initialAffection: val } : c
                        )
                      );
                    }}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>

                <div
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    background: isDark ? '#090d16' : '#f1f5f9',
                    fontSize: 12,
                    color: '#94a3b8',
                  }}
                >
                  当前羁绊阶段：{' '}
                  <strong style={{ color: '#38bdf8' }}>
                    {selectedChar.affection >= 60
                      ? '命运共鸣 (可解锁 TRUE END)'
                      : selectedChar.affection >= 35
                      ? '深层信赖 (可进入角色专属支线)'
                      : '初次相识 (默认主线)'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Custom Attributes Section (可以添加其他的自定义属性) */}
            <div
              style={{
                background: isDark ? '#111827' : '#ffffff',
                border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                borderRadius: 10,
                padding: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, color: '#38bdf8' }}>
                    自定义角色属性扩展（除好感度外可自由添加任意属性）
                  </h3>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                    支持数值型 (如同步率/SAN值)、文本型 (如持有信物/权限)、布尔型 (如是否觉醒)，可在选项与脚本中直接读写
                  </div>
                </div>
              </div>

              {/* Existing Custom Attributes Table */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                {selectedChar.customAttributes.map((attr) => (
                  <div
                    key={attr.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isDark ? '#090d16' : '#f8fafc',
                      border: `1px solid ${isDark ? '#1e293b' : '#cbd5e1'}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{attr.label}</div>
                      <div style={{ fontSize: 10.5, color: '#64748b' }}>
                        变量键名: <code>{attr.key}</code> ({attr.type})
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {attr.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(attr.value)}
                          onChange={(e) =>
                            onChangeCharacters((prev) =>
                              prev.map((c) =>
                                c.id === selectedChar.id
                                  ? {
                                      ...c,
                                      customAttributes: c.customAttributes.map((a) =>
                                        a.key === attr.key ? { ...a, value: e.target.checked } : a
                                      ),
                                    }
                                  : c
                              )
                            )
                          }
                        />
                      ) : (
                        <input
                          type={attr.type === 'number' ? 'number' : 'text'}
                          value={String(attr.value)}
                          onChange={(e) =>
                            onChangeCharacters((prev) =>
                              prev.map((c) =>
                                c.id === selectedChar.id
                                  ? {
                                      ...c,
                                      customAttributes: c.customAttributes.map((a) =>
                                        a.key === attr.key
                                          ? {
                                              ...a,
                                              value:
                                                attr.type === 'number'
                                                  ? Number(e.target.value)
                                                  : e.target.value,
                                            }
                                          : a
                                      ),
                                    }
                                  : c
                              )
                            )
                          }
                          style={{
                            width: 95,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                            background: isDark ? '#111827' : '#fff',
                            color: '#38bdf8',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        />
                      )}
                      <button
                        onClick={() =>
                          onChangeCharacters((prev) =>
                            prev.map((c) =>
                              c.id === selectedChar.id
                                ? {
                                    ...c,
                                    customAttributes: c.customAttributes.filter(
                                      (a) => a.key !== attr.key
                                    ),
                                  }
                                : c
                            )
                          )
                        }
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Custom Attribute Row */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  paddingTop: 12,
                  borderTop: `1px dashed ${isDark ? '#1e293b' : '#cbd5e1'}`,
                }}
              >
                <input
                  type="text"
                  placeholder="属性显示名称 (如: 魔力值 / 勇气)"
                  value={newAttrLabel}
                  onChange={(e) => setNewAttrLabel(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12,
                  }}
                />
                <input
                  type="text"
                  placeholder="英文键名 (如: mana)"
                  value={newAttrKey}
                  onChange={(e) => setNewAttrKey(e.target.value)}
                  style={{
                    width: 140,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12,
                  }}
                />
                <select
                  value={newAttrType}
                  onChange={(e) => setNewAttrType(e.target.value as any)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12,
                  }}
                >
                  <option value="number">数值 (Number)</option>
                  <option value="string">文本 (String)</option>
                  <option value="boolean">布尔 (Boolean)</option>
                </select>
                <input
                  type="text"
                  placeholder="初始值"
                  value={newAttrValue}
                  onChange={(e) => setNewAttrValue(e.target.value)}
                  style={{
                    width: 90,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    background: isDark ? '#090d16' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: 12,
                  }}
                />
                <button
                  onClick={handleAddCustomAttribute}
                  style={{
                    padding: '6px 14px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  + 添加属性
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: 章节系统 · 不同剧情线与不同结局 */}
      {subTab === 'chapters_endings' && (
        <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Storylines Section */}
          <div
            style={{
              background: isDark ? '#111827' : '#ffffff',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>
                不同剧情线系统 (Branching Storylines)
              </h3>
              <button
                onClick={() => {
                  const id = `line_${Date.now().toString().slice(-4)}`;
                  onChangeStorylines((prev) => [
                    ...prev,
                    {
                      id,
                      name: `新支线剧情 #${prev.length + 1}`,
                      color: '#f472b6',
                      description: '通过好感度或特定选项触发的全新世界线分支。',
                      unlockCondition: '好感度 >= 40 或 触发隐藏选项',
                    },
                  ]);
                }}
                style={{
                  padding: '5px 12px',
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                + 新增剧情线
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {storylines.map((line) => (
                <div
                  key={line.id}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: isDark ? '#090d16' : '#f8fafc',
                    border: `1.5px solid ${line.color}`,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: line.color }}>
                    {line.name}
                  </div>
                  <div style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#334155', margin: '6px 0' }}>
                    {line.description}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: `${line.color}18`,
                      color: line.color,
                    }}
                  >
                    进入条件：{line.unlockCondition}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chapters & Scene Count Overview */}
          <div
            style={{
              background: isDark ? '#111827' : '#ffffff',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#38bdf8' }}>
                章节系统 (Chapters &gt; Scenes 层级架构)
              </h3>
              <button
                onClick={() => {
                  const num = chapters.length + 1;
                  onChangeChapters((prev) => [
                    ...prev,
                    {
                      id: `chap_${num}_${Date.now().toString().slice(-3)}`,
                      number: num,
                      title: `第${num}章：新篇章`,
                      subtitle: `Chapter 0${num}`,
                      storylineId: storylines[0]?.id || 'line_main_blue',
                      description: '新创建的章节节点，可在左侧文件管理器中添加场景。',
                    },
                  ]);
                }}
                style={{
                  padding: '5px 12px',
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                + 新建章节
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {chapters.map((chap) => {
                const chapScenes = scenes.filter((s) => s.chapterId === chap.id);
                return (
                  <div
                    key={chap.id}
                    style={{
                      padding: 14,
                      borderRadius: 8,
                      background: isDark ? '#090d16' : '#f8fafc',
                      border: `1px solid ${isDark ? '#1e293b' : '#cbd5e1'}`,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#38bdf8' }}>
                      {chap.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                      {chap.subtitle} · 包含 {chapScenes.length} 个独立场景
                    </div>
                    <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#475569', marginBottom: 10 }}>
                      {chap.description}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {chapScenes.map((sc) => (
                        <button
                          key={sc.id}
                          onClick={() => onJumpToScene(sc.id)}
                          style={{
                            padding: '3px 8px',
                            background: 'rgba(56, 189, 248, 0.14)',
                            border: '1px solid #0284c7',
                            color: '#38bdf8',
                            borderRadius: 4,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          场景 {sc.globalNumber}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multiple Endings System */}
          <div
            style={{
              background: isDark ? '#111827' : '#ffffff',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#f59e0b' }}>
                多结局系统 (基于好感度或关键选项动态解锁)
              </h3>
              <button
                onClick={() => {
                  onChangeEndings((prev) => [
                    ...prev,
                    {
                      id: `end_custom_${Date.now().toString().slice(-4)}`,
                      code: `SECRET END · 0${prev.length + 1}`,
                      title: '隐藏结局：时间观测者的秘密',
                      type: 'TRUE',
                      storylineId: storylines[0]?.id || 'line_main_blue',
                      conditionText: '全角色好感度 >= 40 且 掌握线索数 >= 5',
                      description: '在所有平行世界线中收集齐全部观测碎片后解锁的隐藏真结局。',
                      bgPreset: 'dawn_harbor',
                    },
                  ]);
                }}
                style={{
                  padding: '5px 12px',
                  background: '#f59e0b',
                  color: '#090d16',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + 新增结局分支
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {endings.map((ending) => (
                <div
                  key={ending.id}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: isDark ? '#090d16' : '#f8fafc',
                    border: `1.5px solid ${
                      ending.type === 'TRUE'
                        ? '#f59e0b'
                        : ending.type === 'GOOD'
                        ? '#38bdf8'
                        : ending.type === 'NORMAL'
                        ? '#10b981'
                        : '#ef4444'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>
                      {ending.code} — {ending.title}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        fontWeight: 700,
                      }}
                    >
                      {ending.type} ENDING
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0' }}>
                    {ending.description}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#f59e0b', fontWeight: 600 }}>
                    触发条件：{ending.conditionText}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
