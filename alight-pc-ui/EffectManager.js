// ============================================================
// EffectManager - Manages post-processing WebGL effect chains
// ============================================================

export class EffectManager {
  constructor(gl, composeVertSource) {
    this.gl = gl;
    this.vertShader = this.compileShader(gl.VERTEX_SHADER, composeVertSource);
    this.programs = new Map();
    
    // Core Alight Motion Effects Registry
    this.registerShaders();
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Error compiling shader:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  createProgram(fragSource) {
    const gl = this.gl;
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);
    const program = gl.createProgram();
    gl.attachShader(program, this.vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    return program;
  }

  registerShaders() {
    // 1. Exposure
    this.programs.set('com.alightcreative.effects.exposure', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float exposure; // Value from UI
      uniform float gamma;
      uniform float offset;
      
      void main() {
        vec4 color = texture2D(u_texture, v_texcoord);
        // Basic exposure: color * (2 ^ exposure)
        color.rgb = color.rgb * pow(2.0, exposure) + offset;
        color.rgb = pow(abs(color.rgb), vec3(1.0 / max(gamma, 0.001)));
        gl_FragColor = color;
      }
    `));

    // 2. Brightness / Contrast (brightcont2)
    this.programs.set('com.alightcreative.effects.brightcont2', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float brightness;
      uniform float contrast;
      
      void main() {
        vec4 color = texture2D(u_texture, v_texcoord);
        color.rgb += brightness;
        color.rgb = ((color.rgb - 0.5) * max(contrast, 0.0)) + 0.5;
        gl_FragColor = color;
      }
    `));

    // 3. Gaussian Blur (High Quality approximation)
    this.programs.set('com.alightcreative.effects.gaussianblur', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float strength;
      uniform vec2 resolution;
      
      void main() {
        vec4 color = vec4(0.0);
        float blur = strength * 64.0;
        float total = 0.0;
        for(float i = -4.0; i <= 4.0; i++) {
          float weight = exp(-(i*i)/(2.0*2.0));
          color += texture2D(u_texture, v_texcoord + vec2(i, 0.0) * blur / resolution) * weight;
          total += weight;
        }
        gl_FragColor = color / total;
      }
    `));

    // 4. Hue Shift / Saturation (huesat)
    this.programs.set('com.alightcreative.effects.huesat', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float hue;
      uniform float saturation;
      
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }
      
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      
      void main() {
        vec4 color = texture2D(u_texture, v_texcoord);
        vec3 hsv = rgb2hsv(color.rgb);
        hsv.x += hue / 360.0;
        hsv.y *= (1.0 + saturation);
        color.rgb = hsv2rgb(hsv);
        gl_FragColor = color;
      }
    `));

    // 5. Tiles (Mirror mode)
    this.programs.set('com.alightcreative.effects.tiles', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float count; // Usually 1.0 = normal
      uniform float mirror; // 1.0 = true
      
      void main() {
        vec2 uv = v_texcoord * max(count, 1.0);
        if (mirror > 0.5) {
          vec2 i = floor(uv);
          vec2 f = fract(uv);
          uv = mix(f, 1.0 - f, mod(i, 2.0));
        } else {
          uv = fract(uv);
        }
        gl_FragColor = texture2D(u_texture, uv);
      }
    `));

    // 6. Mirror
    this.programs.set('com.alightcreative.effects.mirror', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float count;
      
      void main() {
        vec2 uv = v_texcoord;
        float angle = 6.28318 / max(count, 1.0);
        float a = atan(uv.y - 0.5, uv.x - 0.5) + 0.5 * angle;
        a = mod(a, angle) - 0.5 * angle;
        float r = length(uv - 0.5);
        uv = vec2(cos(a), sin(a)) * r + 0.5;
        gl_FragColor = texture2D(u_texture, uv);
      }
    `));

    // 7. Glitch (Blocky distortion + RGB Split)
    this.programs.set('com.alightcreative.effects.glitch', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float strength;
      uniform float seed; // Value derived from time
      
      float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }
      
      void main() {
        vec2 uv = v_texcoord;
        float s = strength * 0.1;
        
        // Blocky shift
        float lineNoise = pow(rand(vec2(floor(uv.y * 15.0), seed)), 4.0) * s;
        uv.x += lineNoise;
        
        // RGB Split
        float r = texture2D(u_texture, uv + vec2(s * 0.5, 0.0)).r;
        float g = texture2D(u_texture, uv).g;
        float b = texture2D(u_texture, uv - vec2(s * 0.5, 0.0)).b;
        float a = texture2D(u_texture, uv).a;
        
        gl_FragColor = vec4(r, g, b, a);
      }
    `));

    // 8. Directional Blur
    this.programs.set('com.alightcreative.effects.dirblur', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float strength;
      uniform float angle; // degrees
      uniform vec2 resolution;
      
      void main() {
        vec4 color = vec4(0.0);
        float rad = angle * 0.0174533;
        vec2 dir = vec2(cos(rad), sin(rad)) * strength * 20.0 / resolution;
        
        float total = 0.0;
        for(float i = -5.0; i <= 5.0; i++) {
          color += texture2D(u_texture, v_texcoord + dir * i);
          total += 1.0;
        }
        gl_FragColor = color / total;
      }
    `));
  }

  // Applies a chain of effects using FBO ping-ponging
  // Returns the final FBO that contains the fully processed texture
  applyEffects(layerFBO, effectFBO, effects, properties, positionBuffer, resolution) {
    const gl = this.gl;
    
    // Disable blending during effect passes (overwrite texture entirely)
    gl.disable(gl.BLEND);
    
    let readFBO = layerFBO;
    let writeFBO = effectFBO;

    for (const effect of effects) {
      if (effect.hidden) continue;
      
      const program = this.programs.get(effect.id);
      if (!program) {
         // Effect not implemented yet, skip
         continue;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.frameBuffer);
      gl.viewport(0, 0, resolution[0], resolution[1]);
      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);

      // Bind quad buffers
      const posLoc = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(posLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const texLoc = gl.getUniformLocation(program, "u_texture");
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.texture);
      gl.uniform1i(texLoc, 0);

      // Set Resolution if needed
      const resLoc = gl.getUniformLocation(program, "resolution");
      if (resLoc) gl.uniform2f(resLoc, resolution[0], resolution[1]);

      // Map dynamic properties to uniforms
      for (const [propName, propData] of Object.entries(effect.properties)) {
         const uniformLoc = gl.getUniformLocation(program, propName);
         if (uniformLoc) {
            // Find evaluated property in currentProperties tree (passed from main loop)
            // Wait, effects properties are evaluated locally, but in main loop we didn't evaluate them!
            // Let's pass the evaluated values object for THIS effect.
            // Actually properties param should be the evaluated properties for this specific effect.
            const val = properties[effect.id] ? properties[effect.id][propName] : 0;
            
            if (typeof val === 'number') {
               gl.uniform1f(uniformLoc, val);
            } else if (Array.isArray(val) && val.length === 2) {
               gl.uniform2f(uniformLoc, val[0], val[1]);
            } else if (Array.isArray(val) && val.length === 3) {
               gl.uniform3f(uniformLoc, val[0], val[1], val[2]);
            }
         }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Swap FBOs
      let temp = readFBO;
      readFBO = writeFBO;
      writeFBO = temp;
    }

    // Return the FBO that has the final image
    return readFBO;
  }
}
