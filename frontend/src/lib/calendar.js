/**
 * Utilitas kalender pure untuk komponen DatePicker & validasi tanggal lokal.
 */

const MONTHS_FULL_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const MONTHS_FULL_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTHS_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isLeapYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(year, month) {
  const m = Number(month);
  if (m < 1 || m > 12) return 0;
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function getLocalTodayIso(refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = String(refDate.getMonth() + 1).padStart(2, '0');
  const d = String(refDate.getDate()).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${m}-${d}`;
}

export function formatIsoDate(year, month, day) {
  const yy = Number(year);
  const mm = Number(month);
  const dd = Number(day);
  if (!Number.isInteger(yy) || !Number.isInteger(mm) || !Number.isInteger(dd)) return '';
  if (yy < 1000 || yy > 9999 || mm < 1 || mm > 12) return '';
  const maxDay = daysInMonth(yy, mm);
  if (dd < 1 || dd > maxDay) return '';
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function parseIsoDate(isoStr) {
  const s = String(isoStr || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12) return null;
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) return null;
  return { year, month, day };
}

export function getMonthNames(lang = 'id') {
  return lang === 'en'
    ? { full: MONTHS_FULL_EN, short: MONTHS_SHORT_EN }
    : { full: MONTHS_FULL_ID, short: MONTHS_SHORT_ID };
}

export function getWeekdayLabels(lang = 'id') {
  return lang === 'en' ? WEEKDAYS_EN : WEEKDAYS_ID;
}

/**
 * Membangun 42 sel kalender (6 minggu x 7 hari, Minggu -> Sabtu) untuk (year, month 1..12).
 */
export function buildCalendarCells(year, month) {
  const yy = Number(year);
  const mm = Number(month);
  const first = new Date(2000, mm - 1, 1);
  first.setFullYear(yy);
  const startDow = first.getDay();

  const totalCurrent = daysInMonth(yy, mm);
  const prevMonth = mm === 1 ? 12 : mm - 1;
  const prevYear = mm === 1 ? yy - 1 : yy;
  const totalPrev = daysInMonth(prevYear, prevMonth);

  const nextMonth = mm === 12 ? 1 : mm + 1;
  const nextYear = mm === 12 ? yy + 1 : yy;

  const cells = [];

  for (let i = startDow - 1; i >= 0; i--) {
    const day = totalPrev - i;
    cells.push({
      iso: formatIsoDate(prevYear, prevMonth, day),
      year: prevYear,
      month: prevMonth,
      day,
      inCurrentMonth: false
    });
  }

  for (let day = 1; day <= totalCurrent; day++) {
    cells.push({
      iso: formatIsoDate(yy, mm, day),
      year: yy,
      month: mm,
      day,
      inCurrentMonth: true
    });
  }

  let trailingDay = 1;
  while (cells.length < 42) {
    cells.push({
      iso: formatIsoDate(nextYear, nextMonth, trailingDay),
      year: nextYear,
      month: nextMonth,
      day: trailingDay,
      inCurrentMonth: false
    });
    trailingDay++;
  }

  return cells;
}
