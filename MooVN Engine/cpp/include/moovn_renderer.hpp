#pragma once

/**
 * @file moovn_renderer.hpp
 * @brief MooVN Engine — Hybrid Rust + C++20 Renderer Interface & RGBA Compositor
 *
 * Provides both the C-ABI vtable bridged with Rust (`src/renderer/mod.rs`) and
 * the concrete C++20 `SoftwareCompositorDevice` supporting:
 * - Multi-layer RGBA8888 scene compositing
 * - Real-time Chroma-Key video matting for MP4/WebM character animations
 * - Weather particle simulation (rain, snow, sakura, fireflies)
 * - Post-process color filters (sepia, grayscale, night_blue)
 */

#include <cstdint>
#include <cstddef>
#include <vector>
#include <string>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MooVNCppRendererVTable {
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
} MooVNCppRendererVTable;

#ifdef __cplusplus
} // extern "C"

namespace moovn::renderer {

struct Particle2D {
    float x;
    float y;
    float vx;
    float vy;
    float size;
    float alpha;
};

class IRendererDevice {
public:
    virtual ~IRendererDevice() = default;

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
 * Concrete C++20 RGBA8888 Compositor & Video Chroma-Key Matting Device.
 */
class SoftwareCompositorDevice final : public IRendererDevice {
public:
    SoftwareCompositorDevice() = default;
    ~SoftwareCompositorDevice() override = default;

    bool initialize(uint32_t width, uint32_t height) override;
    void resize(uint32_t width, uint32_t height) override;
    void begin_frame(uint64_t frame_index) override;
    void draw_background(const char* bg_id, const char* transition) override;
    void draw_character(
        const char* char_id,
        const char* sprite_id,
        float x_norm,
        float y_norm,
        float scale,
        float opacity
    ) override;
    void present_frame(uint64_t frame_index) override;
    void shutdown() override;

    /**
     * Real-time Chroma-Key matting for video character sprites (e.g. MP4 green/black screen).
     */
    static void apply_chroma_key_rgba(
        uint8_t* rgba_pixels,
        size_t pixel_count,
        uint8_t key_r,
        uint8_t key_g,
        uint8_t key_b,
        uint8_t tolerance
    ) noexcept;

    /**
     * Post-processing color filter over RGBA8888 buffer.
     */
    void apply_color_filter(const std::string& filter_name) noexcept;

    /**
     * Steps weather particle emitter for rain / snow / sakura / fireflies.
     */
    void step_particles(float dt_sec) noexcept;

    const std::vector<uint8_t>& framebuffer() const noexcept { return framebuffer_; }
    uint32_t width() const noexcept { return width_; }
    uint32_t height() const noexcept { return height_; }
    uint64_t completed_frames() const noexcept { return completed_frames_; }

private:
    uint32_t width_ = 1920;
    uint32_t height_ = 1080;
    uint64_t current_frame_ = 0;
    uint64_t completed_frames_ = 0;
    std::string active_bg_;
    std::vector<uint8_t> framebuffer_;
    std::vector<Particle2D> particles_;
};

MooVNCppRendererVTable create_vtable_for_device(IRendererDevice* device) noexcept;

} // namespace moovn::renderer
#endif
