import React, { useState, useEffect } from 'react';

import api from '../api';
import { useI18n } from '../i18n';

const THEMES = [
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
  { id: 'eye-care', icon: 'eye' },
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
    api_format: 'openai',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    categorize_max_tokens: 2048,
    analyze_max_tokens: 10000,
  });
  const [theme, setTheme] = useState('light');
  const [opacity, setOpacity] = useState(0.92);
  const [remindEnabled, setRemindEnabled] = useState(true);
  const [remindMinutes, setRemindMinutes] = useState(15);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [notifTesting, setNotifTesting] = useState(false);
  const [notifResult, setNotifResult] = useState(null);
  const [shortcutToggle, setShortcutToggle] = useState('');
  const [shortcutQuickAdd, setShortcutQuickAdd] = useState('');
  const [recording, setRecording] = useState(null); // 'toggle' | 'quickadd' | null

  const { locale, setLocale, supportedLocales, t } = useI18n();

  useEffect(() => {
    loadSettings();
  }, []);

  // Press Escape to close settings window
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        api.closeWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply theme whenever it changes, and persist it immediately
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      api.applyTheme(theme);
      // Persist theme immediately so other windows read the correct value from DB
      api.saveSettings({ theme });
    } catch (e) { /* ignore */ }
  }, [theme]);

  // Apply opacity whenever it changes
  useEffect(() => {
    try { api.setOpacity(opacity); } catch (e) { /* ignore */ }
  }, [opacity]);



  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      if (data.api_key) setSettings((prev) => ({ ...prev, api_key: data.api_key }));
      if (data.api_format) setSettings((prev) => ({ ...prev, api_format: data.api_format }));
      if (data.base_url) setSettings((prev) => ({ ...prev, base_url: data.base_url }));
      if (data.model) setSettings((prev) => ({ ...prev, model: data.model }));
      if (data.categorize_max_tokens) setSettings((prev) => ({ ...prev, categorize_max_tokens: data.categorize_max_tokens }));
      if (data.analyze_max_tokens) setSettings((prev) => ({ ...prev, analyze_max_tokens: data.analyze_max_tokens }));
      if (data.theme && ['light', 'dark', 'eye-care'].includes(data.theme)) setTheme(data.theme);
      if (data.todo_opacity != null) {
        const v = Number(data.todo_opacity);
        if (!isNaN(v) && v >= 0.2 && v <= 1) setOpacity(v);
      }

      // Load reminder settings
      if (data.remind_minutes != null) {
        const val = Number(data.remind_minutes);
        setRemindMinutes(val >= 0 ? val : 15);
        setRemindEnabled(val >= 0);
      }

      // Load shortcuts
      try {
        const shortcuts = await api.getShortcuts();
        setShortcutToggle(shortcuts.toggle);
        setShortcutQuickAdd(shortcuts.quickadd);
      } catch (e) { /* ignore */ }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleRemindChange = async (minutes) => {
    try {
      await api.saveSettings({ remind_minutes: minutes });
    } catch (e) { /* ignore */ }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    setSaveStatus(null);
    try {
      await api.saveSettings({
        ...settings,
        theme,
        todo_opacity: opacity,
        font_family: fontFamily,
        remind_minutes: remindEnabled ? remindMinutes : -1,
      });

      setSaveStatus('success');
      setSaveMessage(t('settings.saveSuccess'));
      setTimeout(() => {
        setSaveMessage('');
        setSaveStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
      setSaveMessage(t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormatChange = (format) => {
    const defaults = format === 'anthropic'
      ? { api_format: format, base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' }
      : { api_format: format, base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
    setSettings((prev) => ({ ...prev, ...defaults }));
  };

  // 预设 AI 服务商
  const PROVIDERS = [
    {
      id: 'openai',
      name: 'OpenAI',
      desc: 'GPT-4o / GPT-4o-mini',
      icon: '🤖',
      config: { api_format: 'openai', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      desc: 'DeepSeek-V3 / DeepSeek-R1',
      icon: '🧊',
      config: { api_format: 'openai', base_url: 'https://api.deepseek.com', model: 'deepseek-chat' },
    },
    {
      id: 'zhipu',
      name: '智谱 GLM',
      desc: 'GLM-4-Plus / GLM-4-Flash',
      icon: '🔮',
      config: { api_format: 'openai', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      desc: 'Claude Sonnet / Claude Haiku',
      icon: '🧠',
      config: { api_format: 'anthropic', base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
    },
  ];

  const handleApplyPreset = (providerId) => {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    if (!provider) return;
    setSettings((prev) => ({ ...prev, ...provider.config }));
  };

  // 判断当前设置是否匹配某个预设（用于高亮显示）
  const isActivePreset = (config) => {
    return settings.api_format === config.api_format
      && settings.base_url === config.base_url
      && settings.model === config.model;
  };

  const handleTestNotification = async () => {
    setNotifTesting(true);
    setNotifResult(null);
    try {
      const result = await api.testNotification();
      setNotifResult(result);
    } catch (error) {
      setNotifResult({ success: false, error: error.message });
    } finally {
      setNotifTesting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testLLM({
        api_format: settings.api_format,
        api_key: settings.api_key,
        base_url: settings.base_url,
        model: settings.model,
        categorize_max_tokens: settings.categorize_max_tokens,
        analyze_max_tokens: settings.analyze_max_tokens,
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleClose = () => {
    api.closeWindow();
  };

  const handleMinimize = () => {
    api.minimizeWindow();
  };

  return (
    <div className="h-screen">
      <div className="h-full flex flex-col bg-gray-50 rounded-xl shadow-xl overflow-hidden">
      {/* Title Bar - Draggable, matching TodoWindow style */}
      <div
        className="drag-region flex items-center justify-between px-4 py-2 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-gray-100"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget || e.target.closest('[data-drag-area]')) {
            api.startDragging?.();
          }
        }}
      >
        <div data-drag-area className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-sky-500">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium text-gray-600">{t('settings.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
            title={t('settings.minimize')}
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
            <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('settings.appearance.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('settings.appearance.description')}</p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              {/* Theme Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">{t('settings.theme.label')}</label>
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.map((themeItem) => (
                    <button
                      key={themeItem.id}
                      onClick={() => {
                        // Apply theme immediately (local first, then IPC sync)
                        document.documentElement.setAttribute('data-theme', themeItem.id);
                        setTheme(themeItem.id);
                      }}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        theme === themeItem.id
                          ? 'border-sky-500 bg-sky-50 text-sky-600'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <ThemeIcon type={themeItem.icon} />
                      <span className="text-xs font-medium">{t(`settings.theme.${themeItem.id}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.opacity.label')}
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
                <p className="text-xs text-gray-400 mt-1">{t('settings.opacity.hint')}</p>
              </div>

              {/* Language Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {t('settings.language.label')}
                </label>
                <div className="flex gap-2">
                  {Object.entries(supportedLocales).map(([code, label]) => {
                    const active = locale === code;
                    return (
                      <button
                        key={code}
                        onClick={() => setLocale(code)}
                        className={`
                          flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border transition-all
                          ${active
                            ? 'bg-sky-50 border-sky-300 text-sky-700 ring-1 ring-sky-200'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-white'
                          }
                        `}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">{t('settings.language.hint')}</p>
              </div>
            </div>
          </div>

          {/* Reminder Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('settings.reminder.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('settings.reminder.description')}
            </p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              {/* Enable/Disable Reminder */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">{t('settings.reminder.enable')}</label>
                  <p className="text-xs text-gray-400 mt-1">{t('settings.reminder.enableHint')}</p>
                </div>
                <button
                  onClick={() => {
                    const val = remindEnabled ? -1 : 15;
                    setRemindEnabled(val >= 0);
                    handleRemindChange(val >= 0 ? 15 : -1);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    remindEnabled ? 'bg-sky-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      remindEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Remind Lead Time */}
              {remindEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('settings.reminder.leadTime')}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="1440"
                      step="5"
                      value={remindMinutes}
                      onChange={(e) => {
                        setRemindMinutes(Number(e.target.value));
                        handleRemindChange(Number(e.target.value));
                      }}
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={remindMinutes}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '') return;
                          const num = Math.min(1440, Math.max(0, Number(val)));
                          setRemindMinutes(num);
                          handleRemindChange(num);
                        }}
                        onBlur={(e) => {
                          let val = e.target.value.replace(/[^0-9]/g, '');
                          if (val === '' || Number(val) < 0) val = '0';
                          if (Number(val) > 1440) val = '1440';
                          const num = Number(val);
                          setRemindMinutes(num);
                          handleRemindChange(num);
                        }}
                        className="w-16 px-2 py-1 text-xs text-center bg-white rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-200"
                      />
                      <span className="text-xs text-gray-500 w-8">
                        {remindMinutes >= 60
                          ? t('settings.reminder.hourShort', { value: Math.floor(remindMinutes / 60) })
                          : t('settings.reminder.minuteShort')}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {t('settings.reminder.leadTimeHint')}
                  </p>
                </div>
              )}
            </div>

            {/* Test notification button */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={notifTesting}
                className="px-4 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {notifTesting ? t('settings.notification.sending') : t('settings.notification.test')}
              </button>
              {notifResult && (
                <span className={`ml-2 text-xs ${notifResult.success ? 'text-green-600' : 'text-red-500'}`}>
                  {notifResult.success ? t('settings.notification.success') : `${t('settings.notification.failed')}${notifResult.error}`}
                </span>
              )}
            </div>
          </div>

          {/* Shortcut Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('settings.shortcuts.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('settings.shortcuts.description')}</p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              <ShortcutRecorder
                label={t('settings.shortcuts.toggle')}
                defaultValue={shortcutToggle}
                onChange={(val) => {
                  setShortcutToggle(val);
                  api.updateShortcuts(val, shortcutQuickAdd).catch(() => {});
                }}
              />
              <ShortcutRecorder
                label={t('settings.shortcuts.quickAdd')}
                defaultValue={shortcutQuickAdd}
                onChange={(val) => {
                  setShortcutQuickAdd(val);
                  api.updateShortcuts(shortcutToggle, val).catch(() => {});
                }}
              />
              <p className="text-xs text-gray-400">{t('settings.shortcuts.hint')}</p>
            </div>
          </div>

          {/* Pomodoro Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('settings.pomodoro.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('settings.pomodoro.description')}</p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('settings.pomodoro.focus')}</label>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      value={settings.pomodoro_focus ?? 25}
                      onChange={(e) => handleChange('pomodoro_focus', Math.max(1, Math.min(120, parseInt(e.target.value) || 25)))}
                      min="1" max="120"
                      className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                    />
                    <span className="text-xs text-gray-400 w-5 shrink-0 text-center">{t('settings.pomodoro.minute')}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t('settings.pomodoro.focusHint')}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('settings.pomodoro.shortBreak')}</label>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      value={settings.pomodoro_short_break ?? 5}
                      onChange={(e) => handleChange('pomodoro_short_break', Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
                      min="1" max="30"
                      className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                    />
                    <span className="text-xs text-gray-400 w-5 shrink-0 text-center">{t('settings.pomodoro.minute')}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t('settings.pomodoro.shortBreakHint')}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('settings.pomodoro.longBreak')}</label>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      value={settings.pomodoro_long_break ?? 15}
                      onChange={(e) => handleChange('pomodoro_long_break', Math.max(1, Math.min(60, parseInt(e.target.value) || 15)))}
                      min="1" max="60"
                      className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                    />
                    <span className="text-xs text-gray-400 w-5 shrink-0 text-center">{t('settings.pomodoro.minute')}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t('settings.pomodoro.longBreakHint')}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('settings.pomodoro.cyclesBeforeLong')}</label>
                  <div className="flex items-center gap-0.5">
                    <input
                      type="number"
                      value={settings.pomodoro_cycles_before_long ?? 4}
                      onChange={(e) => handleChange('pomodoro_cycles_before_long', Math.max(1, Math.min(10, parseInt(e.target.value) || 4)))}
                      min="1" max="10"
                      className="w-full px-3 py-1.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                    />
                    <span className="text-xs text-gray-400 w-5 shrink-0 text-center">{t('settings.pomodoro.cycle')}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t('settings.pomodoro.cyclesBeforeLongHint')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Settings */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('settings.ai.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('settings.ai.description')}
            </p>

            {/* 快速选择服务商 */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t('settings.ai.quickSelect')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p.id)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      isActivePreset(p.config)
                        ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-200'
                        : 'border-gray-200 bg-white hover:border-sky-200 hover:bg-sky-50/50'
                    }`}
                  >
                    <span className="text-lg shrink-0 mt-0.5">{p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800">{p.name}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">{p.desc}</div>
                      <div className="text-[10px] text-gray-300 mt-0.5 truncate font-mono">
                        {p.config.base_url.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                    {isActivePreset(p.config) && (
                      <svg className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{t('settings.ai.providerHint')}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              {/* API Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.ai.apiFormat')}
                </label>
                <select
                  value={settings.api_format}
                  onChange={(e) => handleFormatChange(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                >
                  <option value="openai">{t('settings.ai.apiFormatOpenAI')}</option>
                  <option value="anthropic">{t('settings.ai.apiFormatAnthropic')}</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">{t('settings.ai.apiFormatHint')}</p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.ai.apiKey')}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.api_key}
                    onChange={(e) => handleChange('api_key', e.target.value)}
                    placeholder={t('settings.ai.apiKeyPlaceholder')}
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
                <p className="text-xs text-gray-400 mt-1">{t('settings.ai.apiKeyHint')}</p>
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.ai.baseUrl')}
                </label>
                <input
                  type="text"
                  value={settings.base_url}
                  onChange={(e) => handleChange('base_url', e.target.value)}
                  placeholder={t('settings.ai.baseUrlPlaceholder')}
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">{t('settings.ai.baseUrlHint')}</p>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.ai.model')}
                </label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  placeholder={t('settings.ai.modelPlaceholder')}
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">{t('settings.ai.modelHint')}</p>
              </div>

              {/* Categorize Max Tokens */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.ai.categorizeTokens')}
                </label>
                <input
                  type="number"
                  value={settings.categorize_max_tokens}
                  onChange={(e) => handleChange('categorize_max_tokens', parseInt(e.target.value) || 2048)}
                  placeholder={t('settings.ai.categorizeTokensPlaceholder')}
                  min="256"
                  max="4096"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">{t('settings.ai.categorizeTokensHint')}</p>
              </div>

              {/* Analyze Max Tokens */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.ai.analyzeTokens')}
                </label>
                <input
                  type="number"
                  value={settings.analyze_max_tokens}
                  onChange={(e) => handleChange('analyze_max_tokens', parseInt(e.target.value) || 10000)}
                  placeholder={t('settings.ai.analyzeTokensPlaceholder')}
                  min="1024"
                  max="16384"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">{t('settings.ai.analyzeTokensHint')}</p>
              </div>

              {/* Test Connection */}
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={handleTest}
                  disabled={testing || !settings.api_key}
                  className="px-4 py-2 text-sm font-medium bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testing ? t('settings.ai.testing') : t('settings.ai.testConnection')}
                </button>
                {testResult && (
                  <span className={`ml-3 text-sm ${testResult.success ? 'text-green-600' : 'text-red-500'}`}>
                    {testResult.success ? testResult.message : `${t('settings.ai.connectionFailed')}${testResult.error}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Data Management */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">{t('settings.data.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('settings.data.description')}</p>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">{t('settings.data.backup')}</label>
                  <p className="text-xs text-gray-400 mt-1">{t('settings.data.backupDesc')}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const result = await api.backupDatabase();
                      if (result.success) {
                        alert(`${t('settings.data.backupSuccess')}${result.path}`);
                      } else {
                        alert(`${t('settings.data.backupFailed')}${result.error}`);
                      }
                    } catch (error) {
                      alert(`${t('settings.data.backupFailed')}${error.message}`);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
                >
                  {t('settings.data.backup')}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">{t('settings.data.restore')}</label>
                  <p className="text-xs text-gray-400 mt-1">{t('settings.data.restoreDesc')}</p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(t('settings.data.restoreConfirm'))) {
                      return;
                    }
                    try {
                      const result = await api.restoreDatabase();
                      if (result.success) {
                        alert(t('settings.data.restoreSuccess'));
                        // Reload the window to apply changes
                        window.location.reload();
                      } else {
                        alert(`${t('settings.data.restoreFailed')}${result.error}`);
                      }
                    } catch (error) {
                      alert(`${t('settings.data.restoreFailed')}${error.message}`);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  {t('settings.data.restore')}
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? t('settings.saving') : t('settings.saveButton')}
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveStatus === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                {saveMessage}
              </span>
            )}
          </div>

          {/* Usage Tips */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">{t('settings.usage.title')}</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>{t('settings.usage.tip1')}</p>
              <p>{t('settings.usage.tip2')}</p>
              <p>{t('settings.usage.tip3')}</p>
              <p>{t('settings.usage.tip4')}</p>
            </div>
          </div>

          {/* Supported Models */}
          <div className="bg-sky-50 rounded-xl border border-sky-100 p-4">
            <h3 className="text-sm font-medium text-sky-700 mb-2">{t('settings.supportedModels.title')}</h3>
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
                <span className="w-2 h-2 bg-orange-400 rounded-full" />
                Claude (Sonnet, Haiku)
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
    </div>
  );
}

// ===== ShortcutRecorder Component =====
function ShortcutRecorder({ label, defaultValue, onChange }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [current, setCurrent] = useState(defaultValue || '');
  const [error, setError] = useState('');

  useEffect(() => {
    setCurrent(defaultValue || '');
  }, [defaultValue]);

  useEffect(() => {
    if (!recording) return;
    setError('');

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const parts = [];
      if (e.metaKey) parts.push('Cmd');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      // Get the main key
      let key = e.key;
      if (key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift') return;

      if (key === ' ') key = 'Space';
      else if (key === 'Escape') { setRecording(false); return; }
      else if (key.length === 1) key = key.toUpperCase();
      else {
        // Named keys: Enter, Tab, Backspace, etc.
        const validKeys = ['Enter', 'Tab', 'Backspace', 'Delete', 'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
                          'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'];
        if (!validKeys.includes(key)) return;
      }

      if (parts.length === 0) {
        setError(t('settings.shortcuts.modifierRequired'));
        return;
      }

      const combo = [...parts, key].join('+');
      setCurrent(combo);
      onChange(combo);
      setRecording(false);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, onChange, t]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setRecording(true)}
        className={`w-full px-4 py-2.5 text-sm rounded-lg border text-left transition-all font-mono ${
          recording
            ? 'border-sky-400 bg-sky-50 text-sky-600 ring-2 ring-sky-200'
            : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
        }`}
      >
        {recording ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
            {t('settings.shortcuts.recording')}
          </span>
        ) : (
          current || t('settings.shortcuts.notSet')
        )}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <p className="text-xs text-gray-400 mt-1">{t('settings.shortcuts.recorderHint')}</p>
    </div>
  );
}
