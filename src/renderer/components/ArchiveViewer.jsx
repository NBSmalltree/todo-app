import React, { useState, useEffect, useCallback, useRef } from 'react';

import api from '../api';

// Custom select dropdown with polished styling
function CustomSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder || '请选择';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white rounded-lg border transition-all ${
          open
            ? 'border-sky-400 ring-2 ring-sky-100'
            : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className={value === (options[0]?.value) ? 'text-gray-400' : 'text-gray-700'}>
          {label}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[140px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-48 overflow-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                opt.value === value
                  ? 'bg-sky-50 text-sky-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArchiveViewer() {
  const [archives, setArchives] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    category: 'all',
    startDate: '',
    endDate: '',
    searchText: '',
  });
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exportType, setExportType] = useState('archived');
  const [isExporting, setIsExporting] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState(filters.searchText);
  const [categorizingId, setCategorizingId] = useState(null); // Track which item is being categorized
  const [toast, setToast] = useState(null); // Toast message and type
  const [undoToast, setUndoToast] = useState(null); // { message, undoAction, timeoutId }
  const [selectMode, setSelectMode] = useState(false);       // 批量选择模式
  const [selectedIds, setSelectedIds] = useState(new Set());  // 已选中的归档 id
  const toastTimeoutRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchInputRef = useRef(null);

  // Load archives on mount and when filters change
  useEffect(() => {
    loadArchives();
    loadCategories();
  }, [filters]);

  // Debounce search input: only update filters.searchText after 300ms pause
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => {
        if (prev.searchText !== searchInputValue) {
          return { ...prev, searchText: searchInputValue };
        }
        return prev;
      });
    }, 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchInputValue]);

  // Auto-refresh when data changes (archive or categorize)
  useEffect(() => {
    let unlisten;
    api.onDataChanged?.(() => {
      loadArchives();
      loadCategories();
    }).then(fn => { if (fn) unlisten = fn; });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Cmd/Ctrl+F to focus search input (only active when this tab is mounted)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadArchives = async () => {
    setIsLoading(true);
    try {
      const data = await api.getArchived(filters);
      setArchives(data);
    } catch (error) {
      console.error('Failed to load archives:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  // Show toast message
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const showUndoToast = (message, undoAction) => {
    if (undoToast?.timeoutId) clearTimeout(undoToast.timeoutId);
    const timeoutId = setTimeout(() => setUndoToast(null), 5000);
    setUndoToast({
      message,
      undoAction: async () => {
        try {
          await undoAction();
        } catch (e) {
          console.error('Undo action failed:', e);
        }
        setUndoToast(null);
        await loadArchives();
        await loadCategories();
      },
      timeoutId,
    });
  };
  
  const handleNoteDoubleClick = (item) => {
    setEditingNote(item.id);
    setNoteText(item.note || '');
  };

  const handleSaveNote = async (id) => {
    try {
      await api.updateNote(id, noteText);
      setEditingNote(null);
      setNoteText('');
      await loadArchives();
    } catch (error) {
      console.error('Failed to save note:', error);
    }
  };

  const handleCancelNote = () => {
    setEditingNote(null);
    setNoteText('');
  };

  const handleNoteKeyDown = (e, id) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveNote(id);
    }
    if (e.key === 'Escape') {
      handleCancelNote();
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setSearchInputValue('');
    setFilters({
      category: 'all',
      startDate: '',
      endDate: '',
      searchText: '',
    });
  };

  const handleCategorize = async (item) => {
    setCategorizingId(item.id);
    try {
      const category = await api.categorize(item.text);
      if (category) {
        await api.updateCategory(item.id, category);
        await loadArchives();
        await loadCategories();
      }
    } catch (error) {
      console.error('Failed to categorize:', error);
    } finally {
      setCategorizingId(null);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteTodo(id);
      await loadArchives();
      await loadCategories();
      showUndoToast('已删除', () => api.recoverTodo(id));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.restoreTodo(id);
      await loadArchives();
      await loadCategories();
    } catch (error) {
      console.error('Failed to restore:', error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await api.exportCsv({
        ...filters,
        exportType,
      });
      if (result?.success) {
        showToast(`导出成功：${result.filePath}`, 'success');
      } else if (result?.message) {
        showToast(result.message, 'info');
      }
    } catch (error) {
      console.error('Failed to export:', error);
      showToast('导出失败', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // 数据库中存的是北京时间字符串 "YYYY-MM-DD HH:MM:SS"，解析时显式指定为 +08:00
    const date = new Date(dateStr.replace(' ', 'T') + '+08:00');
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-in-out">
          <div className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-500 text-white' :
            toast.type === 'error' ? 'bg-red-500 text-white' :
            'bg-sky-500 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800 text-white rounded-lg shadow-lg text-sm font-medium">
            <span>{undoToast.message}</span>
            <button
              onClick={undoToast.undoAction}
              className="font-medium text-sky-300 hover:text-sky-200 transition-colors"
            >
              撤销
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">搜索</label>
            <input
              type="text"
              ref={searchInputRef}
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              placeholder="搜索任务或备注..."
              className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
          </div>

          {/* Category Filter */}
          <div className="min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">类别</label>
            <CustomSelect
              value={filters.category}
              onChange={(val) => handleFilterChange('category', val)}
              options={[
                { value: 'all', label: '全部类别' },
                ...categories.map((cat) => ({ value: cat, label: cat })),
              ]}
            />
          </div>

          {/* Date Range */}
          <div className="min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">开始日期</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">结束日期</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
          </div>

          {/* Clear Filters */}
          <button
            onClick={handleClearFilters}
            className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            重置
          </button>

          {/* Select Mode Toggle */}
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              setSelectedIds(new Set());
            }}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              selectMode
                ? 'bg-sky-500 text-white'
                : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {selectMode ? '取消' : '选择'}
          </button>

          {/* Export */}
          <div className="flex items-center gap-2 ml-auto">
            <CustomSelect
              value={exportType}
              onChange={(val) => setExportType(val)}
              options={[
                { value: 'archived', label: '归档任务' },
                { value: 'active', label: '待办任务' },
                { value: 'all', label: '全部任务' },
              ]}
            />
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-3 py-1.5 text-sm text-white bg-sky-500 rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? '导出中...' : '导出 CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectMode && (
        <div className="bg-sky-50 border-b border-sky-100 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.size === archives.length && archives.length > 0}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(archives.map(a => a.id)));
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
                  try { await api.restoreTodo(id); } catch (e) {}
                }
                setSelectedIds(new Set());
                await loadArchives();
                await loadCategories();
              }}
              disabled={selectedIds.size === 0}
              className="px-2 py-1 text-xs text-green-600 bg-green-50 rounded hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              批量恢复
            </button>
            <button
              onClick={async () => {
                const ids = [...selectedIds];
                for (const id of ids) {
                  try { await api.deleteTodo(id); } catch (e) {}
                }
                setSelectedIds(new Set());
                await loadArchives();
                await loadCategories();
                showUndoToast(`已删除 ${ids.length} 项`, async () => {
                  for (const id of ids) await api.recoverTodo(id);
                  await loadArchives();
                  await loadCategories();
                });
              }}
              disabled={selectedIds.size === 0}
              className="px-2 py-1 text-xs text-red-500 bg-red-50 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              批量删除
            </button>
          </div>
        </div>
      )}

      {/* Archive List */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
          </div>
        ) : archives.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
              <path d="M8 2h8v4H8z" />
            </svg>
            <span className="text-sm mt-2">暂无归档记录</span>
          </div>
        ) : (
          <div className="overflow-auto h-full">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {selectMode && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === archives.length && archives.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(archives.map(a => a.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-sky-500 focus:ring-sky-200 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    任务内容
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    截止日期
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    类别
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    备注
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    归档时间
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {archives.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    {selectMode && (
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => {
                            const newSelected = new Set(selectedIds);
                            if (newSelected.has(item.id)) {
                              newSelected.delete(item.id);
                            } else {
                              newSelected.add(item.id);
                            }
                            setSelectedIds(newSelected);
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-sky-500 focus:ring-sky-200 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {item.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.due_date ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.due_date < new Date().toISOString().slice(0, 10)
                            ? 'bg-red-100 text-red-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {item.due_date}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700">
                        {item.category || '未分类'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {editingNote === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            onKeyDown={(e) => handleNoteKeyDown(e, item.id)}
                            onBlur={() => handleSaveNote(item.id)}
                            autoFocus
                            className="flex-1 px-2 py-1 text-sm bg-gray-50 rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                            placeholder="输入备注..."
                          />
                          <button
                            onClick={() => handleSaveNote(item.id)}
                            className="px-2 py-1 text-xs bg-sky-500 text-white rounded hover:bg-sky-600 transition-colors"
                          >
                            保存
                          </button>
                        </div>
                      ) : (
                        <span
                          onDoubleClick={() => handleNoteDoubleClick(item)}
                          className="text-sm text-gray-500 cursor-pointer hover:text-gray-700 transition-colors"
                          title="双击编辑备注"
                        >
                          {item.note || '双击添加备注...'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(item.archived_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCategorize(item)}
                          disabled={categorizingId === item.id}
                          className="px-2 py-1 text-xs text-sky-600 bg-sky-50 rounded hover:bg-sky-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="使用AI自动分类"
                        >
                          {categorizingId === item.id ? (
                            <span className="flex items-center gap-1">
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-sky-600" />
                              分类中
                            </span>
                          ) : (
                            'AI分类'
                          )}
                        </button>
                        <button
                          onClick={() => handleRestore(item.id)}
                          className="px-2 py-1 text-xs text-green-600 bg-green-50 rounded hover:bg-green-100 transition-colors"
                          title="恢复为待办"
                        >
                          恢复
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="px-2 py-1 text-xs text-red-500 bg-red-50 rounded hover:bg-red-100 transition-colors"
                          title="删除此记录"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 text-xs text-gray-400 text-center">
        共 {archives.length} 条归档记录
      </div>
    </div>
  );
}
