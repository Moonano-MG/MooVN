cmake_minimum_required(VERSION 3.20)
project(moovn_renderer_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(moovn_renderer_bridge STATIC
    src/moovn_renderer_bridge.cpp
)

target_include_directories(moovn_renderer_bridge PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
