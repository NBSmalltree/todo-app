import React, { useState, useEffect, useRef, useCallback } from 'react';

const { electronAPI } = window;

export default function TodoWindow() {
  const [todos, setTodos] = useState([]);
  const [inputText, setInputText] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [scale, setScale] = useState(1);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const isComposingRef = useRef(false); // Track IME composition state
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Load todos on mount
  useEffect(() => {
    loadTodos();
  }, []);

  // Load and apply theme & opacity on mount, listen for changes
  useEffect(() => {
    const loadAppearance = async () => {
      try {
        const data = await electronAPI.getSettings();
        if (data.theme) document.documentElement.setAttribute('data-theme', data.theme);
        if (data.todo_opacity != null) electronAPI.setOpacity(Number(data.todo_opacity));
      } catch (e) { /* ignore */ }
    };
    loadAppearance();

    electronAPI?.onThemeChanged?.((newTheme) => {
      document.documentElement.setAttribute('data-theme', newTheme);
    });
  }, []);

  // Handle mouse wheel for scaling - attached to container for reliability
  useEffect(() => {
    const container = listRef.current?.parentElement;
    if (!container) return;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.3, Math.min(2.5, scaleRef.current + delta));
        scaleRef.current = newScale;
        setScale(newScale);
        electronAPI?.adjustScale(newScale);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const loadTodos = async () => {
    try {
      const data = await electronAPI.getTodos();
      setTodos(data);
    } catch (error) {
      console.error('Failed to load todos:', error);
    }
  };

  const handleAddTodo = async () => {
    if (!inputText.trim()) return;
    try {
      await electronAPI.addTodo(inputText.trim());
      setInputText('');
      await loadTodos();
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const handleToggle = async (id) => {
    try {
      await electronAPI.toggleTodo(id);
      await loadTodos();
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const handleRestore = async (id) => {
    try {
      await electronAPI.restoreTodo(id);
      await loadTodos();
    } catch (error) {
      console.error('Failed to restore todo:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await electronAPI.deleteTodo(id);
      await loadTodos();
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const handleArchive = async (id) => {
    try {
      await electronAPI.archiveTodo(id);
      await loadTodos();
    } catch (error) {
      console.error('Failed to archive todo:', error);
    }
  };

  const handleContextMenu = (e, todo) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      todo,
    });
  };

  const handleKeyDown = (e) => {
    // Don't submit while IME composition is active (e.g. typing Chinese)
    if (e.key === 'Enter' && !isComposingRef.current) {
      handleAddTodo();
    }
  };

  // Window control buttons
  const handleClose = () => {
    electronAPI?.closeWindow();
  };

  const handleOpenTray = () => {
    electronAPI?.openTrayWindow();
  };

  // Corner resize handlers
  const handleResizeStart = useCallback((e, corner) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      corner,
      scale,
    });
  }, [scale]);

  useEffect(() => {
    if (!isResizing || !resizeStart) return;

    const handleMouseMove = (e) => {
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const direction = dx + dy > 0 ? 1 : -1;
      const scaleDelta = (distance * direction * 0.002);
      const newScale = Math.max(0.3, Math.min(2.5, resizeStart.scale + scaleDelta));
      scaleRef.current = newScale;
      setScale(newScale);
      electronAPI?.setScale(newScale);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart]);

  // Separate active and completed todos
  const activeTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);

  return (
    <div
      className="h-full flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100"
      style={{ zoom: scale }}
    >
      {/* Title Bar - Draggable */}
      <div className="drag-region flex items-center justify-between px-4 py-2 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-sky-500">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-gray-600">待办清单</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenTray}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
            title="历史归档"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
              <path d="M8 2h8v4H8z" />
            </svg>
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

      {/* Input Area */}
      <div className="px-3 py-2 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            placeholder="添加新任务..."
            className="flex-1 px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all placeholder-gray-400"
          />
          <button
            onClick={handleAddTodo}
            disabled={!inputText.trim()}
            className="px-3 py-1.5 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            添加
          </button>
        </div>
      </div>

      {/* Todo List */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-1">
        {/* Active Todos */}
        {activeTodos.map((todo) => (
          <div
            key={todo.id}
            className="todo-item flex items-center gap-2 px-2 py-1.5 rounded-lg group cursor-default"
            onContextMenu={(e) => handleContextMenu(e, todo)}
          >
            <button
              onClick={() => handleToggle(todo.id)}
              className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-sky-400 transition-colors flex items-center justify-center"
            >
              {/* Empty circle for uncompleted */}
            </button>
            <span className="flex-1 text-sm text-gray-700 truncate">{todo.text}</span>
            <button
              onClick={() => handleDelete(todo.id)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Separator if both sections have items */}
        {activeTodos.length > 0 && completedTodos.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1 my-1">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">已完成</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
        )}

        {/* Completed Todos */}
        {completedTodos.map((todo) => (
          <div
            key={todo.id}
            className="todo-item flex items-center gap-2 px-2 py-1.5 rounded-lg group cursor-default"
            onContextMenu={(e) => handleContextMenu(e, todo)}
          >
            <button
              onClick={() => handleRestore(todo.id)}
              className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-sky-400 bg-sky-400 transition-colors flex items-center justify-center"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <span className="flex-1 text-sm text-gray-400 line-through truncate">{todo.text}</span>
            <button
              onClick={() => handleDelete(todo.id)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Empty state */}
        {todos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm mt-2">暂无待办事项</span>
          </div>
        )}
      </div>

      {/* Footer with count */}
      <div className="px-3 py-1.5 bg-gray-50/50 border-t border-gray-100 text-xs text-gray-400 flex justify-between">
        <span>{activeTodos.length} 项待办</span>
        <span>{completedTodos.length} 项已完成</span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.todo.completed ? (
            <button
              className="w-full px-4 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => {
                handleRestore(contextMenu.todo.id);
                setContextMenu(null);
              }}
            >
              恢复为待办
            </button>
          ) : (
            <button
              className="w-full px-4 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => {
                handleToggle(contextMenu.todo.id);
                setContextMenu(null);
              }}
            >
              标记为已完成
            </button>
          )}
          <button
            className="w-full px-4 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => {
              handleArchive(contextMenu.todo.id);
              setContextMenu(null);
            }}
          >
            归档
          </button>
          <div className="h-px bg-gray-100 my-1" />
          <button
            className="w-full px-4 py-1.5 text-sm text-left text-red-500 hover:bg-red-50 transition-colors"
            onClick={() => {
              handleDelete(contextMenu.todo.id);
              setContextMenu(null);
            }}
          >
            删除
          </button>
        </div>
      )}

      {/* Resize handles for four corners */}
      <div
        className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'nw')}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'ne')}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'sw')}
      />
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-40"
        onMouseDown={(e) => handleResizeStart(e, 'se')}
      />
    </div>
  );
}
