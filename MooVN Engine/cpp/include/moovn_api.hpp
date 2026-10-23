#pragma once
/**
 * @file moovn_api.hpp
 * @brief MooVN Engine — C++20 Visual Novel Fast API Binding
 *
 * Provides idiomatic C++ calls (`moovn::save::create("Slot_01")`, `moovn::bg::show(...)`, etc.)
 * mapped to the Rust `MooVNEngineRuntime` FFI exports.
 */

#include <cstdint>
#include <string>
#include "moovn_renderer.hpp"

extern "C" {
    struct MooVNEngineRuntime;
    MooVNEngineRuntime* moovn_engine_create();
    void moovn_engine_destroy(MooVNEngineRuntime* engine);
    bool moovn_engine_save_create(MooVNEngineRuntime* engine, const char* slot_name);
    bool moovn_engine_save_load(MooVNEngineRuntime* engine, const char* slot_name);
    size_t moovn_engine_eval_script(MooVNEngineRuntime* engine, const char* lang_tag, const char* script_source);
    bool moovn_engine_attach_cpp_renderer(MooVNEngineRuntime* engine, MooVNCppRendererVTable vtable);
}

namespace moovn {

inline MooVNEngineRuntime*& active_runtime() {
    static MooVNEngineRuntime* instance = nullptr;
    return instance;
}

namespace save {
    inline bool create(const std::string& name) {
        if (!active_runtime()) return false;
        return moovn_engine_save_create(active_runtime(), name.c_str());
    }
    inline bool load(const std::string& name) {
        if (!active_runtime()) return false;
        return moovn_engine_save_load(active_runtime(), name.c_str());
    }
} // namespace save

namespace bg {
    inline void show(const std::string& bg_id, const std::string& transition = "fade") {
        if (!active_runtime()) return;
        std::string cmd = "moovn::bg::show(\"" + bg_id + "\", \"" + transition + "\");";
        moovn_engine_eval_script(active_runtime(), "cpp", cmd.c_str());
    }
} // namespace bg

namespace text {
    inline void say(const std::string& speaker, const std::string& line) {
        if (!active_runtime()) return;
        std::string cmd = "moovn::text::say(\"" + speaker + "\", \"" + line + "\");";
        moovn_engine_eval_script(active_runtime(), "cpp", cmd.c_str());
    }
} // namespace text

} // namespace moovn
