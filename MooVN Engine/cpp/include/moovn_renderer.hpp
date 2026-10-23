#pragma once
/**
 * @file moovn_renderer.hpp
 * @brief MooVN Engine — Reserved Hybrid Rust + C++ Renderer Interface (WIP)
 *
 * This header defines the C++20 abstract renderer device (`moovn::renderer::IRendererDevice`)
 * and the C-ABI VTable (`MooVNCppRendererVTable`) that bridges the C++ rendering pipeline
 * into the Rust `MooVNEngineRuntime`.
 */

#include <cstdint>
#include <cstddef>

extern "C" {

struct MooVNCppRendererVTable {
    void* user_data;
    bool (*on_init)(void* user_data, uint32_t width, uint32_t height);
    void (*on_resize)(void* user_data, uint32_t width, uint32_t height);
    void (*on_begin_frame)(void* user_data, uint64_t frame_index);
    void (*on_draw_background)(void* user_data, const char* bg_id, const char* transition);
    void (*on_draw_character)(
        void* user_data,
        const char* char_id,
        const char* sprite_id,
        float x_norm,
        float y_norm,
        float scale,
        float opacity
    );
    void (*on_present_frame)(void* user_data, uint64_t frame_index);
    void (*on_shutdown)(void* user_data);
};

} // extern "C"

namespace moovn::renderer {

enum class GraphicsApi : uint8_t {
    Vulkan = 0,
    DirectX12 = 1,
    Metal = 2,
    OpenGL = 3,
    SoftwareStub = 4,
};

/**
 * @brief Abstract C++ Renderer Interface (under active development alongside Rust core).
 */
class IRendererDevice {
public:
    virtual ~IRendererDevice() = default;
    virtual GraphicsApi api_kind() const noexcept = 0;
    virtual bool initialize(uint32_t width, uint32_t height) = 0;
    virtual void resize(uint32_t width, uint32_t height) = 0;
    virtual void begin_frame(uint64_t frame_index) = 0;
    virtual void draw_background(const char* bg_id, const char* transition) = 0;
    virtual void draw_character(
        const char* char_id,
        const char* sprite_id,
        float x_norm,
        float y_norm,
        float scale,
        float opacity
    ) = 0;
    virtual void present_frame(uint64_t frame_index) = 0;
    virtual void shutdown() = 0;
};

/**
 * @brief Builds a C-ABI VTable wrapping any `IRendererDevice*` for attachment to Rust `MooVNEngineRuntime`.
 */
MooVNCppRendererVTable create_vtable_for_device(IRendererDevice* device) noexcept;

} // namespace moovn::renderer
