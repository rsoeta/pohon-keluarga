import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie.js';
import {
  applyFontToDom,
  FONT_PRESETS,
  readStoredFontFamily,
  resolveFontFamily,
  sanitizeFontName,
  writeStoredFontFamily
} from '../lib/fonts.js';

const FontContext = createContext(null);

export function FontProvider({ children }) {
  const [fontFamily, setFontFamilyState] = useState(readStoredFontFamily);
  const metaPengaturan = useLiveQuery(() => db.meta.get('pengaturan'), [], undefined);

  // Sinkronisasi otomatis dari pengaturan global admin di Dexie (`Pengaturan_Sistem`).
  // Hanya menimpa state bila server mengembalikan `font_family` yang valid agar tetap
  // kompatibel mundur jika backend GAS lama belum menyertakan kunci tersebut.
  const serverFont = metaPengaturan?.value?.font_family;
  useEffect(() => {
    const valid = sanitizeFontName(serverFont);
    if (!valid) return;
    setFontFamilyState(resolveFontFamily(valid));
  }, [serverFont]);

  useEffect(() => {
    const applied = applyFontToDom(fontFamily);
    writeStoredFontFamily(applied);
  }, [fontFamily]);

  const setFontFamily = useCallback((next) => {
    setFontFamilyState(resolveFontFamily(next));
  }, []);

  const value = useMemo(
    () => ({
      fontFamily,
      setFontFamily,
      presets: FONT_PRESETS
    }),
    [fontFamily, setFontFamily]
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFont() {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error('useFont must be used inside FontProvider');
  return ctx;
}
