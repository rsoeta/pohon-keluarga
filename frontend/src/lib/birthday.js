/**
 * Utilitas ulang tahun — selaras dengan BirthdayTrigger.gs:
 * - Tanggal lahir parsial (YYYY) atau kosong diabaikan.
 * - Anggota wafat (status_hidup !== true) atau terhapus diabaikan.
 * - Kelahiran 29 Februari diperingati pada 28 Februari di tahun non-kabisat.
 */

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function birthdayEffectiveDate(tglLahir, targetYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tglLahir || '').trim());
  if (!m) return null;
  const birthYear = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month === 2 && day === 29 && !isLeapYear(targetYear)) {
    return { month: 2, day: 28, birthYear, isLeapAdjusted: true };
  }
  return { month, day, birthYear, isLeapAdjusted: false };
}

function toUtcDayIndex(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function parseRefDate(refDate) {
  if (typeof refDate === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refDate.trim());
    if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  const d = refDate instanceof Date ? refDate : new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function getBirthdaySchedule(anggotaList, refDate = new Date()) {
  const { year: refYear, month: refMonth, day: refDay } = parseRefDate(refDate);
  const todayIdx = toUtcDayIndex(refYear, refMonth, refDay);

  const today = [];
  const upcoming = [];

  for (const a of anggotaList || []) {
    if (!a || a.is_deleted || a.status_hidup !== true) continue;
    const effThisYear = birthdayEffectiveDate(a.tgl_lahir, refYear);
    if (!effThisYear) continue;

    const thisYearIdx = toUtcDayIndex(refYear, effThisYear.month, effThisYear.day);
    let targetYear = refYear;
    let eff = effThisYear;
    let targetIdx = thisYearIdx;

    if (thisYearIdx < todayIdx) {
      targetYear = refYear + 1;
      eff = birthdayEffectiveDate(a.tgl_lahir, targetYear);
      targetIdx = toUtcDayIndex(targetYear, eff.month, eff.day);
    }

    const daysUntil = targetIdx - todayIdx;
    const item = {
      anggota: a,
      daysUntil,
      turningAge: targetYear - eff.birthYear,
      nextDateStr: `${targetYear}-${String(eff.month).padStart(2, '0')}-${String(eff.day).padStart(2, '0')}`,
      isLeapAdjusted: eff.isLeapAdjusted
    };

    if (daysUntil === 0) today.push(item);
    else upcoming.push(item);
  }

  today.sort((x, y) => String(x.anggota.nama_lengkap || '').localeCompare(String(y.anggota.nama_lengkap || '')));
  upcoming.sort((x, y) => {
    if (x.daysUntil !== y.daysUntil) return x.daysUntil - y.daysUntil;
    return String(x.anggota.nama_lengkap || '').localeCompare(String(y.anggota.nama_lengkap || ''));
  });

  return { today, upcoming };
}

export function countTodaysBirthdays(anggotaList, refDate = new Date()) {
  return getBirthdaySchedule(anggotaList, refDate).today.length;
}
