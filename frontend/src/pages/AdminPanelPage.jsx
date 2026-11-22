import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  Check,
  Copy,
  FileUp,
  KeyRound,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Type,
  UserPlus,
  Users
} from 'lucide-react';
import { db } from '../db/dexie.js';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useFont } from '../contexts/FontContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { alertError, alertSuccess, confirmAction, promptInput, toastSuccess } from '../lib/swal.js';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';
import {
  buildCssFontStack,
  DEFAULT_FONT_FAMILY,
  FONT_PRESETS,
  isPresetFont,
  loadPreviewFont,
  resolveFontFamily,
  sanitizeFontName,
  SYSTEM_FONT_VALUE
} from '../lib/fonts.js';

const VALID_ADMIN_TABS = new Set(['stats', 'users', 'wa', 'deleted']);
function resolveAdminTabParam(raw) {
  if (raw === 'settings' || raw === 'wa') return 'wa';
  return VALID_ADMIN_TABS.has(raw) ? raw : 'stats';
}

function generateSecureTempPassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const bytes = new Uint8Array(length + 4);
  window.crypto.getRandomValues(bytes);
  const chars = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length]
  ];
  for (let i = 3; i < length; i++) chars.push(all[bytes[i] % all.length]);
  for (let j = chars.length - 1; j > 0; j--) {
    const k = bytes[(j + 3) % bytes.length] % (j + 1);
    [chars[j], chars[k]] = [chars[k], chars[j]];
  }
  return chars.join('');
}

export function AdminPanelPage() {
  const { isOnline, triggerSync } = useAuth();
  const { fontFamily, setFontFamily } = useFont();
  const { lang, t, translateError } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const fontFamilyRef = useRef(fontFamily);
  fontFamilyRef.current = fontFamily;

  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const activeMembers = useMemo(
    () =>
      (anggotaList || [])
        .filter((a) => a && !a.is_deleted)
        .sort((a, b) => String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''))),
    [anggotaList]
  );

  const memberNameMap = useMemo(() => {
    const m = new Map();
    (anggotaList || []).forEach((a) => m.set(a.id_anggota, a.nama_lengkap));
    return m;
  }, [anggotaList]);

  const [tab, setTabState] = useState(() => resolveAdminTabParam(searchParams.get('tab')));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (raw) setTabState(resolveAdminTabParam(raw));
  }, [searchParams]);

  const setTab = useCallback(
    (nextTab) => {
      const normalized = resolveAdminTabParam(nextTab);
      setTabState(normalized);
      setSearchParams(normalized === 'stats' ? {} : { tab: normalized }, { replace: true });
      if (typeof window !== 'undefined' && window.scrollY > 0) {
        const prefersReduced =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
      }
    },
    [setSearchParams]
  );

  // Tab Stats
  const [stats, setStats] = useState(null);

  // Tab Users
  const [users, setUsers] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('User');
  const [newAnggotaId, setNewAnggotaId] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  // Tab Settings, Font & WA
  const [settingsForm, setSettingsForm] = useState({
    nama_keluarga: '',
    id_leluhur_utama: '',
    font_family: fontFamily || DEFAULT_FONT_FAMILY,
    wa_aktif: 'false',
    wa_provider: 'fonnte',
    wa_gateway_url: 'https://api.fonnte.com/send',
    wa_group_id: '',
    wa_jam_trigger: '6',
    wa_template: '',
    wa_token_configured: false
  });
  const [fontMode, setFontMode] = useState(() =>
    isPresetFont(fontFamily || DEFAULT_FONT_FAMILY) ? 'preset' : 'custom'
  );
  const [customFontInput, setCustomFontInput] = useState(() => {
    const initial = resolveFontFamily(fontFamily || DEFAULT_FONT_FAMILY);
    return isPresetFont(initial) ? '' : initial;
  });
  const [waTokenInput, setWaTokenInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Tab Deleted
  const [deletedData, setDeletedData] = useState({ anggota: [], pernikahan: [] });

  const loadTabData = useCallback(
    async (targetTab) => {
      if (!isOnline) return;
      setLoading(true);
      try {
        if (targetTab === 'stats') {
          const s = await api.admin.stats();
          setStats(s);
        } else if (targetTab === 'users') {
          const res = await api.admin.usersList();
          const list = res?.users || [];
          setUsers(list);
          const drafts = {};
          list.forEach((u) => {
            drafts[u.id_user] = {
              role: u.role,
              id_anggota: u.id_anggota || '',
              status_aktif: Boolean(u.status_aktif)
            };
          });
          setUserDrafts(drafts);
        } else if (targetTab === 'wa') {
          const res = await api.admin.settingsGet();
          const loadedFont = resolveFontFamily(res.font_family || fontFamilyRef.current);
          setSettingsForm({
            nama_keluarga: res.nama_keluarga || '',
            id_leluhur_utama: res.id_leluhur_utama || '',
            font_family: loadedFont,
            wa_aktif: String(res.wa_aktif || 'false'),
            wa_provider: res.wa_provider || 'fonnte',
            wa_gateway_url: res.wa_gateway_url || '',
            wa_group_id: res.wa_group_id || '',
            wa_jam_trigger: String(res.wa_jam_trigger ?? '6'),
            wa_template: res.wa_template || '',
            wa_token_configured: Boolean(res.wa_token_configured)
          });
          const presetMatch = isPresetFont(loadedFont);
          setFontMode(presetMatch ? 'preset' : 'custom');
          setCustomFontInput(presetMatch ? '' : loadedFont);
        } else if (targetTab === 'deleted') {
          const res = await api.anggota.listDeleted();
          setDeletedData({
            anggota: res?.anggota || [],
            pernikahan: res?.pernikahan || []
          });
        }
      } catch (err) {
        await alertError(t('admin.title'), translateError(err));
      } finally {
        setLoading(false);
      }
    },
    [isOnline, t, translateError]
  );

  useEffect(() => {
    loadTabData(tab);
  }, [tab, loadTabData]);

  const previewFontName =
    fontMode === 'custom'
      ? sanitizeFontName(customFontInput)
      : sanitizeFontName(settingsForm.font_family);

  useEffect(() => {
    if (tab === 'wa' && previewFontName) {
      loadPreviewFont(previewFontName);
    }
  }, [tab, previewFontName]);

  // Handler Users
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      await alertError(t('common.requiredFields'));
      return;
    }
    setCreatingUser(true);
    try {
      await api.admin.usersCreate({
        username: newUsername.trim().toLowerCase(),
        password: newPassword,
        role: newRole,
        id_anggota: newAnggotaId || '',
        status_aktif: true
      });
      toastSuccess(t('admin.userCreated'));
      setNewUsername('');
      setNewPassword('');
      setNewRole('User');
      setNewAnggotaId('');
      await loadTabData('users');
    } catch (err) {
      await alertError(t('admin.createUserTitle'), translateError(err));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!newUsername.trim() || !newPassword) return;
    try {
      await navigator.clipboard.writeText(
        `Username: ${newUsername.trim().toLowerCase()}\nPassword: ${newPassword}`
      );
      toastSuccess(t('admin.credentialCopied'));
    } catch {
      // Abaikan jika clipboard dibatasi
    }
  };

  const handleUpdateUser = async (idUser) => {
    const d = userDrafts[idUser];
    if (!d) return;
    try {
      await api.admin.usersUpdate({
        id_user: idUser,
        role: d.role,
        id_anggota: d.id_anggota,
        status_aktif: d.status_aktif
      });
      toastSuccess(t('admin.userUpdated'));
      await loadTabData('users');
    } catch (err) {
      await alertError(t('admin.tabUsers'), translateError(err));
    }
  };

  const handleResetPassword = async (u) => {
    const pw = await promptInput({
      title: t('admin.resetPasswordTitle', { username: u.username }),
      text: t('auth.passwordPolicyHint'),
      inputType: 'password',
      placeholder: t('auth.newPassword'),
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
      validator: (val) => {
        if (!val || val.length < 8 || !/[A-Za-z]/.test(val) || !/\d/.test(val)) {
          return t('auth.passwordPolicyHint');
        }
        return undefined;
      }
    });
    if (!pw) return;
    try {
      await api.admin.usersResetPassword({ id_user: u.id_user, password_baru: pw });
      await alertSuccess(t('admin.resetPasswordSuccess'));
      await loadTabData('users');
    } catch (err) {
      await alertError(t('admin.resetPasswordBtn'), translateError(err));
    }
  };

  const handleRevokeSessions = async (u) => {
    const ok = await confirmAction({
      title: t('admin.revokeSessionsConfirm', { username: u.username }),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;
    try {
      await api.admin.usersRevokeSessions(u.id_user);
      toastSuccess(t('admin.revokeSessionsSuccess'));
      await loadTabData('users');
    } catch (err) {
      await alertError(t('admin.revokeSessionsBtn'), translateError(err));
    }
  };

  // Handler Settings, Font & WA
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    const finalFont =
      fontMode === 'custom'
        ? sanitizeFontName(customFontInput)
        : sanitizeFontName(settingsForm.font_family);
    if (!finalFont) {
      await alertError(t('admin.fontSectionTitle'), t('admin.fontInvalidFormat'));
      return;
    }

    setSavingSettings(true);
    try {
      const updated = await api.admin.settingsUpdate({
        nama_keluarga: settingsForm.nama_keluarga,
        id_leluhur_utama: settingsForm.id_leluhur_utama,
        font_family: finalFont,
        wa_aktif: settingsForm.wa_aktif === 'true',
        wa_provider: settingsForm.wa_provider,
        wa_gateway_url: settingsForm.wa_gateway_url,
        wa_group_id: settingsForm.wa_group_id,
        wa_jam_trigger: Number(settingsForm.wa_jam_trigger),
        wa_template: settingsForm.wa_template
      });
      const appliedFont = resolveFontFamily(updated?.font_family || finalFont);
      setFontFamily(appliedFont);
      setSettingsForm((prev) => ({
        ...prev,
        ...updated,
        font_family: appliedFont,
        wa_aktif: String(updated.wa_aktif),
        wa_jam_trigger: String(updated.wa_jam_trigger)
      }));
      const presetMatch = isPresetFont(appliedFont);
      setFontMode(presetMatch ? 'preset' : 'custom');
      if (!presetMatch) setCustomFontInput(appliedFont);
      await triggerSync({ forceFull: false, silent: true });
      toastSuccess(t('admin.settingsSaved'));
    } catch (err) {
      await alertError(t('admin.settingsTitle'), translateError(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveWaToken = async () => {
    if (!waTokenInput.trim()) {
      await alertError(t('common.requiredFields'));
      return;
    }
    try {
      const res = await api.admin.setWaToken(waTokenInput.trim());
      setWaTokenInput('');
      setSettingsForm((prev) => ({ ...prev, wa_token_configured: Boolean(res.wa_token_configured) }));
      toastSuccess(t('admin.tokenSaved'));
    } catch (err) {
      await alertError(t('admin.waTokenTitle'), translateError(err));
    }
  };

  const handleClearWaToken = async () => {
    const ok = await confirmAction({
      title: t('admin.clearTokenConfirm'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;
    try {
      await api.admin.setWaToken('');
      setSettingsForm((prev) => ({ ...prev, wa_token_configured: false }));
      toastSuccess(t('admin.tokenCleared'));
    } catch (err) {
      await alertError(t('admin.waTokenTitle'), translateError(err));
    }
  };

  const handleWaTest = async () => {
    try {
      await api.admin.waTest({ target: settingsForm.wa_group_id });
      await alertSuccess(t('admin.waTestSuccess'));
    } catch (err) {
      await alertError(t('admin.waTestBtn'), translateError(err));
    }
  };

  // Handler Restore Deleted
  const handleRestore = async (kind, id) => {
    const ok = await confirmAction({
      title: t('admin.restoreConfirm'),
      confirmText: t('admin.restoreBtn'),
      cancelText: t('common.cancel')
    });
    if (!ok) return;
    try {
      if (kind === 'anggota') await api.anggota.restore(id);
      else await api.pernikahan.restore(id);
      await triggerSync({ forceFull: false, silent: true });
      toastSuccess(t('admin.restoreSuccess'));
      await loadTabData('deleted');
    } catch (err) {
      await alertError(t('admin.restoreBtn'), translateError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
          <Shield className="w-5 h-5 text-heritage-600 dark:text-heritage-400" />
          <span>{t('admin.title')}</span>
        </h1>

        <button
          type="button"
          onClick={() => loadTabData(tab)}
          disabled={loading || !isOnline}
          aria-label={t('sync.syncNow')}
          className="h-9 w-9 flex items-center justify-center rounded-full bg-surface border border-line text-ink hover:bg-surface-2 disabled:opacity-50 shadow-card"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab Navigasi Fluid Flexbox dengan indikator bergeser halus */}
      <SegmentedPillControl
        role="tablist"
        ariaLabel={t('admin.title')}
        value={tab}
        onChange={setTab}
        fullWidth
        tone="brand"
        buttonClassName="min-w-[6.5rem]"
        options={[
          { value: 'stats', label: t('admin.tabStats'), icon: BarChart3 },
          { value: 'users', label: t('admin.tabUsers'), icon: Users },
          { value: 'wa', label: t('admin.tabWa'), icon: MessageSquare },
          { value: 'deleted', label: t('admin.tabDeleted'), icon: Trash2 }
        ]}
      />

      {/* TAB 1: STATISTIK */}
      {tab === 'stats' && (
        <div key="tab-stats" className="space-y-4 section-enter">
          {stats ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                [t('admin.statMembers'), stats.anggota.total_aktif, `${t('admin.statGenderRatio')}: ${stats.anggota.laki_laki} / ${stats.anggota.perempuan}`],
                [t('admin.statLivingRatio'), `${stats.anggota.hidup} / ${stats.anggota.wafat}`, `${t('admin.statAdopted')}: ${stats.anggota.anak_angkat} · ${t('admin.statDeleted')}: ${stats.anggota.terhapus}`],
                [t('admin.statMarriages'), stats.pernikahan.total_aktif, t('admin.statMarriageDetail', stats.pernikahan)],
                [t('admin.statUsers'), stats.pengguna.aktif, t('admin.statAdmins', { n: stats.pengguna.admin_aktif })],
                [t('admin.statBirthdaysToday'), stats.ulang_tahun_hari_ini, ''],
                [
                  t('admin.statWaStatus'),
                  stats.wa_aktif ? t('admin.waEnabled') : t('admin.waDisabled'),
                  stats.wa_token_configured ? t('admin.tokenReady') : t('admin.tokenMissing')
                ]
              ].map(([title, val, sub]) => (
                <div
                  key={title}
                  className="w-full bg-surface rounded-card border border-line p-4 shadow-card"
                >
                  <p className="text-xs font-bold text-faint">{title}</p>
                  <p className="text-2xl font-bold text-ink mt-1">{val}</p>
                  {sub && <p className="text-xs font-semibold text-muted mt-1">{sub}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-card bg-surface border border-line text-sm font-medium text-muted shadow-card">
              {t('common.loading')}
            </div>
          )}

          <Link
            to="/admin/gedcom"
            className="w-full min-h-cta px-4 py-2 rounded-full bg-heritage-700 hover:bg-heritage-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
          >
            <FileUp className="w-4 h-4" />
            <span>{t('admin.quickGedcom')}</span>
          </Link>
        </div>
      )}

      {/* TAB 2: KELOLA PENGGUNA */}
      {tab === 'users' && (
        <div key="tab-users" className="space-y-4 section-enter">
          <form
            onSubmit={handleCreateUser}
            className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3"
          >
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-brand-700 dark:text-brand-300" />
              <span>{t('admin.createUserTitle')}</span>
            </h2>

            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[11rem]">
                <label className="block text-xs font-bold text-muted mb-1">{t('admin.usernameLabel')}</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="budi.santoso"
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
                />
              </div>

              <div className="flex-1 min-w-[12rem]">
                <label className="block text-xs font-bold text-muted mb-1">{t('admin.passwordLabel')}</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('auth.passwordPolicyHint')}
                    className="flex-1 min-w-0 min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateSecureTempPassword(12))}
                    title={t('admin.generatePassword')}
                    className="min-h-touch px-3 rounded-full bg-surface-2 border border-line text-ink hover:bg-[var(--well)] text-xs font-bold inline-flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-4 h-4 text-heritage-600" />
                    <span className="hidden sm:inline">{t('admin.generatePassword')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    title={t('admin.copyCredentials')}
                    aria-label={t('admin.copyCredentials')}
                    className="min-h-touch min-w-touch flex items-center justify-center rounded-full bg-surface-2 border border-line text-ink hover:bg-[var(--well)] shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="w-36">
                <label className="block text-xs font-bold text-muted mb-1">{t('admin.roleLabel')}</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                >
                  <option value="User">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div className="flex-1 min-w-[12rem]">
                <label className="block text-xs font-bold text-muted mb-1">{t('admin.linkMemberLabel')}</label>
                <select
                  value={newAnggotaId}
                  onChange={(e) => setNewAnggotaId(e.target.value)}
                  className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                >
                  <option value="">{t('admin.noLinkOption')}</option>
                  {activeMembers.map((a) => (
                    <option key={a.id_anggota} value={a.id_anggota}>
                      {a.nama_lengkap} (#{a.kode_unik})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={creatingUser || !isOnline}
              className="w-full sm:w-auto min-h-touch px-5 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-bold shadow-sm"
            >
              {creatingUser ? t('common.saving') : t('admin.createUserBtn')}
            </button>
          </form>

          {/* Daftar Pengguna (Kartu Flexbox Tanpa Horizontal Scroll) */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
              {t('admin.usersListTitle', { n: users.length })}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {users.map((u) => {
                const d = userDrafts[u.id_user] || {
                  role: u.role,
                  id_anggota: u.id_anggota || '',
                  status_aktif: u.status_aktif
                };
                const setDraft = (patch) =>
                  setUserDrafts((prev) => ({ ...prev, [u.id_user]: { ...d, ...patch } }));

                return (
                  <article
                    key={u.id_user}
                    className="bg-surface rounded-card border border-line p-4 shadow-card space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-bold text-ink">@{u.username}</p>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          u.status_aktif
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                        }`}
                      >
                        {u.status_aktif ? t('admin.statusActive') : t('admin.statusInactive')}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={d.role}
                        onChange={(e) => setDraft({ role: e.target.value })}
                        className="min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-xs font-bold"
                      >
                        <option value="User">User</option>
                        <option value="Admin">Admin</option>
                      </select>

                      <select
                        value={d.status_aktif ? '1' : '0'}
                        onChange={(e) => setDraft({ status_aktif: e.target.value === '1' })}
                        className="min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-xs font-bold"
                      >
                        <option value="1">{t('admin.statusActive')}</option>
                        <option value="0">{t('admin.statusInactive')}</option>
                      </select>

                      <select
                        value={d.id_anggota}
                        onChange={(e) => setDraft({ id_anggota: e.target.value })}
                        className="flex-1 min-w-[11rem] min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-xs font-bold"
                      >
                        <option value="">{t('admin.noLinkOption')}</option>
                        {activeMembers.map((a) => (
                          <option key={a.id_anggota} value={a.id_anggota}>
                            {a.nama_lengkap} (#{a.kode_unik})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateUser(u.id_user)}
                        className="flex-1 min-w-[8rem] min-h-touch px-3.5 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{t('admin.saveUserBtn')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResetPassword(u)}
                        className="flex-1 min-w-[8rem] min-h-touch px-3.5 rounded-full bg-surface-2 border border-line hover:bg-[var(--well)] text-ink text-xs font-bold inline-flex items-center justify-center gap-1.5"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{t('admin.resetPasswordBtn')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevokeSessions(u)}
                        className="min-h-touch px-3.5 rounded-full border border-rose-300/80 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold"
                      >
                        {t('admin.revokeSessionsBtn')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PENGATURAN KELUARGA, FONT & WA GATEWAY (Split-View Grid Desktop) */}
      {tab === 'wa' && (
        <div
          key="tab-wa"
          className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-stretch section-enter"
        >
          {/* Kolom Kiri: Pengaturan Keluarga + Font Aplikasi Global */}
          <form
            id="admin-settings-form"
            onSubmit={handleSaveSettings}
            className="bg-surface rounded-card border border-line p-4 shadow-card flex flex-col justify-between gap-3 min-w-0"
          >
            <div className="space-y-3 flex-1 flex flex-col">
              <h2 className="text-sm font-bold text-ink">{t('admin.settingsTitle')}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="min-w-0">
                  <label className="block text-xs font-bold text-muted mb-1">
                    {t('admin.familyNameLabel')}
                  </label>
                  <input
                    type="text"
                    value={settingsForm.nama_keluarga}
                    onChange={(e) => setSettingsForm((s) => ({ ...s, nama_keluarga: e.target.value }))}
                    className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-bold text-muted mb-1">
                    {t('admin.mainAncestorLabel')}
                  </label>
                  <select
                    value={settingsForm.id_leluhur_utama}
                    onChange={(e) =>
                      setSettingsForm((s) => ({ ...s, id_leluhur_utama: e.target.value }))
                    }
                    className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                  >
                    <option value="">{t('admin.noLinkOption')}</option>
                    {activeMembers.map((a) => (
                      <option key={a.id_anggota} value={a.id_anggota}>
                        {a.nama_lengkap} (#{a.kode_unik})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pengaturan Tipografi / Font Aplikasi Global */}
              <div className="p-3 rounded-tile bg-surface-2 border border-line space-y-2.5 flex-1 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-ink">
                        <Type className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0" aria-hidden="true" />
                        <span>{t('admin.fontSectionTitle')}</span>
                      </div>
                      <p className="text-[0.6875rem] text-muted">{t('admin.fontSectionHint')}</p>
                    </div>

                    <SegmentedPillControl
                      ariaLabel={t('admin.fontSectionTitle')}
                      value={fontMode}
                      onChange={(mode) => {
                        setFontMode(mode);
                        if (mode === 'preset') {
                          const candidate = sanitizeFontName(settingsForm.font_family);
                          const nextPreset = isPresetFont(candidate)
                            ? resolveFontFamily(candidate)
                            : DEFAULT_FONT_FAMILY;
                          setSettingsForm((s) => ({ ...s, font_family: nextPreset }));
                        } else {
                          setCustomFontInput((prev) =>
                            prev || (isPresetFont(settingsForm.font_family) ? '' : settingsForm.font_family)
                          );
                        }
                      }}
                      tone="brand"
                      className="bg-surface"
                      options={[
                        { value: 'preset', label: t('admin.fontModePreset') },
                        { value: 'custom', label: t('admin.fontModeCustom') }
                      ]}
                    />
                  </div>

                  {fontMode === 'preset' ? (
                    <div
                      key="font-preset"
                      className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 section-enter"
                    >
                      {FONT_PRESETS.map((preset) => {
                        const selected =
                          sanitizeFontName(settingsForm.font_family).toLowerCase() ===
                          preset.name.toLowerCase();
                        const displayLabel =
                          preset.name === SYSTEM_FONT_VALUE ? t('admin.fontSystemName') : preset.name;
                        const tagText = lang === 'en' ? preset.tagEn : preset.tagId;
                        return (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => setSettingsForm((s) => ({ ...s, font_family: preset.name }))}
                            aria-pressed={selected}
                            className={`text-left px-2.5 py-2 rounded-tile border transition-colors flex items-center justify-between gap-2 ${
                              selected
                                ? 'bg-brand-50/90 dark:bg-brand-950/50 border-brand-600 dark:border-brand-400 text-ink shadow-sm'
                                : 'bg-surface border-line hover:bg-[var(--well)] text-ink'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold truncate leading-snug">
                                {displayLabel}
                              </p>
                              <p className="text-[0.65rem] font-medium text-muted truncate">
                                {preset.designer} · {tagText}
                              </p>
                            </div>
                            {selected && (
                              <span className="w-4 h-4 rounded-full bg-brand-700 text-white flex items-center justify-center shrink-0">
                                <Check className="w-2.5 h-2.5" aria-hidden="true" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div key="font-custom" className="space-y-1.5 section-enter">
                      <label htmlFor="admin-custom-font" className="block text-xs font-bold text-muted">
                        {t('admin.fontCustomLabel')}
                      </label>
                      <input
                        id="admin-custom-font"
                        type="text"
                        maxLength={50}
                        value={customFontInput}
                        onChange={(e) => setCustomFontInput(e.target.value)}
                        placeholder={t('admin.fontCustomPlaceholder')}
                        className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface text-ink placeholder:text-faint text-sm font-semibold"
                      />
                      <p
                        className={`text-xs font-medium ${
                          customFontInput.trim() && !sanitizeFontName(customFontInput)
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-muted'
                        }`}
                      >
                        {customFontInput.trim() && !sanitizeFontName(customFontInput)
                          ? t('admin.fontInvalidFormat')
                          : t('admin.fontCustomHint')}
                      </p>
                    </div>
                  )}
                </div>

                {(() => {
                  const previewTarget = previewFontName || fontFamily;
                  const isActiveFont = resolveFontFamily(previewTarget) === fontFamily;
                  const previewLabel =
                    previewTarget === SYSTEM_FONT_VALUE ? t('admin.fontSystemName') : previewTarget;
                  return (
                    <div
                      className="p-2.5 rounded-tile bg-surface border border-line space-y-0.5"
                      style={{ fontFamily: buildCssFontStack(previewTarget) }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem]">
                        <span className="font-bold uppercase tracking-wider text-faint">
                          {t('admin.fontPreviewLabel')} · {previewLabel}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold ${
                            isActiveFont
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                          }`}
                        >
                          {isActiveFont ? t('admin.fontPreviewActive') : t('admin.fontPreviewUnsaved')}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-ink truncate">
                        {settingsForm.nama_keluarga || t('app.name')}
                      </p>
                      <p className="text-xs sm:text-sm font-medium text-muted truncate">
                        {t('admin.fontPreviewSample')}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </form>

          {/* Kolom Kanan: Konfigurasi WA Gateway + Token Rahasia */}
          <div className="flex flex-col gap-3.5 min-w-0">
            <section className="bg-surface rounded-card border border-line p-4 shadow-card flex-1 flex flex-col justify-between gap-3">
              <div className="space-y-2.5">
                <label className="min-h-ctl flex items-center gap-2.5 cursor-pointer">
                  <input
                    form="admin-settings-form"
                    type="checkbox"
                    checked={settingsForm.wa_aktif === 'true'}
                    onChange={(e) =>
                      setSettingsForm((s) => ({ ...s, wa_aktif: e.target.checked ? 'true' : 'false' }))
                    }
                    className="w-4 h-4 rounded text-brand-700"
                  />
                  <span className="text-sm font-bold text-ink">{t('admin.waActiveLabel')}</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="block text-xs font-bold text-muted mb-1">
                      {t('admin.waProviderLabel')}
                    </label>
                    <select
                      form="admin-settings-form"
                      value={settingsForm.wa_provider}
                      onChange={(e) => setSettingsForm((s) => ({ ...s, wa_provider: e.target.value }))}
                      className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                    >
                      <option value="fonnte">Fonnte</option>
                      <option value="wablas">Wablas</option>
                      <option value="generic">Generic JSON</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-bold text-muted mb-1">
                      {t('admin.waHourLabel')}
                    </label>
                    <input
                      form="admin-settings-form"
                      type="number"
                      min="0"
                      max="23"
                      value={settingsForm.wa_jam_trigger}
                      onChange={(e) => setSettingsForm((s) => ({ ...s, wa_jam_trigger: e.target.value }))}
                      className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="block text-xs font-bold text-muted mb-1">
                      {t('admin.waUrlLabel')}
                    </label>
                    <input
                      form="admin-settings-form"
                      type="url"
                      value={settingsForm.wa_gateway_url}
                      onChange={(e) =>
                        setSettingsForm((s) => ({ ...s, wa_gateway_url: e.target.value }))
                      }
                      placeholder="https://api.fonnte.com/send"
                      className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="block text-xs font-bold text-muted mb-1">
                      {t('admin.waGroupLabel')}
                    </label>
                    <input
                      form="admin-settings-form"
                      type="text"
                      value={settingsForm.wa_group_id}
                      onChange={(e) => setSettingsForm((s) => ({ ...s, wa_group_id: e.target.value }))}
                      placeholder="120363000000@g.us"
                      className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted mb-1">
                    {t('admin.waTemplateLabel')}
                  </label>
                  <textarea
                    form="admin-settings-form"
                    rows={3}
                    value={settingsForm.wa_template}
                    onChange={(e) => setSettingsForm((s) => ({ ...s, wa_template: e.target.value }))}
                    className="w-full p-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-medium"
                  />
                  <p className="text-[0.6875rem] text-muted mt-1">{t('admin.waTemplateHint')}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  form="admin-settings-form"
                  disabled={savingSettings || !isOnline}
                  className="flex-1 min-w-[9rem] min-h-ctl px-4 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-sm"
                >
                  {savingSettings ? t('common.saving') : t('admin.saveSettingsBtn')}
                </button>

                <button
                  type="button"
                  onClick={handleWaTest}
                  disabled={!isOnline}
                  className="min-h-ctl px-3.5 rounded-full bg-wa hover:bg-wa-hover disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t('admin.waTestBtn')}</span>
                </button>
              </div>
            </section>

            {/* Token Rahasia di PropertiesService */}
            <section className="bg-surface rounded-card border border-line p-4 shadow-card space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">{t('admin.waTokenTitle')}</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    settingsForm.wa_token_configured
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}
                >
                  {settingsForm.wa_token_configured ? t('admin.tokenReady') : t('admin.tokenMissing')}
                </span>
              </div>

              <p className="text-xs text-muted">{t('admin.waTokenHint')}</p>

              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  value={waTokenInput}
                  onChange={(e) => setWaTokenInput(e.target.value)}
                  placeholder={t('admin.waTokenPlaceholder')}
                  className="flex-1 min-w-[12rem] min-h-ctl px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
                />

                <button
                  type="button"
                  onClick={handleSaveWaToken}
                  disabled={!isOnline}
                  className="min-h-ctl px-3.5 rounded-full bg-side text-[var(--on-side)] hover:opacity-95 text-xs font-bold shrink-0"
                >
                  {t('admin.saveTokenBtn')}
                </button>

                {settingsForm.wa_token_configured && (
                  <button
                    type="button"
                    onClick={handleClearWaToken}
                    disabled={!isOnline}
                    className="min-h-ctl px-3.5 rounded-full border border-rose-300/80 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold shrink-0"
                  >
                    {t('admin.clearTokenBtn')}
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 4: DATA TERHAPUS (PEMULIHAN) */}
      {tab === 'deleted' && (
        <div key="tab-deleted" className="space-y-4 section-enter">
          {!deletedData.anggota.length && !deletedData.pernikahan.length ? (
            <div className="bg-surface rounded-card border border-line p-6 text-center text-sm font-medium text-muted shadow-card">
              {t('admin.noDeletedData')}
            </div>
          ) : (
            <>
              {deletedData.anggota.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
                    {t('admin.deletedMembersTitle', { n: deletedData.anggota.length })}
                  </h2>
                  {deletedData.anggota.map((a) => (
                    <div
                      key={a.id_anggota}
                      className="bg-surface rounded-card border border-line p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-card"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink break-words">{a.nama_lengkap}</p>
                        <p className="text-xs text-muted font-mono">#{a.kode_unik}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestore('anggota', a.id_anggota)}
                        className="min-h-touch px-4 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t('admin.restoreBtn')}</span>
                      </button>
                    </div>
                  ))}
                </section>
              )}

              {deletedData.pernikahan.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
                    {t('admin.deletedMarriagesTitle', { n: deletedData.pernikahan.length })}
                  </h2>
                  {deletedData.pernikahan.map((m) => (
                    <div
                      key={m.id_pernikahan}
                      className="bg-surface rounded-card border border-line p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-card"
                    >
                      <p className="text-sm font-bold text-ink">
                        {(memberNameMap.get(m.id_suami) || m.id_suami)} &amp;{' '}
                        {(memberNameMap.get(m.id_istri) || m.id_istri)} ({m.status_pernikahan})
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRestore('pernikahan', m.id_pernikahan)}
                        className="min-h-touch px-4 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t('admin.restoreBtn')}</span>
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
