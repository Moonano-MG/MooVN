#include "../include/moovn_renderer.hpp"
#include "../include/moovn_api.hpp"
#include <algorithm>
#include <cmath>

namespace moovn::renderer {

namespace {

bool cb_init(void* user_data, uint32_t width, uint32_t height) {
    auto* dev = static_cast<IRendererDevice*>(user_data);
    return dev ? dev->initialize(width, height) : false;
}

void cb_resize(void* user_data, uint32_t width, uint32_t height) {
    if (auto* dev = static_cast<IRendererDevice*>(user_data)) {
        dev->resize(width, height);
    }
}

void cb_begin_frame(void* user_data, uint64_t frame_index) {
    if (auto* dev = static_cast<IRendererDevice*>(user_data)) {
        dev->begin_frame(frame_index);
    }
}

void cb_draw_bg(void* user_data, const char* bg_id, const char* transition) {
    if (auto* dev = static_cast<IRendererDevice*>(user_data)) {
        dev->draw_background(bg_id, transition);
    }
}

void cb_draw_char(
    void* user_data,
    const char* char_id,
    const char* sprite_id,
    float x_norm,
    float y_norm,
    float scale,
    float opacity
) {
    if (auto* dev = static_cast<IRendererDevice*>(user_data)) {
        dev->draw_character(char_id, sprite_id, x_norm, y_norm, scale, opacity);
    }
}

void cb_present_frame(void* user_data, uint64_t frame_index) {
    if (auto* dev = static_cast<IRendererDevice*>(user_data)) {
        dev->present_frame(frame_index);
    }
}

void cb_shutdown(void* user_data) {
    if (auto* dev = static_cast<IRendererDevice*>(user_data)) {
        dev->shutdown();
    }
}

} // namespace

bool SoftwareCompositorDevice::initialize(uint32_t width, uint32_t height) {
    width_ = std::max<uint32_t>(1, width);
    height_ = std::max<uint32_t>(1, height);
    framebuffer_.assign(static_cast<size_t>(width_) * height_ * 4, 0);
    particles_.resize(64);
    for (size_t i = 0; i < particles_.size(); ++i) {
        particles_[i] = Particle2D{
            static_cast<float>((i * 97) % width_),
            static_cast<float>((i * 53) % height_),
            -12.0f,
            120.0f + static_cast<float>(i % 40),
            2.5f,
            0.75f
        };
    }
    return true;
}

void SoftwareCompositorDevice::resize(uint32_t width, uint32_t height) {
    width_ = std::max<uint32_t>(1, width);
    height_ = std::max<uint32_t>(1, height);
    framebuffer_.resize(static_cast<size_t>(width_) * height_ * 4, 0);
}

void SoftwareCompositorDevice::begin_frame(uint64_t frame_index) {
    current_frame_ = frame_index;
    const size_t total = framebuffer_.size();
    for (size_t i = 0; i + 3 < total; i += 4) {
        framebuffer_[i] = 10;
        framebuffer_[i + 1] = 16;
        framebuffer_[i + 2] = 28;
        framebuffer_[i + 3] = 255;
    }
}

void SoftwareCompositorDevice::draw_background(const char* bg_id, const char* /*transition*/) {
    active_bg_ = bg_id ? bg_id : "";
}

void SoftwareCompositorDevice::draw_character(
    const char* /*char_id*/,
    const char* /*sprite_id*/,
    float x_norm,
    float y_norm,
    float scale,
    float opacity
) {
    if (framebuffer_.empty() || opacity <= 0.0f || scale <= 0.0f) {
        return;
    }
    const int cx = static_cast<int>(std::clamp(x_norm, 0.0f, 1.0f) * static_cast<float>(width_ - 1));
    const int cy = static_cast<int>(std::clamp(y_norm, 0.0f, 1.0f) * static_cast<float>(height_ - 1));
    const size_t idx = (static_cast<size_t>(cy) * width_ + static_cast<size_t>(cx)) * 4;
    if (idx + 3 < framebuffer_.size()) {
        const uint8_t a = static_cast<uint8_t>(std::clamp(opacity, 0.0f, 1.0f) * 255.0f);
        framebuffer_[idx] = 220;
        framebuffer_[idx + 1] = 235;
        framebuffer_[idx + 2] = 255;
        framebuffer_[idx + 3] = a;
    }
}

void SoftwareCompositorDevice::present_frame(uint64_t frame_index) {
    step_particles(1.0f / 60.0f);
    completed_frames_ = frame_index + 1;
}

void SoftwareCompositorDevice::shutdown() {
    framebuffer_.clear();
    particles_.clear();
}

void SoftwareCompositorDevice::apply_chroma_key_rgba(
    uint8_t* rgba_pixels,
    size_t pixel_count,
    uint8_t key_r,
    uint8_t key_g,
    uint8_t key_b,
    uint8_t tolerance
) noexcept {
    if (!rgba_pixels) return;
    const int tol_sq = static_cast<int>(tolerance) * static_cast<int>(tolerance) * 3;
    for (size_t i = 0; i < pixel_count; ++i) {
        uint8_t* px = rgba_pixels + i * 4;
        const int dr = static_cast<int>(px[0]) - static_cast<int>(key_r);
        const int dg = static_cast<int>(px[1]) - static_cast<int>(key_g);
        const int db = static_cast<int>(px[2]) - static_cast<int>(key_b);
        const int dist_sq = dr * dr + dg * dg + db * db;
        if (dist_sq <= tol_sq) {
            px[3] = 0;
        }
    }
}

void SoftwareCompositorDevice::apply_color_filter(const std::string& filter_name) noexcept {
    const size_t total = framebuffer_.size();
    if (filter_name == "grayscale") {
        for (size_t i = 0; i + 3 < total; i += 4) {
            const uint8_t luma = static_cast<uint8_t>(
                (static_cast<uint32_t>(framebuffer_[i]) * 77 +
                 static_cast<uint32_t>(framebuffer_[i + 1]) * 150 +
                 static_cast<uint32_t>(framebuffer_[i + 2]) * 29) >> 8
            );
            framebuffer_[i] = luma;
            framebuffer_[i + 1] = luma;
            framebuffer_[i + 2] = luma;
        }
    } else if (filter_name == "sepia") {
        for (size_t i = 0; i + 3 < total; i += 4) {
            const uint32_t r = framebuffer_[i];
            const uint32_t g = framebuffer_[i + 1];
            const uint32_t b = framebuffer_[i + 2];
            framebuffer_[i] = static_cast<uint8_t>(std::min<uint32_t>(255, (r * 101 + g * 197 + b * 48) >> 8));
            framebuffer_[i + 1] = static_cast<uint8_t>(std::min<uint32_t>(255, (r * 89 + g * 176 + b * 43) >> 8));
            framebuffer_[i + 2] = static_cast<uint8_t>(std::min<uint32_t>(255, (r * 70 + g * 137 + b * 33) >> 8));
        }
    }
}

void SoftwareCompositorDevice::step_particles(float dt_sec) noexcept {
    for (auto& p : particles_) {
        p.x += p.vx * dt_sec;
        p.y += p.vy * dt_sec;
        if (p.x < 0.0f) p.x += static_cast<float>(width_);
        if (p.y >= static_cast<float>(height_)) p.y -= static_cast<float>(height_);
    }
}

MooVNCppRendererVTable create_vtable_for_device(IRendererDevice* device) noexcept {
    MooVNCppRendererVTable vt{};
    vt.user_data = static_cast<void*>(device);
    vt.on_init = &cb_init;
    vt.on_resize = &cb_resize;
    vt.on_begin_frame = &cb_begin_frame;
    vt.on_draw_background = &cb_draw_bg;
    vt.on_draw_character = &cb_draw_char;
    vt.on_present_frame = &cb_present_frame;
    vt.on_shutdown = &cb_shutdown;
    return vt;
}

} // namespace moovn::renderer
