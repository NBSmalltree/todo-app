const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const Database = require('./database');

// Keep a global reference to prevent garbage collection
let floatWindow = null;
let trayWindow = null;
let tray = null;
let db = null;

// Store window scale state
let windowScale = 1.0;
const BASE_WIDTH = 380;
const BASE_HEIGHT = 500;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

function isDev() {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

function createFloatWindow() {
  floatWindow = new BrowserWindow({
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    x: 100,
    y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Allow the window to scale freely without minimum size constraints
  floatWindow.setMinimumSize(Math.round(BASE_WIDTH * MIN_SCALE), Math.round(BASE_HEIGHT * MIN_SCALE));

  // Use 'floating' level instead of 'screen-saver' so IME candidate window can appear above
  floatWindow.setAlwaysOnTop(true, 'floating');

  if (isDev()) {
    floatWindow.loadURL('http://localhost:5173');
    // floatWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    floatWindow.loadFile(path.join(__dirname, '../../build/renderer/index.html'));
  }

  // Disable Chromium's native Ctrl+Wheel zoom so renderer's wheel handler works
  floatWindow.webContents.setZoomFactor(1);
  floatWindow.webContents.on('did-finish-load', () => {
    floatWindow.webContents.setZoomFactor(1);
  });
  floatWindow.webContents.on('before-input-event', (event, input) => {
    // Block Ctrl+Plus/Minus/0 zoom shortcuts
    if (input.control && (input.key === '+' || input.key === '-' || input.key === '0' || input.key === '=')) {
      event.preventDefault();
    }
  });

  // Make window visible on all workspaces (macOS)
  if (process.platform === 'darwin') {
    floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  floatWindow.on('closed', () => {
    floatWindow = null;
  });

  return floatWindow;
}

function createTrayWindow() {
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.show();
    trayWindow.focus();
    return trayWindow;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  trayWindow = new BrowserWindow({
    width: Math.min(900, screenWidth - 100),
    height: Math.min(700, screenHeight - 100),
    show: false,
    frame: true,
    title: 'TodoFloat - 历史归档',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev()) {
    trayWindow.loadURL('http://localhost:5173#/tray');
  } else {
    trayWindow.loadFile(path.join(__dirname, '../../build/renderer/index.html'), {
      hash: '/tray',
    });
  }

  trayWindow.on('close', (e) => {
    e.preventDefault();
    trayWindow.hide();
  });

  return trayWindow;
}

function createTray() {
  // Create a simple tray icon
  const iconSize = process.platform === 'darwin' ? 22 : 16;
  const icon = nativeImage.createEmpty();

  // Use a template image for macOS
  const trayIcon = createTrayIcon(iconSize);
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示待办窗口',
      click: () => {
        if (floatWindow) {
          floatWindow.show();
          floatWindow.focus();
        }
      },
    },
    {
      label: '历史归档 & 工作分析',
      click: () => {
        const win = createTrayWindow();
        win.show();
        win.focus();
        win.webContents.send('navigate', '/tray');
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('TodoFloat - 待办清单');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    const win = createTrayWindow();
    win.show();
    win.focus();
    win.webContents.send('navigate', '/tray');
  });
}

function createTrayIcon(size) {
  // Create a simple SVG-based icon
  const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="#0ea5e9" stroke-width="2" fill="none"/>
      <path d="M8 12l3 3 5-6" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  if (process.platform === 'darwin') {
    return nativeImage.createFromBuffer(
      Buffer.from(canvas),
      { width: size, height: size }
    ).resize({ width: size, height: size });
  }

  return nativeImage.createFromBuffer(
    Buffer.from(canvas),
    { width: size, height: size }
  );
}

// Scale helper: resize window while keeping its center position
function applyScaleToWindow(oldScale, newScale) {
  if (!floatWindow) return;
  const newWidth = Math.round(BASE_WIDTH * newScale);
  const newHeight = Math.round(BASE_HEIGHT * newScale);

  // Keep window centered on the same point
  const [winX, winY] = floatWindow.getPosition();
  const oldWidth = Math.round(BASE_WIDTH * oldScale);
  const oldHeight = Math.round(BASE_HEIGHT * oldScale);
  const newX = winX + Math.round((oldWidth - newWidth) / 2);
  const newY = winY + Math.round((oldHeight - newHeight) / 2);

  floatWindow.setSize(newWidth, newHeight);
  floatWindow.setPosition(newX, newY);
}

// IPC Handlers
function setupIPC() {
  // Database operations
  ipcMain.handle('db:getTodos', () => db.getTodos());
  ipcMain.handle('db:addTodo', (e, text) => db.addTodo(text));
  ipcMain.handle('db:toggleTodo', (e, id) => db.toggleTodo(id));
  ipcMain.handle('db:deleteTodo', (e, id) => db.deleteTodo(id));
  ipcMain.handle('db:restoreTodo', (e, id) => db.restoreTodo(id));
  ipcMain.handle('db:archiveTodo', (e, id) => db.archiveTodo(id));
  ipcMain.handle('db:getArchived', (e, filters) => db.getArchived(filters));
  ipcMain.handle('db:updateNote', (e, id, note) => db.updateNote(id, note));
  ipcMain.handle('db:getCategories', () => db.getCategories());
  ipcMain.handle('db:getWorkAnalysis', (e, period) => db.getWorkAnalysis(period));
  ipcMain.handle('db:getSettings', () => db.getSettings());
  ipcMain.handle('db:saveSettings', (e, settings) => db.saveSettings(settings));

  // LLM categorization
  ipcMain.handle('llm:categorize', async (e, text) => {
    const LLMHelper = require('./llm');
    const settings = db.getSettings();
    if (!settings.api_key) return null;
    const llm = new LLMHelper(settings);
    return await llm.categorize(text);
  });

  // Window control
  ipcMain.handle('window:close', () => {
    if (floatWindow) floatWindow.hide();
  });

  ipcMain.handle('window:minimize', () => {
    if (floatWindow) floatWindow.minimize();
  });

  ipcMain.handle('window:setScale', (e, newScale) => {
    const oldScale = windowScale;
    windowScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (floatWindow) {
      applyScaleToWindow(oldScale, windowScale);
    }
  });

  ipcMain.handle('window:getScale', () => windowScale);

  ipcMain.handle('window:adjustScale', (e, newScale) => {
    const oldScale = windowScale;
    windowScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    if (floatWindow) {
      applyScaleToWindow(oldScale, windowScale);
    }
    return windowScale;
  });

  // Open tray window
  ipcMain.handle('openTrayWindow', () => {
    const win = createTrayWindow();
    win.show();
    win.focus();
  });
}

// App lifecycle
app.whenReady().then(() => {
  db = new Database();
  setupIPC();
  createFloatWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Keep app running in tray
  if (process.platform !== 'darwin') {
    // Don't quit on Windows either - keep in tray
  }
});

app.on('activate', () => {
  if (!floatWindow) {
    createFloatWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (db) db.close();
});
