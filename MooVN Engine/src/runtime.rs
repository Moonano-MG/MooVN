//! Complete Visual Novel Runtime for MooVN Engine.
//!
//! Manages the live scene graph (backgrounds, static & video character actors,
//! camera transforms, weather particles, audio tracks, dialogue backlog, branching
//! expression evaluator, and 12-tab save/load state).

use std::collections::HashMap;

use crate::ir::{ActorMediaKind, EngineOp, SourceLanguage};
use crate::renderer::{RenderLayerCommand, RendererBridge};
use crate::save::{SaveManager, SaveSlotRecord};
use crate::translator::PolyglotTranslator;

#[derive(Debug, Clone)]
pub struct StageCharacterActor {
    pub char_id: String,
    pub sprite_or_media_url: String,
    pub media_kind: ActorMediaKind,
    pub x_norm: f32,
    pub y_norm: f32,
    pub scale: f32,
    pub opacity: f32,
    pub flip_x: bool,
    pub motion_action: String,
}

#[derive(Debug, Clone)]
pub struct DialogueBacklogEntry {
    pub chapter_id: String,
    pub node_id: String,
    pub speaker: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct ActiveChoiceOption {
    pub label: String,
    pub target_node_id: String,
}

#[derive(Debug, Clone, Default)]
pub struct VNWorldState {
    pub current_chapter_id: String,
    pub current_node_id: String,
    pub dialogue_index: usize,
    pub active_background: String,
    pub active_bgm: String,
    pub active_weather: String,
    pub active_weather_intensity: u8,
    pub active_filter: String,
    pub active_filter_intensity: u8,
    pub camera_zoom: f32,
    pub camera_offset_x: f32,
    pub camera_offset_y: f32,
    pub stage_actors: HashMap<String, StageCharacterActor>,
    pub variables: HashMap<String, String>,
    pub affection: HashMap<String, i32>,
    pub unlocked_clues: Vec<(String, String)>,
    pub backlog: Vec<DialogueBacklogEntry>,
    pub pending_choices: Vec<ActiveChoiceOption>,
    pub mounted_msvn_chapters: Vec<String>,
}

pub struct MooVNEngineRuntime {
    pub state: VNWorldState,
    pub saves: SaveManager,
    pub renderer: RendererBridge,
    pub execution_logs: Vec<String>,
}

impl Default for MooVNEngineRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl MooVNEngineRuntime {
    pub fn new() -> Self {
        Self {
            state: VNWorldState {
                current_chapter_id: "ch-1".to_string(),
                current_node_id: "node-1".to_string(),
                dialogue_index: 0,
                active_background: "bg-classroom-day".to_string(),
                active_bgm: String::new(),
                active_weather: "none".to_string(),
                active_weather_intensity: 0,
                active_filter: "none".to_string(),
                active_filter_intensity: 0,
                camera_zoom: 1.0,
                camera_offset_x: 0.0,
                camera_offset_y: 0.0,
                stage_actors: HashMap::new(),
                variables: HashMap::new(),
                affection: HashMap::new(),
                unlocked_clues: Vec::new(),
                backlog: Vec::new(),
                pending_choices: Vec::new(),
                mounted_msvn_chapters: Vec::new(),
            },
            saves: SaveManager::new(),
            renderer: RendererBridge::new(),
            execution_logs: Vec::new(),
        }
    }

    /// Creates a `MooVNEngineRuntime` whose `SaveManager` persists slots atomically to `dir` (`GPT-60`).
    pub fn with_save_dir(dir: impl Into<std::path::PathBuf>) -> Result<Self, String> {
        let mut rt = Self::new();
        rt.saves = SaveManager::with_storage_dir(dir)?;
        Ok(rt)
    }

    /// Evaluates a boolean condition expression against current variables and character affection.
    /// Supports `&&`, `||`, `>=`, `<=`, `==`, `!=`, `>`, `<`.
    pub fn eval_condition(&self, expr: &str) -> bool {
        let trimmed = expr.trim();
        if trimmed.is_empty() || trimmed == "true" || trimmed == "1" {
            return true;
        }
        if trimmed == "false" || trimmed == "0" {
            return false;
        }
        if trimmed.contains("||") {
            return trimmed.split("||").any(|part| self.eval_condition(part));
        }
        if trimmed.contains("&&") {
            return trimmed.split("&&").all(|part| self.eval_condition(part));
        }

        let ops = [">=", "<=", "==", "!=", ">", "<"];
        for op in ops {
            if let Some(idx) = trimmed.find(op) {
                let lhs_key = trimmed[..idx].trim();
                let rhs_raw = trimmed[idx + op.len()..]
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');

                let lhs_str = if let Some(char_id) = lhs_key.strip_prefix("affection.") {
                    self.state
                        .affection
                        .get(char_id)
                        .copied()
                        .unwrap_or(50)
                        .to_string()
                } else {
                    self.state
                        .variables
                        .get(lhs_key)
                        .cloned()
                        .unwrap_or_else(|| "0".to_string())
                };

                if let (Ok(lhs_num), Ok(rhs_num)) = (lhs_str.parse::<f64>(), rhs_raw.parse::<f64>())
                {
                    return match op {
                        ">=" => lhs_num >= rhs_num,
                        "<=" => lhs_num <= rhs_num,
                        "==" => (lhs_num - rhs_num).abs() < f64::EPSILON,
                        "!=" => (lhs_num - rhs_num).abs() >= f64::EPSILON,
                        ">" => lhs_num > rhs_num,
                        "<" => lhs_num < rhs_num,
                        _ => false,
                    };
                } else {
                    return match op {
                        "==" => lhs_str == rhs_raw,
                        "!=" => lhs_str != rhs_raw,
                        _ => false,
                    };
                }
            }
        }

        self.state
            .variables
            .get(trimmed)
            .map(|v| v != "false" && v != "0" && !v.is_empty())
            .unwrap_or(false)
    }

    /// Evaluates a script written in JS, TS, C++, C#, or Rust.
    pub fn eval_polyglot_script(&mut self, script: &str, lang: SourceLanguage) -> Vec<String> {
        let (program, _diags) = PolyglotTranslator::compile_to_ir(script, lang);
        let mut logs = Vec::new();
        for op in &program.operations {
            let msg = self.execute_op(op.clone());
            logs.push(msg);
        }
        logs
    }

    pub fn execute_op(&mut self, op: EngineOp) -> String {
        let log_line = match op {
            EngineOp::SaveCreate { slot_name } => {
                let record = self.snapshot_to_save_record(&slot_name);
                let saved = self.saves.create_save(record);
                format!(
                    "[MooVN Engine::Save] 已创建存档 '{}' (checksum={:016x}, node={})",
                    saved.slot_name, saved.checksum_fnv1a, saved.node_id
                )
            }
            EngineOp::SaveLoad { slot_name } => {
                if let Some(rec) = self.saves.load_save(&slot_name).cloned() {
                    self.restore_from_save_record(&rec);
                    format!(
                        "[MooVN Engine::Save] 已读取存档 '{}' -> 恢复至节点 {}",
                        rec.slot_name, rec.node_id
                    )
                } else {
                    format!("[MooVN Engine::Save] 存档 '{}' 不存在", slot_name)
                }
            }
            EngineOp::SaveDelete { slot_name } => {
                let removed = self.saves.delete_save(&slot_name);
                format!(
                    "[MooVN Engine::Save] 删除存档 '{}' (结果={})",
                    slot_name, removed
                )
            }
            EngineOp::SaveQuickSave => {
                let record = self.snapshot_to_save_record("QuickSave_01");
                self.saves.create_save(record);
                "[MooVN Engine::Save] 已执行快速存档 (QuickSave_01)".to_string()
            }
            EngineOp::SaveQuickLoad => {
                if let Some(rec) = self.saves.load_save("QuickSave_01").cloned() {
                    self.restore_from_save_record(&rec);
                    "[MooVN Engine::Save] 已读取快速存档 (QuickSave_01)".to_string()
                } else {
                    "[MooVN Engine::Save] 尚无快速存档记录".to_string()
                }
            }
            EngineOp::SaveAutoSave => {
                let record = self.snapshot_to_save_record("AutoSave_01");
                self.saves.create_save(record);
                "[MooVN Engine::Save] 已触发自动存档 (AutoSave_01)".to_string()
            }
            EngineOp::SaveList => {
                let count = self.saves.list_saves().len();
                format!("[MooVN Engine::Save] 当前共有 {} 个有效存档", count)
            }
            EngineOp::BgShow { bg_id, transition } => {
                self.state.active_background = bg_id.clone();
                self.renderer.push_command(RenderLayerCommand::DrawBackground {
                    bg_id: bg_id.clone(),
                    transition: transition.clone(),
                });
                format!("[MooVN Engine::BG] 切换背景 '{}' (过渡={})", bg_id, transition)
            }
            EngineOp::BgWeather { effect, intensity } => {
                self.state.active_weather = effect.clone();
                self.state.active_weather_intensity = intensity;
                self.renderer
                    .push_command(RenderLayerCommand::ApplyWeatherParticles {
                        effect: effect.clone(),
                        intensity,
                    });
                format!(
                    "[MooVN Engine::Weather] 粒子天气 '{}' (强度={}%)",
                    effect, intensity
                )
            }
            EngineOp::BgFilter {
                filter_name,
                intensity,
            } => {
                self.state.active_filter = filter_name.clone();
                self.state.active_filter_intensity = intensity;
                self.renderer
                    .push_command(RenderLayerCommand::ApplyColorFilter {
                        filter_name: filter_name.clone(),
                        intensity,
                    });
                format!(
                    "[MooVN Engine::Filter] 滤镜 '{}' (强度={}%)",
                    filter_name, intensity
                )
            }
            EngineOp::CharEnter { char_id, position } => {
                let x = match position.as_str() {
                    "left" => 0.25,
                    "right" => 0.75,
                    _ => 0.50,
                };
                let sprite_id = format!("{}-1", char_id);
                self.state.stage_actors.insert(
                    char_id.clone(),
                    StageCharacterActor {
                        char_id: char_id.clone(),
                        sprite_or_media_url: sprite_id.clone(),
                        media_kind: ActorMediaKind::StaticImage,
                        x_norm: x,
                        y_norm: 0.58,
                        scale: 1.0,
                        opacity: 1.0,
                        flip_x: false,
                        motion_action: "idle".to_string(),
                    },
                );
                self.renderer
                    .push_command(RenderLayerCommand::DrawCharacterSprite {
                        char_id: char_id.clone(),
                        sprite_id,
                        x_norm: x,
                        y_norm: 0.58,
                        scale: 1.0,
                        opacity: 1.0,
                    });
                format!(
                    "[MooVN Engine::Char] 角色 '{}' 登场 (位置={})",
                    char_id, position
                )
            }
            EngineOp::CharExit { char_id } => {
                self.state.stage_actors.remove(&char_id);
                format!("[MooVN Engine::Char] 角色 '{}' 退场", char_id)
            }
            EngineOp::CharExpression { char_id, sprite_id } => {
                if let Some(actor) = self.state.stage_actors.get_mut(&char_id) {
                    actor.sprite_or_media_url = sprite_id.clone();
                }
                format!(
                    "[MooVN Engine::Char] 角色 '{}' 切换立绘 -> '{}'",
                    char_id, sprite_id
                )
            }
            EngineOp::CharVideo {
                char_id,
                video_url,
                loop_video,
                chroma_key,
            } => {
                self.state.stage_actors.insert(
                    char_id.clone(),
                    StageCharacterActor {
                        char_id: char_id.clone(),
                        sprite_or_media_url: video_url.clone(),
                        media_kind: ActorMediaKind::VideoClip {
                            loop_video,
                            chroma_key_hex: chroma_key.clone(),
                            playback_rate: 1.0,
                        },
                        x_norm: 0.50,
                        y_norm: 0.58,
                        scale: 1.0,
                        opacity: 1.0,
                        flip_x: false,
                        motion_action: "video_loop".to_string(),
                    },
                );
                format!(
                    "[MooVN Engine::CharVideo] 角色 '{}' 播放动态视频立绘 '{}' (loop={}, chroma={:?})",
                    char_id, video_url, loop_video, chroma_key
                )
            }
            EngineOp::CharMove {
                char_id,
                x,
                y,
                duration_ms,
            } => {
                if let Some(actor) = self.state.stage_actors.get_mut(&char_id) {
                    actor.x_norm = x;
                    actor.y_norm = y;
                }
                format!(
                    "[MooVN Engine::Char] 角色 '{}' 移动至 ({}, {}) 耗时 {}ms",
                    char_id, x, y, duration_ms
                )
            }
            EngineOp::CharAction { char_id, action } => {
                if let Some(actor) = self.state.stage_actors.get_mut(&char_id) {
                    actor.motion_action = action.clone();
                }
                format!(
                    "[MooVN Engine::Char] 角色 '{}' 执行动画 '{}'",
                    char_id, action
                )
            }
            EngineOp::CharAffection { char_id, delta } => {
                let entry = self.state.affection.entry(char_id.clone()).or_insert(50);
                *entry += delta;
                format!(
                    "[MooVN Engine::Affection] 角色 '{}' 好感度 {:+} -> 当前 {}",
                    char_id, delta, *entry
                )
            }
            EngineOp::TextSay { speaker, text } => {
                self.state.backlog.push(DialogueBacklogEntry {
                    chapter_id: self.state.current_chapter_id.clone(),
                    node_id: self.state.current_node_id.clone(),
                    speaker: speaker.clone(),
                    text: text.clone(),
                });
                format!("[MooVN Engine::Dialogue] {}: 「{}」", speaker, text)
            }
            EngineOp::TextNarrate { text } => {
                self.state.backlog.push(DialogueBacklogEntry {
                    chapter_id: self.state.current_chapter_id.clone(),
                    node_id: self.state.current_node_id.clone(),
                    speaker: String::new(),
                    text: text.clone(),
                });
                format!("[MooVN Engine::Narration] {}", text)
            }
            EngineOp::TextMonologue { text } => {
                self.state.backlog.push(DialogueBacklogEntry {
                    chapter_id: self.state.current_chapter_id.clone(),
                    node_id: self.state.current_node_id.clone(),
                    speaker: "内心独白".to_string(),
                    text: text.clone(),
                });
                format!("[MooVN Engine::Monologue] （{}）", text)
            }
            EngineOp::ChoiceAdd {
                label,
                target_node_id,
            } => {
                self.state.pending_choices.push(ActiveChoiceOption {
                    label: label.clone(),
                    target_node_id: target_node_id.clone(),
                });
                format!(
                    "[MooVN Engine::Choice] 注册选项 '{}' -> 跳转 '{}'",
                    label, target_node_id
                )
            }
            EngineOp::ChoiceTimed {
                seconds,
                default_target_id,
            } => {
                format!(
                    "[MooVN Engine::TimedChoice] 限时 {}s 抉择 (超时默认 -> '{}')",
                    seconds, default_target_id
                )
            }
            EngineOp::BranchIf {
                condition_expr,
                true_target,
                false_target,
            } => {
                let passed = self.eval_condition(&condition_expr);
                if passed {
                    self.state.current_node_id = true_target.clone();
                    format!(
                        "[MooVN Engine::Branch] 条件 '{}' 成立 -> 跳转 '{}'",
                        condition_expr, true_target
                    )
                } else if let Some(ft) = false_target {
                    self.state.current_node_id = ft.clone();
                    format!(
                        "[MooVN Engine::Branch] 条件 '{}' 不成立 -> 跳转 '{}'",
                        condition_expr, ft
                    )
                } else {
                    format!(
                        "[MooVN Engine::Branch] 条件 '{}' 不成立 -> 继续顺序执行",
                        condition_expr
                    )
                }
            }
            EngineOp::AudioBgmPlay { bgm_id, loop_track } => {
                self.state.active_bgm = bgm_id.clone();
                format!(
                    "[MooVN Engine::Audio] 播放 BGM '{}' (loop={})",
                    bgm_id, loop_track
                )
            }
            EngineOp::AudioBgmStop { fade_ms } => {
                self.state.active_bgm.clear();
                format!("[MooVN Engine::Audio] 停止 BGM (淡出={}ms)", fade_ms)
            }
            EngineOp::AudioSfxPlay { sfx_id } => {
                format!("[MooVN Engine::Audio] 播放音效 '{}'", sfx_id)
            }
            EngineOp::AudioVoicePlay { voice_id } => {
                format!("[MooVN Engine::Audio] 播放角色语音 '{}'", voice_id)
            }
            EngineOp::CameraPanZoom {
                zoom,
                offset_x,
                offset_y,
                duration_ms,
            } => {
                self.state.camera_zoom = zoom;
                self.state.camera_offset_x = offset_x;
                self.state.camera_offset_y = offset_y;
                self.renderer
                    .push_command(RenderLayerCommand::ApplyCameraTransform {
                        zoom,
                        offset_x,
                        offset_y,
                    });
                format!(
                    "[MooVN Engine::Camera] 推拉缩放 zoom={} offset=({}, {}) {}ms",
                    zoom, offset_x, offset_y, duration_ms
                )
            }
            EngineOp::CameraShake {
                intensity,
                duration_ms,
            } => {
                format!(
                    "[MooVN Engine::Camera] 震屏特效 '{}' ({}ms)",
                    intensity, duration_ms
                )
            }
            EngineOp::CameraFlash { color, duration_ms } => {
                format!(
                    "[MooVN Engine::Camera] 闪屏特效 '{}' ({}ms)",
                    color, duration_ms
                )
            }
            EngineOp::CameraFade {
                direction,
                duration_ms,
            } => {
                format!(
                    "[MooVN Engine::Camera] 画面转场 '{}' ({}ms)",
                    direction, duration_ms
                )
            }
            EngineOp::VarSet { key, value } => {
                self.state.variables.insert(key.clone(), value.clone());
                format!("[MooVN Engine::Var] {} = {}", key, value)
            }
            EngineOp::VarAdd { key, delta } => {
                let cur: f64 = self
                    .state
                    .variables
                    .get(&key)
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0.0);
                let next = cur + delta;
                self.state.variables.insert(key.clone(), next.to_string());
                format!("[MooVN Engine::Var] {} += {} -> {}", key, delta, next)
            }
            EngineOp::ClueUnlock { title, description } => {
                self.state
                    .unlocked_clues
                    .push((title.clone(), description.clone()));
                format!("[MooVN Engine::Clue] 解锁线索 『{}』: {}", title, description)
            }
            EngineOp::SceneLoad { chapter_id } => {
                self.state.current_chapter_id = chapter_id.clone();
                format!("[MooVN Engine::Scene] 加载章节 '{}'", chapter_id)
            }
            EngineOp::SceneJump { node_id } => {
                self.state.current_node_id = node_id.clone();
                format!("[MooVN Engine::Scene] 跳转节点 '{}'", node_id)
            }
            EngineOp::StreamPreload { ahead_scenes } => {
                format!(
                    "[MooVN Engine::Stream] 流式预加载后续 {} 个场景至内存池",
                    ahead_scenes
                )
            }
            EngineOp::StreamUnload { behind_scenes } => {
                format!(
                    "[MooVN Engine::Stream] 释放前序 {} 个历史场景纹理缓存",
                    behind_scenes
                )
            }
            EngineOp::StreamMountMsvn { package_path } => {
                self.state.mounted_msvn_chapters.push(package_path.clone());
                format!(
                    "[MooVN Engine::Stream] 动态挂载 .msvn 章节资源包 '{}'",
                    package_path
                )
            }
            EngineOp::RendererCommand { pass_name, payload } => {
                self.renderer
                    .push_command(RenderLayerCommand::CustomShaderPass {
                        pass_name: pass_name.clone(),
                        payload: payload.clone(),
                    });
                format!(
                    "[MooVN Engine::RendererBridge] 提交渲染管线指令 pass='{}' payload='{}'",
                    pass_name, payload
                )
            }
        };

        self.execution_logs.push(log_line.clone());
        log_line
    }

    fn snapshot_to_save_record(&self, slot_name: &str) -> SaveSlotRecord {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let mut rec = SaveSlotRecord {
            slot_name: slot_name.to_string(),
            chapter_id: self.state.current_chapter_id.clone(),
            node_id: self.state.current_node_id.clone(),
            dialogue_index: self.state.dialogue_index,
            active_background: self.state.active_background.clone(),
            active_bgm: self.state.active_bgm.clone(),
            variables: self.state.variables.clone(),
            affection: self.state.affection.clone(),
            checksum_fnv1a: 0,
            timestamp_epoch_ms: now_ms,
        };
        rec.checksum_fnv1a = rec.compute_canonical_checksum();
        rec
    }

    fn restore_from_save_record(&mut self, rec: &SaveSlotRecord) {
        self.state.current_chapter_id = rec.chapter_id.clone();
        self.state.current_node_id = rec.node_id.clone();
        self.state.dialogue_index = rec.dialogue_index;
        self.state.active_background = rec.active_background.clone();
        self.state.active_bgm = rec.active_bgm.clone();
        self.state.variables = rec.variables.clone();
        self.state.affection = rec.affection.clone();
    }
}
