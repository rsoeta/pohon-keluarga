export const FONT_STORAGE_KEY = 'pohon_font_family';
export const DEFAULT_FONT_FAMILY = 'Barlow Semi Condensed';
export const SYSTEM_FONT_VALUE = 'System';
export const FONT_STYLESHEET_ID = 'app-font-stylesheet';
export const FONT_PREVIEW_STYLESHEET_ID = 'app-font-preview-stylesheet';
export const FONT_NAME_RE = /^[A-Za-z][A-Za-z0-9 ]{1,49}$/;

export const SYSTEM_SANS_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const SYSTEM_SERIF_STACK =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

export const FONT_PRESETS = Object.freeze([
  {
    name: 'Barlow Semi Condensed',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Jeremy Tribby',
    tagId: 'Ramping & Tegas (Default)',
    tagEn: 'Semi-Condensed & Crisp (Default)'
  },
  {
    name: 'Quicksand',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Andrew Paglinawan',
    tagId: 'Membulat & Hangat',
    tagEn: 'Rounded & Warm'
  },
  {
    name: 'Plus Jakarta Sans',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Tokotype',
    tagId: 'Modern & Geometris',
    tagEn: 'Modern & Geometric'
  },
  {
    name: 'Inter',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Rasmus Andersson',
    tagId: 'Netral & Sangat Rapi',
    tagEn: 'Neutral & Clean UI'
  },
  {
    name: 'DM Sans',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Colophon Foundry',
    tagId: 'Editorial & Ringkas',
    tagEn: 'Editorial & Compact'
  },
  {
    name: 'Nunito',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Vernon Adams',
    tagId: 'Ramah Keluarga',
    tagEn: 'Friendly & Soft'
  },
  {
    name: 'Poppins',
    category: 'sans',
    weights: '400;500;600;700',
    designer: 'Indian Type Foundry',
    tagId: 'Geometris & Kuat',
    tagEn: 'Bold Geometric'
  },
  {
    name: 'Lora',
    category: 'serif',
    weights: '400;500;600;700',
    designer: 'Cyreal',
    tagId: 'Serif Klasik & Hangat',
    tagEn: 'Warm Classic Serif'
  },
  {
    name: 'Merriweather',
    category: 'serif',
    weights: '400;700',
    designer: 'Sorkin Type',
    tagId: 'Serif Silsilah Resmi',
    tagEn: 'Dignified Heritage Serif'
  },
  {
    name: SYSTEM_FONT_VALUE,
    category: 'system',
    weights: '',
    designer: 'OS Native',
    tagId: 'Bawaan Perangkat (100% Offline)',
    tagEn: 'Device Native (100% Offline)'
  }
]);

const PRESET_BY_LOWER = new Map(FONT_PRESETS.map((p) => [p.name.toLowerCase(), p]));

/** Membersihkan dan memvalidasi nama font agar bebas karakter injeksi CSS/URL. */
export function sanitizeFontName(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return FONT_NAME_RE.test(cleaned) ? cleaned : '';
}

/** Mencari preset font secara case-insensitive. */
export function findFontPreset(raw) {
  const cleaned = sanitizeFontName(raw);
  if (!cleaned) return null;
  return PRESET_BY_LOWER.get(cleaned.toLowerCase()) || null;
}

/** Mengembalikan nama font kanonik (preset atau custom valid), fallback ke default. */
export function resolveFontFamily(raw) {
  const preset = findFontPreset(raw);
  if (preset) return preset.name;
  return sanitizeFontName(raw) || DEFAULT_FONT_FAMILY;
}

export function isPresetFont(raw) {
  return Boolean(findFontPreset(raw));
}

/** Membangun nilai CSS `font-family` untuk variabel `--font-sans`. */
export function buildCssFontStack(raw) {
  const resolved = resolveFontFamily(raw);
  if (resolved === SYSTEM_FONT_VALUE) return SYSTEM_SANS_STACK;
  const preset = findFontPreset(resolved);
  const fallback = preset?.category === 'serif' ? SYSTEM_SERIF_STACK : SYSTEM_SANS_STACK;
  return `'${resolved}', ${fallback}`;
}

/** Membangun URL Google Fonts CSS2 untuk font terpilih; kosong bila `System`. */
export function buildGoogleFontUrl(raw, { fallbackNoWeights = false } = {}) {
  const resolved = resolveFontFamily(raw);
  if (resolved === SYSTEM_FONT_VALUE) return '';
  const preset = findFontPreset(resolved);
  const encoded = encodeURIComponent(resolved).replace(/%20/g, '+');
  if (fallbackNoWeights) {
    return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  }
  const weights = preset?.weights || '400;500;600;700';
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weights}&display=swap`;
}

export function readStoredFontFamily() {
  if (typeof window === 'undefined') return DEFAULT_FONT_FAMILY;
  try {
    return resolveFontFamily(window.localStorage.getItem(FONT_STORAGE_KEY) || '');
  } catch {
    return DEFAULT_FONT_FAMILY;
  }
}

export function writeStoredFontFamily(name) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, resolveFontFamily(name));
  } catch {
    // Abaikan error akses storage
  }
}

/** Memuat/memperbarui tag <link> Google Fonts dengan fallback aman tanpa bobot bila gagal. */
export function ensureFontStylesheet(rawName, linkId = FONT_STYLESHEET_ID) {
  if (typeof document === 'undefined' || !document.head) return null;
  const resolved = resolveFontFamily(rawName);
  const existing = document.getElementById(linkId);
  if (resolved === SYSTEM_FONT_VALUE) {
    if (existing) existing.remove();
    return null;
  }

  const primaryUrl = buildGoogleFontUrl(resolved);
  if (!primaryUrl) return null;

  let link = existing;
  if (!link) {
    link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  if (link.getAttribute('href') !== primaryUrl) {
    link.dataset.fallbackTried = '';
    link.onerror = () => {
      if (link.dataset.fallbackTried === '1') return;
      link.dataset.fallbackTried = '1';
      const fallbackUrl = buildGoogleFontUrl(resolved, { fallbackNoWeights: true });
      if (fallbackUrl && link.getAttribute('href') !== fallbackUrl) {
        link.setAttribute('href', fallbackUrl);
      }
    };
    link.setAttribute('href', primaryUrl);
  }

  return link;
}

/** Menerapkan font aktif ke CSS custom property `--font-sans` dan memuat stylesheet-nya. */
export function applyFontToDom(rawName) {
  const resolved = resolveFontFamily(rawName);
  if (typeof document === 'undefined') return resolved;
  const root = document.documentElement;
  root.style.setProperty('--font-sans', buildCssFontStack(resolved));
  root.dataset.fontFamily = resolved;
  ensureFontStylesheet(resolved, FONT_STYLESHEET_ID);
  return resolved;
}

/** Memuat font pratinjau di Panel Admin tanpa mengubah font global aplikasi. */
export function loadPreviewFont(rawName) {
  const cleaned = sanitizeFontName(rawName);
  if (!cleaned) return null;
  const resolved = resolveFontFamily(cleaned);
  if (resolved === SYSTEM_FONT_VALUE) return null;
  return ensureFontStylesheet(resolved, FONT_PREVIEW_STYLESHEET_ID);
}
