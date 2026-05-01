#version 100

precision highp float;
uniform vec4 color;
uniform float grid_spacing;
uniform vec2 grid_offset;
uniform float pixel_scale;
uniform float line_width;
varying vec2 st;

void main() {
    vec2 uv = abs(fract((st+grid_offset+grid_spacing*0.5+0.5)/grid_spacing)-0.5);
    float t = min(uv.x,uv.y);
    float p = clamp(1. - (t-(line_width/grid_spacing)) / (pixel_scale/grid_spacing),0.,1.);
    gl_FragColor = mix(vec4(0.),color,p);
}
