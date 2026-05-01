// ============================================================
// StateManager - Handles scene state, history, and real-time edits
// ============================================================

export class StateManager {
  constructor(sceneData) {
    this.sceneData = sceneData;
    this.selectedShapeId = null;
    this.listeners = [];
  }

  // Set the current scene data
  setSceneData(data) {
    this.sceneData = data;
    this.notify('scene_changed');
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

    // Path can be 'transform.location', 'properties.size', etc.
    const parts = path.split('.');
    let target = shape;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }

    const key = parts[parts.length - 1];
    
    // If it was a keyframeable property, update staticValue
    if (target[key] && target[key].hasOwnProperty('staticValue')) {
      target[key].staticValue = value;
    } else {
      // Direct update
      target[key] = value;
    }

    this.notify('property_updated', { shapeId, path, value });
  }

  // Listen for changes
  addListener(callback) {
    this.listeners.push(callback);
  }

  // Get value by path
  getPropertyValue(obj, path) {
    const parts = path.split('.');
    let target = obj;
    for (const part of parts) {
      if (!target || !target[part]) return null;
      target = target[part];
    }
    // If it's a keyframeable property, return staticValue
    if (target && target.hasOwnProperty('staticValue')) return target.staticValue;
    return target;
  }

  notify(event, data) {
    this.listeners.forEach(cb => cb(event, data));
  }
}
