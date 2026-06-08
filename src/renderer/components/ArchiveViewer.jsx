import React, { useState, useEffect, useCallback } from 'react';

const { electronAPI } = window;

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

  useEffect(() => {
    loadArchives();
    loadCategories();
  }, [filters]);

  // Auto-refresh when data changes (archive or categorize)
  useEffect(() => {
    electronAPI?.onDataChanged?.(() => {
      loadArchives();
      loadCategories();
    });
  }, []);

  const loadArchives = async () => {
    setIsLoading(true);
    try {
      const data = await electronAPI.getArchived(filters);
      setArchives(data);
    } catch (error) {
      console.error('Failed to load archives:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await electronAPI.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleNoteDoubleClick = (item) => {
    setEditingNote(item.id);
    setNoteText(item.note || '');
  };

  const handleSaveNote = async (id) => {
    try {
      await electronAPI.updateNote(id, noteText);
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
    setFilters({
      category: 'all',
      startDate: '',
      endDate: '',
      searchText: '',
    });
  };

  const handleCategorize = async (item) => {
    try {
      const category = await electronAPI.categorize(item.text);
      if (category) {
        await electronAPI.updateCategory(item.id, category);
        await loadArchives();
        await loadCategories();
      }
    } catch (error) {
      console.error('Failed to categorize:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await electronAPI.deleteTodo(id);
      await loadArchives();
      await loadCategories();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleRestore = async (id) => {
    try {
      await electronAPI.restoreTodo(id);
      await loadArchives();
      await loadCategories();
    } catch (error) {
      console.error('Failed to restore:', error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await electronAPI.exportCsv({
        ...filters,
        exportType,
      });
      if (result?.success) {
        alert(`导出成功：${result.filePath}`);
      } else if (result?.message) {
        alert(result.message);
      }
    } catch (error) {
      console.error('Failed to export:', error);
      alert('导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
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
      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">搜索</label>
            <input
              type="text"
              value={filters.searchText}
              onChange={(e) => handleFilterChange('searchText', e.target.value)}
              placeholder="搜索任务或备注..."
              className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
          </div>

          {/* Category Filter */}
          <div className="min-w-[140px]">
            <label className="block text-xs text-gray-500 mb-1">类别</label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            >
              <option value="all">全部类别</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
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

          {/* Export */}
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            >
              <option value="archived">归档任务</option>
              <option value="active">待办任务</option>
              <option value="all">全部任务</option>
            </select>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    任务内容
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
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {item.text}
                      </span>
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
                          className="px-2 py-1 text-xs text-sky-600 bg-sky-50 rounded hover:bg-sky-100 transition-colors"
                          title="使用AI自动分类"
                        >
                          AI分类
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
