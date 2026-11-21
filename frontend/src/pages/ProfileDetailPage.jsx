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
import { canDelete, canEditAnggota } from '../lib/rbac.js';
import { formatKodeUnik, formatTglLahir, formatWaUrl } from '../lib/format.js';
import { alertError, confirmAction, toastSuccess } from '../lib/swal.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { RelationshipModal } from '../components/nasab/RelationshipModal.jsx';

export function ProfileDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isOnline, triggerSync } = useAuth();
  const { lang, t, translateError } = useI18n();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);
  const [deleting, setDeleting] = useState(false);
  const [showRelation, setShowRelation] = useState(false);

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
          className="min-h-touch px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('profile.notFoundTitle')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('profile.notFoundDesc')}
          </p>
        </div>
      </div>
    );
  }

  const waUrl = formatWaUrl(member.no_wa);

  return (
    <div className="space-y-4">
      {/* Bar Atas: Kembali + 3 Aksi Cepat */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/daftar'))}
          className="min-h-touch px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRelation(true)}
            className="min-h-touch px-3.5 rounded-xl bg-heritage-50 dark:bg-heritage-950/40 border border-heritage-200 dark:border-heritage-800 text-heritage-800 dark:text-heritage-200 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <GitCompare className="w-4 h-4" />
            <span>{t('directory.btnRelation')}</span>
          </button>

          <Link
            to={`/pohon?focus=${member.id_anggota}`}
            className="min-h-touch px-3.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
          >
            <GitFork className="w-4 h-4" />
            <span>{t('directory.btnTree')}</span>
          </Link>

          {canEdit && (
            <Link
              to={`/edit/${member.id_anggota}`}
              className="min-h-touch px-3.5 rounded-xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Edit3 className="w-4 h-4" />
              <span>{t('profile.editBtn')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Header Profil */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <MemberAvatar
            fileId={member.foto_file_id}
            name={member.nama_lengkap}
            gender={member.jenis_kelamin}
            isLiving={member.status_hidup}
            size="xl"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white break-words">
              {member.nama_lengkap}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(formatKodeUnik(member.kode_unik))}
                title={t('profile.copyCode')}
                className="min-h-touch px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <span>{formatKodeUnik(member.kode_unik)}</span>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              </button>

              <span className="px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 text-xs font-bold">
                {member.jenis_kelamin === 'L' ? t('common.male') : t('common.female')}
              </span>

              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                  member.status_hidup
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {member.status_hidup ? t('common.living') : t('common.deceased')}
              </span>

              {member.urutan_anak && (
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                  {t('profile.childOrder', { n: member.urutan_anak })}
                </span>
              )}

              {member.status_anak === 'Angkat' && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-bold">
                  {t('common.adopted')}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Biodata */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {t('profile.birthDate')}
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {formatTglLahir(member.tgl_lahir, lang)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <MapPin className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {t('profile.domicile')}
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white break-words">
              {member.domisili || t('common.notSet')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <MessageCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {t('profile.whatsapp')}
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {member.no_wa ? `+${member.no_wa}` : t('common.notSet')}
              </p>
            </div>
          </div>

          {waUrl && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(`+${member.no_wa}`)}
                aria-label={t('common.copySuccess')}
                className="min-h-touch min-w-touch flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-touch px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t('profile.chatWa')}</span>
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Orang Tua */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <span>{t('profile.parentsSection')}</span>
        </h2>

        {!ayah && !ibu ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('profile.noParents')}</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {[
              [ayah, t('profile.father')],
              [ibu, t('profile.mother')]
            ]
              .filter(([p]) => Boolean(p))
              .map(([p, role]) => (
                <Link
                  key={p.id_anggota}
                  to={`/profil/${p.id_anggota}`}
                  className="flex-1 min-w-[12rem] min-h-touch p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-brand-50 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"
                >
                  <MemberAvatar
                    fileId={p.foto_file_id}
                    name={p.nama_lengkap}
                    gender={p.jenis_kelamin}
                    isLiving={p.status_hidup}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-bold uppercase text-brand-700 dark:text-brand-400">
                      {role}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {p.nama_lengkap}
                    </p>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </section>

      {/* Pasangan */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            <span>{t('profile.spousesSection')}</span>
          </h2>
          {canEdit && (user?.id_anggota === member.id_anggota || user?.role === 'Admin') && (
            <Link
              to={`/tambah?mode=pasangan&target=${member.id_anggota}`}
              className="min-h-touch px-3 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 text-xs font-bold inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>{t('profile.addSpouse')}</span>
            </Link>
          )}
        </div>

        {!spouses.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('profile.noSpouses')}</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {spouses.map(({ pernikahan, anggota }) => (
              <Link
                key={pernikahan.id_pernikahan}
                to={`/profil/${anggota.id_anggota}`}
                className="flex-1 min-w-[12rem] min-h-touch p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-brand-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MemberAvatar
                    fileId={anggota.foto_file_id}
                    name={anggota.nama_lengkap}
                    gender={anggota.jenis_kelamin}
                    isLiving={anggota.status_hidup}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {anggota.nama_lengkap}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      #{anggota.kode_unik}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[0.7rem] font-bold text-slate-700 dark:text-slate-200">
                  {pernikahan.status_pernikahan}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Anak */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <span>
              {t('profile.childrenSection')} ({children.length})
            </span>
          </h2>
          {canEdit && (user?.id_anggota === member.id_anggota || user?.role === 'Admin') && (
            <Link
              to={`/tambah?mode=anak&target=${member.id_anggota}`}
              className="min-h-touch px-3 rounded-xl bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 text-xs font-bold inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>{t('profile.addChild')}</span>
            </Link>
          )}
        </div>

        {!children.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('profile.noChildren')}</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {children.map((c) => (
              <Link
                key={c.id_anggota}
                to={`/profil/${c.id_anggota}`}
                className="flex-1 min-w-[12rem] min-h-touch p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-brand-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MemberAvatar
                    fileId={c.foto_file_id}
                    name={c.nama_lengkap}
                    gender={c.jenis_kelamin}
                    isLiving={c.status_hidup}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {c.nama_lengkap}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {c.urutan_anak ? t('profile.childOrder', { n: c.urutan_anak }) : `#${c.kode_unik}`}
                    </p>
                  </div>
                </div>
                {c.status_anak === 'Angkat' && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[0.65rem] font-bold">
                    {t('common.adopted')}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Hapus Data (Khusus Admin) */}
      {allowDelete && (
        <div className="pt-2">
          <button
            type="button"
            disabled={deleting || !isOnline}
            onClick={handleDelete}
            className="w-full min-h-touch px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('profile.deleteBtn')}</span>
          </button>
        </div>
      )}

      <RelationshipModal
        isOpen={showRelation}
        targetId={member.id_anggota}
        onClose={() => setShowRelation(false)}
      />
    </div>
  );
}
