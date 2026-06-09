import React, { useState, useEffect, useRef, useCallback } from 'react';

const { electronAPI } = window;

export default function TodoWindow() {
  const [todos, setTodos] = useState([]);
  const [inputText, setInputText] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [scale, setScale] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState(null);
  const [newIds, setNewIds] = useState(new Set());
  const [exitingIds, setExitingIds] = useState(new Set());
  const [checkPulseIds, setCheckPulseIds] = useState(new Set());
  const [dragId, setDragId] = useState(null);       // item being dragged
  const [dragOverId, setDragOverId] = useState(null); // item being hovered over
  const [editingId, setEditingId] = useState(null);    // 正在编辑的 todo id
  const [editText, setEditText] = useState('');          // 编辑中的文本
  const [edgeState, setEdgeState] = useState({ snapped: false, edge: null, hidden: false });
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const editInputRef = useRef(null);
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
        if (data.theme && ['light', 'dark', 'eye-care'].includes(data.theme)) {
          document.documentElement.setAttribute('data-theme', data.theme);
        }
        if (data.todo_opacity != null) {
          const v = Number(data.todo_opacity);
          if (!isNaN(v) && v >= 0.2 && v <= 1) setOpacity(v);
        }
      } catch (e) { /* ignore */ }
    };
    loadAppearance();

    electronAPI?.onThemeChanged?.((newTheme) => {
      document.documentElement.setAttribute('data-theme', newTheme);
    });

    // Auto-refresh when data changes from archive window
    electronAPI?.onDataChanged?.(() => {
      loadTodos();
    });

    // Listen for opacity changes from settings
    electronAPI?.onOpacityChanged?.((v) => {
      setOpacity(v);
    });

    // Listen for edge state changes
    electronAPI?.onEdgeStateChanged?.((state) => {
      setEdgeState(state);
    });
  }, []);

  // Handle mouse wheel for scaling - attached to container for reliability
  useEffect(() => {
    const container = listRef.current?.parentElement;
    if (!container) return;

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Normalize deltaY: mouse wheel typically gives ±100/120, trackpad gives smaller values
        const raw = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        const delta = -(raw / 2000);
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
      const result = await electronAPI.addTodo(inputText.trim());
      setInputText('');
      await loadTodos();
      // Mark the new item for enter animation
      if (result && result.id) {
        setNewIds((prev) => new Set(prev).add(result.id));
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(result.id);
            return next;
          });
        }, 300);
      }
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to add todo:', error);
    }
  };

  const handleToggle = async (id) => {
    try {
      // Trigger checkbox pulse
      setCheckPulseIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setCheckPulseIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
      await electronAPI.toggleTodo(id);
      await loadTodos();
    } catch (error) {
      console.error('Failed to toggle todo:', error);
    }
  };

  const handleRestore = async (id) => {
    try {
      setCheckPulseIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setCheckPulseIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
      await electronAPI.restoreTodo(id);
      await loadTodos();
    } catch (error) {
      console.error('Failed to restore todo:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      // Play exit animation first
      setExitingIds((prev) => new Set(prev).add(id));
      await new Promise((r) => setTimeout(r, 200));
      await electronAPI.deleteTodo(id);
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  // Drag-and-drop handlers for active todos
  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Set transparent drag image for custom styling
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    const active = todos.filter((t) => !t.completed);
    const dragIdx = active.findIndex((t) => t.id === dragId);
    const targetIdx = active.findIndex((t) => t.id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    // Reorder locally
    const reordered = [...active];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Persist new order
    const orders = reordered.map((t, i) => ({ id: t.id, sort_order: i }));
    try {
      await electronAPI.reorder(orders);
      await loadTodos();
    } catch (err) {
      console.error('Failed to reorder:', err);
    }

    setDragId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  // Color options for urgency levels
  const COLOR_OPTIONS = [
    { value: 'red',    label: '紧急', css: 'bg-red-400' },
    { value: 'orange', label: '重要', css: 'bg-orange-400' },
    { value: 'yellow', label: '一般', css: 'bg-yellow-400' },
    { value: 'green',  label: '低优', css: 'bg-green-400' },
  ];

  const handleColorChange = async (id, color) => {
    try {
      await electronAPI.updateColor(id, color);
      await loadTodos();
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  };

  const handleDoubleClick = (e, todo) => {
    e.stopPropagation();           // 阻止事件冒泡到 drag handler
    e.preventDefault();            // 防止双击选中文本
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const handleSaveEdit = async (id) => {
    const trimmed = editText.trim();
    if (!trimmed) {
      // 空文本则取消编辑，不做保存
      handleCancelEdit();
      return;
    }
    try {
      await electronAPI.updateText(id, trimmed);
      setEditingId(null);
      setEditText('');
      await loadTodos();
    } catch (error) {
      console.error('Failed to update text:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleEditKeyDown = (e, id) => {
    if (e.key === 'Enter' && !isComposingRef.current) {
      e.preventDefault();
      handleSaveEdit(id);
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
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
    <div className="h-full overflow-hidden" style={{ opacity }}>
      <div className="h-full flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100 relative" style={{ zoom: scale, transition: 'zoom 0.15s ease-out' }}>
      {/* Edge snap indicator */}
      {edgeState.snapped && edgeState.edge && (
        <div className={`snap-indicator ${edgeState.edge}`} />
      )}
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
          {edgeState.snapped && (
            <button
              onClick={() => electronAPI?.toggleEdgeHide()}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
              title="取消吸附"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v6m0 0L9 5m3 3l3-3M12 22v-6m0 0l-3 3m3-3l3 3M2 12h6m0 0L5 9m3 3L5 15M22 12h-6m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          )}
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
        {activeTodos.map((todo) => {
          const colorMap = { red: '#f87171', orange: '#fb923c', yellow: '#facc15', green: '#4ade80' };
          const borderColor = todo.color ? colorMap[todo.color] : null;
          return (
          <div key={todo.id}>
            {/* Drop indicator line */}
            {dragOverId === todo.id && dragId !== todo.id && (
              <div className="h-0.5 bg-sky-400 rounded-full mx-2 transition-all" />
            )}
            <div
              draggable={editingId !== todo.id}
              onDragStart={(e) => handleDragStart(e, todo.id)}
              onDragOver={(e) => handleDragOver(e, todo.id)}
              onDrop={(e) => handleDrop(e, todo.id)}
              onDragEnd={handleDragEnd}
              className={`todo-item flex items-center gap-2 px-2 py-1.5 rounded-lg group cursor-default
                ${newIds.has(todo.id) ? 'todo-enter' : ''}
                ${exitingIds.has(todo.id) ? 'todo-exit' : ''}
                ${dragId === todo.id ? 'opacity-40' : ''}
                ${dragOverId === todo.id && dragId !== todo.id ? 'bg-sky-50' : ''}
              `}
              style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : undefined}
              onContextMenu={(e) => handleContextMenu(e, todo)}
            >
              {/* Drag handle */}
              <svg className="flex-shrink-0 w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 cursor-grab active:cursor-grabbing" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
                <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
                <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
              </svg>
              <button
                onClick={() => handleToggle(todo.id)}
                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-sky-400 transition-colors flex items-center justify-center ${checkPulseIds.has(todo.id) ? 'todo-check-animate' : ''}`}
              >
                {/* Empty circle for uncompleted */}
              </button>
              {editingId === todo.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, todo.id)}
                  onBlur={() => handleSaveEdit(todo.id)}
                  onCompositionStart={() => { isComposingRef.current = true; }}
                  onCompositionEnd={() => { isComposingRef.current = false; }}
                  autoFocus
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-sm bg-gray-50 rounded border border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all"
                />
              ) : (
                <span
                  onDoubleClick={(e) => handleDoubleClick(e, todo)}
                  className="flex-1 text-sm text-gray-700 truncate cursor-default"
                  title="双击编辑"
                >
                  {todo.text}
                </span>
              )}
              <button
                onClick={() => handleDelete(todo.id)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          );
        })}

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
            className={`todo-item flex items-center gap-2 px-2 py-1.5 rounded-lg group cursor-default ${newIds.has(todo.id) ? 'todo-enter' : ''} ${exitingIds.has(todo.id) ? 'todo-exit' : ''}`}
            onContextMenu={(e) => handleContextMenu(e, todo)}
          >
            <button
              onClick={() => handleRestore(todo.id)}
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 border-sky-400 bg-sky-400 transition-colors flex items-center justify-center ${checkPulseIds.has(todo.id) ? 'todo-check-animate' : ''}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>
            {editingId === todo.id ? (
              <input
                ref={editInputRef}
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => handleEditKeyDown(e, todo.id)}
                onBlur={() => handleSaveEdit(todo.id)}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                autoFocus
                className="flex-1 min-w-0 px-1.5 py-0.5 text-sm bg-gray-50 rounded border border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all"
              />
            ) : (
              <span
                onDoubleClick={(e) => handleDoubleClick(e, todo)}
                className="flex-1 text-sm text-gray-400 line-through truncate cursor-default"
                title="双击编辑"
              >
                {todo.text}
              </span>
            )}
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
          {/* Color picker - only for active items */}
          {!contextMenu.todo.completed && (
            <div className="px-4 py-1.5 flex items-center gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  title={opt.label}
                  className={`w-5 h-5 rounded-full ${opt.css} transition-transform hover:scale-125 ${contextMenu.todo.color === opt.value ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`}
                  onClick={() => {
                    handleColorChange(contextMenu.todo.id, contextMenu.todo.color === opt.value ? null : opt.value);
                    setContextMenu(null);
                  }}
                />
              ))}
              {contextMenu.todo.color && (
                <button
                  title="清除颜色"
                  className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors"
                  onClick={() => {
                    handleColorChange(contextMenu.todo.id, null);
                    setContextMenu(null);
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
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
          {contextMenu.todo.completed ? (
            <button
              className="w-full px-4 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => {
                handleArchive(contextMenu.todo.id);
                setContextMenu(null);
              }}
            >
              归档
            </button>
          ) : null}
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
    </div>
  );
}
