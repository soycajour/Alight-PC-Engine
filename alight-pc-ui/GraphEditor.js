// ============================================================
// GraphEditor — Bezier Curve Editor for Keyframe Properties
// Renders to a Canvas2D overlay. Supports drag handles.
// ============================================================

export class GraphEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:default;';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // State
    this.property = null;       // The property data (keyframes array) being edited
    this.selectedKfIndex = -1;
    this.dragging = null;       // { type: 'kf'|'h1'|'h2', index }
    this.viewPadding = 40;
    this.onChangeCallback = null;

    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.container);
    this._resize();
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.draw();
  }

  // Load a property's keyframe data
  setProperty(propData) {
    // Deep copy to avoid direct mutation until we want to save
    this.property = propData ? JSON.parse(JSON.stringify(propData)) : null;
    this.selectedKfIndex = -1;
    this.draw();
  }

  // Call when property changes to notify main.js
  onChange(cb) { this.onChangeCallback = cb; }

  // ---- Coordinate Mapping ----
  _toScreen(t, v) {
    const w = this.canvas.width - this.viewPadding * 2;
    const h = this.canvas.height - this.viewPadding * 2;
    const [minV, maxV] = this._valueRange();
    const range = (maxV - minV) || 1;
    return {
      x: this.viewPadding + t * w,
      y: this.viewPadding + (1 - (v - minV) / range) * h
    };
  }

  _toData(px, py) {
    const w = this.canvas.width - this.viewPadding * 2;
    const h = this.canvas.height - this.viewPadding * 2;
    const [minV, maxV] = this._valueRange();
    const range = (maxV - minV) || 1;
    return {
      t: Math.max(0, Math.min(1, (px - this.viewPadding) / w)),
      v: minV + (1 - (py - this.viewPadding) / h) * range
    };
  }

  _valueRange() {
    if (!this.property || !this.property.keyframes || this.property.keyframes.length === 0) return [0, 1];
    const vals = this.property.keyframes.map(k => {
      if (typeof k.v === 'number') return k.v;
      if (Array.isArray(k.v)) return k.v[0];
      return 0;
    });
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.abs(max - min) * 0.2 || 10;
    return [min - pad, max + pad];
  }

  // ---- Drawing ----
  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);

    this._drawGrid();

    if (!this.property || !this.property.keyframes || this.property.keyframes.length < 1) {
      ctx.fillStyle = '#475569';
      ctx.font = '500 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Select a property with keyframes to edit curves', w / 2, h / 2);
      return;
    }

    this._drawCurve();
    this._drawHandles(); // Draw bezier palancas
    this._drawKeyframes();
    this._drawLabels();
  }

  _drawGrid() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.strokeStyle = '#1e1e2e';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 10; i++) {
      const x = this.viewPadding + (i / 10) * (w - this.viewPadding * 2);
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }

  _drawCurve() {
    const ctx = this.ctx;
    const kfs = this.property.keyframes;
    if (kfs.length < 2) return;

    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const v = this._evaluateAtT(t);
      const pt = this._toScreen(t, v);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  _evaluateAtT(t) {
    const kfs = this.property.keyframes;
    if (kfs.length === 0) return 0;
    const getVal = (v) => typeof v === 'number' ? v : (Array.isArray(v) ? v[0] : 0);

    if (t <= kfs[0].t) return getVal(kfs[0].v);
    if (t >= kfs[kfs.length - 1].t) return getVal(kfs[kfs.length - 1].v);

    for (let i = 0; i < kfs.length - 1; i++) {
      if (t >= kfs[i].t && t <= kfs[i + 1].t) {
        const kf1 = kfs[i], kf2 = kfs[i + 1];
        const localT = (t - kf1.t) / (kf2.t - kf1.t);
        
        // Bezier Interpolation logic
        // default handles if not present
        const h1 = kf1.h2 || { t: 0.33, v: 0 }; // Handle 2 of current KF (outgoing)
        const h2 = kf2.h1 || { t: -0.33, v: 0 }; // Handle 1 of next KF (incoming)
        
        const v1 = getVal(kf1.v);
        const v2 = getVal(kf2.v);

        // Cubic Bezier: p0, p1, p2, p3
        // p0 = (0, v1), p1 = (h1.t, v1 + h1.v), p2 = (1 + h2.t, v2 + h2.v), p3 = (1, v2)
        // Since we want v as a function of t, we use a simple approximation for ease
        const cp1 = { x: 0.33, y: v1 };
        const cp2 = { x: 0.66, y: v2 };
        
        // If handles exist, apply them
        const x1 = 0, y1 = v1;
        const x2 = h1.t, y2 = v1 + h1.v;
        const x3 = 1 + h2.t, y3 = v2 + h2.v;
        const x4 = 1, y4 = v2;

        // Cubic Bezier formula
        const mt = 1 - localT;
        const v = mt*mt*mt*y1 + 3*mt*mt*localT*y2 + 3*mt*localT*localT*y3 + localT*localT*localT*y4;
        return v;
      }
    }
    return 0;
  }

  _drawHandles() {
    if (this.selectedKfIndex === -1) return;
    const ctx = this.ctx;
    const kf = this.property.keyframes[this.selectedKfIndex];
    const v = typeof kf.v === 'number' ? kf.v : (Array.isArray(kf.v) ? kf.v[0] : 0);
    const pt = this._toScreen(kf.t, v);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#f59e0b';

    // Handle 1 (Incoming)
    if (this.selectedKfIndex > 0) {
      const h1 = kf.h1 || { t: -0.1, v: 0 };
      const hpt1 = this._toScreen(kf.t + h1.t, v + h1.v);
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(hpt1.x, hpt1.y); ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(hpt1.x - 3, hpt1.y - 3, 6, 6);
    }

    // Handle 2 (Outgoing)
    if (this.selectedKfIndex < this.property.keyframes.length - 1) {
      const h2 = kf.h2 || { t: 0.1, v: 0 };
      const hpt2 = this._toScreen(kf.t + h2.t, v + h2.v);
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(hpt2.x, hpt2.y); ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(hpt2.x - 3, hpt2.y - 3, 6, 6);
    }
  }

  _drawKeyframes() {
    const ctx = this.ctx;
    this.property.keyframes.forEach((kf, i) => {
      const v = typeof kf.v === 'number' ? kf.v : (Array.isArray(kf.v) ? kf.v[0] : 0);
      const pt = this._toScreen(kf.t, v);
      const isSelected = i === this.selectedKfIndex;

      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = isSelected ? '#f59e0b' : '#7c3aed';
      ctx.strokeStyle = '#fff';
      const size = isSelected ? 8 : 6;
      ctx.fillRect(-size/2, -size/2, size, size);
      ctx.strokeRect(-size/2, -size/2, size, size);
      ctx.restore();
    });
  }

  _drawLabels() {
    const ctx = this.ctx;
    const [minV, maxV] = this._valueRange();
    ctx.fillStyle = '#555';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = minV + (i/4) * (maxV - minV);
      const pt = this._toScreen(0, v);
      ctx.fillText(v.toFixed(1), this.viewPadding - 8, pt.y + 4);
    }
  }

  // ---- Interaction ----
  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      const { x, y } = this._getMousePos(e);
      
      // 1. Check Handles first
      if (this.selectedKfIndex !== -1) {
        const kf = this.property.keyframes[this.selectedKfIndex];
        const v = typeof kf.v === 'number' ? kf.v : (Array.isArray(kf.v) ? kf.v[0] : 0);
        
        if (this.selectedKfIndex > 0) {
          const h1 = kf.h1 || { t: -0.1, v: 0 };
          const hpt1 = this._toScreen(kf.t + h1.t, v + h1.v);
          if (Math.hypot(x - hpt1.x, y - hpt1.y) < 10) {
            this.dragging = { type: 'h1', index: this.selectedKfIndex };
            return;
          }
        }
        if (this.selectedKfIndex < this.property.keyframes.length - 1) {
          const h2 = kf.h2 || { t: 0.1, v: 0 };
          const hpt2 = this._toScreen(kf.t + h2.t, v + h2.v);
          if (Math.hypot(x - hpt2.x, y - hpt2.y) < 10) {
            this.dragging = { type: 'h2', index: this.selectedKfIndex };
            return;
          }
        }
      }

      // 2. Check Keyframes
      const hit = this._hitTestKeyframe(x, y);
      if (hit !== -1) {
        this.selectedKfIndex = hit;
        this.dragging = { type: 'kf', index: hit };
        this.draw();
      } else {
        this.selectedKfIndex = -1;
        this.draw();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const { x, y } = this._getMousePos(e);
      const data = this._toData(x, y);
      const kf = this.property.keyframes[this.dragging.index];
      const val = typeof kf.v === 'number' ? kf.v : (Array.isArray(kf.v) ? kf.v[0] : 0);

      if (this.dragging.type === 'kf') {
        kf.t = data.t;
        if (typeof kf.v === 'number') kf.v = data.v;
        else if (Array.isArray(kf.v)) kf.v[0] = data.v;
      } else if (this.dragging.type === 'h1') {
        if (!kf.h1) kf.h1 = { t: -0.1, v: 0 };
        kf.h1.t = data.t - kf.t;
        kf.h1.v = data.v - val;
      } else if (this.dragging.type === 'h2') {
        if (!kf.h2) kf.h2 = { t: 0.1, v: 0 };
        kf.h2.t = data.t - kf.t;
        kf.h2.v = data.v - val;
      }

      this.draw();
      if (this.onChangeCallback) this.onChangeCallback(this.property);
    });

    window.addEventListener('mouseup', () => { this.dragging = null; });
  }

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _hitTestKeyframe(mx, my) {
    if (!this.property) return -1;
    for (let i = 0; i < this.property.keyframes.length; i++) {
      const kf = this.property.keyframes[i];
      const v = typeof kf.v === 'number' ? kf.v : (Array.isArray(kf.v) ? kf.v[0] : 0);
      const pt = this._toScreen(kf.t, v);
      if (Math.hypot(mx - pt.x, my - pt.y) < 10) return i;
    }
    return -1;
  }
}
