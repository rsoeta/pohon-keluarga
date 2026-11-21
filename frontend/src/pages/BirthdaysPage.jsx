import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cake, CalendarClock, Info, MapPin, MessageCircle, Search, Sparkles, X } from 'lucide-react';
import { db } from '../db/dexie.js';
import { prefetchPhotos } from '../db/sync.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { getBirthdaySchedule } from '../lib/birthday.js';
import { formatTglLahir, formatWaUrl } from '../lib/format.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';

export function BirthdaysPage() {
  const { isOnline } = useAuth();
  const { lang, t } = useI18n();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const [query, setQuery] = useState('');
  const [rangeFilter, setRangeFilter] = useState('ALL'); // ALL | 7 | 30

  const schedule = useMemo(() => getBirthdaySchedule(anggotaList), [anggotaList]);

  const filteredUpcoming = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schedule.upcoming.filter((item) => {
      if (rangeFilter === '7' && item.daysUntil > 7) return false;
      if (rangeFilter === '30' && item.daysUntil > 30) return false;
      if (!q) return true;
      const hay = `${item.anggota.nama_lengkap || ''} ${item.anggota.domisili || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [schedule.upcoming, query, rangeFilter]);

  useEffect(() => {
    if (!isOnline) return;
    const fids = [
      ...schedule.today.map((x) => x.anggota.foto_file_id),
      ...filteredUpcoming.slice(0, 30).map((x) => x.anggota.foto_file_id)
    ].filter(Boolean);
    if (fids.length) prefetchPhotos(fids).catch(() => {});
  }, [isOnline, schedule.today, filteredUpcoming]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('birthdays.title')}</h1>

      {/* Seksi 1: Ulang Tahun Hari Ini */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-heritage-600 dark:text-heritage-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {t('birthdays.todaySection')} ({schedule.today.length})
          </h2>
        </div>

        {!schedule.today.length ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm font-medium text-slate-500 dark:text-slate-400 shadow-sm">
            {t('birthdays.noToday')}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {schedule.today.map((item) => {
              const a = item.anggota;
              const greeting = t('birthdays.waGreetingTemplate', {
                age: item.turningAge,
                name: a.nama_lengkap
              });
              const waUrl = formatWaUrl(a.no_wa, greeting);

              return (
                <article
                  key={a.id_anggota}
                  className="w-full sm:w-[calc(50%-0.375rem)] bg-gradient-to-br from-brand-50 via-white to-heritage-50 dark:from-brand-950/40 dark:via-slate-900 dark:to-heritage-950/30 rounded-2xl border border-brand-200 dark:border-brand-800 p-4 shadow-sm flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <MemberAvatar
                      fileId={a.foto_file_id}
                      name={a.nama_lengkap}
                      gender={a.jenis_kelamin}
                      isLiving={a.status_hidup}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[0.7rem] font-bold">
                          {t('birthdays.badgeToday')}
                        </span>
                        {item.turningAge > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-brand-700 text-white text-[0.7rem] font-bold">
                            {t('birthdays.turningAge', { age: item.turningAge })}
                          </span>
                        )}
                      </div>

                      <Link
                        to={`/profil/${a.id_anggota}`}
                        className="text-base font-bold text-slate-900 dark:text-white hover:text-brand-700 dark:hover:text-brand-300 mt-1.5 block break-words"
                      >
                        {a.nama_lengkap}
                      </Link>

                      {a.domisili && (
                        <p className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5 break-words">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{a.domisili}</span>
                        </p>
                      )}

                      {item.isLeapAdjusted && (
                        <p className="text-[0.7rem] font-bold text-amber-700 dark:text-amber-300 mt-1">
                          {t('birthdays.leapNote')}
                        </p>
                      )}
                    </div>
                  </div>

                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-touch px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm"
                    >
                      <MessageCircle className="w-4 h-4 shrink-0" />
                      <span>{t('birthdays.sendWa')}</span>
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Seksi 2: Mendatang (Semua Jadwal) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-brand-700 dark:text-brand-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {t('birthdays.upcomingSection')} ({filteredUpcoming.length})
            </h2>
          </div>
        </div>

        {/* Cari + Filter Rentang Hari (Fluid Flexbox, Anti-Horizontal Scroll) */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[13rem] flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('birthdays.searchPlaceholder')}
              className="w-full min-h-touch pl-10 pr-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('directory.clearSearch')}
                className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              ['7', t('birthdays.filter7')],
              ['30', t('birthdays.filter30')],
              ['ALL', t('birthdays.filterAll')]
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRangeFilter(val)}
                className={`min-h-touch px-3.5 rounded-xl text-xs font-bold border ${
                  rangeFilter === val
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!filteredUpcoming.length ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm font-medium text-slate-500 dark:text-slate-400 shadow-sm">
            {t('birthdays.noUpcoming')}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {filteredUpcoming.map((item) => {
              const a = item.anggota;
              const countdownText =
                item.daysUntil === 1
                  ? t('birthdays.badgeTomorrow')
                  : t('birthdays.badgeDaysLeft', { days: item.daysUntil });

              return (
                <Link
                  key={a.id_anggota}
                  to={`/profil/${a.id_anggota}`}
                  className="w-full sm:w-[calc(50%-0.3125rem)] min-h-touch p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-brand-400 dark:hover:border-brand-700 shadow-sm flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MemberAvatar
                      fileId={a.foto_file_id}
                      name={a.nama_lengkap}
                      gender={a.jenis_kelamin}
                      isLiving={a.status_hidup}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {a.nama_lengkap}
                      </p>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 flex-wrap">
                        <Cake className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
                        <span>{formatTglLahir(item.nextDateStr, lang)}</span>
                        {item.turningAge > 0 && <span>· {t('birthdays.turningAge', { age: item.turningAge })}</span>}
                      </p>
                      {item.isLeapAdjusted && (
                        <p className="text-[0.65rem] font-bold text-amber-700 dark:text-amber-300">
                          {t('birthdays.leapNote')}
                        </p>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold ${
                      item.daysUntil <= 7
                        ? 'bg-heritage-100 dark:bg-heritage-900/40 text-heritage-800 dark:text-heritage-200'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {countdownText}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs font-medium text-slate-600 dark:text-slate-400">
        <Info className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
        <span>{t('birthdays.partialNote')}</span>
      </div>
    </div>
  );
}
