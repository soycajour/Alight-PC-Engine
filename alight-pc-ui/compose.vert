attribute vec4 position;
varying vec2 v_texcoord;
void main() {
    gl_Position = position;
    v_texcoord = position.xy * 0.5 + 0.5;
}
