// ============================================================
// GraphEditor — Bezier Curve Editor for Keyframe Properties
// Renders to a Canvas2D overlay. Supports drag handles.
// ============================================================

export class GraphEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair;';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // State
    this.property = null;       // The property data (keyframes array) being edited
    this.selectedKfIndex = -1;
    this.dragging = null;       // { type: 'kf'|'handle1'|'handle2', index }
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
    this.property = propData ? JSON.parse(JSON.stringify(propData)) : null; // deep copy
    this.selectedKfIndex = -1;
    this.draw();
  }

  // Call when property changes to notify main.js
  onChange(cb) { this.onChangeCallback = cb; }

  // ---- Coordinate Mapping ----
  // Maps normalizedTime [0,1] and value to canvas pixel coords
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
      if (Array.isArray(k.v)) return k.v[0]; // Draw the first component (X) for now
      return 0;
    });
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.2 || 0.5;
    return [min - pad, max + pad];
  }

  // ---- Drawing ----
  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;

    // Background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);

    this._drawGrid();

    if (!this.property || !this.property.keyframes || this.property.keyframes.length < 1) {
      ctx.fillStyle = '#475569';
      ctx.font = '500 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Select a layer with keyframes to edit curves', w / 2, h / 2);
      return;
    }

    this._drawCurve();
    this._drawKeyframes();
    this._drawLabels();
  }

  _drawGrid() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;

    // Vertical lines (time)
    for (let i = 0; i <= 10; i++) {
      const x = this.viewPadding + (i / 10) * (w - this.viewPadding * 2);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal (value zero line)
    const zeroScreen = this._toScreen(0, 0);
    ctx.strokeStyle = '#3a3a6a';
    ctx.beginPath();
    ctx.moveTo(0, zeroScreen.y);
    ctx.lineTo(w, zeroScreen.y);
    ctx.stroke();
  }

  _drawCurve() {
    const ctx = this.ctx;
    const kfs = this.property.keyframes;
    if (kfs.length < 2) return;

    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Sample the curve at many points
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const v = this._evaluateAtT(t);
      const pt = this._toScreen(t, v);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
  }

  _evaluateAtT(t) {
    const kfs = this.property.keyframes;
    if (!kfs || kfs.length === 0) return 0;
    const getVal = (v) => typeof v === 'number' ? v : (Array.isArray(v) ? v[0] : 0);

    if (kfs.length === 1) return getVal(kfs[0].v);
    if (t <= kfs[0].t) return getVal(kfs[0].v);
    if (t >= kfs[kfs.length - 1].t) return getVal(kfs[kfs.length - 1].v);

    for (let i = 0; i < kfs.length - 1; i++) {
      if (t >= kfs[i].t && t <= kfs[i + 1].t) {
        const kf1 = kfs[i], kf2 = kfs[i + 1];
        const localT = (t - kf1.t) / (kf2.t - kf1.t);
        const easedT = kf1.easingFunc ? kf1.easingFunc(localT) : localT;
        const v1 = getVal(kf1.v);
        const v2 = getVal(kf2.v);
        return v1 + (v2 - v1) * easedT;
      }
    }
    return 0;
  }

  _drawKeyframes() {
    const ctx = this.ctx;
    const kfs = this.property.keyframes;

    kfs.forEach((kf, i) => {
      const v = typeof kf.v === 'number' ? kf.v : (Array.isArray(kf.v) ? kf.v[0] : 0);
      const pt = this._toScreen(kf.t, v);
      const isSelected = i === this.selectedKfIndex;

      // Diamond keyframe marker
      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = isSelected ? '#f59e0b' : '#7c3aed';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      const size = isSelected ? 7 : 5;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    });
  }

  _drawLabels() {
    const ctx = this.ctx;
    const [minV, maxV] = this._valueRange();
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    // Value labels
    for (let i = 0; i <= 4; i++) {
      const v = minV + (i / 4) * (maxV - minV);
      const pt = this._toScreen(0, v);
      ctx.fillText(v.toFixed(2), this.viewPadding - 4, pt.y + 3);
    }

    // Time labels
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const pt = this._toScreen(t, minV);
      ctx.fillText(t.toFixed(2), pt.x, this.canvas.height - 4);
    }
  }

  // ---- Interaction ----
  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this._onMouseUp());
    this.canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._onRightClick(e);
    });
  }

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _hitTestKeyframe(mx, my, radius = 10) {
    if (!this.property) return -1;
    const kfs = this.property.keyframes;
    for (let i = 0; i < kfs.length; i++) {
      const v = typeof kfs[i].v === 'number' ? kfs[i].v : 0;
      const pt = this._toScreen(kfs[i].t, v);
      const dx = mx - pt.x, dy = my - pt.y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) return i;
    }
    return -1;
  }

  _onMouseDown(e) {
    const { x, y } = this._getMousePos(e);
    const hit = this._hitTestKeyframe(x, y);
    if (hit !== -1) {
      this.selectedKfIndex = hit;
      this.dragging = { type: 'kf', index: hit };
      this.draw();
    }
  }

  _onMouseMove(e) {
    if (!this.dragging) return;
    const { x, y } = this._getMousePos(e);
    const data = this._toData(x, y);
    const kf = this.property.keyframes[this.dragging.index];
    if (kf) {
      // Clamp time: don't cross adjacent keyframes
      const prev = this.property.keyframes[this.dragging.index - 1];
      const next = this.property.keyframes[this.dragging.index + 1];
      kf.t = Math.max(prev ? prev.t + 0.001 : 0, Math.min(next ? next.t - 0.001 : 1, data.t));
      
      if (typeof kf.v === 'number') {
        kf.v = data.v;
      } else if (Array.isArray(kf.v)) {
        kf.v[0] = data.v; // Only edit X in graph for now
      }
      this.draw();
      if (this.onChangeCallback) this.onChangeCallback(this.property);
    }
  }

  _onMouseUp() {
    this.dragging = null;
  }

  // Double-click: add new keyframe
  _onDblClick(e) {
    if (!this.property) return;
    const { x, y } = this._getMousePos(e);
    const data = this._toData(x, y);
    const newKf = { t: data.t, v: data.v, easingFunc: null };
    this.property.keyframes.push(newKf);
    this.property.keyframes.sort((a, b) => a.t - b.t);
    this.selectedKfIndex = this.property.keyframes.indexOf(newKf);
    this.draw();
    if (this.onChangeCallback) this.onChangeCallback(this.property);
  }

  // Right-click: delete selected keyframe
  _onRightClick(e) {
    if (!this.property) return;
    const { x, y } = this._getMousePos(e);
    const hit = this._hitTestKeyframe(x, y);
    if (hit !== -1 && this.property.keyframes.length > 1) {
      this.property.keyframes.splice(hit, 1);
      this.selectedKfIndex = -1;
      this.draw();
      if (this.onChangeCallback) this.onChangeCallback(this.property);
    }
  }
}
