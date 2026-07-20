import React, { useState, useEffect, useRef, useCallback } from 'react';

import api from '../api';
import CustomSelect from './CustomSelect';

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
  const [isStarting, setIsStarting] = useState(false);
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
    if (isStarting) return;
    setIsStarting(true);
    try {
      const activeTodos = (todos || []).filter((t) => !t.completed && !t.archived);
      let taskId = selectedTaskId;
      let taskText = null;
      if (taskId) {
        const todo = activeTodos.find((t) => t.id === taskId);
        if (todo) taskText = todo.text;
      }
      const result = await api.pomodoroStart({ taskId: taskId || null, taskText });
      if (result?.error) {
        console.error('Pomodoro start failed:', result.error);
      }
      // Reload state from backend (it now has the correct initial timeRemaining)
      loadState();
    } catch (e) {
      console.error('Failed to start pomodoro:', e);
    } finally {
      setIsStarting(false);
    }
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
    <div className={`mb-3 rounded-xl border transition-all duration-300 ease-in-out ${
      expanded ? borderColor + ' ' + bgColor :
      state.isRunning ? borderColor + ' ' + bgColor :
      'border-gray-200 hover:border-gray-300'
    } ${state.isRunning && !expanded ? 'border-l-2 ' + (isFocus ? 'border-l-rose-400' : 'border-l-emerald-400') : ''}`}>
      {/* Collapsed header bar — always toggleable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-all duration-200 rounded-t-xl ${
          expanded ? `border-b ${borderColor}` :
          state.isRunning ? bgColor + ' rounded-t-xl' :
          'rounded-xl hover:bg-gray-50'
        }`}
      >
        <span className={`text-base transition-transform duration-300 ${state.isRunning ? 'animate-pulse-soft' : ''}`}>🍅</span>
        <span className="text-sm font-medium text-gray-700 transition-colors duration-200">番茄钟</span>
        {state.isRunning && (
          <span className={`text-sm font-bold tabular-nums transition-all duration-300 ${accentColor}`}>
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
                  className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-all duration-200 ${isFocus ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                  继续
                </span>
              ) : (
                <span onClick={(e) => { e.stopPropagation(); handlePause(); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-all duration-200 ${isFocus ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
                  暂停
                </span>
              )}
              <span onClick={(e) => { e.stopPropagation(); handleStop(); }}
                className="text-[10px] px-1 py-0.5 rounded cursor-pointer transition-all duration-200 text-gray-400 border border-gray-200 hover:bg-gray-50 hover:text-gray-500">
                结束
              </span>
            </>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-all duration-300 ease-in-out ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded content — animated accordion */}
      {expanded && (
        <div className="p-4 space-y-4 animate-expand-in">
          {/* Timer circle — always centered */}
          <div className="flex flex-col items-center gap-3">
            <div className={`relative w-32 h-32 transition-transform duration-500 ${state.isRunning ? 'scale-100' : 'scale-95'}`}>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none"
                  stroke={theme === 'dark' ? '#313244' : '#f1f5f9'} strokeWidth="6"
                  className="transition-colors duration-300" />
                <circle
                  cx="60" cy="60" r={radius}
                  fill="none"
                  stroke={isFocus ? '#f43f5e' : '#10b981'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold tabular-nums transition-colors duration-300 ${state.isRunning ? 'animate-pulse-soft' : ''} ${accentColor}`}>
                  {formatTime(state.timeRemaining || (expanded ? 0 : state.totalDuration) || (25 * 60))}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5 transition-colors duration-300">
                  {cycleLabel}
                </span>
              </div>
            </div>

            {/* Current task display when running */}
            {state.isRunning && state.taskText && (
              <div className="text-xs text-gray-500 text-center max-w-[200px] truncate animate-appear-up">
                📌 {state.taskText}
              </div>
            )}

            {/* Cycle indicators */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-500 ${
                    i < state.cyclesCompleted % 4
                      ? (isFocus ? 'bg-rose-400 scale-110' : 'bg-emerald-400 scale-110')
                      : 'bg-gray-200'
                  }`}
                />
              ))}
              <span className="text-[10px] text-gray-400 ml-1 transition-opacity duration-300">
                第 {state.cyclesCompleted + 1} 轮
              </span>
            </div>
          </div>

          {/* Task selector card — idle state only, full-width with subtle background */}
          {!state.isRunning && !state.isPaused && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 transition-all duration-300 hover:bg-gray-100/80">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs">📌</span>
                <span className="text-xs text-gray-500">关联任务</span>
                <span className="text-[10px] text-gray-300">可选</span>
              </div>
              <CustomSelect
                value={selectedTaskId || ''}
                onChange={(val) => setSelectedTaskId(val ? Number(val) : null)}
                options={[
                  { value: '', label: '无关联任务' },
                  ...activeTodos.map((t) => ({ value: t.id, label: t.text })),
                ]}
                placeholder="无关联任务"
              />
            </div>
          )}

          {/* Start button — idle state only */}
          {!state.isRunning && !state.isPaused && (
            <button
              type="button"
              onClick={handleStart}
              disabled={isStarting}
              className="w-full py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg transition-all duration-200 hover:bg-amber-600 active:scale-[0.98] hover:shadow-md hover:shadow-amber-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  启动中...
                </span>
              ) : (
                '开始专注'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
