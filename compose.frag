precision mediump float;
varying vec2 v_texcoord;
uniform sampler2D u_texture;
uniform float u_opacity;

void main() {
    vec4 color = texture2D(u_texture, v_texcoord);
    // Premultiplied alpha blending: output rgb is already premultiplied by alpha in the FBO
    gl_FragColor = color * u_opacity;
}
