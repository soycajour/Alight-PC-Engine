// ============================================================
// GizmoManager - Handles interactive selection and transforms
// ============================================================

import { TransformMatrix } from './TransformMatrix.js';

export class GizmoManager {
  constructor(canvas, sceneData, worldResolver, stateManager) {
    this.canvas = canvas;
    this.sceneData = sceneData;
    this.worldResolver = worldResolver;
    this.stateManager = stateManager;

    this.selectedId = null;
    this.hoverId = null;
    
    this.isDragging = false;
    this.dragMode = null; // 'translate', 'scale', 'rotate'
    this.dragStartPos = { x: 0, y: 0 };
    this.initialTransform = null;
    
    this.viewMatrix = null;
    this.viewInverse = null;
  }

  updateView(viewMatrix) {
    this.viewMatrix = viewMatrix;
    this.viewInverse = viewMatrix.inverse();
  }

  // Converts screen (pixel) coordinates to Project Space coordinates
  screenToProject(screenX, screenY) {
    if (!this.viewInverse) return { x: screenX, y: screenY };
    return this.viewInverse.transformPoint(screenX, screenY);
  }

  // Simple hit testing for selection
  hitTest(screenX, screenY, currentTime) {
    const pt = this.screenToProject(screenX, screenY);
    
    // Iterate shapes in reverse (top to bottom)
    const shapes = [...(this.sceneData.shapes || [])].reverse();
    
    for (const shape of shapes) {
      if (shape.hidden) continue;
      if (currentTime < (shape.startTime || 0) || currentTime > (shape.endTime || 0)) continue;

      const worldMatrix = this.worldResolver.getWorldMatrix(shape.id, currentTime);
      const invWorld = worldMatrix.inverse();
      
      // Point in Local Space of the shape
      const localPt = invWorld.transformPoint(pt.x, pt.y);
      
      // Check boundaries (assuming center-aligned for now)
      const w = (shape.properties?.size?.[0] || 100) / 2;
      const h = (shape.properties?.size?.[1] || 100) / 2;
      
      if (localPt.x >= -w && localPt.x <= w && localPt.y >= -h && localPt.y <= h) {
        return shape.id;
      }
    }
    return null;
  }

  onMouseDown(e, currentTime) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hitId = this.hitTest(x, y, currentTime);
    
    if (hitId) {
      this.selectedId = hitId;
      this.isDragging = true;
      this.dragMode = 'translate';
      this.dragStartPos = this.screenToProject(x, y);
      
      const shape = this.sceneData.nodeLookup[hitId];
      // Clone initial location for delta calc
      const loc = this.stateManager.getPropertyValue(shape, 'transform.location');
      this.initialTransform = { location: [...(loc || [0,0,0])] };
      
      return hitId; // Signal that selection changed
    } else {
      this.selectedId = null;
      return null;
    }
  }

  onMouseMove(e, currentTime) {
    if (!this.isDragging || !this.selectedId) return false;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const currentPt = this.screenToProject(x, y);
    
    const dx = currentPt.x - this.dragStartPos.x;
    const dy = currentPt.y - this.dragStartPos.y;

    if (this.dragMode === 'translate') {
      const newLoc = [
        this.initialTransform.location[0] + dx,
        this.initialTransform.location[1] + dy,
        this.initialTransform.location[2] || 0
      ];
      
      const shape = this.sceneData.nodeLookup[this.selectedId];
      this.stateManager.setPropertyValue(shape, 'transform.location', newLoc);
      return true; // Needs redraw
    }
    
    return false;
  }

  onMouseUp() {
    this.isDragging = false;
    this.dragMode = null;
  }

  draw(ctx, currentTime) {
    if (!this.selectedId) return;
    
    const shape = this.sceneData.nodeLookup[this.selectedId];
    if (!shape) return;

    const worldMatrix = this.worldResolver.getWorldMatrix(this.selectedId, currentTime);
    const finalMatrix = this.viewMatrix.multiply(worldMatrix);
    
    const w = (shape.properties?.size?.[0] || 100);
    const h = (shape.properties?.size?.[1] || 100);
    
    ctx.save();
    const [a, b, c, d, tx, ty] = finalMatrix.m;
    ctx.transform(a, b, c, d, tx, ty);
    
    // Selection Box
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(-w/2, -h/2, w, h);
    
    // Handles (Corners)
    ctx.fillStyle = '#fff';
    const hs = 6;
    [[-w/2, -h/2], [w/2, -h/2], [-w/2, h/2], [w/2, h/2]].forEach(p => {
      ctx.fillRect(p[0]-hs/2, p[1]-hs/2, hs, hs);
      ctx.strokeRect(p[0]-hs/2, p[1]-hs/2, hs, hs);
    });

    // Anchor Point
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#8b5cf6';
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
