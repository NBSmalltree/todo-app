import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import ReactMarkdown from 'react-markdown';

const { electronAPI } = window;

const COLORS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#0284c7', '#0369a1', '#075985'];

// Module-level cache survives component mount/unmount (e.g. tab switches)
const _cache = {};
let _version = 0;

export default function WorkAnalysis() {
  const [period, setPeriod] = useState('week');
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [llmTip, setLlmTip] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [pomodoroStats, setPomodoroStats] = useState(null);
  const [pomodoroLoading, setPomodoroLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    // Listen for data changes (archive/toggle) → mark cache stale
    const cleanup = electronAPI?.onDataChanged?.(() => {
      _version += 1;
      setDataVersion(_version);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    loadAnalysis();
    loadPomodoroStats();
  }, [period]);

  const loadAnalysis = async () => {
    setIsLoading(true);
    try {
      const data = await electronAPI.getWorkAnalysis(period);
      setAnalysis(data);
      setIsLoading(false);

      // Handle LLM analysis — non-blocking, runs after UI is ready
      const cached = _cache[period];
      const isStale = !cached || cached.version !== _version;
      const hasTaskData = data && data.totalItems > 0;

      if (!isStale && cached) {
        setLlmTip(cached.tip);
      } else if (hasTaskData) {
        generateAnalysis(data); // fire-and-forget, don't block page render
      }
    } catch (error) {
      console.error('Failed to load analysis:', error);
      setIsLoading(false);
    }
  };

  const loadPomodoroStats = async () => {
    setPomodoroLoading(true);
    try {
      const stats = await electronAPI.pomodoroGetStats(period);
      setPomodoroStats(stats);
    } catch (e) { /* ignore */ }
    setPomodoroLoading(false);
  };

  const generateAnalysis = async (data) => {
    setLlmLoading(true);
    try {
      const tip = await electronAPI.analyzeWork(data);
      const displayTip = tip || '暂无分析';
      setLlmTip(displayTip);
      // Save to module-level cache (survives tab switches)
      _cache[period] = { tip: displayTip, version: _version };
    } catch (e) {
      setLlmTip('分析生成失败');
    } finally {
      setLlmLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (analysis && analysis.totalItems > 0) {
      generateAnalysis(analysis);
    }
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'week': return '本周';
      case 'month': return '本月';
      case 'year': return '本年';
      default: return '';
    }
  };

  const prepareCategoryData = () => {
    if (!analysis?.categoryDistribution) return [];
    return Object.entries(analysis.categoryDistribution).map(([name, data]) => ({
      name,
      value: data.count,
    }));
  };

  const prepareDailyData = () => {
    if (!analysis?.dailyDistribution) return [];
    return Object.entries(analysis.dailyDistribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({
        date: date.slice(5), // MM-DD
        count,
      }));
  };

  const calculateCompletionRate = () => {
    if (!analysis?.completionStats) return 0;
    const { total, archived } = analysis.completionStats;
    if (!total) return 0;
    return Math.round((archived / total) * 100);
  };

  // Wait for both loads to finish before deciding empty state
  const bothLoaded = analysis !== null && pomodoroStats !== null;
  const hasAnyData = (analysis && analysis.totalItems > 0) ||
    (pomodoroStats && (pomodoroStats.totalSessions > 0 || pomodoroStats.todaySessions > 0));

  if (isLoading || !bothLoaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm mt-4">暂无{getPeriodLabel()}的工作数据</span>
        <span className="text-xs mt-1 text-gray-300">归档任务或使用番茄钟后即可查看分析</span>
      </div>
    );
  }

  const categoryData = prepareCategoryData();
  const dailyData = prepareDailyData();
  const completionRate = calculateCompletionRate();

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-6">
        {['week', 'month', 'year'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              period === p
                ? 'bg-sky-500 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {p === 'week' ? '本周' : p === 'month' ? '本月' : '本年'}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{analysis.completionStats?.active || 0}</div>
          <div className="text-sm text-gray-500 mt-1">待办任务</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{analysis.totalItems}</div>
          <div className="text-sm text-gray-500 mt-1">归档任务</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{Object.keys(analysis.categoryDistribution).length}</div>
          <div className="text-sm text-gray-500 mt-1">工作类别</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{completionRate}%</div>
          <div className="text-sm text-gray-500 mt-1">完成率</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Category Distribution Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-4">工作类别分布</h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Distribution Bar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-4">每日任务分布</h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">各类别详情</h3>
        <div className="space-y-3">
          {Object.entries(analysis.categoryDistribution)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([category, data], index) => (
              <div key={category} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{category}</span>
                    <span className="text-sm text-gray-500">{data.count} 项</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${(data.count / analysis.totalItems) * 100}%`,
                        backgroundColor: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Pomodoro Stats */}
      {pomodoroStats && (
        <div className="mt-6 bg-rose-50 rounded-xl border border-rose-100 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🍅</span>
            <h3 className="text-sm font-medium text-rose-700">番茄统计</h3>
          </div>
          {pomodoroLoading ? (
            <div className="flex items-center gap-2 text-rose-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-400" />
              <span className="text-xs">加载中...</span>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-lg border border-rose-100 p-3">
                  <div className="text-xl font-bold text-rose-500">{pomodoroStats.todaySessions}</div>
                  <div className="text-[11px] text-rose-400 mt-0.5">今日完成</div>
                </div>
                <div className="bg-white rounded-lg border border-rose-100 p-3">
                  <div className="text-xl font-bold text-rose-500">{pomodoroStats.totalSessions}</div>
                  <div className="text-[11px] text-rose-400 mt-0.5">{getPeriodLabel()}专注</div>
                </div>
                <div className="bg-white rounded-lg border border-rose-100 p-3">
                  <div className="text-xl font-bold text-rose-500">{pomodoroStats.totalFocusMinutes}</div>
                  <div className="text-[11px] text-rose-400 mt-0.5">总专注（分）</div>
                </div>
              </div>

              {/* Daily breakdown bar chart */}
              {pomodoroStats.dailyBreakdown && pomodoroStats.dailyBreakdown.length > 0 && (
                <div className="h-[120px] mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pomodoroStats.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#fce7f3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#f43f5e" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#f43f5e" />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent sessions */}
              {pomodoroStats.recentSessions && pomodoroStats.recentSessions.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-medium text-rose-600 mb-2">最近记录</h4>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {pomodoroStats.recentSessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.completed ? 'bg-rose-400' : 'bg-gray-300'}`} />
                        <span className="text-rose-500 w-16 flex-shrink-0">{s.dateLabel}</span>
                        <span className={`flex-1 truncate ${s.completed ? 'text-rose-700' : 'text-gray-400'}`}>
                          {s.task_text || (s.cycle_type === 'focus' ? '专注' : s.cycle_type)}
                        </span>
                        <span className="text-gray-400 w-10 text-right">{Math.round((s.actual_duration || 0) / 60)}分</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* AI Work Analysis */}
      <div className="mt-6 bg-sky-50 rounded-xl border border-sky-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-sky-500 flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="text-sm text-sky-700 flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium">AI 工作分析</p>
                {!llmLoading && llmTip && llmTip !== '分析生成失败' && (
                  <span className="text-[10px] text-sky-400 bg-white/60 px-1.5 py-0.5 rounded">已缓存</span>
                )}
              </div>
              {llmLoading ? (
                <div className="flex items-center gap-2 text-sky-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500" />
                  <span>正在分析中...</span>
                </div>
              ) : llmTip === '分析生成失败' ? (
                <div className="flex flex-col items-start gap-2">
                  <span className="text-sky-600">分析生成失败</span>
                  <button
                    onClick={handleRegenerate}
                    className="px-3 py-1 text-xs text-sky-600 bg-sky-50 rounded hover:bg-sky-100 transition-colors"
                  >
                    重新生成
                  </button>
                </div>
              ) : llmTip ? (
                <ReactMarkdown>{llmTip}</ReactMarkdown>
              ) : !analysis || analysis.totalItems === 0 ? (
                <span className="text-sky-400 text-xs">暂无数据，归档任务后可生成分析</span>
              ) : null}
            </div>
          </div>
          {/* Regenerate button always visible when content exists */}
          {!llmLoading && llmTip && llmTip !== '分析生成失败' && (
            <button
              onClick={handleRegenerate}
              className="flex-shrink-0 px-2.5 py-1 text-[11px] text-sky-500 bg-white/70 rounded-lg hover:bg-white hover:text-sky-600 transition-colors border border-sky-200/50"
              title="重新生成分析"
            >
              重新生成
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
