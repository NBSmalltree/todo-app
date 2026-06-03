import React, { useState, useEffect } from 'react';

const { electronAPI } = window;

export default function Settings() {
  const [settings, setSettings] = useState({
    api_key: '',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await electronAPI.getSettings();
      if (data.api_key) setSettings((prev) => ({ ...prev, api_key: data.api_key }));
      if (data.base_url) setSettings((prev) => ({ ...prev, base_url: data.base_url }));
      if (data.model) setSettings((prev) => ({ ...prev, model: data.model }));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      await electronAPI.saveSettings(settings);
      setSaveMessage('设置已保存');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800">AI 分类设置</h2>
          <p className="text-sm text-gray-500 mt-1">
            配置大模型 API，用于归档任务时自动判断工作类别
          </p>
        </div>

        {/* Settings Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.api_key}
                onChange={(e) => handleChange('api_key', e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all pr-10"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">输入你的 OpenAI 或兼容 API 的密钥</p>
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Base URL
            </label>
            <input
              type="text"
              value={settings.base_url}
              onChange={(e) => handleChange('base_url', e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">API 的基础地址，支持 OpenAI 兼容的第三方服务</p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              模型名称
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => handleChange('model', e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">使用的模型名称，如 gpt-4o-mini、gpt-4、claude-3-haiku 等</p>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 text-sm font-medium bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? '保存中...' : '保存设置'}
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('失败') ? 'text-red-500' : 'text-green-500'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>

        {/* Usage Tips */}
        <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">使用说明</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>1. 填写 API Key 和相关配置后，点击"保存设置"</p>
            <p>2. 在历史归档页面，对未分类的任务点击"AI分类"按钮</p>
            <p>3. 系统会自动调用大模型判断任务类别并更新</p>
            <p>4. 支持所有 OpenAI 兼容的 API 服务（如 DeepSeek、智谱等）</p>
          </div>
        </div>

        {/* Supported Models */}
        <div className="mt-4 bg-sky-50 rounded-xl border border-sky-100 p-4">
          <h3 className="text-sm font-medium text-sky-700 mb-2">支持的模型服务</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-sky-600">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full" />
              OpenAI (GPT-4o, GPT-4)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full" />
              DeepSeek
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full" />
              智谱 AI (GLM)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full" />
              通义千问
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full" />
              Claude (Anthropic)
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full" />
              其他兼容 API
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
