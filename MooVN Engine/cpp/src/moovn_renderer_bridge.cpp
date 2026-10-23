#include "../include/moovn_renderer.hpp"
#include "../include/moovn_api.hpp"

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
