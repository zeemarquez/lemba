// Preload script runs in renderer process with Node.js access
// Use this to safely expose APIs to the renderer

const { contextBridge, ipcRenderer } = require('electron');

// Expose platform info and window controls to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Expose platform information
  platform: process.platform,
  isElectron: true,
  
  // App version from package.json
  getVersion: () => {
    try {
      const { version } = require('../package.json');
      return version;
    } catch {
      return 'unknown';
    }
  },

  // Window control functions
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),

  // Listen for maximize state changes
  onWindowMaximized: (callback) => {
    ipcRenderer.on('window-maximized', (event, isMaximized) => callback(isMaximized));
  },
});

// Log that we're running in Electron
console.log('[Electron] Preload script loaded');
console.log('[Electron] Platform:', process.platform);
