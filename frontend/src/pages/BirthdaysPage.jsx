import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Cake, CalendarClock, Info, MapPin, MessageCircle, Search, Sparkles, X } from 'lucide-react';
import { db } from '../db/dexie.js';
import { prefetchPhotos } from '../db/sync.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { useQuickUi } from '../contexts/QuickUiContext.jsx';
import { getBirthdaySchedule } from '../lib/birthday.js';
import { formatTglLahir, formatWaUrl } from '../lib/format.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';

export function BirthdaysPage() {
  const { isOnline } = useAuth();
  const { lang, t } = useI18n();
  const { openMemberDrawer } = useQuickUi();

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
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">{t('birthdays.title')}</h1>

      {/* Seksi 1: Ulang Tahun Hari Ini */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-heritage-600 dark:text-heritage-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            {t('birthdays.todaySection')} ({schedule.today.length})
          </h2>
        </div>

        {!schedule.today.length ? (
          <div className="bg-surface rounded-card border border-line p-5 text-sm font-medium text-muted shadow-card">
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
                  className="w-full sm:w-[calc(50%-0.375rem)] bg-gradient-to-br from-brand-50 via-surface to-heritage-50 dark:from-brand-950/50 dark:via-surface dark:to-heritage-950/30 rounded-card border border-brand-200 dark:border-brand-800 p-4 shadow-card flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => openMemberDrawer(a.id_anggota)}
                      aria-label={a.nama_lengkap}
                      className="rounded-full shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <MemberAvatar
                        fileId={a.foto_file_id}
                        name={a.nama_lengkap}
                        gender={a.jenis_kelamin}
                        isLiving={a.status_hidup}
                        size="lg"
                      />
                    </button>
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

                      <button
                        type="button"
                        onClick={() => openMemberDrawer(a.id_anggota)}
                        className="text-left text-base font-bold text-ink hover:text-brand-700 dark:hover:text-brand-300 mt-1.5 block break-words"
                      >
                        {a.nama_lengkap}
                      </button>

                      {a.domisili && (
                        <p className="flex items-center gap-1 text-xs font-medium text-muted mt-0.5 break-words">
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
                      className="w-full min-h-touch px-3.5 rounded-full bg-wa hover:bg-wa-hover text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
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
            <CalendarClock className="w-5 h-5 text-brand-700 dark:text-brand-300" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
              {t('birthdays.upcomingSection')} ({filteredUpcoming.length})
            </h2>
          </div>
        </div>

        {/* Cari + Filter Rentang Hari (Fluid Flexbox, Anti-Horizontal Scroll) */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[13rem] flex items-center">
            <Search className="w-4 h-4 text-faint absolute left-4 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('birthdays.searchPlaceholder')}
              className="w-full min-h-touch pl-10 pr-10 py-2 rounded-full border border-line bg-surface text-sm font-medium text-ink placeholder:text-faint shadow-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('directory.clearSearch')}
                className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-muted hover:text-ink rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <SegmentedPillControl
            value={rangeFilter}
            onChange={setRangeFilter}
            tone="brand"
            options={[
              { value: '7', label: t('birthdays.filter7') },
              { value: '30', label: t('birthdays.filter30') },
              { value: 'ALL', label: t('birthdays.filterAll') }
            ]}
          />
        </div>

        {!filteredUpcoming.length ? (
          <div className="bg-surface rounded-card border border-line p-5 text-sm font-medium text-muted shadow-card">
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
                <button
                  key={a.id_anggota}
                  type="button"
                  onClick={() => openMemberDrawer(a.id_anggota)}
                  className="w-full sm:w-[calc(50%-0.3125rem)] min-h-touch p-3.5 rounded-card bg-surface border border-line hover:border-brand-500 shadow-card flex items-center justify-between gap-3 text-left transition-colors"
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
                      <p className="text-sm font-bold text-ink truncate">{a.nama_lengkap}</p>
                      <p className="text-xs font-semibold text-muted flex items-center gap-1 flex-wrap">
                        <Cake className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300 shrink-0" />
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
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
                      item.daysUntil <= 7
                        ? 'bg-heritage-100 dark:bg-heritage-900/40 text-heritage-800 dark:text-heritage-200'
                        : 'bg-surface-2 border border-line text-ink'
                    }`}
                  >
                    {countdownText}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="p-3.5 rounded-card bg-surface-2 border border-line flex items-start gap-2.5 text-xs font-medium text-muted">
        <Info className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" />
        <span>{t('birthdays.partialNote')}</span>
      </div>
    </div>
  );
}
