#version 330 core

layout(location = 0) in vec3 aPos;

void main() {
    // Without semicolon this should trigger an error
    vec2 a = vec2(1.0, 2.0)
    vec2 b = vec2(1.0, 2.0);
    // Wrong type, should trigger an error
    vec2 c = 2.0;
    gl_Position = vec4(aPos, 1.0);
}