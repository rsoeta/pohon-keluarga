import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Cake,
  FileUp,
  GitCompare,
  GitFork,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { db } from '../../db/dexie.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTheme } from '../../contexts/ThemeContext.jsx';
import { useI18n } from '../../contexts/I18nContext.jsx';
import { useQuickUi } from '../../contexts/QuickUiContext.jsx';
import { extractBirthYear, formatKodeUnik } from '../../lib/format.js';
import { toastSuccess } from '../../lib/swal.js';
import { MemberAvatar } from './MemberAvatar.jsx';

function renderHighlighted(text, rawQuery) {
  const str = String(text || '');
  const q = String(rawQuery || '').trim().replace(/^#/, '');
  if (!q) return str;
  const lower = str.toLowerCase();
  const needle = q.toLowerCase();
  const parts = [];
  let cursor = 0;

  while (cursor < str.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx === -1) {
      parts.push(<Fragment key={`t-${cursor}`}>{str.slice(cursor)}</Fragment>);
      break;
    }
    if (idx > cursor) {
      parts.push(<Fragment key={`p-${cursor}`}>{str.slice(cursor, idx)}</Fragment>);
    }
    parts.push(
      <mark
        key={`m-${idx}`}
        className="bg-amber-200/90 dark:bg-amber-400/25 text-ink rounded px-0.5"
      >
        {str.slice(idx, idx + q.length)}
      </mark>
    );
    cursor = idx + q.length;
  }
  return parts;
}

export function CommandPalette() {
  const { user, isAdmin, isOnline, syncing, triggerSync } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useI18n();
  const navigate = useNavigate();
  const {
    commandOpen,
    closeCommandPalette,
    openMemberDrawer,
    openRelationModal
  } = useQuickUi();

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (!commandOpen) return undefined;
    setQuery('');
    setActiveIdx(0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 10);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [commandOpen, closeCommandPalette]);

  const memberItems = useMemo(() => {
    const active = (anggotaList || []).filter((a) => a && !a.is_deleted);
    const q = query.trim().toLowerCase().replace(/^#/, '');

    if (!q) {
      const sorted = [...active].sort((a, b) =>
        String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''))
      );
      const me = user?.id_anggota
        ? sorted.find((a) => a.id_anggota === user.id_anggota)
        : null;
      const others = sorted.filter((a) => a.id_anggota !== user?.id_anggota);
      const picked = me ? [me, ...others.slice(0, 4)] : others.slice(0, 5);
      return picked.map((member) => ({
        id: `member:${member.id_anggota}`,
        kind: 'member',
        member
      }));
    }

    const matched = active
      .filter((a) => {
        const hay = `${a.nama_lengkap || ''} ${a.kode_unik || ''} ${a.domisili || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aStarts = String(a.nama_lengkap || '').toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = String(b.nama_lengkap || '').toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''));
      })
      .slice(0, 8);

    return matched.map((member) => ({
      id: `member:${member.id_anggota}`,
      kind: 'member',
      member
    }));
  }, [anggotaList, query, user?.id_anggota]);

  const actionItems = useMemo(() => {
    const base = [
      {
        id: 'act:tree',
        label: t('command.actionTree'),
        keywords: 'pohon silsilah tree bagan',
        Icon: GitFork,
        run: () => {
          closeCommandPalette({ restore: false });
          navigate('/pohon');
        }
      },
      {
        id: 'act:directory',
        label: t('command.actionDirectory'),
        keywords: 'daftar anggota directory search cari',
        Icon: Users,
        run: () => {
          closeCommandPalette({ restore: false });
          navigate('/daftar');
        }
      },
      {
        id: 'act:add',
        label: t('command.actionAdd'),
        keywords: 'tambah anggota baru add member anak pasangan',
        Icon: UserPlus,
        run: () => {
          closeCommandPalette({ restore: false });
          navigate('/tambah');
        }
      },
      {
        id: 'act:birthdays',
        label: t('command.actionBirthdays'),
        keywords: 'ulang tahun ultah birthdays milad',
        Icon: Cake,
        run: () => {
          closeCommandPalette({ restore: false });
          navigate('/ultah');
        }
      },
      {
        id: 'act:relation',
        label: t('command.actionRelation'),
        keywords: 'nasab hubungan kekerabatan kalkulator bfs lca',
        Icon: GitCompare,
        run: () => {
          openRelationModal();
        }
      },
      {
        id: 'act:settings',
        label: t('command.actionSettings'),
        keywords: 'setelan pengaturan profil password bahasa settings',
        Icon: Settings,
        run: () => {
          closeCommandPalette({ restore: false });
          navigate('/setelan');
        }
      }
    ];

    if (isAdmin) {
      base.push(
        {
          id: 'act:admin',
          label: t('command.actionAdmin'),
          keywords: 'admin panel pengguna wa gateway statistik',
          Icon: Shield,
          run: () => {
            closeCommandPalette({ restore: false });
            navigate('/admin');
          }
        },
        {
          id: 'act:gedcom',
          label: t('command.actionGedcom'),
          keywords: 'gedcom impor import massal',
          Icon: FileUp,
          run: () => {
            closeCommandPalette({ restore: false });
            navigate('/admin/gedcom');
          }
        }
      );
    }

    base.push({
      id: 'act:theme',
      label: t('command.actionToggleTheme'),
      keywords: 'tema gelap terang dark light mode',
      Icon: isDark ? Sun : Moon,
      run: () => {
        toggleTheme();
        closeCommandPalette();
      }
    });

    if (isOnline && !syncing) {
      base.push({
        id: 'act:sync',
        label: t('command.actionSync'),
        keywords: 'sinkron sync muat ulang data dexie',
        Icon: RefreshCw,
        run: async () => {
          closeCommandPalette();
          const res = await triggerSync({ forceFull: false, silent: false });
          if (res) toastSuccess(t('sync.syncSuccess'));
        }
      });
    }

    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter((a) => `${a.label} ${a.keywords}`.toLowerCase().includes(q))
      : base;

    return filtered.map((action) => ({
      id: action.id,
      kind: 'action',
      action
    }));
  }, [
    t,
    isAdmin,
    isDark,
    isOnline,
    syncing,
    query,
    closeCommandPalette,
    navigate,
    openRelationModal,
    toggleTheme,
    triggerSync
  ]);

  const flatItems = useMemo(() => [...memberItems, ...actionItems], [memberItems, actionItems]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (activeIdx >= flatItems.length && flatItems.length > 0) {
      setActiveIdx(0);
    }
  }, [activeIdx, flatItems.length]);

  useEffect(() => {
    const el = itemRefs.current[activeIdx];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  if (!commandOpen) return null;

  const executeItem = (item) => {
    if (!item) return;
    if (item.kind === 'member') {
      openMemberDrawer(item.member.id_anggota);
    } else if (item.kind === 'action') {
      item.action.run();
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length) setActiveIdx((i) => (i + 1) % flatItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length) setActiveIdx((i) => (i - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === 'Enter') {
      if (flatItems[activeIdx]) {
        e.preventDefault();
        executeItem(flatItems[activeIdx]);
      }
    }
  };

  const activeItemId = flatItems[activeIdx]?.id ? `cmd-opt-${flatItems[activeIdx].id}` : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('command.dialogLabel')}
      className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-12 sm:pt-20 pb-6 bg-[#081513]/55 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCommandPalette();
      }}
    >
      <div className="w-full max-w-xl bg-raised border border-line rounded-[24px] shadow-float overflow-hidden flex flex-col max-h-[80dvh] palette-enter">
        {/* Input Pencarian */}
        <div className="px-4 py-3 border-b border-line flex items-center gap-2.5">
          <Search className="w-5 h-5 text-brand-700 dark:text-brand-300 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-listbox"
            aria-activedescendant={activeItemId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t('command.searchPlaceholder')}
            className="flex-1 min-w-0 bg-transparent text-sm sm:text-base font-semibold text-ink placeholder:text-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label={t('directory.clearSearch')}
              className="min-h-touch min-w-touch flex items-center justify-center rounded-full text-muted hover:bg-[var(--well)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => closeCommandPalette()}
            aria-label={t('common.close')}
            className="min-h-touch px-3 rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-xs font-bold text-muted"
          >
            Esc
          </button>
        </div>

        {/* Daftar Hasil */}
        <div id="cmd-listbox" role="listbox" className="overflow-y-auto p-2.5 space-y-3">
          {!flatItems.length ? (
            <div className="py-10 px-4 text-center space-y-1">
              <p className="text-sm font-bold text-ink">{t('command.emptyTitle')}</p>
              <p className="text-xs font-medium text-muted">{t('command.emptyDesc')}</p>
            </div>
          ) : (
            <>
              {memberItems.length > 0 && (
                <div className="space-y-1">
                  <p className="px-3 pt-1 text-[0.7rem] font-bold uppercase tracking-wider text-faint">
                    {t('command.groupMembers')}
                  </p>
                  {memberItems.map((item, idx) => {
                    const m = item.member;
                    const yr = extractBirthYear(m.tgl_lahir);
                    const isActive = activeIdx === idx;
                    return (
                      <div
                        key={item.id}
                        id={`cmd-opt-${item.id}`}
                        ref={(el) => {
                          itemRefs.current[idx] = el;
                        }}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => executeItem(item)}
                        className={`min-h-touch px-3 py-2 rounded-2xl flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-brand-100/80 dark:bg-brand-900/50 text-ink'
                            : 'hover:bg-surface-2 text-ink'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <MemberAvatar
                            fileId={m.foto_file_id}
                            name={m.nama_lengkap}
                            gender={m.jenis_kelamin}
                            isLiving={m.status_hidup}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate">
                              {renderHighlighted(m.nama_lengkap, query)}
                            </p>
                            <p className="text-xs font-semibold text-muted truncate">
                              {renderHighlighted(formatKodeUnik(m.kode_unik), query)}
                              {yr ? ` · ${yr}` : ''}
                              {m.domisili ? ' · ' : ''}
                              {m.domisili ? renderHighlighted(m.domisili, query) : ''}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeCommandPalette({ restore: false });
                            navigate(`/pohon?focus=${m.id_anggota}`);
                          }}
                          title={t('command.focusTreeHint')}
                          aria-label={`${t('command.focusTreeHint')}: ${m.nama_lengkap}`}
                          className="min-h-touch min-w-touch px-2.5 rounded-full bg-surface border border-line text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/60 flex items-center justify-center gap-1 text-xs font-bold shrink-0"
                        >
                          <GitFork className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {actionItems.length > 0 && (
                <div className="space-y-1">
                  <p className="px-3 pt-1 text-[0.7rem] font-bold uppercase tracking-wider text-faint">
                    {t('command.groupActions')}
                  </p>
                  {actionItems.map((item, aIdx) => {
                    const globalIdx = memberItems.length + aIdx;
                    const { Icon, label } = item.action;
                    const isActive = activeIdx === globalIdx;
                    return (
                      <button
                        key={item.id}
                        id={`cmd-opt-${item.id}`}
                        ref={(el) => {
                          itemRefs.current[globalIdx] = el;
                        }}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        onClick={() => executeItem(item)}
                        className={`w-full min-h-touch px-3 py-2 rounded-2xl flex items-center gap-3 text-left transition-colors ${
                          isActive
                            ? 'bg-brand-100/80 dark:bg-brand-900/50 text-ink'
                            : 'hover:bg-surface-2 text-ink'
                        }`}
                      >
                        <span className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center text-brand-700 dark:text-brand-300 shrink-0">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="text-sm font-bold truncate">
                          {renderHighlighted(label, query)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Petunjuk Keyboard */}
        <div className="px-4 py-2.5 border-t border-line bg-surface-2 text-[0.7rem] font-semibold text-muted flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-line font-mono">↑↓</kbd>{' '}
              {t('command.footerNavHint')}
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-line font-mono">↵</kbd>{' '}
              {t('command.footerSelectHint')}
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface border border-line font-mono">Esc</kbd>{' '}
              {t('command.footerCloseHint')}
            </span>
          </div>
          <span className="font-mono text-faint">⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
