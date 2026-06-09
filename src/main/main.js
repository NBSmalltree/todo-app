const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const Database = require('./database');

// Keep a global reference to prevent garbage collection
let floatWindow = null;
let trayWindow = null;
let settingsWindow = null;
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
  // Read saved window bounds, fallback to defaults
  let bounds = { x: 100, y: 100, width: BASE_WIDTH, height: BASE_HEIGHT };
  try {
    const settings = db.getSettings();
    if (settings.window_bounds) {
      const saved = typeof settings.window_bounds === 'string'
        ? JSON.parse(settings.window_bounds)
        : settings.window_bounds;
      bounds = { ...bounds, ...saved };
    }
  } catch (e) { /* use defaults */ }

  // Validate bounds are within visible screen area
  const displays = screen.getAllDisplays();
  const isVisible = displays.some((d) => {
    const { x, y, width, height } = d.workArea;
    return bounds.x >= x - 100 && bounds.x < x + width &&
           bounds.y >= y - 100 && bounds.y < y + height;
  });
  if (!isVisible) {
    bounds = { x: 100, y: 100, width: BASE_WIDTH, height: BASE_HEIGHT };
  }

  // Initialize scale from saved size
  windowScale = Math.round((bounds.width / BASE_WIDTH + bounds.height / BASE_HEIGHT) / 2 * 10) / 10;

  floatWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
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
    frame: false,
    title: 'TodoFloat - 历史归档',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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
    if (!app.isQuitting) {
      e.preventDefault();
      trayWindow.hide();
    }
  });

  return trayWindow;
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  settingsWindow = new BrowserWindow({
    width: Math.min(500, screenWidth - 100),
    height: Math.min(600, screenHeight - 100),
    show: false,
    frame: false,
    title: 'TodoFloat - 设置',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev()) {
    settingsWindow.loadURL('http://localhost:5173#/settings');
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../../build/renderer/index.html'), {
      hash: '/settings',
    });
  }

  settingsWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      settingsWindow.hide();
    }
  });

  return settingsWindow;
}

function createTray() {
  const iconSize = process.platform === 'darwin' ? 22 : 16;
  const trayIcon = createTrayIcon(iconSize);
  tray = new Tray(trayIcon);

  // On macOS, mark as template image so it adapts to light/dark menu bar
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '待办清单',
      click: () => {
        if (floatWindow) {
          floatWindow.show();
          floatWindow.focus();
        }
      },
    },
    {
      label: '历史归档',
      click: () => {
        const win = createTrayWindow();
        win.show();
        win.focus();
        win.webContents.send('navigate', '/tray');
      },
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        const win = createSettingsWindow();
        win.show();
        win.focus();
      },
    },
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
    tray.popUpContextMenu(contextMenu);
  });
}

function createTrayIcon(size) {
  const zlib = require('zlib');

  // Create a checkmark icon as PNG
  const width = size;
  const height = size;

  // RGBA pixel data
  const pixels = Buffer.alloc(width * height * 4, 0);

  const setPixel = (x, y, r, g, b, a) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  };

  // Scale coordinates relative to icon size
  const s = size / 16;
  const col = [6, 168, 233]; // sky-500

  // Draw rounded rectangle border
  const drawRoundRect = (x0, y0, x1, y1, radius) => {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const inCorner =
          (x < x0 + radius && y < y0 + radius && Math.sqrt((x - x0 - radius) ** 2 + (y - y0 - radius) ** 2) > radius) ||
          (x > x1 - radius && y < y0 + radius && Math.sqrt((x - x1 + radius) ** 2 + (y - y0 - radius) ** 2) > radius) ||
          (x < x0 + radius && y > y1 - radius && Math.sqrt((x - x0 - radius) ** 2 + (y - y1 + radius) ** 2) > radius) ||
          (x > x1 - radius && y > y1 - radius && Math.sqrt((x - x1 + radius) ** 2 + (y - y1 + radius) ** 2) > radius);
        if (inCorner) continue;
        const onBorder = x === x0 || x === x1 || y === y0 || y === y1;
        if (onBorder) {
          setPixel(x, y, ...col, 255);
        }
      }
    }
  };

  drawRoundRect(Math.round(1 * s), Math.round(1 * s), Math.round(14 * s), Math.round(14 * s), Math.round(2 * s));

  // Draw checkmark
  const drawLine = (x0, y0, x1, y1) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    while (true) {
      setPixel(x, y, ...col, 255);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };

  drawLine(Math.round(4 * s), Math.round(8 * s), Math.round(7 * s), Math.round(11 * s));
  drawLine(Math.round(7 * s), Math.round(11 * s), Math.round(12 * s), Math.round(4 * s));

  // Build PNG
  const png = buildPNG(width, height, pixels, zlib);
  return nativeImage.createFromBuffer(png);

  function buildPNG(w, h, rgba, zlibMod) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const crc32 = (buf) => {
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const typeBuffer = Buffer.from(type);
      const crcData = Buffer.concat([typeBuffer, data]);
      const crcVal = Buffer.alloc(4);
      crcVal.writeUInt32BE(crc32(crcData));
      return Buffer.concat([len, typeBuffer, data, crcVal]);
    };

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    // IDAT - add filter byte (0) to each row
    const rawData = Buffer.alloc(h * (1 + w * 4));
    for (let y = 0; y < h; y++) {
      rawData[y * (1 + w * 4)] = 0;
      rgba.copy(rawData, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
    }
    const compressed = zlibMod.deflateSync(rawData);

    return Buffer.concat([
      signature,
      chunk('IHDR', ihdr),
      chunk('IDAT', compressed),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// Scale helper: resize window proportionally from its current size, keeping center
function applyScaleToWindow(oldScale, newScale) {
  if (!floatWindow) return;
  const [curWidth, curHeight] = floatWindow.getSize();
  const ratio = newScale / oldScale;
  const newWidth = Math.round(curWidth * ratio);
  const newHeight = Math.round(curHeight * ratio);

  const [winX, winY] = floatWindow.getPosition();
  const newX = winX + Math.round((curWidth - newWidth) / 2);
  const newY = winY + Math.round((curHeight - newHeight) / 2);

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
  ipcMain.handle('db:restoreTodo', (e, id) => {
    const result = db.restoreTodo(id);
    // Notify float window to refresh
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send('data-changed');
    }
    return result;
  });
  ipcMain.handle('db:archiveTodo', async (e, id) => {
    const todo = db.archiveTodo(id);
    // Notify tray window to refresh
    if (trayWindow && !trayWindow.isDestroyed()) {
      trayWindow.webContents.send('data-changed');
    }
    // Auto-categorize in background
    if (todo && !todo.category) {
      const settings = db.getSettings();
      if (settings.api_key) {
        const LLMHelper = require('./llm');
        const llm = new LLMHelper(settings);
        llm.categorize(todo.text).then((category) => {
          if (category) {
            db.updateCategory(id, category);
            // Notify tray window again after categorization
            if (trayWindow && !trayWindow.isDestroyed()) {
              trayWindow.webContents.send('data-changed');
            }
          }
        }).catch(() => {});
      }
    }
    return todo;
  });
  ipcMain.handle('db:getArchived', (e, filters) => db.getArchived(filters));
  ipcMain.handle('db:updateNote', (e, id, note) => db.updateNote(id, note));
  ipcMain.handle('db:updateCategory', (e, id, category) => db.updateCategory(id, category));
  ipcMain.handle('db:getCategories', () => db.getCategories());
  ipcMain.handle('db:reorder', (e, orders) => db.updateOrders(orders));
  ipcMain.handle('db:updateColor', (e, id, color) => db.updateColor(id, color));
  ipcMain.handle('db:updateText', (e, id, text) => db.updateText(id, text));
  ipcMain.handle('db:getWorkAnalysis', (e, period) => db.getWorkAnalysis(period));
  ipcMain.handle('db:getSettings', () => db.getSettings());
  ipcMain.handle('db:saveSettings', (e, settings) => {
    try {
      return db.saveSettings(settings);
    } catch (err) {
      console.error('[IPC] saveSettings error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // LLM categorization
  ipcMain.handle('llm:categorize', async (e, text) => {
    try {
      const LLMHelper = require('./llm');
      const settings = db.getSettings();
      if (!settings.api_key) return null;
      const llm = new LLMHelper(settings);
      return await llm.categorize(text);
    } catch (err) {
      console.error('[IPC] categorize error:', err.message);
      return null;
    }
  });

  // LLM work analysis
  ipcMain.handle('llm:analyzeWork', async (e, data) => {
    try {
      const LLMHelper = require('./llm');
      const settings = db.getSettings();
      if (!settings.api_key) return null;
      const llm = new LLMHelper(settings);
      return await llm.analyzeWork(data);
    } catch (err) {
      console.error('[IPC] analyzeWork error:', err.message);
      return null;
    }
  });

  // Export CSV
  ipcMain.handle('export:csv', async (event, filters) => {
    try {
      const fs = require('fs');
      const win = BrowserWindow.fromWebContents(event.sender);

      // Build data based on export type
      let items;
      if (filters.exportType === 'active') {
        items = db.getTodos();
      } else if (filters.exportType === 'archived') {
        items = db.getArchived(filters);
      } else {
        // 'all' — merge both
        const active = db.getTodos();
        const archived = db.getArchived(filters);
        items = [...archived, ...active];
      }

      if (!items || items.length === 0) {
        return { success: false, message: '没有可导出的数据' };
      }

      // Format CSV with BOM for Excel compatibility
      const BOM = '﻿';
      const header = '任务内容,状态,类别,备注,创建时间,完成时间,归档时间\n';
      const rows = items.map((item) => {
        const status = item.completed ? '已完成' : '待办';
        const category = item.category || '未分类';
        // Escape fields that may contain commas or quotes
        const escape = (s) => s ? `"${String(s).replace(/"/g, '""')}"` : '';
        return [
          escape(item.text),
          status,
          escape(category),
          escape(item.note),
          item.created_at || '',
          item.completed_at || '',
          item.archived_at || '',
        ].join(',');
      }).join('\n');

      const csv = BOM + header + rows;

      // Show save dialog
      const defaultName = `todofloat-export-${new Date().toISOString().slice(0, 10)}.csv`;
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出任务数据',
        defaultPath: defaultName,
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      });

      if (canceled || !filePath) return { success: false };

      fs.writeFileSync(filePath, csv, 'utf-8');
      return { success: true, filePath };
    } catch (err) {
      console.error('[IPC] export:csv error:', err.message);
      return { success: false, message: err.message };
    }
  });

  // Window control - works for any calling window
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.hide();
  });

  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
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

  // Open settings window
  ipcMain.handle('openSettingsWindow', () => {
    const win = createSettingsWindow();
    win.show();
    win.focus();
  });

  // Float window opacity — send to renderer as CSS (setOpacity causes Windows hang)
  ipcMain.handle('window:setOpacity', (e, value) => {
    const opacity = Math.max(0.2, Math.min(1, value));
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send('opacity-changed', opacity);
    }
  });

  // Apply theme to all windows
  ipcMain.handle('window:applyTheme', (e, theme) => {
    [floatWindow, trayWindow, settingsWindow].forEach((win) => {
      try {
        if (win && !win.isDestroyed()) {
          win.webContents.send('theme-changed', theme);
        }
      } catch (err) {
        console.error('[IPC] applyTheme send error:', err.message);
      }
    });
  });
}

// Single instance lock - prevent multiple instances (especially on Windows)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // When a second instance is launched, activate the existing window
    if (floatWindow && !floatWindow.isDestroyed()) {
      if (!floatWindow.isVisible()) floatWindow.show();
      floatWindow.focus();
    }
  });

  // App lifecycle
  app.whenReady().then(() => {
    db = new Database();
    setupIPC();
    createFloatWindow();
    createTray();
  });
}

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
  // Save window bounds
  if (floatWindow && !floatWindow.isDestroyed()) {
    try {
      const [width, height] = floatWindow.getSize();
      const [x, y] = floatWindow.getPosition();
      db.saveSettings({ window_bounds: JSON.stringify({ x, y, width, height }) });
    } catch (e) { /* ignore */ }
  }
  if (db) db.close();
});
