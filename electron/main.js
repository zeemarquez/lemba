const { app, BrowserWindow, shell, protocol, net, session, nativeTheme, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Theme colors for title bar
const THEME_COLORS = {
  dark: '#0a0a0a',
  light: '#ffffff'
};

// Register the custom protocol as privileged BEFORE app is ready
// This grants localStorage, IndexedDB, and treats it as a secure context
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false,
    }
  }
]);

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {
  // electron-squirrel-startup not available, ignore
}

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;

// Get the path to the static export directory
function getStaticPath() {
  // In packaged app, resources are in app.asar
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', 'out');
  }
  // In development, use the out directory
  return path.join(__dirname, '..', 'out');
}

// MIME types for serving static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown',
  '.mdt': 'application/json',
  '.txt': 'text/plain',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function createWindow() {
  // Determine initial theme
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const backgroundColor = isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;

  // Create the browser window - frameless for custom title bar
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // Frameless window for custom title bar
    frame: false,
    // Transparent to avoid white flash
    backgroundColor: backgroundColor,
    show: false, // Don't show until ready
  });

  // Listen for window control actions from renderer (works for any window)
  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // Send maximize state changes to renderer for main window
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // Development: load from Next.js dev server
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load via custom protocol
    mainWindow.loadURL('app://./index.html');
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window.open() calls - create frameless windows for internal pages
  mainWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    // Check if it's an internal page (app:// protocol or localhost)
    if (url.startsWith('app://') || url.includes('localhost')) {
      // Parse window features (width, height, left, top)
      const parseFeature = (name) => {
        const match = features.match(new RegExp(`${name}=(\\d+)`));
        return match ? parseInt(match[1], 10) : undefined;
      };

      const width = parseFeature('width') || 400;
      const height = parseFeature('height') || 700;
      const left = parseFeature('left');
      const top = parseFeature('top');

      // Return custom options for frameless window
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width,
          height,
          x: left,
          y: top,
          frame: false, // Frameless for custom title bar
          backgroundColor: nativeTheme.shouldUseDarkColors ? THEME_COLORS.dark : THEME_COLORS.light,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
          },
        }
      };
    }
    // Open external links in default browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol for serving static files
function registerProtocol() {
  protocol.handle('app', (request) => {
    const staticPath = getStaticPath();
    let urlPath = request.url.replace('app://.', '');
    
    // Remove query string and hash
    urlPath = urlPath.split('?')[0].split('#')[0];
    
    // Decode URI components
    urlPath = decodeURIComponent(urlPath);
    
    // Default to index.html for root
    if (urlPath === '/' || urlPath === '') {
      urlPath = '/index.html';
    }
    
    // Handle Next.js routing - if no extension, try .html
    if (!path.extname(urlPath) && !urlPath.endsWith('/')) {
      // Try with .html extension first
      const htmlPath = path.join(staticPath, urlPath + '.html');
      if (fs.existsSync(htmlPath)) {
        urlPath = urlPath + '.html';
      } else {
        // Try as directory with index.html
        const indexPath = path.join(staticPath, urlPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          urlPath = urlPath + '/index.html';
        }
      }
    }
    
    const filePath = path.join(staticPath, urlPath);
    
    // Security: ensure we don't serve files outside the static directory
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.normalize(staticPath))) {
      return new Response('Forbidden', { status: 403 });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('[Electron] File not found:', filePath);
      // Return index.html for SPA routing fallback
      const indexPath = path.join(staticPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return net.fetch('file://' + indexPath);
      }
      return new Response('Not Found', { status: 404 });
    }
    
    // Serve the file using net.fetch for proper handling
    return net.fetch('file://' + filePath);
  });
}

// Create window when Electron is ready
app.whenReady().then(() => {
  // Register custom protocol before creating window
  registerProtocol();
  
  createWindow();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation except through setWindowOpenHandler
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow app:// protocol for static export navigation
    if (parsedUrl.protocol === 'app:') {
      return;
    }
    
    // Allow localhost for development
    if (parsedUrl.hostname === 'localhost') {
      return;
    }
    
    // Block other navigations and open externally
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  // Set up window controls for child windows (like export window)
  contents.on('did-create-window', (childWindow) => {
    // Remove menu from child windows
    childWindow.setMenu(null);

    // Set up IPC for this child window's controls
    childWindow.on('maximize', () => {
      childWindow.webContents.send('window-maximized', true);
    });

    childWindow.on('unmaximize', () => {
      childWindow.webContents.send('window-maximized', false);
    });
  });
});
