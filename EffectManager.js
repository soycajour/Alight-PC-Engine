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

    // 3. Gaussian Blur (simplified single-pass box blur for now, real gaussian requires 2 passes)
    this.programs.set('com.alightcreative.effects.gaussianblur', this.createProgram(`
      precision highp float;
      varying vec2 v_texcoord;
      uniform sampler2D u_texture;
      uniform float strength;
      uniform vec2 resolution;
      
      void main() {
        vec4 color = vec4(0.0);
        float total = 0.0;
        float radius = max(strength * 50.0, 0.1); 
        vec2 texel = 1.0 / resolution;
        
        // Fast approx 3x3
        for(float x = -1.0; x <= 1.0; x++) {
          for(float y = -1.0; y <= 1.0; y++) {
             color += texture2D(u_texture, v_texcoord + vec2(x, y) * texel * radius);
             total += 1.0;
          }
        }
        gl_FragColor = color / total;
      }
    `));
    
    // We can add the other 7 top effects here using the same pattern.
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
