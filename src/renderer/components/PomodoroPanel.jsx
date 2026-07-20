import React, { useState, useEffect, useRef, useCallback } from 'react';

import api from '../api';

export default function PomodoroPanel({ todos }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState({
    isRunning: false,
    isPaused: false,
    timeRemaining: 0,
    totalDuration: 0,
    cycleType: 'focus',
    cyclesCompleted: 0,
    taskId: null,
    taskText: null,
    sessionId: null,
  });
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const mountedRef = useRef(true);
  const stateRef = useRef(state);
  const intervalRef = useRef(null);
  const [theme, setTheme] = useState('light');

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Detect theme
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    let unlisten;
    api.onThemeChanged?.((t) => setTheme(t)).then(fn => { if (fn) unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Load initial state on mount
  const loadState = async () => {
    try {
      const s = await api.pomodoroGetState();
      if (mountedRef.current) setState(s);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadState();
    let unlistenRef = null;
    api.onPomodoroStateChanged?.((newState) => {
      if (mountedRef.current) {
        setState(newState);
      }
    }).then(fn => { if (fn) unlistenRef = fn; });

    return () => {
      mountedRef.current = false;
      if (unlistenRef) unlistenRef();
    };
  }, []);

  // Frontend-driven countdown timer
  const stopFrontendTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleComplete = useCallback(async () => {
    stopFrontendTimer();
    const s = stateRef.current;
    try {
      await api.pomodoroComplete({
        actualDuration: s.totalDuration,
        taskText: s.taskText,
      });
    } catch (e) {
      console.error('Failed to complete pomodoro:', e);
    }
    // Reload state from backend (now in break or idle)
    loadState();
  }, [stopFrontendTimer]);

  useEffect(() => {
    stopFrontendTimer();

    if (!state.isRunning || state.isPaused) return;

    // Start a 1-second countdown that only touches React state
    intervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const s = stateRef.current;
      if (!s.isRunning || s.isPaused) {
        stopFrontendTimer();
        return;
      }
      if (s.timeRemaining <= 1) {
        // Timer done — complete via backend
        setState(prev => ({ ...prev, timeRemaining: 0 }));
        handleComplete();
        return;
      }
      setState(prev => ({ ...prev, timeRemaining: prev.timeRemaining - 1 }));
    }, 1000);

    return stopFrontendTimer;
  }, [state.isRunning, state.isPaused, stopFrontendTimer, handleComplete]);

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progress = state.totalDuration > 0
    ? ((state.totalDuration - state.timeRemaining) / state.totalDuration) * 100
    : 0;

  // Determine colors based on cycle type
  const isFocus = state.cycleType === 'focus';
  const accentColor = isFocus ? 'text-rose-500' : 'text-emerald-500';
  const bgColor = isFocus ? 'bg-rose-50' : 'bg-emerald-50';
  const borderColor = isFocus ? 'border-rose-200' : 'border-emerald-200';
  const cycleLabel = isFocus ? '专注' : state.cycleType === 'short_break' ? '短休息' : '长休息';

  const handleStart = async () => {
    const activeTodos = (todos || []).filter((t) => !t.completed && !t.archived);
    let taskId = selectedTaskId;
    let taskText = null;
    if (taskId) {
      const todo = activeTodos.find((t) => t.id === taskId);
      if (todo) taskText = todo.text;
    }
    await api.pomodoroStart({ taskId: taskId || null, taskText });
    // Reload state from backend (it now has the correct initial timeRemaining)
    loadState();
  };

  const handlePause = async () => { await api.pomodoroPause(); loadState(); };
  const handleResume = async () => { await api.pomodoroResume(); loadState(); };
  const handleStop = async () => {
    stopFrontendTimer();
    await api.pomodoroStop();
    loadState();
  };

  const activeTodos = (todos || []).filter((t) => !t.completed && !t.archived);

  // Circle SVG circumference
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`mb-3 rounded-xl border transition-all ${expanded ? borderColor : state.isRunning ? borderColor + ' ' + bgColor : 'border-gray-200'} ${state.isRunning && !expanded ? 'border-l-2 ' + (isFocus ? 'border-l-rose-400' : 'border-l-emerald-400') : ''}`}>
      {/* Collapsed header bar — always toggleable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors rounded-t-xl ${
          expanded ? `border-b ${borderColor} ${bgColor}` : state.isRunning ? `${bgColor} rounded-t-xl` : 'rounded-xl hover:bg-gray-50'
        }`}
      >
        <span className="text-base">🍅</span>
        <span className="text-sm font-medium text-gray-700">番茄钟</span>
        {state.isRunning && (
          <span className={`text-sm font-bold tabular-nums ${accentColor}`}>
            {formatTime(state.timeRemaining)}{state.isPaused ? ' 暂停' : ''}
          </span>
        )}
        {state.isRunning && state.taskText && (
          <span className="text-[10px] text-gray-400 truncate flex-1">{state.taskText}</span>
        )}
        {state.cyclesCompleted > 0 && !state.isRunning && (
          <span className="text-xs text-gray-400">完成 {state.cyclesCompleted} 个</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {state.isRunning && (
            <>
              {state.isPaused ? (
                <span onClick={(e) => { e.stopPropagation(); handleResume(); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${isFocus ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                  继续
                </span>
              ) : (
                <span onClick={(e) => { e.stopPropagation(); handlePause(); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${isFocus ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                  暂停
                </span>
              )}
              <span onClick={(e) => { e.stopPropagation(); handleStop(); }}
                className="text-[10px] px-1 py-0.5 rounded cursor-pointer text-gray-400 border border-gray-200 hover:bg-gray-50">
                结束
              </span>
            </>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Timer circle */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-32 h-32">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke={theme === 'dark' ? '#313244' : '#f1f5f9'} strokeWidth="6" />
                <circle
                  cx="60" cy="60" r={radius}
                  fill="none"
                  stroke={isFocus ? '#f43f5e' : '#10b981'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold tabular-nums ${accentColor}`}>
                  {formatTime(state.timeRemaining || (expanded ? 0 : state.totalDuration) || (25 * 60))}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">{cycleLabel}</span>
              </div>
            </div>

            {/* Cycle indicators */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i < state.cyclesCompleted % 4
                      ? (isFocus ? 'bg-rose-400' : 'bg-emerald-400')
                      : 'bg-gray-200'
                  }`}
                />
              ))}
              <span className="text-[10px] text-gray-400 ml-1">
                第 {state.cyclesCompleted + 1} 轮
              </span>
            </div>

            {/* Task selector */}
            {!state.isRunning && !state.isPaused && (
              <div className="w-full max-w-xs">
                <label className="block text-[11px] text-gray-400 mb-1">关联任务（可选）</label>
                <select
                  value={selectedTaskId || ''}
                  onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-200 cursor-pointer"
                >
                  <option value="">无关联任务</option>
                  {activeTodos.map((t) => (
                    <option key={t.id} value={t.id}>{t.text}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Current task display when running */}
            {state.isRunning && state.taskText && (
              <div className="text-xs text-gray-500 text-center max-w-[200px] truncate">
                📌 {state.taskText}
              </div>
            )}
          </div>

          {/* Action buttons — only "开始专注" when not running; header has controls when running */}
          {!state.isRunning && !state.isPaused && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleStart}
                className="px-5 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
              >
                开始专注
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
