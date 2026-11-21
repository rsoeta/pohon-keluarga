import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { GitFork, GitCompare, MapPin, Search, User, X } from 'lucide-react';
import { db } from '../db/dexie.js';
import { prefetchPhotos } from '../db/sync.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { useQuickUi } from '../contexts/QuickUiContext.jsx';
import { extractBirthYear, formatKodeUnik } from '../lib/format.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';

const PAGE_SIZE = 30;

export function DirectoryPage() {
  const { isOnline } = useAuth();
  const { t } = useI18n();
  const { openMemberDrawer, openRelationModal } = useQuickUi();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);

  const [query, setQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('ALL'); // ALL | L | P
  const [livingFilter, setLivingFilter] = useState('ALL'); // ALL | LIVING | DECEASED
  const [childFilter, setChildFilter] = useState('ALL');   // ALL | Kandung | Angkat
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    const list = (anggotaList || []).filter((a) => {
      if (!a || a.is_deleted) return false;
      if (genderFilter !== 'ALL' && a.jenis_kelamin !== genderFilter) return false;
      if (livingFilter === 'LIVING' && a.status_hidup !== true) return false;
      if (livingFilter === 'DECEASED' && a.status_hidup !== false) return false;
      if (childFilter !== 'ALL' && (a.status_anak || 'Kandung') !== childFilter) return false;
      if (!q) return true;
      const hay = `${a.nama_lengkap || ''} ${a.kode_unik || ''} ${a.domisili || ''}`.toLowerCase();
      return hay.includes(q);
    });

    list.sort((a, b) => String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || '')));
    return list;
  }, [anggotaList, query, genderFilter, livingFilter, childFilter]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, genderFilter, livingFilter, childFilter]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  useEffect(() => {
    if (!isOnline || !visible.length) return;
    const fids = visible.map((a) => a.foto_file_id).filter(Boolean);
    if (fids.length) prefetchPhotos(fids).catch(() => {});
  }, [isOnline, visible]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">{t('directory.title')}</h1>
        <span className="px-3 py-1 rounded-full bg-surface border border-line text-xs font-bold text-muted">
          {t('directory.resultCount', { shown: visible.length, total: filtered.length })}
        </span>
      </div>

      {/* Kolom Cari */}
      <div className="relative flex items-center">
        <Search className="w-5 h-5 text-faint absolute left-4 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('directory.searchPlaceholder')}
          className="w-full min-h-touch pl-11 pr-12 py-2.5 rounded-full border border-line bg-surface text-sm font-medium text-ink placeholder:text-faint shadow-card focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('directory.clearSearch')}
            className="absolute right-0 min-h-touch min-w-touch flex items-center justify-center text-muted hover:text-ink rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Filter Responsif Fluid Flexbox (Tanpa Horizontal Scroll) */}
      <div className="flex flex-wrap gap-2">
        {[
          ['ALL', t('directory.filterGenderAll')],
          ['L', t('common.male')],
          ['P', t('common.female')]
        ].map(([val, label]) => (
          <button
            key={`g-${val}`}
            type="button"
            onClick={() => setGenderFilter(val)}
            className={`min-h-touch px-3.5 rounded-full text-xs font-bold border transition-colors ${
              genderFilter === val
                ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                : 'bg-surface text-ink border-line hover:bg-surface-2'
            }`}
          >
            {label}
          </button>
        ))}

        {[
          ['ALL', t('directory.filterLivingAll')],
          ['LIVING', t('common.living')],
          ['DECEASED', t('common.deceased')]
        ].map(([val, label]) => (
          <button
            key={`l-${val}`}
            type="button"
            onClick={() => setLivingFilter(val)}
            className={`min-h-touch px-3.5 rounded-full text-xs font-bold border transition-colors ${
              livingFilter === val
                ? 'bg-side text-[var(--on-side)] border-transparent shadow-sm'
                : 'bg-surface text-ink border-line hover:bg-surface-2'
            }`}
          >
            {label}
          </button>
        ))}

        {[
          ['ALL', t('directory.filterChildAll')],
          ['Angkat', t('common.adopted')]
        ].map(([val, label]) => (
          <button
            key={`c-${val}`}
            type="button"
            onClick={() => setChildFilter(val)}
            className={`min-h-touch px-3.5 rounded-full text-xs font-bold border transition-colors ${
              childFilter === val
                ? 'bg-heritage-600 text-white border-heritage-600 shadow-sm'
                : 'bg-surface text-ink border-line hover:bg-surface-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Daftar Kartu Anggota */}
      {!visible.length ? (
        <div className="bg-surface rounded-card border border-line p-8 text-center shadow-card">
          <p className="text-base font-bold text-ink">{t('directory.emptyTitle')}</p>
          <p className="text-sm font-medium text-muted mt-1">{t('directory.emptyDesc')}</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visible.map((a) => {
            const yr = extractBirthYear(a.tgl_lahir);
            return (
              <article
                key={a.id_anggota}
                className="w-full sm:w-[calc(50%-0.375rem)] bg-surface rounded-card border border-line p-4 shadow-card flex flex-col justify-between gap-3"
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
                    <button
                      type="button"
                      onClick={() => openMemberDrawer(a.id_anggota)}
                      className="text-left text-base font-bold text-ink hover:text-brand-700 dark:hover:text-brand-300 leading-snug block break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
                    >
                      {a.nama_lengkap}
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs font-semibold text-muted">
                      <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-line text-ink font-mono text-[0.7rem]">
                        {formatKodeUnik(a.kode_unik)}
                      </span>
                      {yr && <span>{yr}</span>}
                      {a.status_hidup === false && (
                        <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-line text-muted">
                          {t('common.deceased')}
                        </span>
                      )}
                      {a.status_anak === 'Angkat' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                          {t('common.adopted')}
                        </span>
                      )}
                    </div>

                    {a.domisili && (
                      <p className="flex items-center gap-1 text-xs font-medium text-muted mt-1.5 break-words">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{a.domisili}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* 3 Aksi Cepat >= 48px */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => openMemberDrawer(a.id_anggota)}
                    className="flex-1 min-w-[5.5rem] min-h-touch px-3 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <User className="w-4 h-4 shrink-0" />
                    <span>{t('directory.btnProfile')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openRelationModal(a.id_anggota)}
                    className="flex-1 min-w-[5.5rem] min-h-touch px-3 rounded-full bg-heritage-50 dark:bg-heritage-950/40 hover:bg-heritage-100 dark:hover:bg-heritage-900/50 border border-heritage-200/70 dark:border-heritage-800/60 text-heritage-800 dark:text-heritage-200 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <GitCompare className="w-4 h-4 shrink-0" />
                    <span>{t('directory.btnRelation')}</span>
                  </button>

                  <Link
                    to={`/pohon?focus=${a.id_anggota}`}
                    className="flex-1 min-w-[5.5rem] min-h-touch px-3 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <GitFork className="w-4 h-4 shrink-0" />
                    <span>{t('directory.btnTree')}</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {visible.length < filtered.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="w-full min-h-touch px-4 py-3 rounded-full border border-line bg-surface text-sm font-bold text-ink hover:bg-surface-2 shadow-card"
        >
          {t('directory.loadMore', { remaining: filtered.length - visible.length })}
        </button>
      )}
    </div>
  );
}
