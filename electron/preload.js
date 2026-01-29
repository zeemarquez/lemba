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

  // Expose environment variables (only NEXT_PUBLIC ones for security)
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_CUSTOM_APP_ID,
    NEXT_PUBLIC_AUTH_HANDLER_URL: process.env.NEXT_PUBLIC_AUTH_HANDLER_URL,
  },

  // Listen for deep links (e.g. for auth callbacks)
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (event, url) => callback(url));
  },

  // Open external links in default browser
  openExternal: (url) => ipcRenderer.send('open-external', url),
});

// Log that we're running in Electron
console.log('[Electron] Preload script loaded');
console.log('[Electron] Platform:', process.platform);
