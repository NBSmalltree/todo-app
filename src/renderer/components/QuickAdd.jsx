import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function QuickAdd() {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  // Load and apply theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await window.electronAPI?.getSettings();
        const theme = (settings?.theme && ['light', 'dark', 'eye-care'].includes(settings.theme))
          ? settings.theme
          : 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    };
    loadTheme();

    // Listen for theme changes from main process
    const cleanup = window.electronAPI?.onThemeChanged?.((newTheme) => {
      document.documentElement.setAttribute('data-theme', newTheme);
    });
    return cleanup;
  }, []);

  const doClose = useCallback(() => {
    try {
      window.electronAPI?.closeQuickAdd();
    } catch (e) {
      console.error('Failed to close quick add:', e);
    }
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        doClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [doClose]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await window.electronAPI?.quickAdd(trimmed);
      setText('');
      doClose();
    } catch (e) {
      console.error('Quick add failed:', e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full px-4">
        <div className="flex items-center gap-2 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-2.5 relative">
          {/* Close button - top-right corner of the input bar */}
          <button
            onClick={doClose}
            className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-white hover:bg-red-50 text-gray-300 hover:text-red-500 shadow border border-gray-200 transition-all"
            title="关闭 (Esc)"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" className="shrink-0">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="快速添加待办，回车保存，Esc 关闭"
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
          />
          {text && (
            <button
              onClick={() => {
                setText('');
                inputRef.current?.focus();
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              title="清除"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
