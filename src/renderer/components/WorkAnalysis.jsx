import React, { useState, useEffect } from 'react';
import api from '../api';
import { useI18n } from '../i18n';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import ReactMarkdown from 'react-markdown';


const COLORS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#0284c7', '#0369a1', '#075985'];

const ANALYSIS_FAILED = '__ANALYSIS_FAILED__';

// Module-level cache survives component mount/unmount (e.g. tab switches)
const _cache = {};
let _version = 0;

export default function WorkAnalysis() {
  const { t } = useI18n();
  const [period, setPeriod] = useState('week');
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [llmTip, setLlmTip] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [pomodoroStats, setPomodoroStats] = useState(null);
  const [pomodoroLoading, setPomodoroLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(t);
    let unlisten2;
    api.onThemeChanged?.((newTheme) => setTheme(newTheme)).then(fn => { if (fn) unlisten2 = fn; });
    return () => { if (unlisten2) unlisten2(); };
  }, []);

  useEffect(() => {
    // Listen for data changes (archive/toggle) → mark cache stale
    let unlisten;
    api.onDataChanged?.(() => {
      _version += 1;
      setDataVersion(_version);
    }).then(fn => { if (fn) unlisten = fn; });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Load data on mount and when period/dataVersion changes
  useEffect(() => {
    loadAnalysis();
    loadPomodoroStats();
  }, [period, dataVersion]);

  const loadAnalysis = async () => {
    setIsLoading(true);
    try {
      const data = await api.getWorkAnalysis(period);
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
      const stats = await api.pomodoroGetStats(period);
      setPomodoroStats(stats);
    } catch (e) {
      console.error('Failed to load pomodoro stats:', e);
      setPomodoroStats({
        totalSessions: 0,
        totalFocusMinutes: 0,
        todaySessions: 0,
        dailyBreakdown: [],
        recentSessions: [],
      });
    }
    setPomodoroLoading(false);
  };

  const generateAnalysis = async (data) => {
    setLlmLoading(true);
    try {
      const tip = await api.analyzeWork(data);
      const displayTip = tip || t('workAnalysis.ai.noAnalysis');
      setLlmTip(displayTip);
      // Save to module-level cache (survives tab switches)
      _cache[period] = { tip: displayTip, version: _version };
    } catch (e) {
      setLlmTip(ANALYSIS_FAILED);
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
      case 'week': return t('workAnalysis.period.week');
      case 'month': return t('workAnalysis.period.month');
      case 'year': return t('workAnalysis.period.year');
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
        <span className="text-sm mt-4">{t('workAnalysis.empty.title', { period: getPeriodLabel() })}</span>
        <span className="text-xs mt-1 text-gray-300">{t('workAnalysis.empty.subtitle')}</span>
      </div>
    );
  }

  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#313244' : '#f0f0f0';
  const axisStroke = isDark ? '#6c7086' : '#666';
  const pomGridStroke = isDark ? '#4c1d32' : '#fce7f3';

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
            {p === 'week' ? t('workAnalysis.period.week') : p === 'month' ? t('workAnalysis.period.month') : t('workAnalysis.period.year')}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{analysis.completionStats?.active || 0}</div>
          <div className="text-sm text-gray-500 mt-1">{t('workAnalysis.summary.activeTasks')}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{analysis.totalItems}</div>
          <div className="text-sm text-gray-500 mt-1">{t('workAnalysis.summary.archivedTasks')}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{Object.keys(analysis.categoryDistribution).length}</div>
          <div className="text-sm text-gray-500 mt-1">{t('workAnalysis.summary.categories')}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-2xl font-bold text-sky-600">{completionRate}%</div>
          <div className="text-sm text-gray-500 mt-1">{t('workAnalysis.summary.completionRate')}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Category Distribution Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-4">{t('workAnalysis.charts.categoryDistribution')}</h3>
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
          <h3 className="text-sm font-medium text-gray-700 mb-4">{t('workAnalysis.charts.dailyDistribution')}</h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: axisStroke }} />
                <YAxis tick={{ fontSize: 12, fill: axisStroke }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Category Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">{t('workAnalysis.categoryDetails.title')}</h3>
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
                    <span className="text-sm text-gray-500">{t('workAnalysis.categoryDetails.count', { count: data.count })}</span>
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
            <h3 className="text-sm font-medium text-rose-700">{t('workAnalysis.pomodoro.title')}</h3>
          </div>
          {pomodoroLoading ? (
            <div className="flex items-center gap-2 text-rose-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-400" />
              <span className="text-xs">{t('workAnalysis.loading')}</span>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white rounded-lg border border-rose-100 p-2.5 text-center">
                  <div className="text-2xl font-bold text-rose-500 leading-none">{pomodoroStats.todaySessions}</div>
                  <div className="text-[10px] text-rose-400 mt-1.5">{t('workAnalysis.pomodoro.todayCompleted')}</div>
                </div>
                <div className="bg-white rounded-lg border border-rose-100 p-2.5 text-center">
                  <div className="text-2xl font-bold text-rose-500 leading-none">{pomodoroStats.totalSessions}</div>
                  <div className="text-[10px] text-rose-400 mt-1.5">{t('workAnalysis.pomodoro.periodCompleted', { period: getPeriodLabel() })}</div>
                </div>
                <div className="bg-white rounded-lg border border-rose-100 p-2.5 text-center">
                  <div className="text-2xl font-bold text-rose-500 leading-none">
                    {pomodoroStats.totalFocusMinutes}
                    <span className="text-xs font-normal text-rose-400 ml-0.5">{t('workAnalysis.pomodoro.minutes')}</span>
                  </div>
                  <div className="text-[10px] text-rose-400 mt-1.5">{t('workAnalysis.pomodoro.totalFocus')}</div>
                </div>
              </div>

              {/* Daily breakdown bar chart */}
              {pomodoroStats.dailyBreakdown && pomodoroStats.dailyBreakdown.length > 0 && (
                <div className="h-[120px] mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pomodoroStats.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke={pomGridStroke} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#f43f5e' }} stroke="#f43f5e" />
                      <YAxis tick={{ fontSize: 10, fill: '#f43f5e' }} stroke="#f43f5e" />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent sessions */}
              {pomodoroStats.recentSessions && pomodoroStats.recentSessions.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-medium text-rose-600 mb-2">{t('workAnalysis.pomodoro.recentRecords')}</h4>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {pomodoroStats.recentSessions.map((s) => {
                      const seconds = s.actualDuration || 0;
                      const durationText = seconds < 60
                        ? t('workAnalysis.pomodoro.durationSeconds', { seconds })
                        : t('workAnalysis.pomodoro.durationMinutes', { minutes: Math.round(seconds / 60) });
                      const cycleLabel = s.cycleType === 'focus' ? t('workAnalysis.pomodoro.focus')
                        : s.cycleType === 'short_break' ? t('workAnalysis.pomodoro.shortBreak')
                        : s.cycleType === 'long_break' ? t('workAnalysis.pomodoro.longBreak')
                        : s.cycleType;
                      return (
                        <div key={s.id} className="flex items-center gap-2 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-rose-400" />
                          <span className="text-rose-500 w-20 flex-shrink-0 whitespace-nowrap">{s.dateLabel}</span>
                          <span className="flex-1 truncate text-rose-700">
                            {s.taskText || cycleLabel}
                          </span>
                          <span className="text-gray-400 w-10 text-right flex-shrink-0">{durationText}</span>
                        </div>
                      );
                    })}
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
                <p className="font-medium">{t('workAnalysis.ai.title')}</p>
                {!llmLoading && llmTip && llmTip !== ANALYSIS_FAILED && (
                  <span className="text-[10px] text-sky-400 bg-white/60 px-1.5 py-0.5 rounded">{t('workAnalysis.ai.cached')}</span>
                )}
              </div>
                {llmLoading ? (
                <div className="flex items-center gap-2 text-sky-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500" />
                  <span>{t('workAnalysis.ai.analyzing')}</span>
                </div>
              ) : llmTip === ANALYSIS_FAILED ? (
                <div className="flex flex-col items-start gap-2">
                  <span className="text-sky-600">{t('workAnalysis.ai.analysisFailed')}</span>
                  <button
                    onClick={handleRegenerate}
                    className="px-3 py-1 text-xs text-sky-600 bg-sky-50 rounded hover:bg-sky-100 transition-colors"
                  >
                    {t('workAnalysis.ai.regenerate')}
                  </button>
                </div>
              ) : llmTip ? (
                <ReactMarkdown>{llmTip}</ReactMarkdown>
              ) : !analysis || analysis.totalItems === 0 ? (
                <span className="text-sky-400 text-xs">{t('workAnalysis.ai.noData')}</span>
              ) : null}
            </div>
          </div>
          {/* Regenerate button always visible when content exists */}
          {!llmLoading && llmTip && llmTip !== ANALYSIS_FAILED && (
            <button
              onClick={handleRegenerate}
              className="flex-shrink-0 px-2.5 py-1 text-[11px] text-sky-500 bg-white/70 rounded-lg hover:bg-white hover:text-sky-600 transition-colors border border-sky-200/50"
              title={t('workAnalysis.ai.regenerateTooltip')}
            >
              {t('workAnalysis.ai.regenerate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
