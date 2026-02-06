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

const { pathToFileURL } = require('url');

// Register protocol as early as possible
const PROTOCOL_SCHEME = 'modern-markdown-editor';
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// Try to load environment variables
console.log('[Electron] Initializing environment...');
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
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          // Remove wrapping quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          if (key.startsWith('NEXT_PUBLIC_')) {
            process.env[key] = value;
            console.log(`[Electron] Set runtime env: ${key}`);
          }
        }
      });
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
} catch (e) { }

let mainWindow = null;

function getStaticPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', 'out');
  }
  return path.join(__dirname, '..', 'out');
}

// Register IPC handlers once (survives window close on macOS so we don't double-register on activate)
function registerIpcHandlers() {
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

  ipcMain.on('open-external', async (event, url) => {
    console.log('[Main] Opening external URL:', url);
    await require('electron').shell.openExternal(url);
  });

  ipcMain.handle('fetch-url', async (event, url) => {
    console.log('[Main] Fetching URL:', url);
    try {
      const response = await net.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const buffer = await response.arrayBuffer();
      const text = Buffer.from(buffer).toString('utf8');

      if (contentType.includes('text/html')) {
        // Simple HTML to text extraction (very basic version for main process)
        let processed = text
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return { content: processed.substring(0, 50000) };
      }

      return { content: text.substring(0, 50000) };
    } catch (error) {
      console.error('[Main] Fetch URL error:', error);
      return { error: error.message };
    }
  });
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
    // macOS: Hide title bar but keep traffic lights
    // Windows/Linux: Completely frameless
    ...(process.platform === 'darwin'
      ? {
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 12, y: 10 }, // Adjust traffic light position
      }
      : { frame: false }
    ),
    backgroundColor: backgroundColor,
    show: false,
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
    // 1. Internal Application Pages (e.g., Export Panel)
    // These need to open in a new Electron window with our preload script
    const isInternal = url.startsWith('app://') ||
      url.includes('localhost') ||
      url.startsWith('file://') ||
      url.includes('index.html');

    if (isInternal) {
      console.log('[Main] Opening internal window:', url);
      const parseFeature = (name) => {
        const match = features.match(new RegExp(`${name}=(\\d+)`));
        return match ? parseInt(match[1], 10) : undefined;
      };

      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: parseFeature('width') || 400,
          height: parseFeature('height') || 700,
          backgroundColor: nativeTheme.shouldUseDarkColors ? THEME_COLORS.dark : THEME_COLORS.light,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
          },
          ...(process.platform === 'darwin'
            ? {
              titleBarStyle: 'hidden',
              trafficLightPosition: { x: 12, y: 10 },
            }
            : { frame: false }
          ),
        }
      };
    }

    // 2. Everything else (External Links, Auth Popups)
    // Open in the system's default browser
    console.log('[Main] Opening external URL via deep link interception:', url);
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
    // Normalize path by removing protocol and handling potential . prefix
    let urlPath = request.url.replace('app://.', '').replace('app://', '');
    urlPath = urlPath.split('?')[0].split('#')[0];
    urlPath = decodeURIComponent(urlPath);

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    // Handle SPA-style routing for Next.js exported files
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
      if (fs.existsSync(indexPath)) return net.fetch(pathToFileURL(indexPath).href);
      return new Response('Not Found', { status: 404 });
    }

    // Convert file path to valid file:// URL (critical for Windows net.fetch)
    const fileUrl = pathToFileURL(filePath).href;
    return net.fetch(fileUrl);
  });

  // Force Origin and Referer headers for Firebase requests
  // Custom schemes like app:// often send null or missing headers on Windows
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.firebaseio.com/*', 'https://*.googleapis.com/*', 'https://*.firebaseapp.com/*'] },
    (details, callback) => {
      const { requestHeaders } = details;
      if (!requestHeaders['Origin'] || requestHeaders['Origin'] === 'null') {
        requestHeaders['Origin'] = 'app://.';
      }
      if (!requestHeaders['Referer']) {
        requestHeaders['Referer'] = 'app://./index.html';
      }
      callback({ requestHeaders });
    }
  );
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

      // Handle deep links from secondary instances (more robust on Windows)
      const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (url) {
        console.log('[Main] Received deep link from second instance:', url);
        mainWindow.webContents.send('deep-link', url);
      }
    }
  });

  app.whenReady().then(() => {
    registerProtocol();
    registerIpcHandlers();
    createWindow();

    // Check for deep link on startup (Windows/Linux)
    if (process.platform !== 'darwin') {
      const startupUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (startupUrl) {
        // Wait for window to be ready
        setTimeout(() => {
          if (mainWindow) {
            console.log('[Main] Sending startup deep link:', startupUrl);
            mainWindow.webContents.send('deep-link', startupUrl);
          }
        }, 1500);
      }
    }

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
