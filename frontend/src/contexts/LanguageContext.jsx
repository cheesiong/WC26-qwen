import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';
import { formatDate, formatDateShort, toSGT } from '../utils/time';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem('wc26-lang') || 'en'
  );

  useEffect(() => {
    localStorage.setItem('wc26-lang', lang);
  }, [lang]);

  const toggleLang = () => setLang(l => l === 'en' ? 'zh' : 'en');

  return (
    <LanguageContext.Provider value={{ lang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);

// t('dashboard.heroTitle') → looks up translations[lang].dashboard.heroTitle
export function useT() {
  const { lang } = useLang();
  return (key) => {
    const parts = key.split('.');
    let value = translations[lang];
    for (const k of parts) value = value?.[k];
    return value ?? key;
  };
}

const LOCALE_MAP = { en: 'en-US', zh: 'zh-CN' };

// Returns a formatDate function bound to the current language locale
export function useFormatDate() {
  const { lang } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  return (dateStr) => formatDate(dateStr, locale);
}

// Returns a toSGT function bound to the current language locale
export function useToSGT() {
  const { lang } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  return (date, time) => toSGT(date, time, locale);
}

// Returns a formatDateShort function bound to the current language locale
export function useFormatDateShort() {
  const { lang } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  return (dateStr) => formatDateShort(dateStr, locale);
}

// Returns a function that translates a team name: useTeamName()(teamId, englishFallback)
export function useTeamName() {
  const { lang } = useLang();
  return (teamId, fallback) => {
    if (lang !== 'zh' || !teamId) return fallback;
    return translations.zh.teams?.[teamId] || fallback;
  };
}
