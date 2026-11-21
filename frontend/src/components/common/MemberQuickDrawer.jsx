import { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Copy,
  Edit3,
  GitCompare,
  GitFork,
  Heart,
  MapPin,
  MessageCircle,
  Users,
  X
} from 'lucide-react';
import { db } from '../../db/dexie.js';
import { prefetchPhotos } from '../../db/sync.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useQuickUi } from '../../contexts/QuickUiContext.jsx';
import { canEditAnggota } from '../../lib/rbac.js';
import { formatKodeUnik, formatTglLahir, formatWaUrl } from '../../lib/format.js';
import { toastSuccess } from '../../lib/swal.js';
import { MemberAvatar } from './MemberAvatar.jsx';

export function MemberQuickDrawer() {
  const navigate = useNavigate();
  const { user, isOnline } = useAuth();
  const { lang, t } = useI18n();
  const {
    drawerHistory,
    drawerMemberId,
    pushMemberDrawer,
    popMemberDrawer,
    closeMemberDrawer,
    openRelationModal
  } = useQuickUi();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);

  const bodyRef = useRef(null);
  const closeBtnRef = useRef(null);

  const activeMap = useMemo(() => {
    const m = new Map();
    for (const a of anggotaList || []) {
      if (a && !a.is_deleted) m.set(a.id_anggota, a);
    }
    return m;
  }, [anggotaList]);

  const member = drawerMemberId ? activeMap.get(drawerMemberId) || null : null;
  const ayah = member?.id_ayah ? activeMap.get(member.id_ayah) || null : null;
  const ibu = member?.id_ibu ? activeMap.get(member.id_ibu) || null : null;

  const spouses = useMemo(() => {
    if (!member) return [];
    return (pernikahanList || [])
      .filter((m) => m && !m.is_deleted && (m.id_suami === member.id_anggota || m.id_istri === member.id_anggota))
      .map((m) => ({
        pernikahan: m,
        anggota: activeMap.get(m.id_suami === member.id_anggota ? m.id_istri : m.id_suami) || null
      }))
      .filter((x) => x.anggota)
      .sort((a, b) => (a.pernikahan.urutan_pasangan || 99) - (b.pernikahan.urutan_pasangan || 99));
  }, [member, pernikahanList, activeMap]);

  const children = useMemo(() => {
    if (!member) return [];
    return [...activeMap.values()]
      .filter((c) => c.id_ayah === member.id_anggota || c.id_ibu === member.id_anggota)
      .sort((a, b) => (a.urutan_anak || 99) - (b.urutan_anak || 99));
  }, [member, activeMap]);

  const canEdit = member ? canEditAnggota(user, member.id_anggota, anggotaList, pernikahanList) : false;

  useEffect(() => {
    if (!drawerMemberId) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeBtnRef.current?.focus(), 15);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMemberDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerMemberId, closeMemberDrawer]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [drawerMemberId]);

  useEffect(() => {
    if (!isOnline || !member) return;
    const fids = [
      member.foto_file_id,
      ayah?.foto_file_id,
      ibu?.foto_file_id,
      ...spouses.map((s) => s.anggota.foto_file_id),
      ...children.map((c) => c.foto_file_id)
    ].filter(Boolean);
    if (fids.length) prefetchPhotos(fids).catch(() => {});
  }, [isOnline, member, ayah, ibu, spouses, children]);

  if (!drawerMemberId) return null;

  const handleCopy = async (val) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(String(val));
      toastSuccess(t('common.copySuccess'));
    } catch {
      // Abaikan jika clipboard dibatasi
    }
  };

  const waUrl = member ? formatWaUrl(member.no_wa) : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-drawer-title"
      className="fixed inset-0 z-40 flex items-end sm:items-stretch sm:justify-end bg-[#081513]/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeMemberDrawer();
      }}
    >
      <aside className="w-full sm:max-w-md max-h-[90dvh] sm:max-h-none sm:h-dvh bg-raised border-t sm:border-t-0 sm:border-l border-line rounded-t-[26px] sm:rounded-none shadow-float flex flex-col overflow-hidden drawer-enter">
        {/* Header Sticky */}
        <div className="px-4 sm:px-5 pt-3.5 pb-4 border-b border-line bg-surface shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {drawerHistory.length > 1 && (
                <button
                  type="button"
                  onClick={popMemberDrawer}
                  aria-label={t('drawer.backHistory')}
                  title={t('drawer.backHistory')}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <span className="text-[0.7rem] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                {t('drawer.eyebrow')}
              </span>
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={() => closeMemberDrawer()}
              aria-label={t('common.close')}
              className="h-9 w-9 flex items-center justify-center rounded-full text-muted hover:bg-[var(--well)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!member ? (
            <div className="py-4">
              <h2 id="quick-drawer-title" className="text-lg font-bold text-ink">
                {t('profile.notFoundTitle')}
              </h2>
              <p className="text-xs font-medium text-muted mt-1">{t('profile.notFoundDesc')}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3.5 min-w-0">
              <MemberAvatar
                fileId={member.foto_file_id}
                name={member.nama_lengkap}
                gender={member.jenis_kelamin}
                isLiving={member.status_hidup}
                size="lg"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <h2
                  id="quick-drawer-title"
                  className="text-lg sm:text-xl font-bold text-ink leading-snug break-words"
                >
                  {member.nama_lengkap}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(formatKodeUnik(member.kode_unik))}
                    title={t('profile.copyCode')}
                    className="px-2.5 py-1 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-xs font-bold text-ink inline-flex items-center gap-1"
                  >
                    <span className="font-mono">{formatKodeUnik(member.kode_unik)}</span>
                    <Copy className="w-3 h-3 text-muted" />
                  </button>
                  <span className="px-2.5 py-1 rounded-full bg-brand-100/80 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200 text-xs font-bold">
                    {member.jenis_kelamin === 'L' ? t('common.male') : t('common.female')}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      member.status_hidup
                        ? 'bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                        : 'bg-surface-2 text-muted border border-line'
                    }`}
                  >
                    {member.status_hidup ? t('common.living') : t('common.deceased')}
                  </span>
                  {member.status_anak === 'Angkat' && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-bold">
                      {t('common.adopted')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Body Scrollable */}
        {member && (
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Strip Aksi Cepat */}
            <div className="flex flex-wrap gap-1.5" aria-label={t('drawer.quickActions')}>
              <button
                type="button"
                onClick={() => {
                  closeMemberDrawer({ restore: false });
                  navigate(`/pohon?focus=${member.id_anggota}`);
                }}
                className="flex-1 min-w-[7rem] min-h-ctl px-3 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm"
              >
                <GitFork className="w-3.5 h-3.5 shrink-0" />
                <span>{t('drawer.focusTreeBtn')}</span>
              </button>

              <button
                type="button"
                onClick={() => openRelationModal(member.id_anggota)}
                className="min-h-ctl px-3 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <GitCompare className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300 shrink-0" />
                <span>{t('drawer.relationBtn')}</span>
              </button>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    closeMemberDrawer({ restore: false });
                    navigate(`/edit/${member.id_anggota}`);
                  }}
                  className="min-h-ctl px-3 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted shrink-0" />
                  <span>{t('drawer.editBtn')}</span>
                </button>
              )}

              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-ctl px-3 rounded-full bg-wa hover:bg-wa-hover text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>

            {/* Biodata Ringkas */}
            <div className="bg-surface-2 rounded-tile border border-line p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wide text-faint">
                    {t('profile.birthDate')}
                  </p>
                  <p className="text-sm font-bold text-ink">
                    {formatTglLahir(member.tgl_lahir, lang)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2 border-t border-line">
                <MapPin className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wide text-faint">
                    {t('profile.domicile')}
                  </p>
                  <p className="text-sm font-bold text-ink break-words">
                    {member.domisili || t('common.notSet')}
                  </p>
                </div>
              </div>

              {member.no_wa && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <MessageCircle className="w-4 h-4 text-wa shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[0.7rem] font-bold uppercase tracking-wide text-faint">
                        {t('profile.whatsapp')}
                      </p>
                      <p className="text-sm font-bold text-ink font-mono">+{member.no_wa}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(`+${member.no_wa}`)}
                    aria-label={t('common.copySuccess')}
                    className="min-h-touch min-w-touch flex items-center justify-center rounded-full bg-surface border border-line text-muted hover:text-ink"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Relasi Interaktif */}
            <div className="space-y-3">
              {(ayah || ibu) && (
                <div className="space-y-1.5">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-faint flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300" />
                    <span>{t('profile.parentsSection')}</span>
                  </p>
                  <div className="space-y-1.5">
                    {[
                      [ayah, t('profile.father')],
                      [ibu, t('profile.mother')]
                    ]
                      .filter(([p]) => Boolean(p))
                      .map(([p, role]) => (
                        <button
                          key={p.id_anggota}
                          type="button"
                          onClick={() => pushMemberDrawer(p.id_anggota)}
                          className="w-full min-h-touch p-2.5 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line flex items-center justify-between gap-2.5 text-left transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <MemberAvatar
                              fileId={p.foto_file_id}
                              name={p.nama_lengkap}
                              gender={p.jenis_kelamin}
                              isLiving={p.status_hidup}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-[0.65rem] font-bold uppercase text-brand-700 dark:text-brand-300">
                                {role}
                              </p>
                              <p className="text-sm font-bold text-ink truncate">{p.nama_lengkap}</p>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-faint shrink-0" />
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {spouses.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-faint flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span>{t('profile.spousesSection')}</span>
                  </p>
                  <div className="space-y-1.5">
                    {spouses.map(({ pernikahan, anggota }) => (
                      <button
                        key={pernikahan.id_pernikahan}
                        type="button"
                        onClick={() => pushMemberDrawer(anggota.id_anggota)}
                        className="w-full min-h-touch p-2.5 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line flex items-center justify-between gap-2.5 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MemberAvatar
                            fileId={anggota.foto_file_id}
                            name={anggota.nama_lengkap}
                            gender={anggota.jenis_kelamin}
                            isLiving={anggota.status_hidup}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink truncate">
                              {anggota.nama_lengkap}
                            </p>
                            <p className="text-xs font-semibold text-muted">
                              {pernikahan.status_pernikahan}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-faint shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {children.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[0.7rem] font-bold uppercase tracking-wider text-faint flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300" />
                    <span>
                      {t('profile.childrenSection')} ({children.length})
                    </span>
                  </p>
                  <div className="space-y-1.5">
                    {children.map((c) => (
                      <button
                        key={c.id_anggota}
                        type="button"
                        onClick={() => pushMemberDrawer(c.id_anggota)}
                        className="w-full min-h-touch p-2.5 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line flex items-center justify-between gap-2.5 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MemberAvatar
                            fileId={c.foto_file_id}
                            name={c.nama_lengkap}
                            gender={c.jenis_kelamin}
                            isLiving={c.status_hidup}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink truncate">{c.nama_lengkap}</p>
                            <p className="text-xs font-semibold text-muted">
                              {c.urutan_anak
                                ? t('profile.childOrder', { n: c.urutan_anak })
                                : formatKodeUnik(c.kode_unik)}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-faint shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!ayah && !ibu && !spouses.length && !children.length && (
                <p className="text-xs font-medium text-muted text-center py-2">
                  {t('drawer.noRelatives')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer Sticky */}
        {member && (
          <div className="p-3.5 border-t border-line bg-surface shrink-0 pb-safe">
            <Link
              to={`/profil/${member.id_anggota}`}
              onClick={() => closeMemberDrawer({ restore: false })}
              className="w-full min-h-cta px-4 rounded-full bg-side text-[var(--on-side)] hover:opacity-95 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
            >
              <span>{t('drawer.fullProfileBtn')}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
