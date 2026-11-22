import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowUp,
  ChevronDown,
  Compass,
  FileDown,
  GitFork,
  Layers,
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
import { useQuickUi } from '../contexts/QuickUiContext.jsx';
import { computeTreeLayout, pickDefaultFocusId, TREE_GENERATION_OPTIONS } from '../lib/treeLayout.js';
import { canEditAnggota, isAdmin } from '../lib/rbac.js';
import { extractBirthYear, formatKodeUnik } from '../lib/format.js';
import { chooseTwoActions, selectOption, toastError, toastSuccess } from '../lib/swal.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';

const MIN_SCALE = 0.2;
const MAX_SCALE = 1.8;
const DRAG_THRESHOLD_PX = 6;
const MOBILE_TABLET_MQ = '(max-width: 1024px)';

function getDefaultTreeOrientation() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'vertical';
  }
  return window.matchMedia(MOBILE_TABLET_MQ).matches ? 'horizontal' : 'vertical';
}

function clampScale(s) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(s.toFixed(3))));
}

export function TreePage() {
  const { user, isOnline, syncing, triggerSync } = useAuth();
  const { lang, t } = useI18n();
  const { openMemberDrawer } = useQuickUi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);
  const metaPengaturan = useLiveQuery(() => db.meta.get('pengaturan'), [], null);

  const [orientation, setOrientationState] = useState(getDefaultTreeOrientation);
  const [maxGenerations, setMaxGenerations] = useState(4);
  const [scale, setScale] = useState(0.9);
  const [pan, setPan] = useState({ x: 16, y: 16 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const viewportRef = useRef(null);
  const manualOrientationRef = useRef(false);
  const pointersRef = useRef(new Map());
  const dragMovedRef = useRef(false);
  const pinchStartRef = useRef(null);
  const capturedPointerIdRef = useRef(null);
  const suppressClickUntilRef = useRef(0);

  const handleOrientationChange = useCallback((next) => {
    manualOrientationRef.current = true;
    setOrientationState(next);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(MOBILE_TABLET_MQ);
    const onMediaChange = (e) => {
      if (!manualOrientationRef.current) {
        setOrientationState(e.matches ? 'horizontal' : 'vertical');
      }
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onMediaChange);
      return () => mq.removeEventListener('change', onMediaChange);
    }
    mq.addListener(onMediaChange);
    return () => mq.removeListener(onMediaChange);
  }, []);

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

  // Bersihkan pointer & status interaksi kanvas setelah drag/zoom berakhir
  const clearPointerState = useCallback((pointerId) => {
    const hadPointer = pointersRef.current.delete(pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) {
      if (hadPointer && dragMovedRef.current) {
        suppressClickUntilRef.current = Date.now() + 120;
      }
      dragMovedRef.current = false;
      setIsInteracting(false);
    }
  }, []);

  // Pan & Pinch-to-Zoom via Pointer Events (capture ditunda hingga drag melewati ambang agar klik kartu di desktop bekerja)
  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, a')) return;
    pointersRef.current.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY
    });
    if (pointersRef.current.size === 1) {
      dragMovedRef.current = false;
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      dragMovedRef.current = true;
      setIsInteracting(true);
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pinchStartRef.current = { dist, scale };
    }
  };

  const handlePointerMove = (e) => {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      handlePointerUp(e);
      return;
    }
    const nextX = e.clientX;
    const nextY = e.clientY;

    if (pointersRef.current.size === 1) {
      if (!dragMovedRef.current) {
        if (Math.hypot(nextX - prev.startX, nextY - prev.startY) <= DRAG_THRESHOLD_PX) return;
        dragMovedRef.current = true;
        setIsInteracting(true);
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          capturedPointerIdRef.current = e.pointerId;
        } catch {
          // Abaikan jika browser menolak capture pada pointer ini
        }
      }
      const dx = nextX - prev.x;
      const dy = nextY - prev.y;
      pointersRef.current.set(e.pointerId, { ...prev, x: nextX, y: nextY });
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (pointersRef.current.size === 2 && pinchStartRef.current) {
      pointersRef.current.set(e.pointerId, { ...prev, x: nextX, y: nextY });
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const ratio = dist / pinchStartRef.current.dist;
      setScale(clampScale(pinchStartRef.current.scale * ratio));
    }
  };

  const handlePointerUp = (e) => {
    if (capturedPointerIdRef.current === e.pointerId) {
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }
      } catch {
        // Abaikan jika capture sudah dilepas
      }
      capturedPointerIdRef.current = null;
    }
    clearPointerState(e.pointerId);
  };

  const handlePointerLeave = (e) => {
    if (e.pointerType === 'mouse' && capturedPointerIdRef.current !== e.pointerId && !dragMovedRef.current) {
      pointersRef.current.delete(e.pointerId);
    }
  };

  const handleLostPointerCapture = (e) => {
    if (capturedPointerIdRef.current === e.pointerId) {
      capturedPointerIdRef.current = null;
    }
    clearPointerState(e.pointerId);
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
    const pdfOptions = {};
    for (const [paperKey, labelKey] of [
      ['a4', 'tree.paperA4'],
      ['a3', 'tree.paperA3']
    ]) {
      for (const gen of TREE_GENERATION_OPTIONS) {
        pdfOptions[`${paperKey}:${gen}`] = `${t(labelKey)} · ${t('tree.generations', { n: gen })}`;
      }
    }

    const picked = await selectOption({
      title: t('tree.exportPdfTitle'),
      options: pdfOptions,
      initialValue: `${maxGenerations >= 5 ? 'a3' : 'a4'}:${maxGenerations}`,
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
      <div className="bg-surface rounded-card border border-line p-6 sm:p-10 text-center shadow-card space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center">
          <GitFork className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-ink">{t('tree.emptyTitle')}</h1>
        <p className="text-sm font-medium text-muted max-w-md mx-auto">
          {t('tree.emptyDesc')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          <Link
            to="/tambah"
            className="min-h-cta px-4 py-2 rounded-full bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm inline-flex items-center gap-2 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('tree.addMember')}</span>
          </Link>
          <button
            type="button"
            disabled={syncing || !isOnline}
            onClick={() => triggerSync({ forceFull: true })}
            className="min-h-touch px-4 py-2 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
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
    <div className="flex-1 flex flex-col gap-3">
      {/* Bar Kontrol Atas — Fluid Flexbox tanpa horizontal scroll */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Sakelar Menurun / Mendatar dengan indikator pill bergeser */}
        <SegmentedPillControl
          value={orientation}
          onChange={handleOrientationChange}
          tone="brand"
          options={[
            { value: 'vertical', label: t('tree.vertical'), icon: Rows3 },
            { value: 'horizontal', label: t('tree.horizontal'), icon: Columns3 }
          ]}
        />

        {/* Kedalaman Generasi & Navigasi Fokus */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Pemilih Generasi Ringkas di Mobile (< 640px) agar tetap 1 baris dan rapi */}
          <div className="relative inline-flex sm:hidden items-center rounded-[20px] bg-surface border border-line p-0.5 shadow-card">
            <div className="relative inline-flex items-center gap-1 min-h-ctl pl-2.5 pr-2 py-1 rounded-full bg-heritage-700 text-white text-xs font-bold shadow-sm focus-within:ring-2 focus-within:ring-brand-500">
              <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{maxGenerations}G</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-90" aria-hidden="true" />
              <select
                aria-label={t('tree.generations', { n: maxGenerations })}
                value={maxGenerations}
                onChange={(e) => setMaxGenerations(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {TREE_GENERATION_OPTIONS.map((gen) => (
                  <option key={gen} value={gen} className="bg-surface text-ink">
                    {t('tree.generations', { n: gen })} ({gen}G)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pemilih Generasi Sliding Pill di Tablet & Desktop (>= 640px) */}
          <div className="hidden sm:inline-flex">
            <SegmentedPillControl
              value={maxGenerations}
              onChange={setMaxGenerations}
              tone="heritage"
              ariaLabel={t('tree.generations', { n: maxGenerations })}
              className="flex-nowrap"
              buttonClassName="px-2.5"
              options={TREE_GENERATION_OPTIONS.map((gen) => ({ value: gen, label: `${gen}G` }))}
            />
          </div>

          {canGoUpParent && (
            <button
              type="button"
              onClick={() =>
                setFocus(layout.parentsOfFocus.ayah?.id_anggota || layout.parentsOfFocus.ibu?.id_anggota)
              }
              className="min-h-ctl px-3 rounded-full bg-surface border border-line text-xs font-bold text-ink shadow-card flex items-center gap-1.5 hover:bg-[var(--well)]"
            >
              <ArrowUp className="w-3.5 h-3.5 text-brand-700 dark:text-brand-300" />
              <span>{t('tree.upToParent')}</span>
            </button>
          )}

          {user?.id_anggota && activeFocusId !== user.id_anggota && (
            <button
              type="button"
              onClick={() => setFocus(user.id_anggota)}
              className="min-h-ctl px-3 rounded-full bg-surface border border-line text-xs font-bold text-brand-700 dark:text-brand-300 shadow-card flex items-center gap-1.5 hover:bg-brand-50 dark:hover:bg-brand-950/60"
            >
              <Compass className="w-3.5 h-3.5" />
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
        onPointerLeave={handlePointerLeave}
        onLostPointerCapture={handleLostPointerCapture}
        onWheel={handleWheel}
        className={`relative flex-1 w-full min-h-[calc(100dvh-12.5rem)] rounded-card border border-line bg-surface shadow-card overflow-hidden touch-none select-none ${
          isInteracting ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(13,92,85,0.16) 1px, transparent 1px)',
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
          className={`relative ${isInteracting ? '' : 'tree-stage-smooth'}`}
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
                stroke={edge.isAngkat ? '#d97706' : '#7b8f89'}
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
                    : '#0d5c55'
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
                onClick={(e) => {
                  if (e.target.closest('button, a')) return;
                  if (dragMovedRef.current || Date.now() < suppressClickUntilRef.current) return;
                  openMemberDrawer(p.id_anggota);
                }}
                role="button"
                tabIndex={0}
                aria-label={`${p.nama_lengkap} (${formatKodeUnik(p.kode_unik)})`}
                onKeyDown={(e) => {
                  if (e.target.closest('button, a')) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openMemberDrawer(p.id_anggota);
                  }
                }}
                className={`absolute rounded-tile border border-l-4 ${borderAccent} p-2.5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  node.isFocus
                    ? 'bg-brand-50 dark:bg-brand-950/70 border-brand-500 ring-2 ring-brand-500/35'
                    : !p.status_hidup
                    ? 'bg-surface-2 border-line opacity-95'
                    : 'bg-raised border-line'
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
                    <p className="text-xs font-bold text-ink truncate leading-snug">
                      {p.nama_lengkap}
                    </p>
                    <p className="text-[0.6875rem] font-semibold text-muted truncate">
                      {formatKodeUnik(p.kode_unik)}
                      {birthYear ? ` · ${birthYear}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1 pt-1">
                  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                    {!p.status_hidup && (
                      <span className="px-1.5 py-0.5 rounded bg-surface border border-line text-muted text-[0.6rem] font-bold truncate">
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
                        className="px-2 py-1 rounded-full bg-surface-2 hover:bg-brand-100 dark:hover:bg-brand-900/50 border border-line text-ink text-[0.65rem] font-bold"
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
                        className="px-2 py-1 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-[0.65rem] font-bold"
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
        <div className="absolute bottom-3 left-3 z-20 pointer-events-none hidden sm:flex items-center gap-3 px-3.5 py-1.5 rounded-full bg-surface/90 backdrop-blur-md border border-line text-[0.7rem] font-semibold text-muted shadow-sm">
          <span>{t('tree.nodesShown', { n: layout.totalNodes })}</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-0.5 bg-[#7b8f89] inline-block" />
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
            className="min-h-touch px-3.5 rounded-full bg-brand-700 hover:bg-brand-800 active:scale-95 text-white shadow-float flex items-center gap-1.5 text-xs font-bold transition-all"
          >
            <FileDown className="w-4 h-4 shrink-0" />
            <span>{t('tree.exportPdf')}</span>
          </button>

          <div className="inline-flex items-center rounded-full bg-surface/95 backdrop-blur-md border border-line shadow-card p-0.5">
            <button
              type="button"
              onClick={() => zoomBy(-0.15)}
              aria-label={t('tree.zoomOut')}
              className="min-h-ctl min-w-ctl flex items-center justify-center rounded-full text-ink hover:bg-[var(--well)]"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={fitView}
              title={t('tree.resetView')}
              className="min-h-ctl px-2 text-xs font-bold text-ink hover:bg-[var(--well)] rounded-full tabular-nums"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              onClick={() => zoomBy(0.15)}
              aria-label={t('tree.zoomIn')}
              className="min-h-ctl min-w-ctl flex items-center justify-center rounded-full text-ink hover:bg-[var(--well)]"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
