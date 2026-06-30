import React, { useState, useEffect, useRef } from 'react';

const { electronAPI } = window;

export default function QuickAdd() {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input on mount
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await electronAPI.quickAdd(trimmed);
      setText('');
      // Close window after successful add
      electronAPI?.closeQuickAdd();
    } catch (e) {
      console.error('Quick add failed:', e);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      electronAPI?.closeQuickAdd();
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50/80 backdrop-blur-sm">
      <div className="w-full px-4">
        <div className="flex items-center gap-2 bg-white/90 rounded-xl shadow-lg border border-gray-200 px-4 py-2.5">
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
