//! MooVN Engine CLI & Polyglot Verification Runner.

use moovn_engine::{MooVNEngineRuntime, PolyglotTranslator, SourceLanguage};

fn main() {
    let mut engine = MooVNEngineRuntime::new();

    // 1. C# fast API script (`moovn.save:create(NAME)`)
    let csharp_script = r#"
        // C# Visual Novel Fast API
        moovn.bg:show("bg-station-night", "fade");
        moovn.char:enter("char-yukina", "center");
        moovn.text:say("白川雪菜", "C# 存档接口已就绪，正在创建星轨锚点存档。");
        moovn.save:create("Astral_Save_Slot_01");
    "#;

    // 2. JavaScript fast API script (`moovn.save:create(NAME)`)
    let js_script = r#"
        // JavaScript Visual Novel Fast API
        moovn.bg:weather("rain", 75);
        moovn.char:affection("char-yukina", 5);
        moovn.save:create("Astral_Save_Slot_02");
        moovn.save:load("Astral_Save_Slot_01");
    "#;

    // 3. C++ / Rust fast API script (`moovn::save::create(NAME)`)
    let cpp_script = r#"
        // C++20 / Rust Visual Novel Fast API
        moovn::camera::pan_zoom(1.08, 0.0, -10.0, 500);
        moovn::renderer::submit("bloom_pass", "threshold=0.82");
        moovn::save::create("Astral_Save_Slot_03");
    "#;

    println!("=== MooVN Engine v0.1.0 Polyglot Runtime ===");
    for (lang, code) in [
        (SourceLanguage::CSharp, csharp_script),
        (SourceLanguage::JavaScript, js_script),
        (SourceLanguage::Cpp, cpp_script),
    ] {
        let logs = engine.eval_polyglot_script(code, lang);
        for line in logs {
            println!("{}", line);
        }
    }

    // Demonstrate cross-language transpilation
    let (ir, _) = PolyglotTranslator::compile_to_ir(csharp_script, SourceLanguage::CSharp);
    println!("\n--- Transpiled to JavaScript ---\n{}", PolyglotTranslator::transpile(&ir, SourceLanguage::JavaScript));
    println!("--- Transpiled to C# ---\n{}", PolyglotTranslator::transpile(&ir, SourceLanguage::CSharp));
    println!("--- Transpiled to Rust ---\n{}", PolyglotTranslator::transpile(&ir, SourceLanguage::Rust));
}
