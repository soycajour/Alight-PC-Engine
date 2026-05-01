precision mediump float;
varying vec2 v_texcoord;
uniform sampler2D u_texture;
uniform sampler2D u_mask;
uniform float u_opacity;
uniform float u_use_mask;

void main() {
    vec4 color = texture2D(u_texture, v_texcoord);
    if (u_use_mask > 0.5) {
        vec4 mask = texture2D(u_mask, v_texcoord);
        color *= mask.a; // Clip current layer by mask's alpha
    }
    gl_FragColor = color * u_opacity;
}
