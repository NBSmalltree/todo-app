const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, globalShortcut } = require('electron');
const path = require('path');
const Database = require('./database');
const EdgeManager = require('./edgeManager');

// Keep a global reference to prevent garbage collection
let floatWindow = null;
let trayWindow = null;
let settingsWindow = null;
let tray = null;
let db = null;
let edgeManager = null;

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
  let savedEdgeState = null;
  try {
    if (!db) {
      console.warn('[Main] Database not initialized, using default bounds');
    } else {
      const settings = db.getSettings();
      if (settings.window_bounds) {
        const saved = typeof settings.window_bounds === 'string'
          ? JSON.parse(settings.window_bounds)
          : settings.window_bounds;
        bounds = { ...bounds, ...saved };
      }
      if (settings.edge_state) {
        savedEdgeState = typeof settings.edge_state === 'string'
          ? JSON.parse(settings.edge_state)
          : settings.edge_state;
      }
    }
  } catch (e) {
    console.error('[Main] Failed to load settings:', e.message);
    /* use defaults */
  }

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

  // Initialize edge manager
  edgeManager = new EdgeManager(floatWindow);
  edgeManager.loadSettings(db);

  // Add move and resize event listeners for edge detection
  floatWindow.on('move', () => {
    if (edgeManager) edgeManager.onWindowMoved();
  });

  floatWindow.on('resize', () => {
    if (edgeManager) edgeManager.onWindowResized();
  });

  // Restore edge state after renderer is fully ready
  if (savedEdgeState && savedEdgeState.edge) {
    floatWindow.webContents.on('did-finish-load', () => {
      if (edgeManager) edgeManager.restoreState(savedEdgeState);
    });
  }

  floatWindow.on('closed', () => {
    if (edgeManager) {
      edgeManager.destroy();
      edgeManager = null;
    }
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
  // Load tray icon from PNG files (Electron auto-picks @2x/@3x version on macOS Retina)
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);

  // On macOS, mark as template image so it adapts to light/dark menu bar
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '待办清单',
      click: () => {
        if (floatWindow) {
          // If window is hidden by edge manager, show it
          if (edgeManager && edgeManager.state === 'HIDDEN') {
            edgeManager.showWindow();
          } else {
            floatWindow.show();
          }
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

// Input validation helpers
function isNonEmptyString(v, maxLen = 500) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}
function isPositiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

// IPC Handlers
function setupIPC() {
  // Database operations
  ipcMain.handle('db:getTodos', () => db.getTodos());
  ipcMain.handle('db:addTodo', (e, text) => {
    if (!isNonEmptyString(text)) return { success: false, error: 'Invalid text' };
    return db.addTodo(text.trim());
  });
  ipcMain.handle('db:toggleTodo', (e, id) => {
    if (!isPositiveInt(id)) return null;
    return db.toggleTodo(id);
  });
  ipcMain.handle('db:deleteTodo', (e, id) => {
    if (!isPositiveInt(id)) return { success: false, error: 'Invalid id' };
    return db.deleteTodo(id);
  });
  ipcMain.handle('db:restoreTodo', (e, id) => {
    if (!isPositiveInt(id)) return null;
    const result = db.restoreTodo(id);
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send('data-changed');
    }
    return result;
  });
  ipcMain.handle('db:archiveTodo', (e, id) => {
    if (!isPositiveInt(id)) return null;
    const todo = db.archiveTodo(id);
    if (trayWindow && !trayWindow.isDestroyed()) {
      trayWindow.webContents.send('data-changed');
    }
    if (todo && !todo.category) {
      const settings = db.getSettings();
      if (settings.api_key) {
        const LLMHelper = require('./llm');
        const llmSettings = {
          api_format: 'openai',
          model: 'gpt-4o-mini',
          categorize_max_tokens: 2048,
          analyze_max_tokens: 10000,
          ...settings,
        };
        const llm = new LLMHelper(llmSettings);
        llm.categorize(todo.text).then((category) => {
          if (category) {
            db.updateCategory(id, category);
            if (trayWindow && !trayWindow.isDestroyed()) {
              trayWindow.webContents.send('data-changed');
            }
          }
        }).catch(() => {});
      }
    }
    return todo;
  });
  ipcMain.handle('db:getArchived', (e, filters) => {
    if (filters && typeof filters !== 'object') return [];
    return db.getArchived(filters || {});
  });
  ipcMain.handle('db:updateNote', (e, id, note) => {
    if (!isPositiveInt(id)) return null;
    return db.updateNote(id, typeof note === 'string' ? note : '');
  });
  ipcMain.handle('db:updateCategory', (e, id, category) => {
    if (!isPositiveInt(id)) return null;
    return db.updateCategory(id, typeof category === 'string' ? category : null);
  });
  ipcMain.handle('db:setDueDate', (e, id, dueDate) => {
    if (!isPositiveInt(id)) return null;
    // Validate dueDate format (YYYY-MM-DD) or allow null
    if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { success: false, error: 'Invalid date format' };
    return db.setDueDate(id, dueDate);
  });
  ipcMain.handle('db:getCategories', () => db.getCategories());
  ipcMain.handle('db:reorder', (e, orders) => {
    if (!Array.isArray(orders)) return { success: false, error: 'Invalid orders' };
    return db.updateOrders(orders);
  });
  ipcMain.handle('db:updateColor', (e, id, color) => {
    if (!isPositiveInt(id)) return null;
    return db.updateColor(id, color);
  });
  ipcMain.handle('db:updateText', (e, id, text) => {
    if (!isPositiveInt(id) || !isNonEmptyString(text)) return null;
    return db.updateText(id, text.trim());
  });
  ipcMain.handle('db:getWorkAnalysis', (e, period) => {
    const validPeriods = ['week', 'month', 'year'];
    return db.getWorkAnalysis(validPeriods.includes(period) ? period : 'week');
  });
  ipcMain.handle('db:getSettings', () => db.getSettings());
  ipcMain.handle('db:saveSettings', (e, settings) => {
    if (!settings || typeof settings !== 'object') {
      return { success: false, error: 'Invalid settings' };
    }
    try {
      return db.saveSettings(settings);
    } catch (err) {
      console.error('[IPC] saveSettings error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Edge management
  ipcMain.handle('edge:toggleHide', () => {
    if (edgeManager) edgeManager.toggleHide();
  });

  ipcMain.handle('edge:getSettings', () => {
    if (edgeManager) return edgeManager.getSettings();
    return { edge_snap_enabled: true, edge_hide_delay: 3000, edge_snap_threshold: 20 };
  });

  ipcMain.handle('edge:saveSettings', (e, settings) => {
    if (edgeManager) edgeManager.saveSettings(db, settings);
  });

  // LLM categorization
  ipcMain.handle('llm:categorize', async (e, text) => {
    try {
      const LLMHelper = require('./llm');
      const settings = db.getSettings();
      if (!settings.api_key) return null;
      const llmSettings = {
        api_format: 'openai',
        model: 'gpt-4o-mini',
        categorize_max_tokens: 2048,
        analyze_max_tokens: 10000,
        ...settings,
      };
      const llm = new LLMHelper(llmSettings);
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
      const llmSettings = {
        api_format: 'openai',
        model: 'gpt-4o-mini',
        categorize_max_tokens: 2048,
        analyze_max_tokens: 10000,
        ...settings,
      };
      const llm = new LLMHelper(llmSettings);
      return await llm.analyzeWork(data);
    } catch (err) {
      console.error('[IPC] analyzeWork error:', err.message);
      return null;
    }
  });

  // Quick add todo (from quick add window)
  ipcMain.handle('db:quickAdd', (e, text) => {
    if (!text || typeof text !== 'string' || !text.trim()) return { success: false };
    try {
      const todo = db.addTodo(text.trim());
      // Notify float window to refresh
      if (floatWindow && !floatWindow.isDestroyed()) {
        floatWindow.webContents.send('data-changed');
      }
      return { success: true, todo };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Close quick add window
  ipcMain.handle('quickadd:close', () => {
    if (quickAddWindow && !quickAddWindow.isDestroyed()) {
      quickAddWindow.close();
    }
  });

  // LLM connection test
  ipcMain.handle('llm:test', async (e, settings) => {
    try {
      const LLMHelper = require('./llm');
      if (!settings || !settings.api_key) {
        return { success: false, error: '请先填写 API Key' };
      }
      const llm = new LLMHelper(settings);
      return await llm.test();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Database backup and restore
  ipcMain.handle('app:backupDatabase', async (event) => {
    try {
      const fs = require('fs');
      const dbPath = db.getDbPath();
      const win = BrowserWindow.fromWebContents(event.sender);

      const { filePath } = await dialog.showSaveDialog(win, {
        title: '备份数据库',
        defaultPath: `todo-app-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [
          { name: '数据库文件', extensions: ['db'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!filePath) {
        return { success: false, error: '用户取消' };
      }

      fs.copyFileSync(dbPath, filePath);
      return { success: true, path: filePath };
    } catch (err) {
      console.error('[IPC] backupDatabase error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('app:restoreDatabase', async (event) => {
    try {
      const fs = require('fs');
      const dbPath = db.getDbPath();
      const win = BrowserWindow.fromWebContents(event.sender);

      const { filePaths } = await dialog.showOpenDialog(win, {
        title: '恢复数据库',
        filters: [
          { name: '数据库文件', extensions: ['db'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!filePaths || filePaths.length === 0) {
        return { success: false, error: '用户取消' };
      }

      const backupPath = filePaths[0];

      // Close database connection
      db.close();

      // Copy backup file to current database location
      fs.copyFileSync(backupPath, dbPath);

      // Reopen database connection
      db = new Database();

      return { success: true };
    } catch (err) {
      console.error('[IPC] restoreDatabase error:', err.message);
      return { success: false, error: err.message };
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
      const header = '任务内容,状态,截止日期,类别,备注,创建时间,完成时间,归档时间\n';
      const rows = items.map((item) => {
        const status = item.completed ? '已完成' : '待办';
        const category = item.category || '未分类';
        // Escape fields that may contain commas or quotes
        const escape = (s) => s ? `"${String(s).replace(/"/g, '""')}"` : '';
        return [
          escape(item.text),
          status,
          item.due_date || '',
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
    if (win) {
      // If edge manager is active, un-snap before hiding
      if (edgeManager && win === floatWindow && edgeManager.state !== 'FREE') {
        edgeManager.unSnap();
      }
      win.hide();
    }
  });

  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
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

  // Apply font family to all windows
  ipcMain.handle('window:applyFontFamily', (e, font) => {
    [floatWindow, trayWindow, settingsWindow].forEach((win) => {
      try {
        if (win && !win.isDestroyed()) {
          win.webContents.send('font-family-changed', font);
        }
      } catch (err) {
        console.error('[IPC] applyFontFamily send error:', err.message);
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
    
    // Register global shortcut: Ctrl+Shift+T (Cmd+Shift+T on macOS)
    const shortcut = process.platform === 'darwin' ? 'Cmd+Shift+T' : 'Ctrl+Shift+T';
    globalShortcut.register(shortcut, () => {
      if (floatWindow) {
        if (floatWindow.isVisible() && !floatWindow.isMinimized()) {
          // If window is visible and not minimized, hide it
          if (edgeManager && edgeManager.state === 'HIDDEN') {
            edgeManager.showWindow();
          } else {
            floatWindow.hide();
          }
        } else {
          // If window is hidden or minimized, show and focus it
          floatWindow.show();
          floatWindow.focus();
        }
      }
    });
    console.log(`Global shortcut registered: ${shortcut}`);
  });

  // Register global shortcut for quick add (Ctrl/Cmd + Shift + Space)
  const quickAddShortcut = process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space';
  globalShortcut.register(quickAddShortcut, () => {
    createQuickAddWindow();
  });
  console.log(`Quick add shortcut registered: ${quickAddShortcut}`);

  // Start reminder polling (check every 60 seconds)
  startReminderPolling();
});

// Reminder polling: check due tasks every 60 seconds
let reminderTimer = null;
let remindedTaskIds = new Set(); // track already-reminded tasks to avoid duplicate notifications

function startReminderPolling() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(() => {
    if (!db) return;
    try {
      const settings = db.getSettings();
      const remindMinutes = settings.remind_minutes != null ? Number(settings.remind_minutes) : 15;
      if (remindMinutes < 0) return; // disabled

      const dueTasks = db.getDueSoon(remindMinutes);
      dueTasks.forEach((task) => {
        if (remindedTaskIds.has(task.id)) return; // already reminded
        remindedTaskIds.add(task.id);

        const dueStr = task.due_date || '';
        const body = dueStr ? `任务「${task.text}」将于 ${dueStr} 到期` : `任务「${task.text}」已到期`;

        if (process.platform === 'darwin') {
          // macOS: use native Notification
          const { Notification } = require('electron');
          const notif = new Notification({
            title: 'TodoFloat 提醒',
            body,
            silent: false,
          });
          notif.show();
          notif.on('click', () => {
            if (floatWindow) {
              floatWindow.show();
              floatWindow.focus();
            }
          });
        } else {
          // Windows: use toast notification via electron
          const { Notification } = require('electron');
          const notif = new Notification({
            title: 'TodoFloat 提醒',
            body,
            silent: false,
          });
          notif.show();
        }
      });
    } catch (e) {
      console.error('[Reminder] Polling error:', e.message);
    }
  }, 60000); // check every 60 seconds
}

function stopReminderPolling() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

// Quick Add Window
let quickAddWindow = null;

function createQuickAddWindow() {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.min(400, screenWidth - 40);
  const winHeight = 52;

  quickAddWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    type: 'toolbar', // makes it appear as a floating tool window
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Center on screen
  quickAddWindow.center();

  quickAddWindow.setAlwaysOnTop(true, 'floating');

  if (isDev()) {
    quickAddWindow.loadURL('http://localhost:5173#/quickadd');
  } else {
    quickAddWindow.loadFile(path.join(__dirname, '../../build/renderer/index.html'), {
      hash: '/quickadd',
    });
  }

  quickAddWindow.once('ready-to-show', () => {
    quickAddWindow.show();
    quickAddWindow.focus();
  });

  quickAddWindow.on('closed', () => {
    quickAddWindow = null;
  });
}

// Unregister global shortcuts when app quits
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
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
    // Ensure db is initialized
    if (!db) {
      console.warn('[Main] Database not initialized on activate, initializing now...');
      db = new Database();
    }
    createFloatWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopReminderPolling();
  // Save window bounds and edge state
  if (floatWindow && !floatWindow.isDestroyed()) {
    try {
      const [width, height] = floatWindow.getSize();
      const [x, y] = floatWindow.getPosition();
      const settingsToSave = { window_bounds: JSON.stringify({ x, y, width, height }) };

      // Save edge state if snapped
      if (edgeManager) {
        const edgeState = edgeManager.getState();
        if (edgeState) {
          settingsToSave.edge_state = JSON.stringify(edgeState);
        } else {
          settingsToSave.edge_state = null;
        }
      }

      db.saveSettings(settingsToSave);
    } catch (e) { /* ignore */ }
  }
  if (edgeManager) {
    edgeManager.destroy();
    edgeManager = null;
  }
  if (db) db.close();
});
