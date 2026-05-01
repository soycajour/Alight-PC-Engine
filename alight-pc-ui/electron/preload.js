const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openXMLFile: () => ipcRenderer.invoke('dialog:openXML'),
  saveXMLFile: (xmlString) => ipcRenderer.invoke('dialog:saveXML', xmlString),
  saveWebMFile: (buffer) => ipcRenderer.invoke('dialog:saveWebM', buffer),
  
  // Menu-triggered events
  onProjectOpen: (cb) => ipcRenderer.on('project:open', (_e, content, path) => cb(content, path)),
  onExportStart: (cb) => ipcRenderer.on('export:start', () => cb()),
  onPlaybackToggle: (cb) => ipcRenderer.on('playback:toggle', () => cb()),
  onPlaybackToStart: (cb) => ipcRenderer.on('playback:toStart', () => cb()),
  onPlaybackToEnd: (cb) => ipcRenderer.on('playback:toEnd', () => cb()),
  onToggleGraph: (cb) => ipcRenderer.on('ui:toggleGraph', () => cb()),
  onToggleProperties: (cb) => ipcRenderer.on('ui:toggleProperties', () => cb()),
});
