//! Polyglot Translation Engine for MooVN Engine.
//!
//! Translates visual novel fast API calls from JavaScript, TypeScript, C++, C#, and Rust
//! into canonical `EngineOp` IR instructions, and transpiles between any of those languages.
//!
//! Supported API dialects:
//! - JavaScript: `moovn.save.create(NAME);`
//! - TypeScript: `moovn.save.create(NAME);`
//! - C#:         `Moovn.Save.Create(NAME);`
//! - C++:        `moovn::save::create(NAME);`
//! - Rust:       `moovn::save::create(NAME);`

use crate::ir::{EngineOp, EngineScriptProgram, SourceLanguage};

#[derive(Debug, Clone)]
pub struct TranslationDiagnostic {
    pub line: usize,
    pub message: String,
    pub normalized_token: String,
}

pub struct PolyglotTranslator;

impl PolyglotTranslator {
    /// Compile source code in JS/TS/C++/C#/Rust into canonical `EngineScriptProgram`.
    pub fn compile_to_ir(
        source: &str,
        source_language: SourceLanguage,
    ) -> (EngineScriptProgram, Vec<TranslationDiagnostic>) {
        let mut operations = Vec::new();
        let mut diagnostics = Vec::new();

        for (idx, raw_line) in source.lines().enumerate() {
            let line_no = idx + 1;
            let trimmed = raw_line.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("//")
                || trimmed.starts_with('#')
                || trimmed.starts_with("--")
                || trimmed.starts_with("/*")
                || trimmed.starts_with('*')
            {
                continue;
            }

            if let Some((module, action, args)) = Self::parse_fast_api_call(trimmed) {
                let norm_mod = Self::normalize_module(&module);
                let norm_act = Self::normalize_action(&action);
                let canonical = format!("moovn.{}.{}({})", norm_mod, norm_act, args.join(", "));

                if let Some(op) = Self::map_to_engine_op(&norm_mod, &norm_act, &args) {
                    diagnostics.push(TranslationDiagnostic {
                        line: line_no,
                        message: format!(
                            "[{} -> IR] 已解析指令 {:?}",
                            source_language.as_str(),
                            op
                        ),
                        normalized_token: canonical,
                    });
                    operations.push(op);
                } else {
                    diagnostics.push(TranslationDiagnostic {
                        line: line_no,
                        message: format!(
                            "[WARN line {}] 未知的模块或动作 '{}.{}'",
                            line_no, norm_mod, norm_act
                        ),
                        normalized_token: trimmed.to_string(),
                    });
                }
            } else {
                diagnostics.push(TranslationDiagnostic {
                    line: line_no,
                    message: format!(
                        "[SKIP line {}] 非 moovn.* API 调用行已跳过: {}",
                        line_no, trimmed
                    ),
                    normalized_token: trimmed.to_string(),
                });
            }
        }

        (
            EngineScriptProgram {
                source_language,
                operations,
            },
            diagnostics,
        )
    }

    /// Transpile an `EngineScriptProgram` into target language source code
    /// (`JavaScript`, `TypeScript`, `C#`, `C++`, or `Rust`).
    pub fn transpile(program: &EngineScriptProgram, target: SourceLanguage) -> String {
        let mut out = String::new();
        match target {
            SourceLanguage::JavaScript => {
                out.push_str("// MooVN Engine Polyglot API — JavaScript\n");
            }
            SourceLanguage::TypeScript => {
                out.push_str("// MooVN Engine Polyglot API — TypeScript\n");
            }
            SourceLanguage::CSharp => {
                out.push_str("// MooVN Engine Polyglot API — C#\n");
            }
            SourceLanguage::Cpp => {
                out.push_str("// MooVN Engine Polyglot API — C++20\n#include \"moovn_api.hpp\"\n");
            }
            SourceLanguage::Rust => {
                out.push_str("// MooVN Engine Polyglot API — Rust\nuse moovn_engine::prelude::*;\n");
            }
        }

        for op in &program.operations {
            let line = Self::format_op_for_language(op, target);
            out.push_str(&line);
            out.push('\n');
        }
        out
    }

    fn format_op_for_language(op: &EngineOp, target: SourceLanguage) -> String {
        match op {
            EngineOp::SaveCreate { slot_name } => {
                Self::fmt_call(target, "save", "create", &[format!("\"{}\"", slot_name)])
            }
            EngineOp::SaveLoad { slot_name } => {
                Self::fmt_call(target, "save", "load", &[format!("\"{}\"", slot_name)])
            }
            EngineOp::SaveDelete { slot_name } => {
                Self::fmt_call(target, "save", "delete", &[format!("\"{}\"", slot_name)])
            }
            EngineOp::SaveQuickSave => Self::fmt_call(target, "save", "quick_save", &[]),
            EngineOp::SaveQuickLoad => Self::fmt_call(target, "save", "quick_load", &[]),
            EngineOp::SaveAutoSave => Self::fmt_call(target, "save", "auto_save", &[]),
            EngineOp::SaveList => Self::fmt_call(target, "save", "list", &[]),
            EngineOp::BgShow { bg_id, transition } => {
                Self::fmt_call(target, "bg", "show", &[format!("\"{}\"", bg_id), format!("\"{}\"", transition)])
            }
            EngineOp::BgWeather { effect, intensity } => {
                Self::fmt_call(target, "bg", "weather", &[format!("\"{}\"", effect), intensity.to_string()])
            }
            EngineOp::BgFilter { filter_name, intensity } => {
                Self::fmt_call(target, "bg", "filter", &[format!("\"{}\"", filter_name), intensity.to_string()])
            }
            EngineOp::CharEnter { char_id, position } => {
                Self::fmt_call(target, "char", "enter", &[format!("\"{}\"", char_id), format!("\"{}\"", position)])
            }
            EngineOp::CharExit { char_id } => {
                Self::fmt_call(target, "char", "exit", &[format!("\"{}\"", char_id)])
            }
            EngineOp::CharExpression { char_id, sprite_id } => {
                Self::fmt_call(target, "char", "expr", &[format!("\"{}\"", char_id), format!("\"{}\"", sprite_id)])
            }
            EngineOp::CharVideo {
                char_id,
                video_url,
                loop_video,
                chroma_key,
            } => {
                let mut args = vec![
                    format!("\"{}\"", char_id),
                    format!("\"{}\"", video_url),
                    loop_video.to_string(),
                ];
                if let Some(ck) = chroma_key {
                    args.push(format!("\"{}\"", ck));
                }
                Self::fmt_call(target, "char", "video", &args)
            }
            EngineOp::BranchIf {
                condition_expr,
                true_target,
                false_target,
            } => {
                let mut args = vec![
                    format!("\"{}\"", condition_expr),
                    format!("\"{}\"", true_target),
                ];
                if let Some(ft) = false_target {
                    args.push(format!("\"{}\"", ft));
                }
                Self::fmt_call(target, "scene", "branch_if", &args)
            }
            EngineOp::CharMove { char_id, x, y, duration_ms } => {
                Self::fmt_call(
                    target,
                    "char",
                    "move",
                    &[format!("\"{}\"", char_id), x.to_string(), y.to_string(), duration_ms.to_string()],
                )
            }
            EngineOp::CharAction { char_id, action } => {
                Self::fmt_call(target, "char", "action", &[format!("\"{}\"", char_id), format!("\"{}\"", action)])
            }
            EngineOp::CharAffection { char_id, delta } => {
                Self::fmt_call(target, "char", "affection", &[format!("\"{}\"", char_id), delta.to_string()])
            }
            EngineOp::TextSay { speaker, text } => {
                Self::fmt_call(target, "text", "say", &[format!("\"{}\"", speaker), format!("\"{}\"", text)])
            }
            EngineOp::TextNarrate { text } => {
                Self::fmt_call(target, "text", "narrate", &[format!("\"{}\"", text)])
            }
            EngineOp::TextMonologue { text } => {
                Self::fmt_call(target, "text", "monologue", &[format!("\"{}\"", text)])
            }
            EngineOp::ChoiceAdd { label, target_node_id } => {
                Self::fmt_call(target, "choice", "add", &[format!("\"{}\"", label), format!("\"{}\"", target_node_id)])
            }
            EngineOp::ChoiceTimed { seconds, default_target_id } => {
                Self::fmt_call(target, "choice", "timed", &[seconds.to_string(), format!("\"{}\"", default_target_id)])
            }
            EngineOp::AudioBgmPlay { bgm_id, loop_track } => {
                Self::fmt_call(target, "audio", "bgm_play", &[format!("\"{}\"", bgm_id), loop_track.to_string()])
            }
            EngineOp::AudioBgmStop { fade_ms } => {
                Self::fmt_call(target, "audio", "bgm_stop", &[fade_ms.to_string()])
            }
            EngineOp::AudioSfxPlay { sfx_id } => {
                Self::fmt_call(target, "audio", "sfx", &[format!("\"{}\"", sfx_id)])
            }
            EngineOp::AudioVoicePlay { voice_id } => {
                Self::fmt_call(target, "audio", "voice", &[format!("\"{}\"", voice_id)])
            }
            EngineOp::CameraPanZoom { zoom, offset_x, offset_y, duration_ms } => Self::fmt_call(
                target,
                "camera",
                "pan_zoom",
                &[zoom.to_string(), offset_x.to_string(), offset_y.to_string(), duration_ms.to_string()],
            ),
            EngineOp::CameraShake { intensity, duration_ms } => {
                Self::fmt_call(target, "camera", "shake", &[format!("\"{}\"", intensity), duration_ms.to_string()])
            }
            EngineOp::CameraFlash { color, duration_ms } => {
                Self::fmt_call(target, "camera", "flash", &[format!("\"{}\"", color), duration_ms.to_string()])
            }
            EngineOp::CameraFade { direction, duration_ms } => {
                Self::fmt_call(target, "camera", "fade", &[format!("\"{}\"", direction), duration_ms.to_string()])
            }
            EngineOp::VarSet { key, value } => {
                Self::fmt_call(target, "var", "set", &[format!("\"{}\"", key), format!("\"{}\"", value)])
            }
            EngineOp::VarAdd { key, delta } => {
                Self::fmt_call(target, "var", "add", &[format!("\"{}\"", key), delta.to_string()])
            }
            EngineOp::ClueUnlock { title, description } => {
                Self::fmt_call(target, "clue", "unlock", &[format!("\"{}\"", title), format!("\"{}\"", description)])
            }
            EngineOp::SceneLoad { chapter_id } => {
                Self::fmt_call(target, "scene", "load", &[format!("\"{}\"", chapter_id)])
            }
            EngineOp::SceneJump { node_id } => {
                Self::fmt_call(target, "scene", "jump", &[format!("\"{}\"", node_id)])
            }
            EngineOp::StreamPreload { ahead_scenes } => {
                Self::fmt_call(target, "stream", "preload", &[ahead_scenes.to_string()])
            }
            EngineOp::StreamUnload { behind_scenes } => {
                Self::fmt_call(target, "stream", "unload", &[behind_scenes.to_string()])
            }
            EngineOp::StreamMountMsvn { package_path } => {
                Self::fmt_call(target, "stream", "mount_msvn", &[format!("\"{}\"", package_path)])
            }
            EngineOp::RendererCommand { pass_name, payload } => {
                Self::fmt_call(target, "renderer", "submit", &[format!("\"{}\"", pass_name), format!("\"{}\"", payload)])
            }
        }
    }

    fn to_pascal_case(snake: &str) -> String {
        snake
            .split('_')
            .filter(|s| !s.is_empty())
            .map(|seg| {
                let mut chars = seg.chars();
                match chars.next() {
                    Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
                    None => String::new(),
                }
            })
            .collect()
    }

    fn fmt_call(target: SourceLanguage, module: &str, action: &str, args: &[String]) -> String {
        let joined = args.join(", ");
        match target {
            SourceLanguage::JavaScript | SourceLanguage::TypeScript => {
                format!("moovn.{}.{}({});", module, action, joined)
            }
            SourceLanguage::CSharp => {
                format!(
                    "Moovn.{}.{}({});",
                    Self::to_pascal_case(module),
                    Self::to_pascal_case(action),
                    joined
                )
            }
            SourceLanguage::Cpp | SourceLanguage::Rust => {
                format!("moovn::{}::{}({});", module, action, joined)
            }
        }
    }

    /// Parses any API call line such as:
    /// - `moovn.save.create("slot1");`
    /// - `Moovn.Save.Create("slot1");`
    /// - `moovn::save::create("slot1");`
    fn parse_fast_api_call(line: &str) -> Option<(String, String, Vec<String>)> {
        let clean = line.trim().trim_end_matches(';').trim();
        let open_paren = clean.find('(')?;
        let close_paren = clean.rfind(')')?;
        if close_paren < open_paren {
            return None;
        }

        let head = clean[..open_paren].trim();
        let args_raw = &clean[open_paren + 1..close_paren];

        // Normalize separators `::`, `:`, `.`, `->` into `.`
        let normalized_head = head
            .replace("::", ".")
            .replace("->", ".")
            .replace(':', ".");
        let parts: Vec<&str> = normalized_head
            .split('.')
            .filter(|s| !s.is_empty())
            .collect();

        if parts.len() < 2 {
            return None;
        }

        let root_lower = parts[0].to_ascii_lowercase();
        if root_lower != "moovn" {
            return None;
        }

        let (module, action) = if parts.len() >= 3 {
            (parts[1].to_ascii_lowercase(), parts[2].to_ascii_lowercase())
        } else {
            // 2-part legacy MooVN.setBg(...) style
            Self::split_legacy_method(parts[1])
        };

        let args = Self::parse_args(args_raw);
        Some((module, action, args))
    }

    fn split_legacy_method(method: &str) -> (String, String) {
        match method {
            "setBg" => ("bg".to_string(), "show".to_string()),
            "weather" => ("bg".to_string(), "weather".to_string()),
            "colorFilter" => ("bg".to_string(), "filter".to_string()),
            "enterChar" => ("char".to_string(), "enter".to_string()),
            "exitChar" => ("char".to_string(), "exit".to_string()),
            "setExpression" => ("char".to_string(), "expr".to_string()),
            "moveChar" => ("char".to_string(), "move".to_string()),
            "addAffection" => ("char".to_string(), "affection".to_string()),
            "dialogue" => ("text".to_string(), "say".to_string()),
            "narration" => ("text".to_string(), "narrate".to_string()),
            "playBgm" => ("audio".to_string(), "bgm_play".to_string()),
            "stopBgm" => ("audio".to_string(), "bgm_stop".to_string()),
            "playSfx" => ("audio".to_string(), "sfx".to_string()),
            "playVoice" => ("audio".to_string(), "voice".to_string()),
            "cameraPanZoom" => ("camera".to_string(), "pan_zoom".to_string()),
            "cameraShake" => ("camera".to_string(), "shake".to_string()),
            "setVar" => ("var".to_string(), "set".to_string()),
            "unlockClue" => ("clue".to_string(), "unlock".to_string()),
            "preloadScenes" => ("stream".to_string(), "preload".to_string()),
            "unloadScenes" => ("stream".to_string(), "unload".to_string()),
            other => ("core".to_string(), other.to_ascii_lowercase()),
        }
    }

    fn normalize_module(raw: &str) -> String {
        match raw.trim().to_ascii_lowercase().as_str() {
            "save" | "saves" => "save".to_string(),
            "bg" | "background" => "bg".to_string(),
            "char" | "character" | "actor" => "char".to_string(),
            "text" | "dialogue" | "dialog" | "say" => "text".to_string(),
            "choice" | "branch" => "choice".to_string(),
            "audio" | "sound" | "bgm" => "audio".to_string(),
            "camera" | "cam" | "vfx" => "camera".to_string(),
            "var" | "vars" | "state" => "var".to_string(),
            "clue" | "clues" => "clue".to_string(),
            "scene" | "chapter" => "scene".to_string(),
            "stream" | "memory" => "stream".to_string(),
            "renderer" | "render" | "gfx" => "renderer".to_string(),
            other => other.to_string(),
        }
    }

    fn normalize_action(raw: &str) -> String {
        match raw.trim().to_ascii_lowercase().as_str() {
            "create" | "new" | "write" | "save" => "create".to_string(),
            "load" | "read" | "restore" => "load".to_string(),
            "delete" | "remove" | "rm" => "delete".to_string(),
            "quicksave" | "quick_save" => "quick_save".to_string(),
            "quickload" | "quick_load" => "quick_load".to_string(),
            "autosave" | "auto_save" => "auto_save".to_string(),
            other => other.to_string(),
        }
    }

    fn parse_args(raw: &str) -> Vec<String> {
        let mut res = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;
        let mut quote_char = '"';

        for ch in raw.chars() {
            if (ch == '"' || ch == '\'') && !in_quotes {
                in_quotes = true;
                quote_char = ch;
                continue;
            } else if ch == quote_char && in_quotes {
                in_quotes = false;
                continue;
            }

            if ch == ',' && !in_quotes {
                res.push(current.trim().to_string());
                current.clear();
            } else {
                current.push(ch);
            }
        }
        if !current.trim().is_empty() {
            res.push(current.trim().to_string());
        }
        res
    }

    fn map_to_engine_op(module: &str, action: &str, args: &[String]) -> Option<EngineOp> {
        let a0 = args.first().cloned().unwrap_or_default();
        let a1 = args.get(1).cloned().unwrap_or_default();
        let a2 = args.get(2).cloned().unwrap_or_default();
        let a3 = args.get(3).cloned().unwrap_or_default();

        match (module, action) {
            ("save", "create") => Some(EngineOp::SaveCreate {
                slot_name: if a0.is_empty() { "Slot_01".to_string() } else { a0 },
            }),
            ("save", "load") => Some(EngineOp::SaveLoad {
                slot_name: if a0.is_empty() { "Slot_01".to_string() } else { a0 },
            }),
            ("save", "delete") => Some(EngineOp::SaveDelete { slot_name: a0 }),
            ("save", "quick_save") => Some(EngineOp::SaveQuickSave),
            ("save", "quick_load") => Some(EngineOp::SaveQuickLoad),
            ("save", "auto_save") => Some(EngineOp::SaveAutoSave),
            ("save", "list") => Some(EngineOp::SaveList),

            ("scene", "load") => Some(EngineOp::SceneLoad { chapter_id: a0 }),
            ("scene", "jump") => Some(EngineOp::SceneJump { node_id: a0 }),
            ("scene", "branch_if") => Some(EngineOp::BranchIf {
                condition_expr: a0,
                true_target: a1,
                false_target: if a2.is_empty() { None } else { Some(a2) },
            }),

            ("bg", "show") => Some(EngineOp::BgShow {
                bg_id: a0,
                transition: if a1.is_empty() { "fade".to_string() } else { a1 },
            }),
            ("bg", "weather") => Some(EngineOp::BgWeather {
                effect: a0,
                intensity: a1.parse().unwrap_or(60),
            }),
            ("bg", "filter") => Some(EngineOp::BgFilter {
                filter_name: a0,
                intensity: a1.parse().unwrap_or(30),
            }),

            ("char", "enter") => Some(EngineOp::CharEnter {
                char_id: a0,
                position: if a1.is_empty() { "center".to_string() } else { a1 },
            }),
            ("char", "exit") => Some(EngineOp::CharExit { char_id: a0 }),
            ("char", "expr") | ("char", "expression") => Some(EngineOp::CharExpression {
                char_id: a0,
                sprite_id: a1,
            }),
            ("char", "video") => Some(EngineOp::CharVideo {
                char_id: a0,
                video_url: a1,
                loop_video: a2.parse().unwrap_or(true),
                chroma_key: if a3.is_empty() { None } else { Some(a3) },
            }),
            ("char", "move") => Some(EngineOp::CharMove {
                char_id: a0,
                x: a1.parse().unwrap_or(50.0),
                y: a2.parse().unwrap_or(58.0),
                duration_ms: a3.parse().unwrap_or(400),
            }),
            ("char", "action") => Some(EngineOp::CharAction {
                char_id: a0,
                action: a1,
            }),
            ("char", "affection") => Some(EngineOp::CharAffection {
                char_id: a0,
                delta: a1.parse().unwrap_or(1),
            }),

            ("text", "say") | ("text", "dialogue") => Some(EngineOp::TextSay {
                speaker: a0,
                text: a1,
            }),
            ("text", "narrate") | ("text", "narration") => Some(EngineOp::TextNarrate { text: a0 }),
            ("text", "monologue") => Some(EngineOp::TextMonologue { text: a0 }),

            ("choice", "add") => Some(EngineOp::ChoiceAdd {
                label: a0,
                target_node_id: a1,
            }),
            ("choice", "timed") => Some(EngineOp::ChoiceTimed {
                seconds: a0.parse().unwrap_or(10),
                default_target_id: a1,
            }),

            ("audio", "bgm_play") | ("audio", "bgm") => Some(EngineOp::AudioBgmPlay {
                bgm_id: a0,
                loop_track: a1.parse().unwrap_or(true),
            }),
            ("audio", "bgm_stop") => Some(EngineOp::AudioBgmStop {
                fade_ms: a0.parse().unwrap_or(500),
            }),
            ("audio", "sfx") => Some(EngineOp::AudioSfxPlay { sfx_id: a0 }),
            ("audio", "voice") => Some(EngineOp::AudioVoicePlay { voice_id: a0 }),

            ("camera", "pan_zoom") => Some(EngineOp::CameraPanZoom {
                zoom: a0.parse().unwrap_or(1.0),
                offset_x: a1.parse().unwrap_or(0.0),
                offset_y: a2.parse().unwrap_or(0.0),
                duration_ms: a3.parse().unwrap_or(500),
            }),
            ("camera", "shake") => Some(EngineOp::CameraShake {
                intensity: a0,
                duration_ms: a1.parse().unwrap_or(350),
            }),
            ("camera", "flash") => Some(EngineOp::CameraFlash {
                color: a0,
                duration_ms: a1.parse().unwrap_or(250),
            }),
            ("camera", "fade") => Some(EngineOp::CameraFade {
                direction: a0,
                duration_ms: a1.parse().unwrap_or(600),
            }),

            ("var", "set") => Some(EngineOp::VarSet { key: a0, value: a1 }),
            ("var", "add") => Some(EngineOp::VarAdd {
                key: a0,
                delta: a1.parse().unwrap_or(1.0),
            }),
            ("clue", "unlock") => Some(EngineOp::ClueUnlock {
                title: a0,
                description: a1,
            }),

            ("stream", "preload") => Some(EngineOp::StreamPreload {
                ahead_scenes: a0.parse().unwrap_or(4),
            }),
            ("stream", "unload") => Some(EngineOp::StreamUnload {
                behind_scenes: a0.parse().unwrap_or(4),
            }),
            ("stream", "mount_msvn") => Some(EngineOp::StreamMountMsvn { package_path: a0 }),

            ("renderer", _) => Some(EngineOp::RendererCommand {
                pass_name: action.to_string(),
                payload: a0,
            }),
            _ => None,
        }
    }
}
