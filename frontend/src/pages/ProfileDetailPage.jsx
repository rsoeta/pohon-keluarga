import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Calendar,
  Copy,
  Edit3,
  GitCompare,
  GitFork,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  Trash2,
  Users
} from 'lucide-react';
import { db } from '../db/dexie.js';
import { prefetchPhotos } from '../db/sync.js';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { useQuickUi } from '../contexts/QuickUiContext.jsx';
import { canDelete, canEditAnggota } from '../lib/rbac.js';
import { formatKodeUnik, formatTglLahir, formatWaUrl } from '../lib/format.js';
import { alertError, confirmAction, toastSuccess } from '../lib/swal.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';

export function ProfileDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isOnline, triggerSync } = useAuth();
  const { lang, t, translateError } = useI18n();
  const { openRelationModal } = useQuickUi();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);
  const [deleting, setDeleting] = useState(false);

  const activeMap = useMemo(() => {
    const m = new Map();
    for (const a of anggotaList) {
      if (a && !a.is_deleted) m.set(a.id_anggota, a);
    }
    return m;
  }, [anggotaList]);

  const member = activeMap.get(id) || null;
  const ayah = member?.id_ayah ? activeMap.get(member.id_ayah) || null : null;
  const ibu = member?.id_ibu ? activeMap.get(member.id_ibu) || null : null;

  const spouses = useMemo(() => {
    if (!member) return [];
    return (pernikahanList || [])
      .filter((m) => m && !m.is_deleted && (m.id_suami === id || m.id_istri === id))
      .map((m) => ({
        pernikahan: m,
        anggota: activeMap.get(m.id_suami === id ? m.id_istri : m.id_suami) || null
      }))
      .filter((x) => x.anggota)
      .sort((a, b) => (a.pernikahan.urutan_pasangan || 99) - (b.pernikahan.urutan_pasangan || 99));
  }, [member, pernikahanList, id, activeMap]);

  const children = useMemo(() => {
    if (!member) return [];
    return [...activeMap.values()]
      .filter((c) => c.id_ayah === id || c.id_ibu === id)
      .sort((a, b) => (a.urutan_anak || 99) - (b.urutan_anak || 99));
  }, [member, activeMap, id]);

  const canEdit = canEditAnggota(user, id, anggotaList, pernikahanList);
  const allowDelete = canDelete(user);

  // Prefetch foto profil + orang tua + pasangan + anak
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

  const handleCopy = async (val) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(String(val));
      toastSuccess(t('common.copySuccess'));
    } catch {
      // Fallback tidak tersedia di konteks non-HTTPS lama
    }
  };

  const handleDelete = async () => {
    if (!member || deleting) return;
    const ok = await confirmAction({
      title: t('profile.deleteConfirmTitle', { name: member.nama_lengkap }),
      text: t('profile.deleteConfirmBody'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.anggota.delete(member.id_anggota);
      await triggerSync({ forceFull: false, silent: true });
      toastSuccess(t('profile.deleteSuccess'));
      navigate('/daftar', { replace: true });
    } catch (err) {
      await alertError(t('profile.deleteBtn'), translateError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (!member) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate('/daftar')}
          className="min-h-touch px-4 rounded-full bg-surface border border-line text-sm font-bold text-ink inline-flex items-center gap-2 shadow-card"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <div className="bg-surface rounded-card border border-line p-8 text-center shadow-card">
          <h1 className="text-lg font-bold text-ink">{t('profile.notFoundTitle')}</h1>
          <p className="text-sm text-muted mt-1">{t('profile.notFoundDesc')}</p>
        </div>
      </div>
    );
  }

  const waUrl = formatWaUrl(member.no_wa);

  return (
    <div className="flex-1 flex flex-col gap-3.5">
      {/* Bar Atas: Kembali + 3 Aksi Cepat */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/daftar'))}
          className="min-h-ctl px-3.5 rounded-full bg-surface border border-line text-xs sm:text-sm font-bold text-ink inline-flex items-center gap-1.5 shadow-card hover:bg-surface-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => openRelationModal(member.id_anggota)}
            className="min-h-ctl px-3 rounded-full bg-heritage-50 dark:bg-heritage-950/40 border border-heritage-200 dark:border-heritage-800 text-heritage-800 dark:text-heritage-200 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>{t('directory.btnRelation')}</span>
          </button>

          <Link
            to={`/pohon?focus=${member.id_anggota}`}
            className="min-h-ctl px-3.5 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>{t('directory.btnTree')}</span>
          </Link>

          {canEdit && (
            <Link
              to={`/edit/${member.id_anggota}`}
              className="min-h-ctl px-3.5 rounded-full bg-side text-[var(--on-side)] hover:opacity-95 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t('profile.editBtn')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Split-View Grid Desktop: Identitas & Biodata (Kiri) + Relasi Keluarga (Kanan) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Kolom Kiri (5 cols): Identitas Profil + Biodata + Hapus Admin */}
        <div className="lg:col-span-5 flex flex-col min-w-0">
          <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card flex-1 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              {/* Header Identitas */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3.5">
                <MemberAvatar
                  fileId={member.foto_file_id}
                  name={member.nama_lengkap}
                  gender={member.jenis_kelamin}
                  isLiving={member.status_hidup}
                  size="xl"
                />

                <div className="min-w-0 flex-1 space-y-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-ink break-words leading-snug">
                    {member.nama_lengkap}
                  </h1>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(formatKodeUnik(member.kode_unik))}
                      title={t('profile.copyCode')}
                      className="min-h-ctl px-2.5 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink text-xs font-bold inline-flex items-center gap-1.5 font-mono"
                    >
                      <span>{formatKodeUnik(member.kode_unik)}</span>
                      <Copy className="w-3.5 h-3.5 text-muted" />
                    </button>

                    <span className="px-2.5 py-1 rounded-full bg-brand-100/80 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 text-xs font-bold">
                      {member.jenis_kelamin === 'L' ? t('common.male') : t('common.female')}
                    </span>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        member.status_hidup
                          ? 'bg-emerald-100/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                          : 'bg-surface-2 border border-line text-muted'
                      }`}
                    >
                      {member.status_hidup ? t('common.living') : t('common.deceased')}
                    </span>

                    {member.urutan_anak && (
                      <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-line text-muted text-xs font-bold">
                        {t('profile.childOrder', { n: member.urutan_anak })}
                      </span>
                    )}

                    {member.status_anak === 'Angkat' && (
                      <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-bold">
                        {t('common.adopted')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Biodata Ringkas */}
              <div className="pt-3.5 border-t border-line space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-tile bg-surface-2 border border-line flex items-start gap-2.5 min-w-0">
                    <Calendar className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[0.6875rem] font-bold text-faint">{t('profile.birthDate')}</p>
                      <p className="text-sm font-bold text-ink truncate">{formatTglLahir(member.tgl_lahir, lang)}</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-tile bg-surface-2 border border-line flex items-start gap-2.5 min-w-0">
                    <MapPin className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[0.6875rem] font-bold text-faint">{t('profile.domicile')}</p>
                      <p className="text-sm font-bold text-ink break-words">
                        {member.domisili || t('common.notSet')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-tile bg-surface-2 border border-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <MessageCircle className="w-4 h-4 text-wa shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[0.6875rem] font-bold text-faint">{t('profile.whatsapp')}</p>
                      <p className="text-sm font-bold text-ink truncate">
                        {member.no_wa ? `+${member.no_wa}` : t('common.notSet')}
                      </p>
                    </div>
                  </div>

                  {waUrl && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(`+${member.no_wa}`)}
                        aria-label={t('common.copySuccess')}
                        className="h-8 w-8 flex items-center justify-center rounded-full bg-surface border border-line text-ink hover:bg-[var(--well)]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-ctl px-3 rounded-full bg-wa hover:bg-wa-hover text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{t('profile.chatWa')}</span>
                      </a>
                    </div>
                  )}
                </div>

                {member.email && (
                  <div className="p-2.5 rounded-tile bg-surface-2 border border-line flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Mail className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[0.6875rem] font-bold text-faint">{t('profile.email')}</p>
                        <p className="text-sm font-bold text-ink truncate">{member.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(member.email)}
                      aria-label={t('common.copySuccess')}
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-surface border border-line text-ink hover:bg-[var(--well)] shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Hapus Data (Khusus Admin) */}
            {allowDelete && (
              <div className="pt-3 border-t border-line">
                <button
                  type="button"
                  disabled={deleting || !isOnline}
                  onClick={handleDelete}
                  className="w-full min-h-ctl px-4 rounded-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('profile.deleteBtn')}</span>
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Kolom Kanan (7 cols): Orang Tua + Pasangan + Anak */}
        <div className="lg:col-span-7 flex flex-col gap-3.5 min-w-0">
          {/* Baris Atas Kanan: Orang Tua & Pasangan berdampingan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Orang Tua */}
            <section className="bg-surface rounded-card border border-line p-4 shadow-card space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-faint flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-700 dark:text-brand-300" />
                <span>{t('profile.parentsSection')}</span>
              </h2>

              {!ayah && !ibu ? (
                <p className="text-sm text-muted">{t('profile.noParents')}</p>
              ) : (
                <div className="space-y-2">
                  {[
                    [ayah, t('profile.father')],
                    [ibu, t('profile.mother')]
                  ]
                    .filter(([p]) => Boolean(p))
                    .map(([p, role]) => (
                      <Link
                        key={p.id_anggota}
                        to={`/profil/${p.id_anggota}`}
                        className="min-h-touch p-2.5 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line flex items-center gap-2.5 transition-colors"
                      >
                        <MemberAvatar
                          fileId={p.foto_file_id}
                          name={p.nama_lengkap}
                          gender={p.jenis_kelamin}
                          isLiving={p.status_hidup}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.6875rem] font-bold uppercase text-brand-700 dark:text-brand-300">
                            {role}
                          </p>
                          <p className="text-sm font-bold text-ink truncate">{p.nama_lengkap}</p>
                        </div>
                      </Link>
                    ))}
                </div>
              )}
            </section>

            {/* Pasangan */}
            <section className="bg-surface rounded-card border border-line p-4 shadow-card space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-faint flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-500" />
                  <span>{t('profile.spousesSection')}</span>
                </h2>
                {canEdit && (user?.id_anggota === member.id_anggota || user?.role === 'Admin') && (
                  <Link
                    to={`/tambah?mode=pasangan&target=${member.id_anggota}`}
                    className="min-h-ctl px-2.5 rounded-full bg-brand-100/80 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 text-xs font-bold inline-flex items-center gap-1 hover:bg-brand-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('profile.addSpouse')}</span>
                  </Link>
                )}
              </div>

              {!spouses.length ? (
                <p className="text-sm text-muted">{t('profile.noSpouses')}</p>
              ) : (
                <div className="space-y-2">
                  {spouses.map(({ pernikahan, anggota }) => (
                    <Link
                      key={pernikahan.id_pernikahan}
                      to={`/profil/${anggota.id_anggota}`}
                      className="min-h-touch p-2.5 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MemberAvatar
                          fileId={anggota.foto_file_id}
                          name={anggota.nama_lengkap}
                          gender={anggota.jenis_kelamin}
                          isLiving={anggota.status_hidup}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink truncate">{anggota.nama_lengkap}</p>
                          <p className="text-xs font-semibold text-muted font-mono">#{anggota.kode_unik}</p>
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-surface border border-line text-[0.6875rem] font-bold text-ink">
                        {pernikahan.status_pernikahan}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Anak */}
          <section className="bg-surface rounded-card border border-line p-4 shadow-card flex-1 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-faint flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-700 dark:text-brand-300" />
                <span>
                  {t('profile.childrenSection')} ({children.length})
                </span>
              </h2>
              {canEdit && (user?.id_anggota === member.id_anggota || user?.role === 'Admin') && (
                <Link
                  to={`/tambah?mode=anak&target=${member.id_anggota}`}
                  className="min-h-ctl px-3 rounded-full bg-brand-100/80 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 text-xs font-bold inline-flex items-center gap-1 hover:bg-brand-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('profile.addChild')}</span>
                </Link>
              )}
            </div>

            {!children.length ? (
              <p className="text-sm text-muted">{t('profile.noChildren')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {children.map((c) => (
                  <Link
                    key={c.id_anggota}
                    to={`/profil/${c.id_anggota}`}
                    className="min-h-touch p-2.5 rounded-tile bg-surface-2 hover:bg-[var(--well)] border border-line flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MemberAvatar
                        fileId={c.foto_file_id}
                        name={c.nama_lengkap}
                        gender={c.jenis_kelamin}
                        isLiving={c.status_hidup}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink truncate">{c.nama_lengkap}</p>
                        <p className="text-xs font-semibold text-muted">
                          {c.urutan_anak ? t('profile.childOrder', { n: c.urutan_anak }) : `#${c.kode_unik}`}
                        </p>
                      </div>
                    </div>
                    {c.status_anak === 'Angkat' && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[0.65rem] font-bold">
                        {t('common.adopted')}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
