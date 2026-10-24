//! Unified Intermediate Representation (IR) for MooVN Engine.
//!
//! Compiles scripts across JavaScript/TypeScript, C#, C++, and Rust into
//! a deterministic visual novel instruction set.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceLanguage {
    JavaScript,
    TypeScript,
    Cpp,
    CSharp,
    Rust,
}

impl SourceLanguage {
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceLanguage::JavaScript => "javascript",
            SourceLanguage::TypeScript => "typescript",
            SourceLanguage::Cpp => "cpp",
            SourceLanguage::CSharp => "csharp",
            SourceLanguage::Rust => "rust",
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            SourceLanguage::JavaScript => "js",
            SourceLanguage::TypeScript => "ts",
            SourceLanguage::Cpp => "cpp",
            SourceLanguage::CSharp => "cs",
            SourceLanguage::Rust => "rs",
        }
    }

    pub fn from_tag(tag: &str) -> Self {
        let lower = tag.trim().to_ascii_lowercase();
        let ext = lower.rsplit('.').next().unwrap_or(lower.as_str());
        match ext {
            "js" | "javascript" => SourceLanguage::JavaScript,
            "ts" | "typescript" => SourceLanguage::TypeScript,
            "cpp" | "cxx" | "cc" | "hpp" | "h" | "c++" => SourceLanguage::Cpp,
            "cs" | "c#" | "csharp" => SourceLanguage::CSharp,
            "rs" | "rust" => SourceLanguage::Rust,
            _ => SourceLanguage::TypeScript,
        }
    }
}

/// Media type for a character actor on stage (static image, animated GIF/WebP, or MP4/WebM video).
#[derive(Debug, Clone, PartialEq)]
pub enum ActorMediaKind {
    StaticImage,
    AnimatedSprite,
    VideoClip {
        loop_video: bool,
        chroma_key_hex: Option<String>,
        playback_rate: f32,
    },
}

/// Canonical Visual Novel Engine Operation IR.
#[derive(Debug, Clone, PartialEq)]
pub enum EngineOp {
    // ==================== Save / Load System ====================
    /// `C#`: `moovn.save:create(NAME)`
    /// `JS/TS`: `moobn.sava:create(NAME)` / `moovn.save:create(NAME)`
    /// `C++/Rust`: `moovn::save::create(NAME)` / `moovn.save:create(NAME)`
    SaveCreate { slot_name: String },
    SaveLoad { slot_name: String },
    SaveDelete { slot_name: String },
    SaveQuickSave,
    SaveQuickLoad,
    SaveAutoSave,
    SaveList,

    // ==================== Scene & Flow & Branching ====================
    SceneLoad { chapter_id: String },
    SceneJump { node_id: String },
    BranchIf {
        condition_expr: String,
        true_target: String,
        false_target: Option<String>,
    },

    // ==================== Background & Environment ====================
    BgShow { bg_id: String, transition: String },
    BgWeather { effect: String, intensity: u8 },
    BgFilter { filter_name: String, intensity: u8 },

    // ==================== Character & Stage (Static + Video + Animation) ====================
    CharEnter { char_id: String, position: String },
    CharExit { char_id: String },
    CharExpression { char_id: String, sprite_id: String },
    CharVideo {
        char_id: String,
        video_url: String,
        loop_video: bool,
        chroma_key: Option<String>,
    },
    CharMove { char_id: String, x: f32, y: f32, duration_ms: u32 },
    CharAction { char_id: String, action: String },
    CharAffection { char_id: String, delta: i32 },

    // ==================== Dialogue & Choices ====================
    TextSay { speaker: String, text: String },
    TextNarrate { text: String },
    TextMonologue { text: String },
    ChoiceAdd { label: String, target_node_id: String },
    ChoiceTimed { seconds: u32, default_target_id: String },

    // ==================== Audio ====================
    AudioBgmPlay { bgm_id: String, loop_track: bool },
    AudioBgmStop { fade_ms: u32 },
    AudioSfxPlay { sfx_id: String },
    AudioVoicePlay { voice_id: String },

    // ==================== Camera & VFX ====================
    CameraPanZoom { zoom: f32, offset_x: f32, offset_y: f32, duration_ms: u32 },
    CameraShake { intensity: String, duration_ms: u32 },
    CameraFlash { color: String, duration_ms: u32 },
    CameraFade { direction: String, duration_ms: u32 },

    // ==================== Variables, Clues & Streaming ====================
    VarSet { key: String, value: String },
    VarAdd { key: String, delta: f64 },
    ClueUnlock { title: String, description: String },
    StreamPreload { ahead_scenes: u32 },
    StreamUnload { behind_scenes: u32 },
    StreamMountMsvn { package_path: String },

    // ==================== Reserved Hybrid Renderer Call ====================
    RendererCommand { pass_name: String, payload: String },
}

#[derive(Debug, Clone)]
pub struct EngineScriptProgram {
    pub source_language: SourceLanguage,
    pub operations: Vec<EngineOp>,
}
