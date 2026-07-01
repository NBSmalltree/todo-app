import React, { useState, useEffect } from 'react';
import ArchiveViewer from './ArchiveViewer';
import WorkAnalysis from './WorkAnalysis';

const { electronAPI } = window;

const TABS = [
  { id: 'archive', label: '历史归档', icon: 'archive' },
  { id: 'analysis', label: '工作分析', icon: 'chart' },
];

function TabIcon({ type }) {
  switch (type) {
    case 'archive':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path d="M8 2h8v4H8z" />
        </svg>
      );
    case 'chart':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TrayView() {
  const [activeTab, setActiveTab] = useState('archive');
  const [isMaximized, setIsMaximized] = useState(false);
  const [pomodoroState, setPomodoroState] = useState(null);

  // Load theme on mount, listen for changes
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const data = await electronAPI.getSettings();
        if (data.theme && ['light', 'dark', 'eye-care'].includes(data.theme)) {
          document.documentElement.setAttribute('data-theme', data.theme);
        }
      } catch (e) { /* ignore */ }
    };
    loadTheme();

    electronAPI?.onThemeChanged?.((newTheme) => {
      document.documentElement.setAttribute('data-theme', newTheme);
    });

    // Listen for pomodoro state changes
    electronAPI?.onPomodoroStateChanged?.((state) => {
      setPomodoroState(state);
    });

    // Check initial maximized state
    checkMaximizedState();
  }, []);

  const checkMaximizedState = async () => {
    try {
      const maximized = await electronAPI?.isWindowMaximized?.();
      setIsMaximized(maximized);
    } catch (e) { /* ignore */ }
  };

  const handleClose = () => {
    electronAPI?.closeWindow();
  };

  const handleMinimize = () => {
    electronAPI?.minimizeWindow();
  };

  const handleMaximize = async () => {
    await electronAPI?.maximizeWindow?.();
    // Toggle the state
    setIsMaximized(!isMaximized);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Title Bar - Draggable, matching TodoWindow style */}
      <div className="drag-region flex items-center justify-between px-4 py-2 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-sky-500">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-gray-600">历史归档</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
            title="最小化"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            onClick={handleMaximize}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
            title={isMaximized ? "还原" : "最大化"}
          >
            {isMaximized ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Pomodoro banner (when running) */}
      {pomodoroState?.isRunning && (
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${pomodoroState.cycleType === 'focus' ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}>
          <span className="text-sm">{pomodoroState.cycleType === 'focus' ? '🍅' : '☕'}</span>
          <span className={`text-xs font-semibold ${pomodoroState.cycleType === 'focus' ? 'text-rose-600' : 'text-emerald-600'}`}>
            {pomodoroState.cycleType === 'focus' ? '专注中' : '休息中'}
            {pomodoroState.isPaused && ' (暂停)'}
          </span>
          <span className={`text-sm font-bold tabular-nums ${pomodoroState.cycleType === 'focus' ? 'text-rose-500' : 'text-emerald-500'}`}>
            {String(Math.floor(pomodoroState.timeRemaining / 60)).padStart(2, '0')}:{String(pomodoroState.timeRemaining % 60).padStart(2, '0')}
          </span>
          {pomodoroState.taskText && (
            <span className="text-xs text-gray-400 truncate flex-1 text-right">{pomodoroState.taskText}</span>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <TabIcon type={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'archive' && <ArchiveViewer />}
        {activeTab === 'analysis' && <WorkAnalysis />}
      </div>
    </div>
  );
}
