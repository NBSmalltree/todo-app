// Tauri API adapter — drop-in replacement for window.electronAPI
// Maps all Tauri commands and events to the same interface used by React components

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const api = {
  // ===== Database - Todo CRUD =====
  getTodos: () => invoke('get_todos'),
  getActiveTodos: () => invoke('get_active_todos'),
  getFutureScheduledTodos: () => invoke('get_future_scheduled_todos'),
  addTodo: (text) => invoke('add_todo', { text }),
  toggleTodo: (id) => invoke('toggle_todo', { id }),
  deleteTodo: (id) => invoke('delete_todo', { id }),
  recoverTodo: (id) => invoke('recover_todo', { id }),
  restoreTodo: (id) => invoke('restore_todo', { id }),
  archiveTodo: (id) => invoke('archive_todo', { id }),
  getArchived: (filters) => invoke('get_archived', { filters }),
  updateNote: (id, note) => invoke('update_note', { id, note }),
  updateCategory: (id, category) => invoke('update_category', { id, category }),
  setDueDate: (id, dueDate) => invoke('set_due_date', { id, dueDate }),
  setScheduledDate: (id, dateStr) => invoke('set_scheduled_date', { id, dateStr }),
  getCategories: () => invoke('get_categories'),
  reorder: (orders) => invoke('reorder', { orders }),
  updateColor: (id, color) => invoke('update_color', { id, color }),
  updateText: (id, text) => invoke('update_text', { id, text }),
  getWorkAnalysis: (period) => invoke('get_work_analysis', { period }),

  // ===== Subtask CRUD =====
  getSubtasks: (todoId) => invoke('get_subtasks', { todoId }),
  addSubtask: (todoId, text) => invoke('add_subtask', { todoId, text }),
  toggleSubtask: (id) => invoke('toggle_subtask', { id }),
  deleteSubtask: (id) => invoke('delete_subtask', { id }),
  updateSubtaskText: (id, text) => invoke('update_subtask_text', { id, text }),

  // ===== Settings =====
  getSettings: () => invoke('get_settings'),
  saveSettings: (settings) => invoke('save_settings', { settings }),

  // ===== Shortcuts =====
  getShortcuts: () => invoke('get_shortcuts'),
  updateShortcuts: (toggle, quickadd) => invoke('update_shortcuts', { toggle, quickadd }),

  // ===== LLM =====
  categorize: (text) => invoke('llm_categorize', { text }),
  analyzeWork: (data) => invoke('llm_analyze_work', { data }),
  testLLM: (settings) => invoke('llm_test', { settings }),
  testNotification: () => invoke('test_notification'),

  // ===== Quick Add =====
  quickAdd: (text, category, dueDate) => invoke('quick_add', { text, category, dueDate }),
  closeQuickAdd: () => invoke('close_quick_add'),
  exportCsv: (filters) => invoke('export_csv', { filters }),

  // ===== Window Control =====
  closeWindow: () => invoke('window_close'),
  minimizeWindow: () => invoke('window_minimize'),
  maximizeWindow: () => invoke('window_maximize'),
  isWindowMaximized: () => invoke('window_is_maximized'),
  getScale: () => invoke('window_get_scale'),
  adjustScale: (delta) => invoke('window_adjust_scale', { scale: delta }),
  setOpacity: (value) => invoke('window_set_opacity', { opacity: value }),
  applyTheme: (theme) => invoke('window_apply_theme', { theme }),
  openTrayWindow: () => invoke('open_tray_window'),
  openSettingsWindow: () => invoke('open_settings_window'),

  // ===== App =====
  backupDatabase: () => invoke('backup_database'),
  restoreDatabase: () => invoke('restore_database'),

  // ===== Pomodoro =====
  pomodoroGetState: () => invoke('pomodoro_get_state'),
  pomodoroStart: (data) => invoke('pomodoro_start', {
    taskId: data.taskId || null,
    taskText: data.taskText || null,
  }),
  pomodoroPause: () => invoke('pomodoro_pause'),
  pomodoroResume: () => invoke('pomodoro_resume'),
  pomodoroStop: () => invoke('pomodoro_stop'),
  pomodoroComplete: (data) => invoke('pomodoro_complete', {
    actualDuration: data.actualDuration,
    taskText: data.taskText || null,
  }),
  pomodoroGetSessions: () => invoke('pomodoro_get_sessions'),
  pomodoroGetStats: (period) => invoke('pomodoro_get_stats', { period }),

  // ===== Events =====
  onPomodoroStateChanged: (callback) => {
    return listen('pomodoro:stateChanged', (event) => {
      callback(event.payload);
    });
  },
  onScaleChanged: (callback) => {
    return listen('scale-changed', (event) => {
      callback(event.payload);
    });
  },
  onNavigate: (callback) => {
    return listen('navigate', (event) => {
      callback(event.payload);
    });
  },
  onThemeChanged: (callback) => {
    return listen('theme-changed', (event) => {
      callback(event.payload);
    });
  },
  onDataChanged: (callback) => {
    return listen('data-changed', callback);
  },
  onOpacityChanged: (callback) => {
    return listen('opacity-changed', (event) => {
      callback(event.payload);
    });
  },

  // ===== Window Drag =====
  startDragging: () => {
    try { getCurrentWindow().startDragging(); } catch {}
  },
};

export default api;
