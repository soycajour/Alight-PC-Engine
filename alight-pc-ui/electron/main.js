import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load the native Rust core
let nativePath = path.join(process.cwd(), 'alight-pc-core/index.node');
if (!fs.existsSync(nativePath)) {
  // Try parent directory (development structure)
  nativePath = path.join(process.cwd(), '../alight-pc-core/index.node');
}

let alightCore;
try {
  if (fs.existsSync(nativePath)) {
    const { AlightCore } = require(nativePath);
    alightCore = new AlightCore();
    console.log('Native AlightCore successfully loaded from:', nativePath);
  } else {
    console.warn('Native AlightCore not found at:', nativePath);
  }
} catch (e) {
  console.error('Failed to load native AlightCore:', e);
}
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';

function buildMenu(mainWindow) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [{ name: 'Alight Motion XML', extensions: ['xml'] }]
            });
            if (!canceled && filePaths[0]) {
              const content = fs.readFileSync(filePaths[0], 'utf-8');
              mainWindow.webContents.send('project:open', content, filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Export Video...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('export:start')
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Graph Editor',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow.webContents.send('ui:toggleGraph')
        },
        {
          label: 'Toggle Properties Panel',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow.webContents.send('ui:toggleProperties')
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow.webContents.openDevTools()
        }
      ]
    },
    {
      label: 'Playback',
      submenu: [
        {
          label: 'Play / Pause',
          accelerator: 'Space',
          click: () => mainWindow.webContents.send('playback:toggle')
        },
        {
          label: 'Go to Start',
          accelerator: 'Home',
          click: () => mainWindow.webContents.send('playback:toStart')
        },
        {
          label: 'Go to End',
          accelerator: 'End',
          click: () => mainWindow.webContents.send('playback:toEnd')
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Alight PC',
          click: async () => {
            await dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Alight PC',
              message: 'Alight PC v0.11.0',
              detail: 'High-performance motion graphics engine\nBuilt with Electron + WebGL + Canvas2D'
            });
          }
        },
        {
          label: 'GitHub',
          click: () => shell.openExternal('https://github.com')
        }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 700,
    title: 'Alight PC',
    backgroundColor: '#0a0a14',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a14',
      symbolColor: '#8888aa',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const menu = buildMenu(mainWindow);
  Menu.setApplicationMenu(menu);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // IPC: Open XML and load via Rust
  ipcMain.handle('dialog:openXML', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Alight Motion XML', extensions: ['xml'] }]
    });
    
    if (canceled || !filePaths[0]) return null;
    
    const filePath = filePaths[0];
    
    // If Rust core is available, use it for high-speed parsing
    if (alightCore) {
      try {
        console.log(`Loading project via Rust: ${filePath}`);
        const scene = alightCore.loadProjectFromPath(filePath);
        return { scene, filePath };
      } catch (e) {
        console.error('Rust parsing failed, falling back to legacy JS parser:', e);
        return { content: fs.readFileSync(filePath, 'utf-8'), filePath };
      }
    }
    
    // Fallback if native core is missing
    return { content: fs.readFileSync(filePath, 'utf-8'), filePath };
  });

  // IPC: Save WebM
  ipcMain.handle('dialog:saveWebM', async (event, arrayBuffer) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Video',
      defaultPath: 'alight_pc_export.webm',
      filters: [{ name: 'WebM Video', extensions: ['webm'] }]
    });
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
      return filePath;
    }
    return null;
  });

  // IPC: Save XML
  ipcMain.handle('dialog:saveXML', async (event, xmlString) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Project',
      defaultPath: 'alight_project.xml',
      filters: [{ name: 'Alight Motion XML', extensions: ['xml'] }]
    });
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, xmlString, 'utf-8');
      return filePath;
    }
    return null;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
