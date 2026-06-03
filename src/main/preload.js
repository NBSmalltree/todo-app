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
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  getWorkAnalysis: (period) => ipcRenderer.invoke('db:getWorkAnalysis', period),
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (settings) => ipcRenderer.invoke('db:saveSettings', settings),

  // LLM
  categorize: (text) => ipcRenderer.invoke('llm:categorize', text),

  // Window control
  closeWindow: () => ipcRenderer.invoke('window:close'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  setScale: (scale) => ipcRenderer.invoke('window:setScale', scale),
  getScale: () => ipcRenderer.invoke('window:getScale'),
  adjustScale: (delta) => ipcRenderer.invoke('window:adjustScale', delta),

  // Open tray window
  openTrayWindow: () => ipcRenderer.invoke('openTrayWindow'),

  // Events
  onScaleChanged: (callback) => {
    ipcRenderer.on('scale-changed', (e, scale) => callback(scale));
  },
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (e, route) => callback(route));
  },
});
