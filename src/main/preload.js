const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  getTodos: () => ipcRenderer.invoke('db:getTodos'),
  addTodo: (text) => ipcRenderer.invoke('db:addTodo', text),
  toggleTodo: (id) => ipcRenderer.invoke('db:toggleTodo', id),
  deleteTodo: (id) => ipcRenderer.invoke('db:deleteTodo', id),
  restoreTodo: (id) => ipcRenderer.invoke('db:restoreTodo', id),
  archiveTodo: (id) => ipcRenderer.invoke('db:archiveTodo', id),
  getArchived: (filters) => ipcRenderer.invoke('db:getArchived', filters),
  updateNote: (id, note) => ipcRenderer.invoke('db:updateNote', id, note),
  updateCategory: (id, category) => ipcRenderer.invoke('db:updateCategory', id, category),
  setDueDate: (id, dueDate) => ipcRenderer.invoke('db:setDueDate', id, dueDate),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  reorder: (orders) => ipcRenderer.invoke('db:reorder', orders),
  updateColor: (id, color) => ipcRenderer.invoke('db:updateColor', id, color),
  updateText: (id, text) => ipcRenderer.invoke('db:updateText', id, text),
  getWorkAnalysis: (period) => ipcRenderer.invoke('db:getWorkAnalysis', period),

  // Subtask operations
  getSubtasks: (todoId) => ipcRenderer.invoke('db:getSubtasks', todoId),
  addSubtask: (todoId, text) => ipcRenderer.invoke('db:addSubtask', todoId, text),
  toggleSubtask: (id) => ipcRenderer.invoke('db:toggleSubtask', id),
  deleteSubtask: (id) => ipcRenderer.invoke('db:deleteSubtask', id),
  updateSubtaskText: (id, text) => ipcRenderer.invoke('db:updateSubtaskText', id, text),
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('db:saveSettings', settings),

  // LLM
  categorize: (text) => ipcRenderer.invoke('llm:categorize', text),
  analyzeWork: (data) => ipcRenderer.invoke('llm:analyzeWork', data),
  testLLM: (settings) => ipcRenderer.invoke('llm:test', settings),
  testNotification: () => ipcRenderer.invoke('notification:test'),

  // Quick add
  quickAdd: (text) => ipcRenderer.invoke('db:quickAdd', text),
  closeQuickAdd: () => ipcRenderer.invoke('quickadd:close'),
  exportCsv: (filters) => ipcRenderer.invoke('export:csv', filters),

  // Window control
  closeWindow: () => ipcRenderer.invoke('window:close'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  getScale: () => ipcRenderer.invoke('window:getScale'),
  adjustScale: (delta) => ipcRenderer.invoke('window:adjustScale', delta),

  // Open tray window
  openTrayWindow: () => ipcRenderer.invoke('openTrayWindow'),
  openSettingsWindow: () => ipcRenderer.invoke('openSettingsWindow'),

  // Window opacity
  setOpacity: (value) => ipcRenderer.invoke('window:setOpacity', value),

  // Theme
  applyTheme: (theme) => ipcRenderer.invoke('window:applyTheme', theme),

  // Pomodoro
  pomodoroGetState: () => ipcRenderer.invoke('pomodoro:getState'),
  pomodoroStart: (data) => ipcRenderer.invoke('pomodoro:start', data),
  pomodoroPause: () => ipcRenderer.invoke('pomodoro:pause'),
  pomodoroResume: () => ipcRenderer.invoke('pomodoro:resume'),
  pomodoroStop: () => ipcRenderer.invoke('pomodoro:stop'),
  pomodoroGetSessions: () => ipcRenderer.invoke('pomodoro:getSessions'),
  onPomodoroStateChanged: (callback) => {
    const handler = (e, state) => callback(state);
    ipcRenderer.on('pomodoro:stateChanged', handler);
    return () => ipcRenderer.removeListener('pomodoro:stateChanged', handler);
  },

  // Font family
  applyFontFamily: (font) => ipcRenderer.invoke('window:applyFontFamily', font),

  // Edge management
  toggleEdgeHide: () => ipcRenderer.invoke('edge:toggleHide'),
  getEdgeSettings: () => ipcRenderer.invoke('edge:getSettings'),
  saveEdgeSettings: (settings) => ipcRenderer.invoke('edge:saveSettings', settings),

  // App functions
  backupDatabase: () => ipcRenderer.invoke('app:backupDatabase'),
  restoreDatabase: () => ipcRenderer.invoke('app:restoreDatabase'),

  // Events — each returns a cleanup function for useEffect teardown
  onScaleChanged: (callback) => {
    const handler = (e, scale) => callback(scale);
    ipcRenderer.on('scale-changed', handler);
    return () => ipcRenderer.removeListener('scale-changed', handler);
  },
  onNavigate: (callback) => {
    const handler = (e, route) => callback(route);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },
  onThemeChanged: (callback) => {
    const handler = (e, theme) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => ipcRenderer.removeListener('theme-changed', handler);
  },
  onFontFamilyChanged: (callback) => {
    const handler = (e, font) => callback(font);
    ipcRenderer.on('font-family-changed', handler);
    return () => ipcRenderer.removeListener('font-family-changed', handler);
  },
  onDataChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('data-changed', handler);
    return () => ipcRenderer.removeListener('data-changed', handler);
  },
  onOpacityChanged: (callback) => {
    const handler = (e, opacity) => callback(opacity);
    ipcRenderer.on('opacity-changed', handler);
    return () => ipcRenderer.removeListener('opacity-changed', handler);
  },
  onEdgeStateChanged: (callback) => {
    const handler = (e, state) => callback(state);
    ipcRenderer.on('edge:stateChanged', handler);
    return () => ipcRenderer.removeListener('edge:stateChanged', handler);
  },
});
