// ============================================================
// ShapeRenderer - Renders vector shapes to Canvas2D textures
// ============================================================

export class ShapeRenderer {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  // Resizes the internal canvas if needed
  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  // Clears the canvas
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Parse color string to rgba format (Alight uses #AARRGGBB or #RRGGBB)
  _parseColor(colorStr) {
    if (!colorStr) return 'rgba(0,0,0,0)';
    if (colorStr.startsWith('#')) {
      let hex = colorStr.substring(1);
      if (hex.length === 8) {
        // AARRGGBB -> RRGGBBAA
        const a = parseInt(hex.substring(0, 2), 16) / 255;
        const r = parseInt(hex.substring(2, 4), 16);
        const g = parseInt(hex.substring(4, 6), 16);
        const b = parseInt(hex.substring(6, 8), 16);
        return `rgba(${r},${g},${b},${a})`;
      } else if (hex.length === 6) {
        return `#${hex}`;
      }
    }
    return colorStr;
  }

  // Renders a shape node onto the canvas
  renderShape(node, properties, worldMatrix) {
    const ctx = this.ctx;
    ctx.save();

    // Default dimensions
    let width = properties.size ? properties.size[0] : 100;
    let height = properties.size ? properties.size[1] : 100;

    // Apply the accumulated world transform (parent chain)
    // worldMatrix.m = [a, b, c, d, tx, ty]
    if (worldMatrix) {
      const [a, b, c, d, tx, ty] = worldMatrix.m;
      ctx.transform(a, b, c, d, tx, ty);
    }


    if (node.type === 'text') {
      const fontSize = properties.size || node.fontSize || 24;
      const fontName = node.font || 'sans-serif';
      ctx.font = `${fontSize}px ${fontName}, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const text = node.textContent || node.content || '';
      
      if (node.fillType === 'color' || node.fillColor) {
        const color = properties.fillColor || (node.fillColor ? node.fillColor.staticValue : '#ffffffff');
        ctx.fillStyle = this._parseColor(color);
        ctx.fillText(text, 0, 0);
      }
      
      if (node.pathStroke) {
        ctx.strokeStyle = this._parseColor(node.pathStroke.color);
        ctx.lineWidth = node.pathStroke.size || 1;
        ctx.strokeText(text, 0, 0);
      }
    } 
    // Handle vector shapes
    else {
      // Path setup
      ctx.beginPath();
      
      if (node.shapeType === '.rect') {
        ctx.rect(-width/2, -height/2, width, height);
      } 
      else if (node.shapeType === '.roundrect') {
        let radius = properties.cornerRadius || 0;
        radius = Math.min(radius, width/2, height/2);
        ctx.roundRect(-width/2, -height/2, width, height, radius);
      }
      else if (node.shapeType === '.circle') {
        ctx.ellipse(0, 0, width/2, height/2, 0, 0, Math.PI * 2);
      }
      else if (node.pathData) {
        // Custom SVG path
        const p = new Path2D(node.pathData);
        ctx.addPath(p);
      } else {
        // Default fallback
        ctx.rect(-width/2, -height/2, width, height);
      }

      // Fill
      if (node.fillType === 'color' && node.fillColor) {
        const color = this._parseColor(properties.fillColor || (node.fillColor ? node.fillColor.staticValue : null));
        ctx.fillStyle = color;
        ctx.fill();
      } else if (node.gradient) {
        let grad;
        if (node.gradient.type === 'linear') {
          // Map normalized start/end to pixel coordinates relative to center
          const s = node.gradient.start || [0, 0];
          const e = node.gradient.end || [0, 1];
          grad = ctx.createLinearGradient(
            (s[0] - 0.5) * width, (s[1] - 0.5) * height,
            (e[0] - 0.5) * width, (e[1] - 0.5) * height
          );
        } else {
          grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) / 2);
        }
        
        grad.addColorStop(0, this._parseColor(node.gradient.startColor));
        grad.addColorStop(1, this._parseColor(node.gradient.endColor));
        ctx.fillStyle = grad;
        ctx.fill();
      } else if (node.fillType === 'media') {
        const mediaManager = properties.mediaManager;
        if (mediaManager) {
          const uri = node.fillImage || node.fillVideo;
          const mediaElement = mediaManager.getMedia(uri);
          if (mediaElement) {
            ctx.save(); ctx.clip();
            ctx.drawImage(mediaElement, -width/2, -height/2, width, height);
            ctx.restore();
          }
        }
      } else {
        // Fallback fill to make shapes visible
        ctx.fillStyle = 'rgba(100, 100, 150, 0.5)';
        ctx.fill();
      }

      // Stroke
      if (node.pathStroke) {
        ctx.strokeStyle = this._parseColor(node.pathStroke.color);
        ctx.lineWidth = node.pathStroke.size || 1;
        ctx.stroke();
      }
    }

    ctx.restore();
    return this.canvas;
  }
  
  // Creates or updates a WebGL texture from the current canvas state
  updateTexture(gl, texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
}
