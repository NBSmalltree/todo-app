import React, { useState, useEffect, useCallback, useMemo } from 'react';

import api from '../api';
import zhCN from '../locales/zh-CN.json';
import enUS from '../locales/en-US.json';
import { I18nContext, SUPPORTED_LOCALES, DEFAULT_LOCALE, createTranslation } from './index';

const dictionaries = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

function resolveLocale(raw) {
  if (raw && SUPPORTED_LOCALES[raw]) return raw;

  const nav = navigator.language;
  if (nav && SUPPORTED_LOCALES[nav]) return nav;

  const base = nav?.split('-')[0]?.toLowerCase();
  if (base === 'zh') return 'zh-CN';
  if (base === 'en') return 'en-US';

  return DEFAULT_LOCALE;
}

export default function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => resolveLocale(null));

  useEffect(() => {
    let mounted = true;
    api.getSettings()
      .then((data) => {
        if (!mounted) return;
        const saved = data?.locale;
        if (saved && SUPPORTED_LOCALES[saved]) {
          setLocaleState(saved);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    const resolved = resolveLocale(next);
    setLocaleState(resolved);
    try {
      api.saveSettings({ locale: resolved });
    } catch (e) {
      // ignore
    }
  }, []);

  const t = useMemo(() => createTranslation(locale, dictionaries), [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      supportedLocales: SUPPORTED_LOCALES,
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
