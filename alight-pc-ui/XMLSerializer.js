/**
 * AlightXMLSerializer - Converts sceneData object back into Alight XML format
 */
export class AlightXMLSerializer {
  static serialize(sceneData) {
    const doc = document.implementation.createDocument(null, 'scene', null);
    const root = doc.documentElement;

    root.setAttribute('title', sceneData.title || 'Untitled');
    root.setAttribute('width', sceneData.width || 1920);
    root.setAttribute('height', sceneData.height || 1080);
    root.setAttribute('exportWidth', sceneData.exportWidth || sceneData.width || 1920);
    root.setAttribute('exportHeight', sceneData.exportHeight || sceneData.height || 1080);
    root.setAttribute('bgcolor', sceneData.bgColor || '#ff000000');
    root.setAttribute('totalTime', sceneData.totalTime || 5000);
    root.setAttribute('fps', sceneData.fps || 30);

    // Media
    if (sceneData.media) {
      sceneData.media.forEach(m => {
        const el = doc.createElement('media');
        el.setAttribute('uri', m.uri);
        el.setAttribute('filename', m.filename);
        el.setAttribute('type', m.type);
        if (m.width) el.setAttribute('width', m.width);
        if (m.height) el.setAttribute('height', m.height);
        if (m.duration) el.setAttribute('duration', m.duration);
        root.appendChild(el);
      });
    }

    // Nodes (Recursive)
    const nodes = sceneData.nodes || sceneData.shapes || [];
    nodes.forEach(node => {
      root.appendChild(this._serializeNode(doc, node));
    });

    const serializer = new XMLSerializer();
    return '<?xml version="1.0" encoding="utf-8"?>\n' + serializer.serializeToString(doc);
  }

  static _serializeNode(doc, node) {
    let elName = 'shape';
    if (node.type === 'text') elName = 'text';
    if (node.type === 'nullobj') elName = 'nullobj';
    if (node.type === 'embedScene') elName = 'embedScene';

    const el = doc.createElement(elName);
    if (node.id) el.setAttribute('id', node.id);
    if (node.label) el.setAttribute('label', node.label);
    if (node.shapeType) el.setAttribute('type', node.shapeType);
    if (node.startTime !== undefined) el.setAttribute('startTime', node.startTime);
    if (node.endTime !== undefined) el.setAttribute('endTime', node.endTime);
    if (node.parentId) el.setAttribute('parentId', node.parentId);
    if (node.blending) el.setAttribute('blending', node.blending);
    if (node.hidden) el.setAttribute('hidden', 'true');

    // Transform
    if (node.transform) {
      const txEl = doc.createElement('transform');
      Object.keys(node.transform).forEach(k => {
        txEl.appendChild(this._serializeProperty(doc, k, node.transform[k]));
      });
      el.appendChild(txEl);
    }

    // Properties
    if (node.properties) {
      Object.keys(node.properties).forEach(k => {
        el.appendChild(this._serializeProperty(doc, k, node.properties[k]));
      });
    }

    // Effects
    if (node.effects) {
      node.effects.forEach(fx => {
        const fxEl = doc.createElement('effect');
        fxEl.setAttribute('id', fx.id);
        if (fx.properties) {
          Object.keys(fx.properties).forEach(k => {
            fxEl.appendChild(this._serializeProperty(doc, k, fx.properties[k]));
          });
        }
        el.appendChild(fxEl);
      });
    }

    // Children
    if (node.children) {
      node.children.forEach(child => {
        el.appendChild(this._serializeNode(doc, child));
      });
    }

    return el;
  }

  static _serializeProperty(doc, name, prop) {
    const el = doc.createElement(name);
    
    // Determine type
    let type = 'float';
    const val = prop.staticValue !== undefined ? prop.staticValue : (prop.keyframes ? prop.keyframes[0].v : 0);
    if (Array.isArray(val)) {
      type = val.length === 2 ? 'vec2' : 'vec3';
    } else if (typeof val === 'string' && val.startsWith('#')) {
      type = 'color';
    } else if (typeof val === 'boolean') {
      type = 'bool';
    }
    el.setAttribute('type', type);

    if (prop.keyframes && prop.keyframes.length > 0) {
      prop.keyframes.forEach(kf => {
        const kfEl = doc.createElement('keyframe');
        kfEl.setAttribute('t', kf.t);
        kfEl.setAttribute('v', Array.isArray(kf.v) ? kf.v.join(',') : kf.v);
        if (kf.easing) kfEl.setAttribute('e', kf.easing);
        el.appendChild(kfEl);
      });
    } else if (prop.staticValue !== undefined) {
      el.setAttribute('value', Array.isArray(prop.staticValue) ? prop.staticValue.join(',') : prop.staticValue);
    }

    return el;
  }
}
