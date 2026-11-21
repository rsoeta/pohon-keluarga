import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUpDown, GitCompare, Heart, X } from 'lucide-react';
import { db } from '../../db/dexie.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { findRelationshipLocal } from '../../lib/nasabClient.js';
import { formatKodeUnik } from '../../lib/format.js';
import { MemberAvatar } from '../common/MemberAvatar.jsx';

export function RelationshipModal({ isOpen, onClose, targetId = '', initialFromId = '' }) {
  const { user } = useAuth();
  const { lang, t } = useI18n();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);

  const activeMembers = useMemo(
    () =>
      (anggotaList || [])
        .filter((a) => a && !a.is_deleted)
        .sort((a, b) => String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''))),
    [anggotaList]
  );

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const myId =
      initialFromId && activeMembers.some((a) => a.id_anggota === initialFromId)
        ? initialFromId
        : user?.id_anggota && activeMembers.some((a) => a.id_anggota === user.id_anggota)
        ? user.id_anggota
        : activeMembers.find((a) => a.id_anggota !== targetId)?.id_anggota ||
          activeMembers[0]?.id_anggota ||
          '';
    setFromId(myId);
    setToId(targetId || activeMembers[0]?.id_anggota || '');
  }, [isOpen, initialFromId, targetId, user?.id_anggota, activeMembers]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const result = useMemo(() => {
    if (!isOpen || !fromId || !toId) return null;
    return findRelationshipLocal(anggotaList, pernikahanList, fromId, toId);
  }, [isOpen, fromId, toId, anggotaList, pernikahanList]);

  if (!isOpen) return null;

  const swapDirection = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const mainLabel = result ? (lang === 'en' ? result.label_en : result.label_id) : '-';
  const bloodLabel = result?.also_blood
    ? lang === 'en'
      ? result.also_blood.label_en
      : result.also_blood.label_id
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nasab-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#081513]/55 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col bg-raised rounded-t-[26px] sm:rounded-card border border-line shadow-float overflow-hidden palette-enter">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line bg-surface flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare className="w-5 h-5 text-brand-700 dark:text-brand-300 shrink-0" />
            <h2
              id="nasab-modal-title"
              className="text-base font-bold text-ink truncate"
            >
              {t('nasab.title')}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="min-h-touch min-w-touch flex items-center justify-center rounded-full text-muted hover:bg-[var(--well)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Konten Scrollable */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Pemilih Profil Dari & Ke */}
          <div className="space-y-2.5">
            <div>
              <label className="block text-xs font-bold text-muted mb-1">
                {t('nasab.fromLabel')}
              </label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
              >
                {activeMembers.map((a) => (
                  <option key={a.id_anggota} value={a.id_anggota}>
                    {a.nama_lengkap} ({formatKodeUnik(a.kode_unik)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-bold text-muted mb-1">
                  {t('nasab.toLabel')}
                </label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                >
                  {activeMembers.map((a) => (
                    <option key={a.id_anggota} value={a.id_anggota}>
                      {a.nama_lengkap} ({formatKodeUnik(a.kode_unik)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={swapDirection}
                title={t('nasab.swapBtn')}
                aria-label={t('nasab.swapBtn')}
                className="mt-5 min-h-touch min-w-touch flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink shrink-0"
              >
                <ArrowUpDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Kartu Kesimpulan */}
          {result && (
            <div
              className={`rounded-tile p-4 border ${
                result.found
                  ? 'bg-brand-50/90 dark:bg-brand-950/50 border-brand-200 dark:border-brand-800'
                  : 'bg-surface-2 border-line'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  {t('nasab.conclusionLabel')}
                </span>
                {result.found && (
                  <span className="px-2.5 py-0.5 rounded-full bg-surface text-xs font-bold text-muted border border-line">
                    {t('nasab.stepsCount', { n: result.distance })}
                  </span>
                )}
              </div>

              <p className="text-xl sm:text-2xl font-bold text-ink mt-1.5 break-words">
                {mainLabel}
              </p>

              {result.has_angkat && (
                <span className="mt-2 inline-block px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-bold">
                  {t('common.adopted')}
                </span>
              )}

              {result.also_blood && (
                <p className="mt-2 text-xs font-bold text-heritage-800 dark:text-heritage-300">
                  {t('nasab.alsoBloodNote', {
                    label: bloodLabel,
                    steps: result.also_blood.distance
                  })}
                </p>
              )}

              {!result.found && (
                <p className="mt-1.5 text-xs font-medium text-muted">
                  {t('nasab.notConnectedDesc')}
                </p>
              )}
            </div>
          )}

          {/* Diagram Vertikal Jalur Kekerabatan */}
          {result && result.found && result.nodes.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-faint mb-2">
                {t('nasab.pathTitle')}
              </p>

              {result.nodes.map((node, idx) => {
                const edge = idx < result.edges.length ? result.edges[idx] : null;
                const isLca =
                  result.lca_id &&
                  result.lca_id === node.id_anggota &&
                  result.distance >= 2 &&
                  idx > 0 &&
                  idx < result.nodes.length - 1;

                return (
                  <div key={`${node.id_anggota}_${idx}`} className="flex flex-col items-stretch">
                    <Link
                      to={`/profil/${node.id_anggota}`}
                      onClick={() => onClose?.()}
                      className={`min-h-touch p-3 rounded-tile border flex items-center gap-3 transition-colors ${
                        idx === 0 || idx === result.nodes.length - 1
                          ? 'bg-surface border-brand-400 dark:border-brand-700 shadow-sm'
                          : 'bg-surface-2 border-line hover:bg-[var(--well)]'
                      }`}
                    >
                      <MemberAvatar
                        fileId={node.foto_file_id}
                        name={node.nama_lengkap}
                        gender={node.jenis_kelamin}
                        isLiving={node.status_hidup}
                        size="md"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink truncate">
                          {node.nama_lengkap}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[0.7rem] font-semibold">
                          <span className="text-muted font-mono">
                            {formatKodeUnik(node.kode_unik)}
                          </span>
                          {!node.status_hidup && (
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-line text-muted">
                              ({t('common.deceased')})
                            </span>
                          )}
                          {node.status_anak === 'Angkat' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
                              ({t('common.adopted')})
                            </span>
                          )}
                          {isLca && (
                            <span className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-200">
                              {t('nasab.commonAncestor')}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>

                    {edge && (
                      <div className="py-1.5 flex items-center justify-center gap-2">
                        <span
                          className={`h-6 border-l-2 ${
                            edge.is_angkat
                              ? 'border-dashed border-amber-500'
                              : edge.dir === 'SPOUSE'
                              ? 'border-rose-400'
                              : 'border-brand-400'
                          }`}
                        />
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                            edge.is_angkat
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                              : edge.dir === 'SPOUSE'
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                              : 'bg-surface-2 border border-line text-ink'
                          }`}
                        >
                          {edge.dir === 'SPOUSE' ? (
                            <Heart className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )}
                          <span>{lang === 'en' ? edge.label_en : edge.label_id}</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
