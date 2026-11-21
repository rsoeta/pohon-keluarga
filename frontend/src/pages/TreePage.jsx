import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowUp,
  Compass,
  FileDown,
  GitFork,
  LocateFixed,
  Minus,
  Plus,
  RefreshCw,
  Rows3,
  Columns3,
  UserPlus
} from 'lucide-react';
import { db } from '../db/dexie.js';
import { prefetchPhotos } from '../db/sync.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { computeTreeLayout, pickDefaultFocusId } from '../lib/treeLayout.js';
import { canEditAnggota, isAdmin } from '../lib/rbac.js';
import { extractBirthYear, formatKodeUnik } from '../lib/format.js';
import { chooseTwoActions, selectOption, toastError, toastSuccess } from '../lib/swal.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';

const MIN_SCALE = 0.35;
const MAX_SCALE = 1.8;

function clampScale(s) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(s.toFixed(3))));
}

export function TreePage() {
  const { user, isOnline, syncing, triggerSync } = useAuth();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);
  const metaPengaturan = useLiveQuery(() => db.meta.get('pengaturan'), [], null);

  const [orientation, setOrientation] = useState('vertical');
  const [maxGenerations, setMaxGenerations] = useState(4);
  const [scale, setScale] = useState(0.9);
  const [pan, setPan] = useState({ x: 16, y: 16 });
  const [exporting, setExporting] = useState(false);

  const viewportRef = useRef(null);
  const pointersRef = useRef(new Map());
  const dragMovedRef = useRef(false);
  const pinchStartRef = useRef(null);

  const pengaturan = metaPengaturan?.value || {};
  const paramFocus = searchParams.get('focus') || '';

  const defaultFocusId = useMemo(
    () => pickDefaultFocusId(anggotaList, pernikahanList, user, pengaturan),
    [anggotaList, pernikahanList, user, pengaturan]
  );

  const activeFocusId = useMemo(() => {
    if (paramFocus && anggotaList.some((a) => !a.is_deleted && a.id_anggota === paramFocus)) {
      return paramFocus;
    }
    return defaultFocusId;
  }, [paramFocus, anggotaList, defaultFocusId]);

  const layout = useMemo(
    () =>
      computeTreeLayout(anggotaList, pernikahanList, {
        focusId: activeFocusId,
        orientation,
        maxGenerations
      }),
    [anggotaList, pernikahanList, activeFocusId, orientation, maxGenerations]
  );

  const editableIds = useMemo(() => {
    const s = new Set();
    for (const node of layout.nodes) {
      if (canEditAnggota(user, node.id_anggota, anggotaList, pernikahanList)) {
        s.add(node.id_anggota);
      }
    }
    return s;
  }, [layout.nodes, user, anggotaList, pernikahanList]);

  // Prefetch foto profil node yang tampil di kanvas
  useEffect(() => {
    if (!isOnline || !layout.nodes.length) return;
    const ids = layout.nodes.map((n) => n.person.foto_file_id).filter(Boolean);
    if (ids.length) prefetchPhotos(ids).catch(() => {});
  }, [isOnline, layout.nodes]);

  const fitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !layout.width || !layout.height) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const fitScale = clampScale(Math.min(vw / (layout.width + 24), vh / (layout.height + 24), 1));
    const cx = Math.max(12, (vw - layout.width * fitScale) / 2);
    const cy = Math.max(12, Math.min(32, (vh - layout.height * fitScale) / 2));
    setScale(fitScale);
    setPan({ x: cx, y: cy });
  }, [layout.width, layout.height]);

  useEffect(() => {
    fitView();
  }, [fitView, activeFocusId, orientation, maxGenerations]);

  const setFocus = (id) => {
    if (!id) return;
    setSearchParams({ focus: id });
  };

  // Pan & Pinch-to-Zoom via Pointer Events
  const handlePointerDown = (e) => {
    if (e.target.closest('button, a')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      dragMovedRef.current = false;
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pinchStartRef.current = { dist, scale };
    }
  };

  const handlePointerMove = (e) => {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, next);

    if (pointersRef.current.size === 1) {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMovedRef.current = true;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const ratio = dist / pinchStartRef.current.dist;
      setScale(clampScale(pinchStartRef.current.scale * ratio));
    }
  };

  const handlePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
  };

  const zoomBy = (delta) => {
    setScale((prev) => clampScale(prev + delta));
  };

  const handleWheel = (e) => {
    if (!layout.nodes.length) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    zoomBy(step);
  };

  const handleQuickAdd = async (person) => {
    const isSelf = user?.id_anggota === person.id_anggota;
    if (!isAdmin(user) && !isSelf) {
      // Non-admin bisa menambah anak untuk dirinya atau via profil sendiri
      navigate(`/tambah?mode=anak&target=${person.id_anggota}`);
      return;
    }

    const choice = await chooseTwoActions({
      title: t('tree.quickAddTitle', { name: person.nama_lengkap }),
      primaryText: t('tree.addChildChoice'),
      secondaryText: t('tree.addSpouseChoice'),
      cancelText: t('common.cancel')
    });
    if (choice === 'primary') {
      navigate(`/tambah?mode=anak&target=${person.id_anggota}`);
    } else if (choice === 'secondary') {
      navigate(`/tambah?mode=pasangan&target=${person.id_anggota}`);
    }
  };

  const handleExportPdf = async () => {
    if (!layout.nodes.length || exporting) return;
    const picked = await selectOption({
      title: t('tree.exportPdfTitle'),
      options: {
        'a4:3': `${t('tree.paperA4')} · ${t('tree.generations', { n: 3 })}`,
        'a4:4': `${t('tree.paperA4')} · ${t('tree.generations', { n: 4 })}`,
        'a3:3': `${t('tree.paperA3')} · ${t('tree.generations', { n: 3 })}`,
        'a3:4': `${t('tree.paperA3')} · ${t('tree.generations', { n: 4 })}`
      },
      initialValue: `a4:${maxGenerations}`,
      confirmText: t('tree.exportPdf'),
      cancelText: t('common.cancel')
    });
    if (!picked) return;

    const [paper, genStr] = picked.split(':');
    setExporting(true);
    try {
      const pdfLayout =
        Number(genStr) === layout.maxGenerations
          ? layout
          : computeTreeLayout(anggotaList, pernikahanList, {
              focusId: activeFocusId,
              orientation,
              maxGenerations: Number(genStr)
            });

      const { exportTreeToPdf } = await import('../lib/pdfExport.js');
      exportTreeToPdf(pdfLayout, {
        familyName: pengaturan?.nama_keluarga || t('app.name'),
        paper,
        lang
      });
      toastSuccess(t('tree.exportSuccess'));
    } catch {
      toastError(t('errors.INTERNAL_ERROR'));
    } finally {
      setExporting(false);
    }
  };

  if (!anggotaList.length || !layout.nodes.length) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 text-center shadow-sm space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center">
          <GitFork className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('tree.emptyTitle')}</h1>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {t('tree.emptyDesc')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/tambah"
            className="min-h-touch px-5 py-2.5 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm inline-flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('tree.addMember')}</span>
          </Link>
          <button
            type="button"
            disabled={syncing || !isOnline}
            onClick={() => triggerSync({ forceFull: true })}
            className="min-h-touch px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{t('sync.syncNow')}</span>
          </button>
        </div>
      </div>
    );
  }

  const canGoUpParent = Boolean(layout.parentsOfFocus?.ayah || layout.parentsOfFocus?.ibu);

  return (
    <div className="space-y-3">
      {/* Bar Kontrol Atas — Fluid Flexbox tanpa horizontal scroll */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Sakelar Menurun / Mendatar */}
        <div className="inline-flex rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setOrientation('vertical')}
            className={`min-h-touch px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              orientation === 'vertical'
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Rows3 className="w-4 h-4" />
            <span>{t('tree.vertical')}</span>
          </button>
          <button
            type="button"
            onClick={() => setOrientation('horizontal')}
            className={`min-h-touch px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              orientation === 'horizontal'
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Columns3 className="w-4 h-4" />
            <span>{t('tree.horizontal')}</span>
          </button>
        </div>

        {/* Kedalaman Generasi & Navigasi Fokus */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 shadow-sm">
            {[3, 4].map((gen) => (
              <button
                key={gen}
                type="button"
                onClick={() => setMaxGenerations(gen)}
                className={`min-h-touch px-3 rounded-lg text-xs font-bold transition-colors ${
                  maxGenerations === gen
                    ? 'bg-heritage-500 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {gen}G
              </button>
            ))}
          </div>

          {canGoUpParent && (
            <button
              type="button"
              onClick={() =>
                setFocus(layout.parentsOfFocus.ayah?.id_anggota || layout.parentsOfFocus.ibu?.id_anggota)
              }
              className="min-h-touch px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ArrowUp className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>{t('tree.upToParent')}</span>
            </button>
          )}

          {user?.id_anggota && activeFocusId !== user.id_anggota && (
            <button
              type="button"
              onClick={() => setFocus(user.id_anggota)}
              className="min-h-touch px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-brand-700 dark:text-brand-300 shadow-sm flex items-center gap-1.5 hover:bg-brand-50 dark:hover:bg-slate-800"
            >
              <Compass className="w-4 h-4" />
              <span>{t('tree.myProfile')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Kanvas Bagan Silsilah Interaktif */}
      <div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className="relative w-full h-[calc(100dvh-14.5rem)] min-h-[24rem] rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)',
          backgroundSize: '22px 22px'
        }}
      >
        {/* Layer Transform Pan & Zoom */}
        <div
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            transformOrigin: '0 0'
          }}
          className="relative"
        >
          {/* Konektor SVG */}
          <svg
            width={layout.width}
            height={layout.height}
            className="absolute inset-0 pointer-events-none"
          >
            {layout.childEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke={edge.isAngkat ? '#d97706' : '#94a3b8'}
                strokeWidth={2}
                strokeDasharray={edge.isAngkat ? '6 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {layout.marriageEdges.map((mEdge) => (
              <path
                key={mEdge.id}
                d={mEdge.path}
                fill="none"
                stroke={
                  mEdge.status === 'Cerai'
                    ? '#e11d48'
                    : mEdge.status === 'Wafat'
                    ? '#64748b'
                    : '#0f766e'
                }
                strokeWidth={2.4}
                strokeDasharray={mEdge.status === 'Cerai' ? '5 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {/* Kartu Anggota */}
          {layout.nodes.map((node) => {
            const p = node.person;
            const birthYear = extractBirthYear(p.tgl_lahir);
            const canAdd =
              !node.isDuplicateRef &&
              (isAdmin(user) || user?.id_anggota === p.id_anggota || editableIds.has(p.id_anggota));
            const borderAccent =
              p.jenis_kelamin === 'L' ? 'border-l-brand-600' : 'border-l-rose-500';

            return (
              <div
                key={node.key}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height
                }}
                onClick={() => {
                  if (!dragMovedRef.current) navigate(`/profil/${p.id_anggota}`);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/profil/${p.id_anggota}`);
                }}
                className={`absolute rounded-2xl border border-l-4 ${borderAccent} p-2.5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                  node.isFocus
                    ? 'bg-brand-50/95 dark:bg-brand-950/60 border-brand-500 ring-2 ring-brand-500/30'
                    : !p.status_hidup
                    ? 'bg-slate-100/95 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MemberAvatar
                    fileId={p.foto_file_id}
                    name={p.nama_lengkap}
                    gender={p.jenis_kelamin}
                    isLiving={p.status_hidup}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-snug">
                      {p.nama_lengkap}
                    </p>
                    <p className="text-[0.65rem] font-semibold text-slate-500 dark:text-slate-400 truncate">
                      {formatKodeUnik(p.kode_unik)}
                      {birthYear ? ` · ${birthYear}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 pt-1">
                  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                    {!p.status_hidup && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[0.6rem] font-bold truncate">
                        {lang === 'en' ? 'Dec.' : 'Alm.'}
                      </span>
                    )}
                    {p.status_anak === 'Angkat' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[0.6rem] font-bold truncate">
                        {lang === 'en' ? 'Adopted' : 'Angkat'}
                      </span>
                    )}
                    {node.marriageStatus && node.marriageStatus !== 'Aktif' && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[0.6rem] font-bold truncate">
                        {node.marriageStatus}
                      </span>
                    )}
                    {node.isDuplicateRef && (
                      <span
                        title={t('tree.duplicateRef')}
                        className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 text-[0.6rem] font-bold"
                      >
                        ↔
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!node.isFocus && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocus(p.id_anggota);
                        }}
                        title={t('tree.focusHere')}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-brand-100 dark:hover:bg-brand-900/50 text-slate-700 dark:text-slate-200 text-[0.65rem] font-bold"
                      >
                        <LocateFixed className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canAdd && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickAdd(p);
                        }}
                        title={t('tree.addMember')}
                        className="px-2 py-1 rounded-lg bg-brand-700 hover:bg-brand-800 text-white text-[0.65rem] font-bold"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info Ringkas & Legenda (Kiri Bawah) */}
        <div className="absolute bottom-3 left-3 z-20 pointer-events-none hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-300 shadow-sm">
          <span>{t('tree.nodesShown', { n: layout.totalNodes })}</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-0.5 bg-slate-400 inline-block" />
            {t('tree.legendBiological')}
          </span>
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <span className="w-4 border-t-2 border-dashed border-amber-600 inline-block" />
            {t('tree.legendAdopted')}
          </span>
        </div>

        {/* Kontrol Melayang (Kanan Bawah): Ekspor PDF + Zoom */}
        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting}
            aria-label={t('tree.exportPdf')}
            className="min-h-touch px-3.5 rounded-2xl bg-brand-700 hover:bg-brand-800 active:scale-95 text-white shadow-lg shadow-brand-700/25 flex items-center gap-2 text-xs font-bold transition-all"
          >
            <FileDown className="w-4 h-4 shrink-0" />
            <span>{t('tree.exportPdf')}</span>
          </button>

          <div className="inline-flex items-center rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-lg p-1">
            <button
              type="button"
              onClick={() => zoomBy(-0.15)}
              aria-label={t('tree.zoomOut')}
              className="min-h-touch min-w-touch flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={fitView}
              title={t('tree.resetView')}
              className="min-h-touch px-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl tabular-nums"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              onClick={() => zoomBy(0.15)}
              aria-label={t('tree.zoomIn')}
              className="min-h-touch min-w-touch flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
