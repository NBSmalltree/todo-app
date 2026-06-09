import React, { useState, useEffect } from 'react';

const { electronAPI } = window;

const THEMES = [
  { id: 'light', label: '浅色模式', icon: 'sun' },
  { id: 'dark', label: '深色模式', icon: 'moon' },
  { id: 'eye-care', label: '护眼模式', icon: 'eye' },
];

function ThemeIcon({ type }) {
  switch (type) {
    case 'sun':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    case 'moon':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      );
    case 'eye':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Settings() {
  const [settings, setSettings] = useState({
    api_key: '',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  });
  const [theme, setTheme] = useState('light');
  const [opacity, setOpacity] = useState(0.92);
  const [edgeSettings, setEdgeSettings] = useState({
    edge_snap_enabled: true,
    edge_hide_delay: 3000,
    edge_snap_threshold: 20,
  });
  const [fontFamily, setFontFamily] = useState('system');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  // Apply theme whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { electronAPI?.applyTheme(theme); } catch (e) { /* ignore */ }
  }, [theme]);

  // Apply opacity whenever it changes
  useEffect(() => {
    try { electronAPI?.setOpacity(opacity); } catch (e) { /* ignore */ }
  }, [opacity]);

  // Apply font family whenever it changes
  useEffect(() => {
    applyFontFamily(fontFamily);
    try { electronAPI?.applyFontFamily(fontFamily); } catch (e) { /* ignore */ }
  }, [fontFamily]);

  // Apply font family on mount
  useEffect(() => {
    applyFontFamily(fontFamily);
  }, []);

  const loadSettings = async () => {
    try {
      const data = await electronAPI.getSettings();
      if (data.api_key) setSettings((prev) => ({ ...prev, api_key: data.api_key }));
      if (data.base_url) setSettings((prev) => ({ ...prev, base_url: data.base_url }));
      if (data.model) setSettings((prev) => ({ ...prev, model: data.model }));
      if (data.theme && ['light', 'dark', 'eye-care'].includes(data.theme)) setTheme(data.theme);
      if (data.todo_opacity != null) {
        const v = Number(data.todo_opacity);
        if (!isNaN(v) && v >= 0.2 && v <= 1) setOpacity(v);
      }

      // Load edge settings
      try {
        const edgeData = await electronAPI.getEdgeSettings();
        setEdgeSettings(edgeData);
      } catch (e) { /* ignore */ }

      // Load font family
      if (data.font_family) setFontFamily(data.font_family);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      await electronAPI.saveSettings({
        ...settings,
        theme,
        todo_opacity: opacity,
        font_family: fontFamily,
      });

      // Save edge settings
      await electronAPI.saveEdgeSettings(edgeSettings);

      // Apply font family
      applyFontFamily(fontFamily);

      setSaveMessage('设置已保存');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdgeSettingChange = (key, value) => {
    setEdgeSettings((prev) => ({ ...prev, [key]: value }));
  };

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

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    electronAPI?.closeWindow();
  };

  const handleMinimize = () => {
    electronAPI?.minimizeWindow();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Title Bar - Draggable, matching TodoWindow style */}
      <div className="drag-region flex items-center justify-between px-4 py-2 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-sky-500">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-gray-600">设置</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
            title="最小化"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Appearance Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">外观设置</h2>
            <p className="text-sm text-gray-500 mb-4">调整主题风格和待办清单窗口透明度</p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">主题模式</label>
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        theme === t.id
                          ? 'border-sky-500 bg-sky-50 text-sky-600'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <ThemeIcon type={t.icon} />
                      <span className="text-xs font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  待办清单透明度
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.01"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <span className="text-sm text-gray-600 w-12 text-right">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">仅影响待办清单悬浮窗口的透明度</p>
              </div>

              {/* Font Family Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  字体样式
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'system', label: '系统默认', desc: '自动适配当前系统字体' },
                    { id: 'pingfang', label: '苹方', desc: 'macOS 优雅中文字体' },
                    { id: 'microsoft', label: '微软雅黑', desc: 'Windows 经典中文字体' },
                    { id: 'sans', label: '无衬线', desc: '简洁现代的字体风格' },
                    { id: 'serif', label: '衬线', desc: '传统正式的字体风格' },
                    { id: 'mono', label: '等宽', desc: '适合代码和数据展示' },
                  ].map((font) => (
                    <button
                      key={font.id}
                      onClick={() => setFontFamily(font.id)}
                      className={`flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-left ${
                        fontFamily === font.id
                          ? 'border-sky-500 bg-sky-50 text-sky-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-sm font-medium">{font.label}</span>
                      <span className="text-xs opacity-75">{font.desc}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">选择适合您的字体样式，保存后立即生效</p>
              </div>
            </div>
          </div>

          {/* AI Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">AI 分类设置</h2>
            <p className="text-sm text-gray-500 mb-4">
              配置大模型 API，用于归档任务时自动判断工作类别
            </p>

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
            </div>
          </div>

          {/* Edge Snap Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">窗口吸附设置</h2>
            <p className="text-sm text-gray-500 mb-4">配置窗口靠近屏幕边缘时的自动吸附行为</p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">启用边缘吸附</label>
                  <p className="text-xs text-gray-400 mt-1">窗口靠近屏幕边缘时自动吸附并可自动隐藏</p>
                </div>
                <button
                  onClick={() => handleEdgeSettingChange('edge_snap_enabled', !edgeSettings.edge_snap_enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    edgeSettings.edge_snap_enabled ? 'bg-sky-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      edgeSettings.edge_snap_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Hide Delay Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  自动隐藏延迟: {edgeSettings.edge_hide_delay / 1000}秒
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1000"
                    max="10000"
                    step="500"
                    value={edgeSettings.edge_hide_delay}
                    onChange={(e) => handleEdgeSettingChange('edge_hide_delay', Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <span className="text-sm text-gray-600 w-16 text-right">
                    {edgeSettings.edge_hide_delay / 1000}秒
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">窗口吸附后多久自动隐藏到屏幕边缘</p>
              </div>

              {/* Snap Threshold Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  吸附灵敏度: {edgeSettings.edge_snap_threshold}px
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={edgeSettings.edge_snap_threshold}
                    onChange={(e) => handleEdgeSettingChange('edge_snap_threshold', Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <span className="text-sm text-gray-600 w-12 text-right">
                    {edgeSettings.edge_snap_threshold}px
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">距离屏幕边缘多近时触发吸附</p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3">
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

          {/* Usage Tips */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">使用说明</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>1. 填写 API Key 和相关配置后，点击"保存设置"</p>
              <p>2. 在历史归档页面，对未分类的任务点击"AI分类"按钮</p>
              <p>3. 系统会自动调用大模型判断任务类别并更新</p>
              <p>4. 支持所有 OpenAI 兼容的 API 服务（如 DeepSeek、智谱等）</p>
            </div>
          </div>

          {/* Supported Models */}
          <div className="bg-sky-50 rounded-xl border border-sky-100 p-4">
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
    </div>
  );
}
