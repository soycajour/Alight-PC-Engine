// StateManager - Handles scene state, history, and real-time edits
// ============================================================
import { AlightXMLParser } from './XMLParser.js';

export class StateManager {
  constructor(sceneData) {
    this.sceneData = sceneData;
    this.selectedShapeId = null;
    this.listeners = [];
    this.currentTime = 0; // Current playhead time
  }

  // Set the current scene data
  setSceneData(data) {
    this.sceneData = data;
    this.notify('scene_changed');
  }

  setCurrentTime(time) {
    this.currentTime = time;
  }

  // Set selected shape
  selectShape(id) {
    this.selectedShapeId = id;
    this.notify('selection_changed', id);
  }

  // Get selected shape
  getSelectedShape() {
    if (!this.selectedShapeId || !this.sceneData.nodeLookup) return null;
    return this.sceneData.nodeLookup[this.selectedShapeId];
  }

  // Update a property of a shape
  updateProperty(shapeId, path, value) {
    const shape = this.sceneData.nodeLookup[shapeId];
    if (!shape) return;

    const parts = path.split('.');
    let target = shape;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }

    const key = parts[parts.length - 1];
    const prop = target[key];

    if (prop && prop.keyframes && prop.keyframes.length > 0) {
      // Keyframe update
      const normalizedTime = (this.currentTime - shape.startTime) / (shape.endTime - shape.startTime);
      const existingKf = prop.keyframes.find(kf => Math.abs(kf.t - normalizedTime) < 0.001);
      
      if (existingKf) {
        existingKf.v = value;
      } else {
        prop.keyframes.push({ t: normalizedTime, v: value });
        prop.keyframes.sort((a, b) => a.t - b.t);
      }
      delete prop.staticValue;
    } else {
      // Static update
      if (typeof prop === 'object' && prop !== null && !Array.isArray(prop)) {
         prop.staticValue = value;
         delete prop.keyframes;
      } else {
         target[key] = { staticValue: value };
      }
    }

    this.notify('property_updated', { shapeId, path, value });
  }

  // Toggle animation (static <-> animated)
  toggleAnimation(shapeId, path) {
    const shape = this.sceneData.nodeLookup[shapeId];
    if (!shape) return;

    const parts = path.split('.');
    let target = shape;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
    }
    const key = parts[parts.length - 1];
    const prop = target[key];

    if (prop.keyframes && prop.keyframes.length > 0) {
      // Turn off: Keep current value as static
      const normalizedTime = (this.currentTime - shape.startTime) / (shape.endTime - shape.startTime);
      // We would need a real evaluator here, but for now just use the first KF or a default
      prop.staticValue = prop.keyframes[0].v;
      delete prop.keyframes;
    } else {
      // Turn on: Create first keyframe at current time
      const normalizedTime = (this.currentTime - shape.startTime) / (shape.endTime - shape.startTime);
      const val = prop.staticValue !== undefined ? prop.staticValue : [0,0,0];
      prop.keyframes = [{ t: normalizedTime, v: val }];
      delete prop.staticValue;
    }

    this.notify('property_updated', { shapeId, path });
  }

  // Listen for changes
  addListener(callback) {
    this.listeners.push(callback);
  }

  // Get value by path
  getPropertyValue(obj, path) {
    if (!obj) return null;
    const parts = path.split('.');
    let target = obj;
    for (const part of parts) {
      if (!target || !target[part]) return null;
      target = target[part];
    }
    
    if (target && typeof target === 'object' && !Array.isArray(target)) {
       if (target.hasOwnProperty('staticValue')) return target.staticValue;
       if (target.keyframes && target.keyframes.length > 0) {
          const normalizedTime = (this.currentTime - obj.startTime) / (obj.endTime - obj.startTime);
          return AlightXMLParser.evaluateProperty(target, normalizedTime);
       }
    }
    return target;
  }

  notify(event, data) {
    this.listeners.forEach(cb => cb(event, data));
  }
}
