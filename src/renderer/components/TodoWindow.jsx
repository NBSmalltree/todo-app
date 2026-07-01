import React, { useState, useEffect, useRef, useCallback } from 'react';
import DueDatePicker from './DueDatePicker';
import PomodoroPanel from './PomodoroPanel';

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
    const [datePickerId, setDatePickerId] = useState(null); // 正在设置截止日期的 todo id
    const [selectMode, setSelectMode] = useState(false);       // 批量选择模式
    const [selectedIds, setSelectedIds] = useState(new Set());  // 已选中的 todo id
    const [edgeState, setEdgeState] = useState({ snapped: false, edge: null, hidden: false });
  const [searchText, setSearchText] = useState('');     // 搜索文本
  const searchInputRef = useRef(null);                  // 搜索输入框 ref
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const editInputRef = useRef(null);
  const isComposingRef = useRef(false); // Track IME composition state
  const edgeSeqRef = useRef(0); // Track edge notification ordering
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  // Apply font family
  const applyFontFamily = (font) => {
    const fontMap = {
      system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif",
      sans: "'Helvetica Neue', Arial, 'Noto Sans SC', sans-serif",
      serif: "Georgia, 'Noto Serif SC', serif",
      mono: "'SF Mono', Monaco, 'Courier New', 'Noto Sans SC', monospace",
      pingfang: "'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
      microsoft: "'Microsoft YaHei', 'Segoe UI', Arial, sans-serif",
    };
    const fontFamilyValue = fontMap[font] || fontMap.system;
    document.documentElement.style.setProperty('--app-font-family', fontFamilyValue);
  };

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

        // Apply font family
        if (data.font_family) {
          applyFontFamily(data.font_family);
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

    // Listen for font family changes from settings
    electronAPI?.onFontFamilyChanged?.((font) => {
      applyFontFamily(font);
    });

    // Listen for edge state changes (ordered by seq to avoid stale notifications)
    electronAPI?.onEdgeStateChanged?.((state) => {
      if ((state.seq || 0) >= edgeSeqRef.current) {
        edgeSeqRef.current = state.seq || 0;
        setEdgeState(state);
      }
    });
  }, []);

  // Focus edit input when editing starts (more reliable than autoFocus)
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

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

  // Apply scale to root font size so all rem-based Tailwind classes scale
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale * 16}px`;
  }, [scale]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Global shortcut: Ctrl/Cmd+F to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (todos.length > 5 || searchText) {
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [todos.length, searchText]);

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

  const handleChangeDueDate = async (id, dueDate) => {
    try {
      await electronAPI.setDueDate(id, dueDate);
      // 实时保存后刷新列表，但不关闭选择器（用户可能还要继续微调）
      await loadTodos();
    } catch (error) {
      console.error('Failed to set due date:', error);
    }
  };

  const handleCloseDueDatePicker = () => {
    setDatePickerId(null);
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
      electronAPI?.adjustScale(newScale);
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

  // Filter todos by search text
  const filteredTodos = todos.filter((t) => {
    if (!searchText.trim()) return true;
    const keyword = searchText.toLowerCase();
    return (
      t.text.toLowerCase().includes(keyword) ||
      (t.note && t.note.toLowerCase().includes(keyword)) ||
      (t.category && t.category.toLowerCase().includes(keyword))
    );
  });

  // Separate active and completed todos
  const activeTodos = filteredTodos.filter((t) => !t.completed);
  const completedTodos = filteredTodos.filter((t) => t.completed);

  return (
    <div className="h-full overflow-hidden" style={{ opacity }}>
      <div className="h-full flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-100 relative">
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
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              setSelectedIds(new Set());
            }}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              selectMode
                ? 'bg-sky-100 text-sky-600'
                : 'hover:bg-gray-200/60 text-gray-400 hover:text-gray-600'
            }`}
            title={selectMode ? '取消选择' : '批量选择'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
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

      {/* Search Bar */}
      {searchText || todos.length > 5 ? (
        <div className="px-3 py-1.5 border-b border-gray-50">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索任务..."
              className="w-full pl-7 pr-7 py-1 text-xs bg-gray-50 rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-200 focus:border-sky-300 transition-all placeholder-gray-400"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Selection Bar */}
      {selectMode && (
        <div className="px-3 py-1.5 bg-sky-50 border-b border-sky-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.size === todos.length && todos.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(todos.map(t => t.id)));
                } else {
                  setSelectedIds(new Set());
                }
              }}
              className="w-4 h-4 rounded border-gray-300 text-sky-500 focus:ring-sky-200 cursor-pointer"
            />
            <span className="text-xs text-sky-700 font-medium">
              {selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : '全选'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                for (const id of [...selectedIds]) {
                  try { await electronAPI.deleteTodo(id); } catch (e) {}
                }
                setSelectedIds(new Set());
                await loadTodos();
              }}
              disabled={selectedIds.size === 0}
              className="px-2 py-1 text-xs text-red-500 bg-red-50 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              批量删除
            </button>
            <button
              onClick={async () => {
                for (const id of [...selectedIds]) {
                  const todo = todos.find(t => t.id === id);
                  if (todo && todo.completed) {
                    try { await electronAPI.archiveTodo(id); } catch (e) {}
                  }
                }
                setSelectedIds(new Set());
                await loadTodos();
              }}
              disabled={selectedIds.size === 0 || !completedTodos.some(t => selectedIds.has(t.id))}
              className="px-2 py-1 text-xs text-sky-600 bg-sky-50 rounded hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              批量归档
            </button>
          </div>
        </div>
      )}

      {/* Pomodoro Timer */}
      <div className="px-3 pt-2">
        <PomodoroPanel todos={todos} />
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
              draggable={editingId !== todo.id && !selectMode}
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
              {/* Checkbox (select mode) */}
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(todo.id)}
                  onChange={() => {
                    const newSelected = new Set(selectedIds);
                    if (newSelected.has(todo.id)) {
                      newSelected.delete(todo.id);
                    } else {
                      newSelected.add(todo.id);
                    }
                    setSelectedIds(newSelected);
                  }}
                  className="flex-shrink-0 w-4 h-4 rounded border-gray-300 text-sky-500 focus:ring-sky-200 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {/* Drag handle */}
              {!selectMode && (
              <svg className="flex-shrink-0 w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 cursor-grab active:cursor-grabbing" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5" cy="3" r="1.5" /><circle cx="11" cy="3" r="1.5" />
                <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
                <circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="13" r="1.5" />
              </svg>
              )}
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
              {/* Due date badge - click to toggle date picker */}
              {!editingId && todo.due_date && (
                <span
                  data-date-toggle={todo.id}
                  onClick={() => setDatePickerId(datePickerId === todo.id ? null : todo.id)}
                  className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                    todo.due_date < new Date().toISOString().slice(0, 16).replace('T', ' ')
                      ? 'bg-red-100 text-red-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  title="点击设置截止日期"
                >
                  {(() => {
                    const d = todo.due_date;
                    // d is "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
                    const datePart = d.slice(5, 10).replace('-', '/');
                    const timePart = d.length > 10 ? ' ' + d.slice(11, 16) : '';
                    return datePart + timePart;
                  })()}
                </span>
              )}
              {/* Calendar icon: set due date */}
              {!editingId && (
                <button
                  data-date-toggle={todo.id}
                  onClick={() => setDatePickerId(datePickerId === todo.id ? null : todo.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-sky-50 text-gray-300 hover:text-sky-500 transition-all"
                  title={todo.due_date ? '修改截止日期' : '设置截止日期'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
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
            {/* Inline date picker */}
            {datePickerId === todo.id && (
              <DueDatePicker
                value={todo.due_date}
                onChange={(newVal) => handleChangeDueDate(todo.id, newVal)}
                onClose={handleCloseDueDatePicker}
              />
            )}
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
