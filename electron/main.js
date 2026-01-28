const { app, BrowserWindow, shell, protocol, net, session, nativeTheme, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Register protocol as early as possible
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('modern-markdown-editor', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('modern-markdown-editor');
}

// Try to load environment variables
try {
  const possiblePaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(app.getAppPath(), '.env'),
    path.join(app.getAppPath(), '.env.local'),
    path.join(path.dirname(app.getPath('exe')), '.env'),
    path.join(path.dirname(app.getPath('exe')), '.env.local'),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      console.log('[Electron] Loading env from:', envPath);
      try {
        require('dotenv').config({ path: envPath });
        console.log('[Electron] Dotenv loaded successfully');
      } catch (e) {
        // Dotenv might not be available yet if using a pre-packaged build
        // but it should be there in dev and local builds
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
          const match = line.match(/^([^#=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
            if (key.startsWith('NEXT_PUBLIC_')) {
              process.env[key] = value;
            }
          }
        });
      }
    }
  }
} catch (e) {
  console.log('[Electron] Error loading .env file:', e.message);
}

// Theme colors for title bar
const THEME_COLORS = {
  dark: '#0a0a0a',
  light: '#ffffff'
};

// Register the custom protocol as privileged BEFORE app is ready
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

// Handle creating/removing shortcuts on Windows
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {}

let mainWindow = null;

function getStaticPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', 'out');
  }
  return path.join(__dirname, '..', 'out');
}

function createWindow() {
  const isDarkMode = nativeTheme.shouldUseDarkColors;
  const backgroundColor = isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;

  const iconPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '..', 'public', 'favicon.png')
    : path.join(getStaticPath(), 'favicon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: false,
    backgroundColor: backgroundColor,
    show: false,
  });

  // Handle IPC calls
  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Handle Auth Popups and External Links
  mainWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    // 1. Internal Pages
    if (url.startsWith('app://') || url.includes('localhost')) {
      const parseFeature = (name) => {
        const match = features.match(new RegExp(`${name}=(\\d+)`));
        return match ? parseInt(match[1], 10) : undefined;
      };
      
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: parseFeature('width') || 400,
          height: parseFeature('height') || 700,
          frame: false,
          backgroundColor: nativeTheme.shouldUseDarkColors ? THEME_COLORS.dark : THEME_COLORS.light,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
          },
        }
      };
    }

    // 2. Firebase Auth Popups - ALLOW them to open in Electron for cross-origin communication
    if (url.includes('firebaseapp.com') || url.includes('google.com/auth') || url.includes('accounts.google.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Don't use preload for external auth pages to avoid security issues
          }
        }
      };
    }

    // 3. External links
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerProtocol() {
  protocol.handle('app', (request) => {
    const staticPath = getStaticPath();
    let urlPath = request.url.replace('app://.', '');
    urlPath = urlPath.split('?')[0].split('#')[0];
    urlPath = decodeURIComponent(urlPath);

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    if (!path.extname(urlPath) && !urlPath.endsWith('/')) {
      const htmlPath = path.join(staticPath, urlPath + '.html');
      if (fs.existsSync(htmlPath)) urlPath = urlPath + '.html';
      else {
        const indexPath = path.join(staticPath, urlPath, 'index.html');
        if (fs.existsSync(indexPath)) urlPath = urlPath + '/index.html';
      }
    }

    const filePath = path.join(staticPath, urlPath);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.normalize(staticPath))) {
      return new Response('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      const indexPath = path.join(staticPath, 'index.html');
      if (fs.existsSync(indexPath)) return net.fetch('file://' + indexPath);
      return new Response('Not Found', { status: 404 });
    }

    return net.fetch('file://' + filePath);
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Handle deep links from secondary instances
      const url = commandLine.pop();
      if (url.startsWith('modern-markdown-editor://')) {
        mainWindow.webContents.send('deep-link', url);
      }
    }
  });

  app.whenReady().then(() => {
    registerProtocol();
    createWindow();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
  } else {
    // If window not yet created, store the URL or wait
    app.once('ready', () => {
      setTimeout(() => {
        if (mainWindow) mainWindow.webContents.send('deep-link', url);
      }, 1000);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol === 'app:' || parsedUrl.hostname === 'localhost') return;
    
    // Check if it's an auth redirect
    if (navigationUrl.includes('firebaseapp.com') || navigationUrl.includes('google.com')) return;

    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  contents.on('did-create-window', (childWindow) => {
    childWindow.setMenu(null);
    childWindow.on('maximize', () => childWindow.webContents.send('window-maximized', true));
    childWindow.on('unmaximize', () => childWindow.webContents.send('window-maximized', false));
  });
});
