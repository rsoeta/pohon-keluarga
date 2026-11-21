/**
 * Utilitas pemformatan biodata, kode unik, dan validasi tanggal parsial.
 */

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTglLahir(tgl, lang = 'id') {
  const s = String(tgl || '').trim();
  if (!s) return '-';
  if (/^\d{4}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const y = Number(m[1]);
  const monIdx = Number(m[2]) - 1;
  const d = Number(m[3]);
  const months = lang === 'en' ? MONTHS_EN : MONTHS_ID;
  const monLabel = months[monIdx] || m[2];
  return `${d} ${monLabel} ${y}`;
}

export function extractBirthYear(tgl) {
  const m = /^(\d{4})/.exec(String(tgl || '').trim());
  return m ? m[1] : '';
}

export function formatKodeUnik(kode) {
  const s = String(kode || '').trim();
  return s ? `#${s}` : '-';
}

export function formatWaUrl(noWa, text = '') {
  const digits = String(noWa || '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${query}`;
}

export function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PK';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/**
 * Validasi tanggal lahir 3 mode: 'empty' | 'year' | 'full'.
 * Mengembalikan { ok: true, value } atau { ok: false }.
 */
export function validateBirthDateInput(mode, fullDate, yearOnly, refTodayStr) {
  const today = refTodayStr || new Date().toISOString().slice(0, 10);
  const thisYear = Number(today.slice(0, 4));

  if (mode === 'empty') return { ok: true, value: '' };

  if (mode === 'year') {
    const yStr = String(yearOnly || '').trim();
    if (!/^\d{4}$/.test(yStr)) return { ok: false };
    const y = Number(yStr);
    if (y < 1000 || y > thisYear) return { ok: false };
    return { ok: true, value: yStr };
  }

  const s = String(fullDate || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return { ok: false };
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (yy < 1000 || mm < 1 || mm > 12 || dd < 1 || dd > daysInMonth(yy, mm)) return { ok: false };
  if (s > today) return { ok: false };
  return { ok: true, value: s };
}
