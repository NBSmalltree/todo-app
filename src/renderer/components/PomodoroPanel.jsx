import React, { useState, useEffect, useRef } from 'react';

const { electronAPI } = window;

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

  // Load initial state on mount
  const loadState = async () => {
    try {
      const s = await electronAPI.pomodoroGetState();
      if (mountedRef.current) setState(s);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadState();
    const cleanup = electronAPI.onPomodoroStateChanged?.((newState) => {
      if (mountedRef.current) setState(newState);
    });
    return () => {
      mountedRef.current = false;
      if (cleanup) cleanup();
    };
  }, []);

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
  const hoverBg = isFocus ? 'hover:bg-rose-100' : 'hover:bg-emerald-100';
  const ringColor = isFocus ? 'focus:ring-rose-200' : 'focus:ring-emerald-200';
  const cycleLabel = isFocus ? '专注' : state.cycleType === 'short_break' ? '短休息' : '长休息';

  const handleStart = async () => {
    const activeTodos = (todos || []).filter((t) => !t.completed && !t.archived);
    let taskId = selectedTaskId;
    let taskText = null;
    if (taskId) {
      const todo = activeTodos.find((t) => t.id === taskId);
      if (todo) taskText = todo.text;
    }
    await electronAPI.pomodoroStart({ taskId: taskId || null, taskText });
  };

  const handlePause = async () => { await electronAPI.pomodoroPause(); };
  const handleResume = async () => { await electronAPI.pomodoroResume(); };
  const handleStop = async () => { await electronAPI.pomodoroStop(); };

  const activeTodos = (todos || []).filter((t) => !t.completed && !t.archived);

  // Circle SVG circumference
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`mb-3 rounded-xl border transition-all ${expanded ? borderColor : 'border-gray-200'}`}>
      {/* Collapsed header bar */}
      <button
        type="button"
        onClick={() => { if (!state.isRunning && !state.isPaused) setExpanded(!expanded); else setExpanded(true); }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-t-xl ${
          expanded ? `border-b ${borderColor} ${bgColor}` : 'rounded-xl hover:bg-gray-50'
        }`}
      >
        <span className="text-base">🍅</span>
        <span className="text-sm font-medium text-gray-700">番茄钟</span>
        {state.isRunning && (
          <span className={`text-xs font-semibold ${accentColor}`}>
            {formatTime(state.timeRemaining)}
            {state.isPaused && ' (暂停)'}
          </span>
        )}
        {state.cyclesCompleted > 0 && !state.isRunning && (
          <span className="text-xs text-gray-400">今日完成 {state.cyclesCompleted} 个</span>
        )}
        <svg
          className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Timer circle */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-32 h-32">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="6" />
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

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-2">
            {!state.isRunning && !state.isPaused ? (
              <button
                type="button"
                onClick={handleStart}
                className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isFocus ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
              >
                开始专注
              </button>
            ) : state.isPaused ? (
              <>
                <button
                  type="button"
                  onClick={handleResume}
                  className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isFocus ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                >
                  继续
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  结束
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handlePause}
                  className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isFocus ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                >
                  暂停
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  结束
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
