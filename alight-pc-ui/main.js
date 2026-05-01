import vertShaderSource from './tex2d.vert?raw'
import fragShaderSource from './grid.frag?raw'
import composeVertSource from './compose.vert?raw'
import composeFragSource from './compose.frag?raw'
import { AlightXMLParser } from './XMLParser.js'
import { ShapeRenderer } from './ShapeRenderer.js'
import { MediaManager } from './MediaManager.js'
import { EffectManager } from './EffectManager.js'
import { TransformMatrix, WorldTransformResolver } from './TransformMatrix.js'
import { GraphEditor } from './GraphEditor.js'
import { StateManager } from './StateManager.js'
import { AlightXMLSerializer } from './XMLSerializer.js'
import testPresetXml from './test-preset.xml?raw'

// Global Error Handling
window.onerror = (msg, url, line, col, error) => {
  console.error(`[Global Error] ${msg} at ${line}:${col}`, error);
  if (statusMsg) statusMsg.textContent = `Error: ${msg}`;
  return false;
};

// Initialize Managers
const mediaManager = new MediaManager();
console.log('Alight PC: Managers initialized');

// Parse the preset
let sceneData = AlightXMLParser.parse(testPresetXml);
mediaManager.preloadMedia(sceneData);

// Transform resolver — resolves parent-child world matrices
let worldResolver = new WorldTransformResolver(sceneData.nodeLookup, AlightXMLParser.evaluateTransform.bind(AlightXMLParser), AlightXMLParser);
const stateManager = new StateManager(sceneData);

// Timeline State
let isPlaying = true;
let currentAnimTime = 0;
let lastFrameTime = performance.now();

const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl');
const effectManager = new EffectManager(gl, composeVertSource);

// ═══════════════════════════════════════
// UI Element References
// ═══════════════════════════════════════
const tbPlay       = document.getElementById('tb-play');
const tbStart      = document.getElementById('tb-start');
const tbEnd        = document.getElementById('tb-end');
const tbTime       = document.getElementById('tb-time');
const tbFps        = document.getElementById('tb-fps');
const titlebarProj = document.getElementById('titlebar-project');
const viewerOverlay= document.getElementById('viewer-overlay');
const viewerTitle  = document.getElementById('viewer-scene-title');
const layerList    = document.getElementById('layer-list');
const layerCount   = document.getElementById('layer-count');
const propsContent = document.getElementById('props-content');
const btnToggleProps = document.getElementById('btn-toggle-props');
const panelProps   = document.getElementById('panel-properties');
const statusMsg    = document.getElementById('status-msg');
const statusScene  = document.getElementById('status-scene');

// Zoom logic
let viewerZoom = 1.0;
let viewerOffset = { x: 0, y: 0 };
let viewerScale = 1.0;

const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const zoomLabel = document.getElementById('zoom-label');

if (zoomInBtn) {
  zoomInBtn.addEventListener('click', () => updateZoom(viewerZoom * 1.1));
  zoomOutBtn.addEventListener('click', () => updateZoom(viewerZoom / 1.1));
  zoomResetBtn.addEventListener('click', () => updateZoom(1.0));
}

function updateZoom(newZoom) {
  viewerZoom = Math.max(0.05, Math.min(20, newZoom));
  if (zoomLabel) zoomLabel.textContent = `${Math.round(viewerZoom * 100)}%`;
}
const statusLayers = document.getElementById('status-layers');
const statusFpsLive= document.getElementById('status-fps-live');
const statusRender = document.getElementById('status-render');
const tlLabelCol   = document.getElementById('tl-label-col');
const tlTracksArea = document.getElementById('timeline-track-area');
const tlPlayhead   = document.getElementById('playhead');
const tlPlayheadTr = document.getElementById('playhead-track');
const btnGraph     = document.getElementById('btn-graph');
const graphPanel   = document.getElementById('graph-editor-panel');
const graphPropSel = document.getElementById('graph-property-select');
const btnCloseGph  = document.getElementById('btn-close-graph');
const btnImport    = document.getElementById('btn-import');
const btnExport    = document.getElementById('btn-export');
const btnSave      = document.getElementById('btn-save');
const btnOpenHint  = document.getElementById('btn-open-hint');
const btnZoomFit   = document.getElementById('btn-zoom-fit');
const btnAddLayer  = document.getElementById('btn-add-layer');

btnAddLayer.addEventListener('click', () => {
  const newId = 'shape_' + Math.random().toString(36).substr(2, 9);
  const newShape = {
    id: newId,
    type: 'shape',
    shapeType: '.rect',
    label: 'Rectangle',
    startTime: 0,
    endTime: sceneData.totalTime || 5000,
    transform: {
      location: { staticValue: [sceneData.width/2 || 540, sceneData.height/2 || 540, 0] },
      scale: { staticValue: [1.0, 1.0] },
      rotation: { staticValue: 0 },
      opacity: { staticValue: 1.0 }
    },
    properties: {
      size: { staticValue: [200, 200] },
      fillColor: { staticValue: '#ffffffff' }
    },
    fillType: 'color'
  };
  
  if (!sceneData.shapes) sceneData.shapes = [];
  sceneData.shapes.unshift(newShape); 
  if (!sceneData.nodeLookup) sceneData.nodeLookup = {};
  sceneData.nodeLookup[newId] = newShape;
  
  buildLayerList();
  buildTimeline();
  updateStatus();
});

// ═══════════════════════════════════════
// Graph Editor
// ═══════════════════════════════════════
const graphEditor = new GraphEditor('graph-editor-canvas-container');
let selectedShape = null;

btnGraph.addEventListener('click', () => {
  const vis = graphPanel.style.display !== 'none';
  graphPanel.style.display = vis ? 'none' : 'flex';
  if (!vis) graphEditor.draw();
});
btnCloseGph.addEventListener('click', () => { graphPanel.style.display = 'none'; });

graphPropSel.addEventListener('change', () => {
  if (!selectedShape) return;
  const key = graphPropSel.value;
  const prop = (selectedShape.properties && selectedShape.properties[key])
            || (selectedShape.transform && selectedShape.transform[key])
            || null;
  graphEditor.setProperty(prop);
});

function loadShapeIntoGraph(shape) {
  selectedShape = shape;
  graphPropSel.innerHTML = '<option value="">— Select Property —</option>';
  const add = (val, label) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = label;
    graphPropSel.appendChild(o);
  };
  if (shape.transform) {
    if (shape.transform.location) add('location', '📍 Location');
    if (shape.transform.scale)    add('scale',    '📐 Scale');
    if (shape.transform.rotation) add('rotation', '🔄 Rotation');
    if (shape.transform.opacity)  add('opacity',  '💧 Opacity');
  }
  if (shape.properties) Object.keys(shape.properties).forEach(k => add(k, `⚙️ ${k}`));
}

// ═══════════════════════════════════════
// Viewport Interaction (Gizmos)
// ═══════════════════════════════════════
let isDraggingGizmo = false;
let dragStartPos = { x: 0, y: 0 };
let dragStartLocation = [0, 0, 0];

canvas.addEventListener('mousedown', (e) => {
  if (!selectedShape) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  isDraggingGizmo = true;
  dragStartPos = { x, y };
  
  // Get current location evaluated at current time
  const normalizedTime = (currentAnimTime - selectedShape.startTime) / (selectedShape.endTime - selectedShape.startTime);
  const loc = AlightXMLParser.evaluateProperty(selectedShape.transform.location, normalizedTime);
  dragStartLocation = [...(loc || [0,0,0])];
});

window.addEventListener('mousemove', (e) => {
  if (!isDraggingGizmo || !selectedShape) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Account for zoom and offset
  const dx = (x - dragStartPos.x) / viewerScale;
  const dy = (y - dragStartPos.y) / viewerScale;
  
  const newLoc = [
    dragStartLocation[0] + dx,
    dragStartLocation[1] + dy,
    dragStartLocation[2]
  ];
  
  stateManager.updateProperty(selectedShape.id, 'transform.location', newLoc);
  updatePropertyInputs(selectedShape);
});

window.addEventListener('mouseup', () => {
  isDraggingGizmo = false;
});

// ═══════════════════════════════════════
// Properties Panel
// ═══════════════════════════════════════
btnToggleProps.addEventListener('click', () => {
  panelProps.classList.toggle('collapsed');
  btnToggleProps.textContent = panelProps.classList.contains('collapsed') ? '▶' : '◀';
});

let lastRenderedShapeId = null;

function renderPropertiesPanel(shape, force = false) {
  if (!shape) { 
    propsContent.innerHTML = '<div class="prop-empty">Select a layer</div>'; 
    lastRenderedShapeId = null;
    return; 
  }
  
  // Only recreate HTML if we switched shapes or force update
  if (shape.id !== lastRenderedShapeId || force) {
    let html = '';
    const tx = shape.transform;
    
    html += `<div class="prop-section">
      <div class="prop-section-title">Identity</div>
      <div class="prop-row"><span class="prop-label">Name</span><input type="text" class="prop-input" id="prop-name" value="${shape.label || shape.id || ''}"></div>
      <div class="prop-row"><span class="prop-label">Type</span><span class="prop-value">${shape.type}</span></div>
      <div class="prop-row"><span class="prop-label">Blend</span><span class="prop-blend">${shape.blending || 'normal'}</span></div>
    </div>`;

    if (tx) {
      html += `<div class="prop-section"><div class="prop-section-title">Transform</div>`;
      
      const renderProp = (p, label, path, defaultVal) => {
        let valHtml = '';
        const isAnimated = p && p.keyframes && p.keyframes.length > 0;
        
        if (isAnimated) {
          valHtml = `<span class="prop-value animated" data-path="${path}">${p.keyframes.length} KF</span>`;
        } else {
          const v = p ? p.staticValue : defaultVal;
          if (Array.isArray(v)) {
             valHtml = v.map((n, i) => `<input type="number" step="0.1" class="prop-input-small" data-path="${path}" data-index="${i}" value="${typeof n === 'number' ? n.toFixed(1) : n}">`).join('');
          } else {
             valHtml = `<input type="number" step="0.01" class="prop-input" data-path="${path}" value="${typeof v === 'number' ? v.toFixed(2) : v}">`;
          }
        }
        
        return `<div class="prop-row" data-prop-path="${path}">
          <span class="prop-label">${label}</span>
          <div class="prop-input-group">${valHtml}</div>
          <button class="prop-kf-btn ${isAnimated ? 'active' : ''}" data-path="${path}" title="Animate Property">⬥</button>
        </div>`;
      };

      html += renderProp(tx.location, 'Location', 'transform.location', [0, 0, 0]);
      html += renderProp(tx.scale,    'Scale',    'transform.scale',    [1.0, 1.0]);
      html += renderProp(tx.rotation, 'Rotation', 'transform.rotation', 0);
      html += renderProp(tx.opacity,  'Opacity',  'transform.opacity',  1.0);
      html += '</div>';
    }
    
    if (shape.effects && shape.effects.length > 0) {
      html += `<div class="prop-section"><div class="prop-section-title">Effects (${shape.effects.length})</div>`;
      shape.effects.forEach(fx => {
        html += `<div class="prop-row"><span class="prop-label" style="color:var(--accent-alt);">⚡ ${fx.id}</span></div>`;
      });
      html += '</div>';
    }
    propsContent.innerHTML = html;
    lastRenderedShapeId = shape.id;

    // Add listeners (only once per shape change)
    attachPropertyListeners(shape);
  } else {
    // Update existing inputs with current values (interpolated)
    updatePropertyInputs(shape);
  }
}

function attachPropertyListeners(shape) {
  // Input listener
  propsContent.querySelectorAll('.prop-input, .prop-input-small').forEach(input => {
    input.addEventListener('input', (e) => {
      const path = input.dataset.path;
      const index = input.dataset.index;
      let val = parseFloat(input.value);
      if (isNaN(val)) val = input.value;

      if (index !== undefined) {
        const currentArr = stateManager.getPropertyValue(shape, path) || [0,0,0];
        const newArr = [...currentArr];
        newArr[parseInt(index)] = val;
        stateManager.updateProperty(shape.id, path, newArr);
      } else {
        stateManager.updateProperty(shape.id, path, val);
      }
    });
  });

  // Name listener
  document.getElementById('prop-name')?.addEventListener('input', (e) => {
    shape.label = e.target.value;
    const labelEl = document.querySelector(`.layer-row[data-shape-id="${shape.id}"] .layer-name`);
    if (labelEl) labelEl.textContent = shape.label;
    const clipLabel = document.querySelector(`.tl-clip[data-shape-id="${shape.id}"] .tl-clip-label`);
    if (clipLabel) clipLabel.textContent = shape.label;
  });

  // Keyframe toggle listener
  propsContent.querySelectorAll('.prop-kf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = btn.dataset.path;
      stateManager.toggleAnimation(shape.id, path);
      renderPropertiesPanel(shape, true); // Force full redraw to show/hide inputs
      buildTimeline(); 
    });
  });
}

function updatePropertyInputs(shape) {
  // Don't update if user is typing
  if (document.activeElement.tagName === 'INPUT') return;

  propsContent.querySelectorAll('.prop-input, .prop-input-small').forEach(input => {
    const path = input.dataset.path;
    const index = input.dataset.index;
    const val = stateManager.getPropertyValue(shape, path);
    
    if (index !== undefined && Array.isArray(val)) {
      input.value = val[index].toFixed(1);
    } else if (typeof val === 'number') {
      input.value = val.toFixed(2);
    }
  });
  
  // Update KF badges
  propsContent.querySelectorAll('.prop-value.animated').forEach(badge => {
    const path = badge.dataset.path;
    const prop = stateManager.getPropertyValue(shape, path, true); // raw prop
    if (prop && prop.keyframes) {
      badge.textContent = `${prop.keyframes.length} KF`;
    }
  });
}

// ═══════════════════════════════════════
// Scene Loading
// ═══════════════════════════════════════
async function loadScene(data, filename = 'Project') {
  setStatus('Processing scene data...', 'loading');
  
  // If data is a string (legacy/fallback), parse it in JS
  if (typeof data === 'string') {
    sceneData = AlightXMLParser.parse(data);
  } else {
    // If it's already an object (from Rust), use it directly
    sceneData = data;
    // Note: Rust parser returns scene with .shapes while JS uses .shapes (or .layers in some versions)
    // We need to ensure compatibility.
    if (!sceneData.shapes && sceneData.layers) {
      sceneData.shapes = sceneData.layers;
    }
  }

  await mediaManager.preloadMedia(sceneData);
  stateManager.setSceneData(sceneData);
  selectedShape = null;

  worldResolver = new WorldTransformResolver(
    sceneData.nodeLookup || {},
    AlightXMLParser.evaluateTransform.bind(AlightXMLParser),
    AlightXMLParser
  );
  currentAnimTime = 0;
  isPlaying = false;
  tbPlay.classList.remove('playing');
  tbPlay.textContent = '▶';
  
  // Update UI
  titlebarProj.textContent = filename.replace(/\.xml$/i, '');
  viewerTitle.textContent = sceneData.title || filename;
  tbFps.textContent = `${sceneData.fps || 30} fps`;
  
  // Hide overlay
  viewerOverlay.classList.add('hidden');
  
  buildLayerList();
  buildTimeline();
  updateStatus();
  setStatus(`Loaded: ${sceneData.shapes.length} layers`, 'ok');
}

function setStatus(msg, type = 'ok') {
  statusMsg.textContent = msg;
  statusMsg.style.color = type === 'ok' ? 'var(--text-dim)'
    : type === 'loading' ? 'var(--amber)'
    : 'var(--red)';
}

function updateStatus() {
  statusScene.textContent = sceneData.title || 'Untitled';
  statusLayers.textContent = `${sceneData.shapes.length} layers`;
}

// ═══════════════════════════════════════
// Layer List (left panel)
// ═══════════════════════════════════════
function buildLayerList() {
  layerList.innerHTML = '';
  layerCount.textContent = sceneData.shapes.length;
  
  if (sceneData.shapes.length === 0) {
    layerList.innerHTML = '<div class="layer-empty">No layers</div>';
    return;
  }
  
  sceneData.shapes.forEach((shape, i) => {
    const icon = shape.type === 'text' ? '𝐓' : shape.type === 'embedScene' ? '⬡' : '◻';
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.shapeId = shape.id;
    row.innerHTML = `
      <span class="layer-icon">${icon}</span>
      <span class="layer-name">${shape.label || shape.id || `Layer ${i+1}`}</span>
      <span class="layer-type-badge">${shape.type}</span>
      <span class="layer-vis" title="Toggle visibility">👁</span>
    `;
    row.addEventListener('click', () => {
      document.querySelectorAll('.layer-row').forEach(r => r.classList.remove('selected'));
      document.querySelectorAll('.tl-clip').forEach(c => c.classList.remove('selected'));
      row.classList.add('selected');
      // Select matching timeline clip
      document.querySelector(`.tl-clip[data-shape-id="${shape.id}"]`)?.classList.add('selected');
      selectedShape = shape;
      stateManager.selectShape(shape.id);
      renderPropertiesPanel(shape);
      loadShapeIntoGraph(shape);
    });
    // Visibility toggle
    row.querySelector('.layer-vis').addEventListener('click', (e) => {
      e.stopPropagation();
      shape.hidden = !shape.hidden;
      e.target.style.opacity = shape.hidden ? '0.3' : '1';
    });
    layerList.appendChild(row);
  });
}

// ═══════════════════════════════════════
// Timeline
// ═══════════════════════════════════════
function buildTimeline() {
  tlLabelCol.innerHTML = '';
  // Clear all track rows but keep playhead track
  tlTracksArea.querySelectorAll('.tl-track-row').forEach(r => r.remove());
  
  sceneData.shapes.forEach((shape, i) => {
    // Label
    const label = document.createElement('div');
    label.className = 'tl-track-label';
    label.textContent = shape.label || shape.id || `Layer ${i+1}`;
    label.dataset.shapeId = shape.id;
    label.addEventListener('click', () => {
      document.querySelectorAll('.tl-track-label').forEach(l => l.classList.remove('selected'));
      document.querySelectorAll('.layer-row').forEach(r => r.classList.remove('selected'));
      label.classList.add('selected');
      document.querySelector(`.layer-row[data-shape-id="${shape.id}"]`)?.classList.add('selected');
      selectedShape = shape;
      renderPropertiesPanel(shape);
      loadShapeIntoGraph(shape);
    });
    tlLabelCol.appendChild(label);
    
    // Track row
    const row = document.createElement('div');
    row.className = 'tl-track-row';
    
    // Clip
    const leftPct = (shape.startTime / sceneData.totalTime) * 100;
    const widthPct = ((shape.endTime - shape.startTime) / sceneData.totalTime) * 100;
    const clip = document.createElement('div');
    clip.className = 'tl-clip';
    clip.dataset.shapeId = shape.id;
    clip.style.left = `${leftPct}%`;
    clip.style.width = `${widthPct}%`;
    clip.innerHTML = `<div class="tl-clip-label">${shape.label || shape.id}</div>`;
    clip.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.layer-row').forEach(r => r.classList.remove('selected'));
      document.querySelectorAll('.tl-clip').forEach(c => c.classList.remove('selected'));
      clip.classList.add('selected');
      document.querySelector(`.layer-row[data-shape-id="${shape.id}"]`)?.classList.add('selected');
      selectedShape = shape;
      stateManager.selectShape(shape.id);
      renderPropertiesPanel(shape);
      loadShapeIntoGraph(shape);
    });

    clip.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      isDraggingClip = true;
      startX = e.clientX;
      startStartTime = shape.startTime;
      startEndTime = shape.endTime;
      targetShapeForDrag = shape;
      targetClipForDrag = clip;
      document.body.style.cursor = 'grabbing';
    });
    
    // Keyframe diamonds
    const addKfMarkers = (propObj) => {
      if (!propObj) return;
      Object.values(propObj).forEach(p => {
        if (p && p.keyframes) {
          p.keyframes.forEach(kf => {
            const kfEl = document.createElement('div');
            kfEl.className = 'tl-keyframe';
            kfEl.style.left = `${kf.t * 100}%`;
            clip.appendChild(kfEl);
          });
        }
      });
    };
    if (shape.transform) addKfMarkers(shape.transform);
    if (shape.properties) addKfMarkers(shape.properties);
    
    row.appendChild(clip);
    tlTracksArea.insertBefore(row, tlPlayheadTr);
  });
}

// Global dragging state
let isDraggingClip = false;
let startX = 0;
let startStartTime = 0;
let startEndTime = 0;
let targetShapeForDrag = null;
let targetClipForDrag = null;

window.addEventListener('mousemove', (e) => {
  if (!isDraggingClip || !targetShapeForDrag) return;
  const dx = e.clientX - startX;
  const rect = tlTracksArea.getBoundingClientRect();
  const dt = (dx / rect.width) * sceneData.totalTime;
  
  targetShapeForDrag.startTime = Math.max(0, startStartTime + dt);
  targetShapeForDrag.endTime = startEndTime + (targetShapeForDrag.startTime - startStartTime);
  
  const leftPct = (targetShapeForDrag.startTime / sceneData.totalTime) * 100;
  if (targetClipForDrag) targetClipForDrag.style.left = `${leftPct}%`;
});

window.addEventListener('mouseup', () => {
  if (isDraggingClip) {
    isDraggingClip = false;
    document.body.style.cursor = 'default';
    updateTimelineUI();
  }
});

// ═══════════════════════════════════════
// Playback Controls
// ═══════════════════════════════════════
function togglePlayback() {
  isPlaying = !isPlaying;
  if (isPlaying) {
    lastFrameTime = performance.now();
    tbPlay.textContent = '⏸';
    tbPlay.classList.add('playing');
  } else {
    tbPlay.textContent = '▶';
    tbPlay.classList.remove('playing');
  }
}
tbPlay.addEventListener('click', togglePlayback);
tbStart.addEventListener('click', () => { currentAnimTime = 0; isPlaying = false; tbPlay.textContent = '▶'; tbPlay.classList.remove('playing'); updateTimelineUI(); });
tbEnd.addEventListener('click', () => { currentAnimTime = sceneData.totalTime; isPlaying = false; tbPlay.textContent = '▶'; tbPlay.classList.remove('playing'); updateTimelineUI(); });

// Open buttons
async function openProject() {
  if (window.electronAPI) {
    const result = await window.electronAPI.openXMLFile();
    if (result) {
      const { scene, content, filePath } = result;
      const name = filePath ? filePath.split(/[\\/]/).pop() : 'Project';
      await loadScene(scene || content, name);
    }
  }
}
btnImport.addEventListener('click', openProject);
if (btnOpenHint) btnOpenHint.addEventListener('click', openProject);

// Save
btnSave.addEventListener('click', async () => {
  const xml = AlightXMLSerializer.serialize(sceneData);
  if (window.electronAPI) {
    const path = await window.electronAPI.saveXMLFile(xml);
    if (path) setStatus(`Project saved to ${path.split(/[\\/]/).pop()}`, 'ok');
  } else {
    // Browser fallback: download blob
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'project.xml'; a.click();
  }
});

// Export
btnExport?.addEventListener('click', () => {
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) exportBtn.click();
});

// Electron menu events
if (window.electronAPI) {
  window.electronAPI.onProjectOpen?.((content, path) => {
    const name = path ? path.split(/[\\/]/).pop() : 'Project';
    loadScene(content, name);
  });
  window.electronAPI.onPlaybackToggle?.(() => togglePlayback());
  window.electronAPI.onPlaybackToStart?.(() => tbStart.click());
  window.electronAPI.onPlaybackToEnd?.(() => tbEnd.click());
  window.electronAPI.onToggleGraph?.(() => btnGraph.click());
  window.electronAPI.onExportStart?.(() => document.getElementById('btn-export')?.click());
}

// Timeline scrubbing
let isDragging = false;
const tlRuler = document.getElementById('tl-ruler');
tlRuler.addEventListener('mousedown', (e) => { isDragging = true; isPlaying = false; tbPlay.textContent = '▶'; tbPlay.classList.remove('playing'); updateTimeFromMouse(e, tlRuler); });
window.addEventListener('mousemove', (e) => { if (isDragging) updateTimeFromMouse(e, tlRuler); });
window.addEventListener('mouseup', () => { isDragging = false; });

function updateTimeFromMouse(e, ruler) {
  const rect = ruler.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  currentAnimTime = (x / rect.width) * sceneData.totalTime;
  updateTimelineUI();
}

// Space bar
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
    e.preventDefault();
    togglePlayback();
  }
  if (e.code === 'Home') tbStart.click();
  if (e.code === 'End') tbEnd.click();
});

// FPS counter
let fpsFrames = 0, fpsLast = performance.now(), fpsVal = 0;
function trackFPS() {
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast > 500) {
    fpsVal = Math.round(fpsFrames / ((now - fpsLast) / 1000));
    statusFpsLive.textContent = `${fpsVal} fps`;
    fpsFrames = 0; fpsLast = now;
  }
}

function updateTimelineUI() {
  const t = currentAnimTime;
  stateManager.setCurrentTime(t);
  const mins = Math.floor(t / 60000);
  const secs = Math.floor((t % 60000) / 1000);
  const ms   = Math.floor(t % 1000);
  const str  = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}:${String(ms).padStart(3,'0')}`;
  tbTime.textContent = str;
  
  const progress = sceneData.totalTime > 0 ? t / sceneData.totalTime : 0;
  const pct = `${Math.max(0, Math.min(100, progress * 100))}%`;
  tlPlayhead.style.left = pct;
  tlPlayheadTr.style.left = pct;
  
  // Real-time property update
  if (selectedShape) renderPropertiesPanel(selectedShape);
}

// Initial setup: Load the default preset
(async () => {
  if (testPresetXml) {
    await loadScene(testPresetXml, 'test-preset.xml');
  } else {
    updateTimelineUI();
    setStatus('Ready — Open an XML project');
  }
})();


// Export State

let isExporting = false;
let mediaRecorder = null;
let recordedChunks = [];

btnExport.addEventListener('click', async () => {
  if (isExporting) return;
  
  // Prepare for recording
  isExporting = true;
  recordedChunks = [];
  currentAnimTime = 0;
  isPlaying = false; // Disable real-time playback
  btnPlay.textContent = 'Play';
  btnExport.textContent = 'Exporting...';
  btnExport.disabled = true;
  
  const fps = sceneData.fps || 30;
  const timeStep = 1000 / fps;
  
  // Capture stream with 0 fps (manual frame push)
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  
  // Using vp9 for high quality webm
  const options = { mimeType: 'video/webm; codecs=vp9' };
  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream); // Fallback to default
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    
    if (window.electronAPI) {
      const arrayBuffer = await blob.arrayBuffer();
      const savedPath = await window.electronAPI.saveWebMFile(arrayBuffer);
      if (savedPath) {
        console.log('Saved successfully to:', savedPath);
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'alight_pc_export.webm';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    }
    
    // Reset UI
    btnExport.textContent = 'Export WebM';
    btnExport.disabled = false;
    isExporting = false;
    currentAnimTime = 0;
    updateTimelineUI();
  };

  mediaRecorder.start();

  // Offline Render Loop
  async function exportFrame() {
    updateTimelineUI();
    
    // Render synchronous frame
    drawScene();
    
    // Force the track to capture the current canvas state
    if (track.requestFrame) {
      track.requestFrame();
    }
    
    currentAnimTime += timeStep;
    
    if (currentAnimTime > sceneData.totalTime) {
      mediaRecorder.stop();
    } else {
      // Yield to the browser so MediaRecorder can process chunks and UI updates
      setTimeout(exportFrame, 0);
    }
  }

  // Start offline rendering
  exportFrame();
});

let layerFBO = null;
let effectFBO = null;

function createFBO(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { frameBuffer: fbo, texture: tex, width: width, height: height };
}

let shapeRenderer = null;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  
  if (!shapeRenderer) shapeRenderer = new ShapeRenderer(canvas.width, canvas.height);
  else shapeRenderer.resize(canvas.width, canvas.height);
  
  if (!layerFBO || layerFBO.width !== canvas.width || layerFBO.height !== canvas.height) {
    if (layerFBO) {
      gl.deleteFramebuffer(layerFBO.frameBuffer);
      gl.deleteTexture(layerFBO.texture);
    }
    if (effectFBO) {
      gl.deleteFramebuffer(effectFBO.frameBuffer);
      gl.deleteTexture(effectFBO.texture);
    }
    layerFBO = createFBO(gl, canvas.width, canvas.height);
    effectFBO = createFBO(gl, canvas.width, canvas.height);
  }
}
window.addEventListener('resize', () => {
  resizeCanvas();
  if (sceneData.shapes.length > 0) buildTimeline();
});
resizeCanvas();

function compileShader(gl, type, source) {
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

const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertShaderSource);
const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragShaderSource);

const gridProgram = gl.createProgram();
gl.attachShader(gridProgram, vertShader);
gl.attachShader(gridProgram, fragShader);
gl.linkProgram(gridProgram);

const compVertShader = compileShader(gl, gl.VERTEX_SHADER, composeVertSource);
const compFragShader = compileShader(gl, gl.FRAGMENT_SHADER, composeFragSource);

const composeProgram = gl.createProgram();
gl.attachShader(composeProgram, compVertShader);
gl.attachShader(composeProgram, compFragShader);
gl.linkProgram(composeProgram);

const positions = new Float32Array([
  -1.0, -1.0,
   1.0, -1.0,
  -1.0,  1.0,
  -1.0,  1.0,
   1.0, -1.0,
   1.0,  1.0,
]);

let texcoords = new Float32Array(12);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

const texcoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

const positionLocation = gl.getAttribLocation(gridProgram, "position");
const texcoordLocation = gl.getAttribLocation(gridProgram, "texcoord");

const compPositionLocation = gl.getAttribLocation(composeProgram, "position");
const compOpacityLocation = gl.getUniformLocation(composeProgram, "u_opacity");
const compTexLocation = gl.getUniformLocation(composeProgram, "u_texture");

const colorLoc = gl.getUniformLocation(gridProgram, "color");
const gridSpacingLoc = gl.getUniformLocation(gridProgram, "grid_spacing");
const gridOffsetLoc = gl.getUniformLocation(gridProgram, "grid_offset");
const pixelScaleLoc = gl.getUniformLocation(gridProgram, "pixel_scale");
const lineWidthLoc = gl.getUniformLocation(gridProgram, "line_width");

// Legacy grid UI elements (removed in Phase 11 — kept as null stubs to avoid ref errors)
const colorInput = null;
const valSpacing = null;
const valWidth = null;
const valOffX = null;
const valOffY = null;
const offsetXInput = null;
const offsetYInput = null;

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255.0,
    parseInt(result[2], 16) / 255.0,
    parseInt(result[3], 16) / 255.0,
    1.0
  ] : [0, 1, 0, 1];
}

function applyBlendMode(gl, mode) {
  // Ensure default equation
  gl.blendEquation(gl.FUNC_ADD);
  
  switch (mode) {
    case 'normal':
    default:
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      break;
    case 'multiply':
      gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
      break;
    case 'screen':
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      break;
    case 'add':
    case 'linear-dodge':
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
    case 'subtract':
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
    case 'darken':
      gl.blendEquation(gl.MIN);
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
    case 'lighten':
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
    // Note: Other complex modes (overlay, soft-light, mask) require shader-level sampling.
    // For now, they fall back to standard blend behaviors where possible or 'normal'.
  }
}


function drawScene() {
  // Prepare to draw shapes
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.05, 0.05, 0.1, 1.0); // Viewer background
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Enable alpha blending for composing FBOs onto the main canvas
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const projW = sceneData.width || 1920;
  const projH = sceneData.height || 1080;
  const fitScale = Math.min(canvas.width / projW, canvas.height / projH);
  viewerScale = fitScale * viewerZoom;
  viewerOffset.x = (canvas.width - projW * viewerScale) / 2;
  viewerOffset.y = (canvas.height - projH * viewerScale) / 2;
  
  const viewMatrix = TransformMatrix.fromTRS(viewerOffset.x, viewerOffset.y, viewerScale, viewerScale, 0, 0, 0);

  // --- DRAW PROJECT BOUNDARY GUIDE ---
  // We use the shapeRenderer's canvas as a temp buffer for the border
  shapeRenderer.clear();
  const guideCtx = shapeRenderer.ctx;
  guideCtx.save();
  // Apply view matrix directly to canvas for the guide
  guideCtx.transform(viewerScale, 0, 0, viewerScale, viewerOffset.x, viewerOffset.y);
  guideCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  guideCtx.lineWidth = 2 / viewerScale; // Constant pixel width
  guideCtx.setLineDash([10 / viewerScale, 5 / viewerScale]);
  guideCtx.strokeRect(0, 0, projW, projH);
  guideCtx.restore();
  shapeRenderer.updateTexture(gl, layerFBO.texture);
  
  // Compose Guide to Viewer
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(composeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, layerFBO.texture);
  gl.uniform1f(compOpacityLocation, 1.0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Clear per-frame transform cache
  worldResolver.clearCache();
  
  for (const shape of (sceneData.shapes || [])) {
     if (!shape || shape.hidden) continue;
     if (currentAnimTime >= (shape.startTime || 0) && currentAnimTime <= (shape.endTime || 0)) {
        const normalizedTime = (currentAnimTime - shape.startTime) / (shape.endTime - shape.startTime);
        
        // --- Compute World Transform (parent chain) in Project Space ---
        const worldMatrix = worldResolver.getWorldMatrix(shape.id, currentAnimTime);
        
        // --- Combine with View Matrix to get Viewer Space Matrix ---
        const finalMatrix = viewMatrix.multiply(worldMatrix);

        // Evaluate properties for this shape
        let currentProperties = {};
        if (shape.properties) {
           Object.keys(shape.properties).forEach(propName => {
              currentProperties[propName] = AlightXMLParser.evaluateProperty(shape.properties[propName], normalizedTime);
           });
        }
        currentProperties.mediaManager = mediaManager;
        
        // Evaluate effect properties
        let effectProperties = {};
        if (shape.effects) {
          shape.effects.forEach(effect => {
             effectProperties[effect.id] = {};
             if (effect.properties) {
                Object.keys(effect.properties).forEach(pName => {
                   effectProperties[effect.id][pName] = AlightXMLParser.evaluateProperty(effect.properties[pName], normalizedTime);
                });
             }
          });
        }
        
        // --- STEP 1: Render shape to Canvas2D and upload to layerFBO texture ---
        shapeRenderer.clear();
        shapeRenderer.renderShape(shape, currentProperties, finalMatrix);
        shapeRenderer.updateTexture(gl, layerFBO.texture);

        // --- STEP 1.5: Apply Effects ---
        let finalFBO = layerFBO;
        if (shape.effects && shape.effects.length > 0) {
           finalFBO = effectManager.applyEffects(
              layerFBO, effectFBO, shape.effects, effectProperties,
              positionBuffer, [canvas.width, canvas.height]
           );
        }

        // --- STEP 2: Compose finalFBO to Main Canvas ---
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        gl.enable(gl.BLEND);
        applyBlendMode(gl, shape.blending);
        
        gl.useProgram(composeProgram);
        
        gl.enableVertexAttribArray(compPositionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(compPositionLocation, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, finalFBO.texture);
        gl.uniform1i(compTexLocation, 0);
        
        // Extract opacity from transform
        let currentOpacity = 1.0;
        if (shape.transform && shape.transform.opacity) {
            currentOpacity = AlightXMLParser.evaluateProperty(shape.transform.opacity, normalizedTime);
        }
        gl.uniform1f(compOpacityLocation, currentOpacity);

        // Reset viewport to full canvas for composition
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
     }
  }
}

function render(now) {
  if (!isExporting) {
    resizeCanvas();
    const dpr = window.devicePixelRatio || 1;

    if (isPlaying) {
      let dt = now - lastFrameTime;
      currentAnimTime += dt;
      
      if (currentAnimTime > sceneData.totalTime) {
        currentAnimTime %= sceneData.totalTime;
      }
      stateManager.setCurrentTime(currentAnimTime);
      updateTimelineUI();
    }
    
    drawScene();
    trackFPS();
    lastFrameTime = now;
  }
  
  requestAnimationFrame(render);
}

function loadShapeIntoGraph(shape) {
  if (!shape) return;
  // Try to find the first property with keyframes to show in graph
  let targetProp = null;
  
  if (shape.transform) {
    targetProp = Object.values(shape.transform).find(p => p && p.keyframes && p.keyframes.length > 0);
  }
  
  if (!targetProp && shape.properties) {
    targetProp = Object.values(shape.properties).find(p => p && p.keyframes && p.keyframes.length > 0);
  }
  
  if (targetProp) {
    graphEditor.setProperty(targetProp);
  } else {
    graphEditor.setProperty(null);
  }
}

requestAnimationFrame(render);
