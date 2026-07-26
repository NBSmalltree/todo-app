import { useContext, createContext } from 'react';

export const SUPPORTED_LOCALES = { 'zh-CN': '中文', 'en-US': 'English' };
export const DEFAULT_LOCALE = 'zh-CN';

export const I18nContext = createContext(null);

export function createTranslation(locale, dictionaries = {}) {
  const dictionary = dictionaries[locale] || {};

  return function t(key, vars = {}) {
    let value = dictionary[key];

    if (value === undefined && dictionary && typeof dictionary === 'object') {
      const parts = key.split('.');
      value = dictionary;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }
    }

    if (typeof value !== 'string') return key;

    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      if (vars[name] !== undefined) return String(vars[name]);
      return `{{${name}}}`;
    });
  };
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
