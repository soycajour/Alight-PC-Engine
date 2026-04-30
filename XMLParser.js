// ============================================================
// Alight Motion XML Parser V2 — Full Scene Graph
// ============================================================

// --- Bezier Easing (kept from V1) ---
const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;
const kSplineTableSize = 11;
const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

function A(a1, a2) { return 1.0 - 3.0 * a2 + 3.0 * a1; }
function B(a1, a2) { return 3.0 * a2 - 6.0 * a1; }
function C(a1)     { return 3.0 * a1; }
function calcBezier(t, a1, a2) { return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t; }
function getSlope(t, a1, a2) { return 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1); }

function binarySubdivide(aX, aA, aB, mX1, mX2) {
  let currentX, currentT, i = 0;
  do {
    currentT = aA + (aB - aA) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0.0) aB = currentT; else aA = currentT;
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
}

function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
  for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
    let slope = getSlope(aGuessT, mX1, mX2);
    if (slope === 0.0) return aGuessT;
    aGuessT -= (calcBezier(aGuessT, mX1, mX2) - aX) / slope;
  }
  return aGuessT;
}

export function BezierEasing(mX1, mY1, mX2, mY2) {
  mX1 = Math.max(0, Math.min(1, mX1));
  mX2 = Math.max(0, Math.min(1, mX2));
  if (mX1 === mY1 && mX2 === mY2) return x => x;
  
  const samples = new Float32Array(kSplineTableSize);
  for (let i = 0; i < kSplineTableSize; ++i) samples[i] = calcBezier(i * kSampleStepSize, mX1, mX2);

  function getTForX(aX) {
    let start = 0.0, idx = 1, last = kSplineTableSize - 1;
    for (; idx !== last && samples[idx] <= aX; ++idx) start += kSampleStepSize;
    --idx;
    let dist = (aX - samples[idx]) / (samples[idx + 1] - samples[idx]);
    let guess = start + dist * kSampleStepSize;
    let slope = getSlope(guess, mX1, mX2);
    if (slope >= NEWTON_MIN_SLOPE) return newtonRaphsonIterate(aX, guess, mX1, mX2);
    if (slope === 0.0) return guess;
    return binarySubdivide(aX, start, start + kSampleStepSize, mX1, mX2);
  }
  return x => (x === 0 || x === 1) ? x : calcBezier(getTForX(x), mY1, mY2);
}

// --- Elastic Easing ---
function ElasticEasing(amp, period, decay, bounce) {
  return function(t) {
    if (t === 0 || t === 1) return t;
    const s = period / (2 * Math.PI) * Math.asin(1 / amp);
    const envelope = Math.pow(2, -decay * 10 * t);
    return 1 + envelope * amp * Math.sin((t - s) * (2 * Math.PI) / period) * bounce;
  };
}

// --- Parse easing string ---
function parseEasing(eStr) {
  if (!eStr) return x => x;
  if (eStr.startsWith('cubicBezier')) {
    const p = eStr.split(' ');
    if (p.length >= 5) return BezierEasing(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]), parseFloat(p[4]));
  }
  if (eStr.startsWith('elastic')) {
    const p = eStr.split(' ');
    if (p.length >= 5) return ElasticEasing(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]), parseFloat(p[4]));
  }
  return x => x;
}

// --- Value parsers ---
function parseFloatSafe(v) { return v != null ? parseFloat(v) : 0; }

function parseValue(type, valStr) {
  if (valStr == null || valStr === '') return null;
  if (type === 'float' || type === 'int') return parseFloat(valStr) || 0;
  if (type === 'bool') return valStr === 'true';
  if (type === 'vec2') {
    const p = valStr.split(',');
    return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0];
  }
  if (type === 'vec3') {
    const p = valStr.split(',');
    return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0, parseFloat(p[2]) || 0];
  }
  if (type === 'color') return valStr;
  return valStr;
}

// --- Parse keyframeable property or static value ---
function parseProperty(propNode) {
  const name = propNode.getAttribute('name');
  const type = propNode.getAttribute('type') || 'float';
  const valueAttr = propNode.getAttribute('value');
  const prop = { name, type, keyframes: [] };

  if (valueAttr !== null) {
    prop.staticValue = parseValue(type, valueAttr);
  }
  
  const kfNodes = propNode.querySelectorAll(':scope > kf');
  if (kfNodes.length > 0) {
    delete prop.staticValue;
    kfNodes.forEach(kf => {
      prop.keyframes.push({
        t: parseFloat(kf.getAttribute('t')),
        v: parseValue(type, kf.getAttribute('v')),
        easingFunc: parseEasing(kf.getAttribute('e'))
      });
    });
    prop.keyframes.sort((a, b) => a.t - b.t);
  }
  return prop;
}

// --- Parse a keyframeable inline element (like <location>, <scale>, etc.) ---
function parseTransformProp(node, name, type) {
  if (!node) return null;
  const prop = { name, type, keyframes: [] };
  const valueAttr = node.getAttribute('value');
  
  if (valueAttr !== null) {
    prop.staticValue = parseValue(type, valueAttr);
  }
  
  const kfNodes = node.querySelectorAll(':scope > kf');
  if (kfNodes.length > 0) {
    delete prop.staticValue;
    kfNodes.forEach(kf => {
      prop.keyframes.push({
        t: parseFloat(kf.getAttribute('t')),
        v: parseValue(type, kf.getAttribute('v')),
        easingFunc: parseEasing(kf.getAttribute('e'))
      });
    });
    prop.keyframes.sort((a, b) => a.t - b.t);
  }
  return prop;
}

// --- Parse <transform> block ---
function parseTransform(node) {
  const txNode = node.querySelector(':scope > transform');
  const tx = {
    location: null, scale: null, rotation: null,
    pivot: null, opacity: null
  };
  if (!txNode) return tx;
  
  const loc = txNode.querySelector(':scope > location');
  if (loc) tx.location = parseTransformProp(loc, 'location', 'vec3');
  
  const sc = txNode.querySelector(':scope > scale');
  if (sc) tx.scale = parseTransformProp(sc, 'scale', 'vec2');
  
  const rot = txNode.querySelector(':scope > rotation');
  if (rot) tx.rotation = parseTransformProp(rot, 'rotation', 'float');
  
  const piv = txNode.querySelector(':scope > pivot');
  if (piv) tx.pivot = parseTransformProp(piv, 'pivot', 'vec2');
  
  const op = txNode.querySelector(':scope > opacity');
  if (op) tx.opacity = parseTransformProp(op, 'opacity', 'float');
  
  return tx;
}

// --- Parse effects ---
function parseEffects(parentNode) {
  const effects = [];
  const effectNodes = parentNode.querySelectorAll(':scope > effect');
  effectNodes.forEach(en => {
    const effect = {
      id: en.getAttribute('id'),
      hidden: en.getAttribute('hidden') === 'true',
      locallyApplied: en.getAttribute('locallyApplied') === 'true',
      properties: {}
    };
    en.querySelectorAll(':scope > property').forEach(pn => {
      const p = parseProperty(pn);
      effect.properties[p.name] = p;
    });
    effects.push(effect);
  });
  return effects;
}

// --- Parse gradient ---
function parseGradient(node) {
  const gn = node.querySelector(':scope > gradient');
  if (!gn) return null;
  return {
    type: gn.getAttribute('type') || 'linear',
    startColor: gn.getAttribute('startColor'),
    endColor: gn.getAttribute('endColor'),
    start: parseValue('vec2', gn.getAttribute('start')),
    end: parseValue('vec2', gn.getAttribute('end'))
  };
}

// --- Parse shadow ---
function parseShadow(node) {
  const sn = node.querySelector(':scope > shadow');
  if (!sn) return null;
  const shadow = { direction: sn.getAttribute('direction') || 'outside', enabled: sn.getAttribute('enabled') !== 'false' };
  const col = sn.querySelector(':scope > color');
  if (col) shadow.color = col.getAttribute('value');
  const sz = sn.querySelector(':scope > size');
  if (sz) shadow.size = parseFloat(sz.getAttribute('value'));
  const op = sn.querySelector(':scope > opacity');
  if (op) shadow.opacity = parseFloat(op.getAttribute('value'));
  const off = sn.querySelector(':scope > offset');
  if (off) shadow.offset = off.getAttribute('value');
  const h = sn.querySelector(':scope > hardness');
  if (h) shadow.hardness = parseFloat(h.getAttribute('value'));
  return shadow;
}

// --- Parse fillColor (may be keyframed) ---
function parseFillColor(node) {
  const fc = node.querySelector(':scope > fillColor');
  if (!fc) return null;
  return parseTransformProp(fc, 'fillColor', 'color');
}

// --- Parse path data ---
function parsePath(node) {
  const pathNode = node.querySelector(':scope > path');
  if (!pathNode) return null;
  return pathNode.getAttribute('d');
}

// --- Parse path-stroke ---
function parsePathStroke(node) {
  const ps = node.querySelector(':scope > path-stroke');
  if (!ps) return null;
  const stroke = { direction: ps.getAttribute('direction'), endSize: parseFloatSafe(ps.getAttribute('end-size')) };
  const col = ps.querySelector(':scope > color');
  if (col) stroke.color = col.getAttribute('value');
  const sz = ps.querySelector(':scope > size');
  if (sz) stroke.size = parseFloat(sz.getAttribute('value'));
  return stroke;
}

// --- Main node parser (recursive) ---
function parseNode(xmlNode) {
  const tag = xmlNode.tagName;
  const node = {
    type: tag, // 'shape', 'text', 'embedScene', 'nullobj'
    id: xmlNode.getAttribute('id'),
    label: xmlNode.getAttribute('label') || '',
    startTime: parseFloatSafe(xmlNode.getAttribute('startTime')),
    endTime: parseFloatSafe(xmlNode.getAttribute('endTime')),
    hidden: xmlNode.getAttribute('hidden') === 'true',
    parentId: xmlNode.getAttribute('parent') || null,
    blending: xmlNode.getAttribute('blending') || 'normal',
    clippingMask: xmlNode.getAttribute('clippingMask') === 'true',
    transform: parseTransform(xmlNode),
    effects: parseEffects(xmlNode),
    fillColor: parseFillColor(xmlNode),
    gradient: parseGradient(xmlNode),
    shadow: parseShadow(xmlNode),
    children: []
  };

  // Shape-specific
  if (tag === 'shape') {
    node.shapeType = xmlNode.getAttribute('s') || 'custom'; // .rect, .roundrect, .circle
    node.fillType = xmlNode.getAttribute('fillType') || 'color';
    node.fillImage = xmlNode.getAttribute('fillImage') || null;
    node.fillVideo = xmlNode.getAttribute('fillVideo') || null;
    node.pathData = parsePath(xmlNode);
    node.pathStroke = parsePathStroke(xmlNode);
    // Parse shape properties (size, cornerRadius, etc.)
    node.properties = {};
    xmlNode.querySelectorAll(':scope > property').forEach(pn => {
      const p = parseProperty(pn);
      node.properties[p.name] = p;
    });
  }

  // Text-specific
  if (tag === 'text') {
    node.fillType = xmlNode.getAttribute('fillType') || 'color';
    node.fontSize = parseFloatSafe(xmlNode.getAttribute('size')) || 18;
    node.font = xmlNode.getAttribute('font') || '';
    node.align = xmlNode.getAttribute('align') || 'left';
    node.wrapWidth = parseFloatSafe(xmlNode.getAttribute('wrapWidth')) || 512;
    const content = xmlNode.querySelector(':scope > content');
    node.content = content ? content.textContent : '';
    node.properties = {};
    xmlNode.querySelectorAll(':scope > property').forEach(pn => {
      const p = parseProperty(pn);
      node.properties[p.name] = p;
    });
  }

  // NullObj-specific
  if (tag === 'nullobj') {
    node.nullType = xmlNode.getAttribute('type') || 'transform';
  }

  // EmbedScene — recurse into inner <scene>
  if (tag === 'embedScene') {
    node.fillType = xmlNode.getAttribute('fillType') || 'intrinsic';
    const innerScene = xmlNode.querySelector(':scope > scene');
    if (innerScene) {
      node.sceneWidth = parseFloatSafe(innerScene.getAttribute('width'));
      node.sceneHeight = parseFloatSafe(innerScene.getAttribute('height'));
      node.sceneBgColor = innerScene.getAttribute('bgcolor') || '#00000000';
      node.children = parseSceneChildren(innerScene);
    }
  }

  return node;
}

// --- Parse all direct child nodes of a <scene> ---
function parseSceneChildren(sceneNode) {
  const children = [];
  for (const child of sceneNode.children) {
    const tag = child.tagName;
    if (tag === 'shape' || tag === 'text' || tag === 'embedScene' || tag === 'nullobj') {
      children.push(parseNode(child));
    }
    // Skip <media>, <bookmark> — metadata only
  }
  return children;
}

// --- Resolve parent relationships ---
function resolveParenting(nodes, lookup) {
  // Build lookup
  function buildLookup(nodeList) {
    for (const n of nodeList) {
      lookup[n.id] = n;
      if (n.children) buildLookup(n.children);
    }
  }
  buildLookup(nodes);
}

// ============================================================
// Main Parser Class
// ============================================================
export class AlightXMLParser {
  
  static parse(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const root = doc.documentElement; // <scene>

    const scene = {
      title: root.getAttribute('title') || 'Untitled',
      width: parseFloatSafe(root.getAttribute('width')) || 1920,
      height: parseFloatSafe(root.getAttribute('height')) || 1080,
      exportWidth: parseFloatSafe(root.getAttribute('exportWidth')),
      exportHeight: parseFloatSafe(root.getAttribute('exportHeight')),
      bgColor: root.getAttribute('bgcolor') || '#ff000000',
      totalTime: parseFloatSafe(root.getAttribute('totalTime')),
      fps: parseFloatSafe(root.getAttribute('fps')) || 30,
      nodes: [],    // Full scene graph tree
      nodeLookup: {},  // id → node reference
      
      // Legacy compat for current render loop
      shapes: [],
    };

    // Parse bookmarks
    scene.bookmarks = [];
    root.querySelectorAll(':scope > bookmark').forEach(b => {
      scene.bookmarks.push(parseFloatSafe(b.getAttribute('t')));
    });

    // Parse media references
    scene.media = [];
    root.querySelectorAll(':scope > media').forEach(m => {
      scene.media.push({
        uri: m.getAttribute('uri'),
        filename: m.getAttribute('filename'),
        type: m.getAttribute('type'),
        width: parseFloatSafe(m.getAttribute('width')),
        height: parseFloatSafe(m.getAttribute('height')),
        duration: parseFloatSafe(m.getAttribute('duration'))
      });
    });

    // Parse all children of root scene
    scene.nodes = parseSceneChildren(root);
    
    // Resolve parent references
    resolveParenting(scene.nodes, scene.nodeLookup);

    // Legacy compat: flatten shapes for existing render loop
    scene.shapes = this._flattenShapes(scene.nodes);

    return scene;
  }

  // Flatten tree into render list preserving full node data (including parentId/transform)
  static _flattenShapes(nodes) {
    const result = [];
    function walk(nodeList) {
      for (const n of nodeList) {
        // Renderable types only (nullobj acts as a transform parent, not drawn)
        if (n.type === 'shape' || n.type === 'text' || n.type === 'embedScene') {
          result.push(n); // push the FULL node reference — no stripping
        }
        if (n.children && n.children.length > 0) walk(n.children);
      }
    }
    walk(nodes);
    return result;
  }

  // --- Evaluate a property at a given normalized time ---
  static evaluateProperty(propData, normalizedTime) {
    if (propData.staticValue !== undefined) return propData.staticValue;
    
    const kfs = propData.keyframes;
    if (!kfs || kfs.length === 0) return 0;
    if (kfs.length === 1) return kfs[0].v;
    if (normalizedTime <= kfs[0].t) return kfs[0].v;
    if (normalizedTime >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;

    for (let i = 0; i < kfs.length - 1; i++) {
      if (normalizedTime >= kfs[i].t && normalizedTime <= kfs[i + 1].t) {
        const kf1 = kfs[i], kf2 = kfs[i + 1];
        const localT = (normalizedTime - kf1.t) / (kf2.t - kf1.t);
        const easedT = kf1.easingFunc ? kf1.easingFunc(localT) : localT;

        if (typeof kf1.v === 'number') {
          return kf1.v + (kf2.v - kf1.v) * easedT;
        }
        if (Array.isArray(kf1.v)) {
          return kf1.v.map((v, idx) => v + (kf2.v[idx] - v) * easedT);
        }
        // Color or string: no interpolation, snap
        return easedT < 0.5 ? kf1.v : kf2.v;
      }
    }
    return kfs[kfs.length - 1].v;
  }

  // --- Evaluate transform at absolute time ---
  static evaluateTransform(transform, normalizedTime) {
    const result = {
      x: 0, y: 0, z: 0,
      scaleX: 1, scaleY: 1,
      rotation: 0,
      pivotX: 0, pivotY: 0,
      opacity: 1
    };
    if (!transform) return result;

    if (transform.location) {
      const loc = this.evaluateProperty(transform.location, normalizedTime);
      if (Array.isArray(loc)) { 
        result.x = loc[0]; 
        result.y = loc[1]; 
        result.z = loc[2] || 0; 
      }
    }
    if (transform.scale) {
      const sc = this.evaluateProperty(transform.scale, normalizedTime);
      if (Array.isArray(sc)) { 
        result.scaleX = sc[0]; 
        result.scaleY = sc[1]; 
      } else if (typeof sc === 'number') { 
        result.scaleX = sc; 
        result.scaleY = sc; 
      }
    }
    if (transform.rotation) {
      const rot = this.evaluateProperty(transform.rotation, normalizedTime);
      result.rotation = typeof rot === 'number' ? rot : 0;
    }
    if (transform.pivot) {
      const pv = this.evaluateProperty(transform.pivot, normalizedTime);
      if (Array.isArray(pv)) { 
        result.pivotX = pv[0]; 
        result.pivotY = pv[1]; 
      }
    }
    if (transform.opacity) {
      const op = this.evaluateProperty(transform.opacity, normalizedTime);
      result.opacity = typeof op === 'number' ? op : 1;
    }
    return result;
  }
}
