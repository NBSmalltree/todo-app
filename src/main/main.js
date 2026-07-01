const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, dialog, globalShortcut } = require('electron');
const path = require('path');
const Database = require('./database');
const EdgeManager = require('./edgeManager');

// Keep a global reference to prevent garbage collection
let floatWindow = null;
let trayWindow = null;
let settingsWindow = null;
let quickAddWindow = null;
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
  ipcMain.handle('db:getActiveTodos', () => db.getActiveTodos());
  ipcMain.handle('db:getFutureScheduledTodos', () => db.getFutureScheduledTodos());
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
    // Validate dueDate format (YYYY-MM-DD or YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS) or allow null
    if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(dueDate)) return { success: false, error: 'Invalid date format' };
    return db.setDueDate(id, dueDate);
  });
  ipcMain.handle('db:setScheduledDate', (e, id, dateStr) => {
    if (!isPositiveInt(id)) return null;
    // Allow YYYY-MM-DD or null
    if (dateStr !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { success: false, error: 'Invalid date format' };
    return db.setScheduledDate(id, dateStr);
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

  // Subtask operations
  ipcMain.handle('db:getSubtasks', (e, todoId) => {
    if (!isPositiveInt(todoId)) return [];
    return db.getSubtasks(todoId);
  });
  ipcMain.handle('db:addSubtask', (e, todoId, text) => {
    if (!isPositiveInt(todoId) || !isNonEmptyString(text)) return null;
    return db.addSubtask(todoId, text.trim());
  });
  ipcMain.handle('db:toggleSubtask', (e, id) => {
    if (!isPositiveInt(id)) return null;
    return db.toggleSubtask(id);
  });
  ipcMain.handle('db:deleteSubtask', (e, id) => {
    if (!isPositiveInt(id)) return { success: false };
    return db.deleteSubtask(id);
  });
  ipcMain.handle('db:updateSubtaskText', (e, id, text) => {
    if (!isPositiveInt(id) || !isNonEmptyString(text)) return null;
    return db.updateSubtaskText(id, text.trim());
  });

  ipcMain.handle('db:getWorkAnalysis', (e, period) => {
    const validPeriods = ['week', 'month', 'year'];
    return db.getWorkAnalysis(validPeriods.includes(period) ? period : 'week');
  });
  ipcMain.handle('db:getSettings', () => db.getSettings());
  // Handle test notification
  ipcMain.handle('notification:test', () => {
    try {
      const { Notification } = require('electron');
      const notif = new Notification({
        title: 'TodoFloat 提醒',
        body: '这是一条测试通知，如果你看到了说明提醒功能正常 ✔',
        silent: false,
      });
      notif.show();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('shortcuts:get', () => {
    const s = db.getSettings();
    return {
      toggle: s.shortcut_toggle || (process.platform === 'darwin' ? 'Cmd+Shift+T' : 'Ctrl+Shift+T'),
      quickadd: s.shortcut_quickadd || (process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space'),
    };
  });
  ipcMain.handle('shortcuts:update', async (e, { toggle, quickadd }) => {
    try {
      db.saveSettings({ shortcut_toggle: toggle, shortcut_quickadd: quickadd });
      registerShortcuts();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
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
    [floatWindow, trayWindow, settingsWindow, quickAddWindow].forEach((win) => {
      try {
        if (win && !win.isDestroyed()) {
          win.webContents.send('theme-changed', theme);
        }
      } catch (err) {
        console.error('[IPC] applyTheme send error:', err.message);
      }
    });
  });

  // ===== Pomodoro Timer =====
  ipcMain.handle('pomodoro:getState', () => getPomodoroState());
  ipcMain.handle('pomodoro:start', async (e, { taskId, taskText }) => {
    try {
      return startPomodoro(db, taskId, taskText);
    } catch (err) {
      console.error('[Pomodoro] start error:', err.message);
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('pomodoro:pause', () => pausePomodoro());
  ipcMain.handle('pomodoro:resume', () => resumePomodoro());
  ipcMain.handle('pomodoro:stop', () => {
    try {
      return stopPomodoro(db);
    } catch (err) {
      console.error('[Pomodoro] stop error:', err.message);
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('pomodoro:getSessions', () => {
    try {
      return db.getPomodoroSessions();
    } catch (err) {
      console.error('[Pomodoro] getSessions error:', err.message);
      return [];
    }
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
    
    // Register global shortcuts from settings
    registerShortcuts();

    // Start reminder polling (check every 60 seconds)
    startReminderPolling();
  });

// ===== Global Shortcuts =====
function registerShortcuts() {
  if (!db) return;
  globalShortcut.unregisterAll();

  const settings = db.getSettings();
  const toggleShortcut = settings.shortcut_toggle || (process.platform === 'darwin' ? 'Cmd+Shift+T' : 'Ctrl+Shift+T');
  const quickAddShortcut = settings.shortcut_quickadd || (process.platform === 'darwin' ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space');

  try {
    globalShortcut.register(toggleShortcut, () => {
      if (floatWindow) {
        if (floatWindow.isVisible() && !floatWindow.isMinimized()) {
          if (edgeManager && edgeManager.state === 'HIDDEN') {
            edgeManager.showWindow();
          } else {
            floatWindow.hide();
          }
        } else {
          floatWindow.show();
          floatWindow.focus();
        }
      }
    });
    console.log(`[Shortcuts] Toggle registered: ${toggleShortcut}`);
  } catch (e) {
    console.error(`[Shortcuts] Failed to register toggle shortcut "${toggleShortcut}":`, e.message);
  }

  try {
    globalShortcut.register(quickAddShortcut, () => {
      createQuickAddWindow();
    });
    console.log(`[Shortcuts] Quick add registered: ${quickAddShortcut}`);
  } catch (e) {
    console.error(`[Shortcuts] Failed to register quick add shortcut "${quickAddShortcut}":`, e.message);
  }
}

// ===== Pomodoro Timer =====
const POMODORO_DEFAULTS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

let pomodoroTimer = null;
const pomodoroState = {
  isRunning: false,
  isPaused: false,
  timeRemaining: 0,
  totalDuration: 0,
  cycleType: 'focus', // 'focus' | 'short_break' | 'long_break'
  cyclesCompleted: 0,
  taskId: null,
  taskText: null,
  sessionId: null,
  startTime: null,
};

function getPomodoroConfig(dbInstance) {
  const s = dbInstance.getSettings();
  return {
    focusMinutes: Number(s.pomodoro_focus) || POMODORO_DEFAULTS.focusMinutes,
    shortBreakMinutes: Number(s.pomodoro_short_break) || POMODORO_DEFAULTS.shortBreakMinutes,
    longBreakMinutes: Number(s.pomodoro_long_break) || POMODORO_DEFAULTS.longBreakMinutes,
    cyclesBeforeLongBreak: Number(s.pomodoro_cycles_before_long) || POMODORO_DEFAULTS.cyclesBeforeLongBreak,
  };
}

function broadcastPomodoroState() {
  const state = {
    isRunning: pomodoroState.isRunning,
    isPaused: pomodoroState.isPaused,
    timeRemaining: pomodoroState.timeRemaining,
    totalDuration: pomodoroState.totalDuration,
    cycleType: pomodoroState.cycleType,
    cyclesCompleted: pomodoroState.cyclesCompleted,
    taskId: pomodoroState.taskId,
    taskText: pomodoroState.taskText,
    sessionId: pomodoroState.sessionId,
  };
  [floatWindow, trayWindow, settingsWindow, quickAddWindow].forEach((win) => {
    try {
      if (win && !win.isDestroyed()) {
        win.webContents.send('pomodoro:stateChanged', state);
      }
    } catch { /* ignore */ }
  });
}

function startPomodoro(dbInstance, taskId, taskText) {
  if (pomodoroState.isRunning) {
    return { success: false, error: '番茄钟已在运行' };
  }

  const config = getPomodoroConfig(dbInstance);
  const duration = config.focusMinutes * 60; // seconds

  // Create session record
  const session = dbInstance.addPomodoroSession({
    task_id: taskId,
    task_text: taskText || null,
    duration,
    cycle_type: 'focus',
  });

  if (!session) {
    return { success: false, error: '创建会话失败' };
  }

  pomodoroState.isRunning = true;
  pomodoroState.isPaused = false;
  pomodoroState.timeRemaining = duration;
  pomodoroState.totalDuration = duration;
  pomodoroState.cycleType = 'focus';
  pomodoroState.taskId = taskId || null;
  pomodoroState.taskText = taskText || null;
  pomodoroState.sessionId = session.id;
  pomodoroState.startTime = Date.now();

  clearInterval(pomodoroTimer);
  pomodoroTimer = setInterval(() => {
    if (pomodoroState.isPaused) return;
    pomodoroState.timeRemaining--;
    broadcastPomodoroState();

    // Timer complete
    if (pomodoroState.timeRemaining <= 0) {
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
      pomodoroState.isRunning = false;

      // Update session as completed
      const actualDuration = Math.round((Date.now() - pomodoroState.startTime) / 1000);
      dbInstance.updatePomodoroSession(pomodoroState.sessionId, {
        end_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
        actual_duration: actualDuration,
        completed: 1,
      });

      // Show notification
      try {
        const { Notification } = require('electron');
        const notif = new Notification({
          title: '🍅 番茄时间结束！',
          body: taskText ? `「${taskText}」的专注时间已到，休息一下吧！` : '专注时间已到，休息一下吧！',
          silent: false,
        });
        notif.show();
        notif.on('click', () => {
          try {
            if (floatWindow && !floatWindow.isDestroyed()) {
              floatWindow.show();
              floatWindow.focus();
            }
          } catch { /* ignore */ }
        });
      } catch { /* ignore */ }

      // Auto-start break
      const config2 = getPomodoroConfig(dbInstance);
      pomodoroState.cyclesCompleted++;
      const isLongBreak = pomodoroState.cyclesCompleted % config2.cyclesBeforeLongBreak === 0;
      const breakType = isLongBreak ? 'long_break' : 'short_break';
      const breakDuration = (isLongBreak ? config2.longBreakMinutes : config2.shortBreakMinutes) * 60;

      // Create break session
      const breakSession = dbInstance.addPomodoroSession({
        task_id: taskId,
        task_text: taskText || null,
        duration: breakDuration,
        cycle_type: breakType,
      });

      if (breakSession) {
        pomodoroState.isRunning = true;
        pomodoroState.isPaused = false;
        pomodoroState.timeRemaining = breakDuration;
        pomodoroState.totalDuration = breakDuration;
        pomodoroState.cycleType = breakType;
        pomodoroState.sessionId = breakSession.id;
        pomodoroState.startTime = Date.now();

        pomodoroTimer = setInterval(() => {
          if (pomodoroState.isPaused) return;
          pomodoroState.timeRemaining--;
          broadcastPomodoroState();

          if (pomodoroState.timeRemaining <= 0) {
            clearInterval(pomodoroTimer);
            pomodoroTimer = null;
            pomodoroState.isRunning = false;

            const actDur = Math.round((Date.now() - pomodoroState.startTime) / 1000);
            dbInstance.updatePomodoroSession(pomodoroState.sessionId, {
              end_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
              actual_duration: actDur,
              completed: 1,
            });

            try {
              const { Notification } = require('electron');
              const notif = new Notification({
                title: isLongBreak ? '☕ 长休息结束！' : '☕ 休息结束！',
                body: '休息时间结束，准备开始新的番茄吧！',
                silent: false,
              });
              notif.show();
            } catch { /* ignore */ }

            broadcastPomodoroState();
          }
        }, 1000);
      }

      broadcastPomodoroState();
    }
  }, 1000);

  broadcastPomodoroState();
  return { success: true };
}

function pausePomodoro() {
  if (!pomodoroState.isRunning || pomodoroState.isPaused) {
    return { success: false };
  }
  pomodoroState.isPaused = true;
  broadcastPomodoroState();
  return { success: true };
}

function resumePomodoro() {
  if (!pomodoroState.isRunning || !pomodoroState.isPaused) {
    return { success: false };
  }
  pomodoroState.isPaused = false;
  broadcastPomodoroState();
  return { success: true };
}

function stopPomodoro(dbInstance) {
  if (!pomodoroState.isRunning && !pomodoroState.isPaused) {
    return { success: false, error: '没有正在运行的番茄钟' };
  }

  clearInterval(pomodoroTimer);
  pomodoroTimer = null;

  // Record incompleted session
  if (pomodoroState.sessionId) {
    const actualDuration = pomodoroState.startTime
      ? Math.round((Date.now() - pomodoroState.startTime) / 1000)
      : 0;
    dbInstance.updatePomodoroSession(pomodoroState.sessionId, {
      end_time: new Date().toISOString().replace('T', ' ').slice(0, 19),
      actual_duration: actualDuration,
      completed: 0,
    });
  }

  // Reset state
  pomodoroState.isRunning = false;
  pomodoroState.isPaused = false;
  pomodoroState.timeRemaining = 0;
  pomodoroState.totalDuration = 0;
  pomodoroState.cycleType = 'focus';
  pomodoroState.taskId = null;
  pomodoroState.taskText = null;
  pomodoroState.sessionId = null;
  pomodoroState.startTime = null;

  broadcastPomodoroState();
  return { success: true };
}

function getPomodoroState() {
  return {
    isRunning: pomodoroState.isRunning,
    isPaused: pomodoroState.isPaused,
    timeRemaining: pomodoroState.timeRemaining,
    totalDuration: pomodoroState.totalDuration,
    cycleType: pomodoroState.cycleType,
    cyclesCompleted: pomodoroState.cyclesCompleted,
    taskId: pomodoroState.taskId,
    taskText: pomodoroState.taskText,
    sessionId: pomodoroState.sessionId,
  };
}

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

      // Clean up remindedTaskIds: remove IDs that no longer exist or are completed/archived
      try {
        const activeIds = new Set(
          db.db.prepare('SELECT id FROM todos WHERE archived = 0 AND completed = 0').pluck().all()
        );
        for (const id of remindedTaskIds) {
          if (!activeIds.has(id)) remindedTaskIds.delete(id);
        }
      } catch { /* ignore */ }

      const dueTasks = db.getDueSoon(remindMinutes);
      dueTasks.forEach((task) => {
        if (remindedTaskIds.has(task.id)) return; // already reminded
        remindedTaskIds.add(task.id);

        const dueStr = task.due_date || '';
        const body = dueStr ? `任务「${task.text}」将于 ${dueStr} 到期` : `任务「${task.text}」已到期`;

        try {
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
              try {
                if (floatWindow && !floatWindow.isDestroyed()) {
                  floatWindow.show();
                  floatWindow.focus();
                }
              } catch { /* ignore */ }
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
        } catch { /* swallow EPIPE or other notification errors */ }
      });
    } catch (e) {
      try { console.error('[Reminder] Polling error:', e.message); } catch {}
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
function createQuickAddWindow() {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.min(440, screenWidth - 40);
  const winHeight = 80;

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
    // Apply current theme to the newly created window via executeJavaScript,
    // which is more reliable than sending an event (renderer may not have
    // registered the listener yet when the event arrives).
    try {
      const settings = db.getSettings();
      const theme = (settings?.theme && ['light', 'dark', 'eye-care'].includes(settings.theme))
        ? settings.theme
        : 'light';
      quickAddWindow.webContents.executeJavaScript(
        `document.documentElement.setAttribute('data-theme', '${theme}')`
      ).catch(() => {});
    } catch (e) { /* ignore */ }

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
