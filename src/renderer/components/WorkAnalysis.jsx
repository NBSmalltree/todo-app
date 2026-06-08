import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import ReactMarkdown from 'react-markdown';

const { electronAPI } = window;

const COLORS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#0284c7', '#0369a1', '#075985'];

export default function WorkAnalysis() {
  const [period, setPeriod] = useState('week');
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [llmTip, setLlmTip] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);

  useEffect(() => {
    loadAnalysis();
  }, [period]);

  const loadAnalysis = async () => {
    setIsLoading(true);
    setLlmTip('');
    setLlmLoading(false);
    try {
      const data = await electronAPI.getWorkAnalysis(period);
      setAnalysis(data);
      setIsLoading(false);
      // Trigger LLM analysis independently
      if (data && data.totalItems > 0) {
        setLlmLoading(true);
        try {
          const tip = await electronAPI.analyzeWork(data);
          setLlmTip(tip || '暂无分析');
        } catch (e) {
          setLlmTip('分析生成失败');
        } finally {
          setLlmLoading(false);
        }
      }
    } catch (error) {
      console.error('Failed to load analysis:', error);
      setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  if (!analysis || analysis.totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm mt-4">暂无{getPeriodLabel()}的工作数据</span>
        <span className="text-xs mt-1 text-gray-300">归档任务后即可查看工作分析</span>
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

      {/* AI Work Analysis */}
      <div className="mt-6 bg-sky-50 rounded-xl border border-sky-100 p-4">
        <div className="flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-sky-500 flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className="text-sm text-sky-700 flex-1">
            <p className="font-medium mb-1">AI 工作分析</p>
            {llmLoading ? (
              <div className="flex items-center gap-2 text-sky-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500" />
                <span>正在分析中...</span>
              </div>
            ) : (
              <div className="text-sky-600 leading-relaxed prose prose-sm prose-sky max-w-none">
                <ReactMarkdown>{llmTip}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
