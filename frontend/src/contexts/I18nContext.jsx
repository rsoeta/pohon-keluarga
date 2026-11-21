import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import idDict from '../i18n/id.js';
import enDict from '../i18n/en.js';

const LANG_STORAGE_KEY = 'nasab_lang';
const DICTS = { id: idDict, en: enDict };

const I18nContext = createContext(null);

function resolveInitialLang() {
  if (typeof window === 'undefined') return 'id';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'id' || saved === 'en') return saved;
  } catch {
    // Abaikan error akses storage
  }
  return 'id';
}

function lookup(dict, key) {
  const parts = String(key || '').split('.');
  let cur = dict;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, part)) {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(resolveInitialLang);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Abaikan error akses storage
    }
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next === 'en' ? 'en' : 'id');
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'id' ? 'en' : 'id'));
  }, []);

  const t = useCallback(
    (key, params) => {
      const raw = lookup(DICTS[lang], key) ?? lookup(DICTS.id, key) ?? key;
      if (!params || typeof raw !== 'string') return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
      );
    },
    [lang]
  );

  const translateError = useCallback(
    (err) => {
      const code = err && typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR';
      const msg = lookup(DICTS[lang], `errors.${code}`) ?? lookup(DICTS.id, `errors.${code}`);
      return msg || lookup(DICTS[lang], 'errors.INTERNAL_ERROR') || 'Error';
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t,
      translateError
    }),
    [lang, setLang, toggleLang, t, translateError]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
