import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
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
  UserPlus,
  Users
} from 'lucide-react';
import { db } from '../db/dexie.js';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { alertError, alertSuccess, confirmAction, promptInput, toastSuccess } from '../lib/swal.js';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';

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
  const { t, translateError } = useI18n();

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

  const [tab, setTab] = useState('stats'); // stats | users | wa | deleted
  const [loading, setLoading] = useState(false);

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

  // Tab Settings & WA
  const [settingsForm, setSettingsForm] = useState({
    nama_keluarga: '',
    id_leluhur_utama: '',
    wa_aktif: 'false',
    wa_provider: 'fonnte',
    wa_gateway_url: 'https://api.fonnte.com/send',
    wa_group_id: '',
    wa_jam_trigger: '6',
    wa_template: '',
    wa_token_configured: false
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
          setSettingsForm({
            nama_keluarga: res.nama_keluarga || '',
            id_leluhur_utama: res.id_leluhur_utama || '',
            wa_aktif: String(res.wa_aktif || 'false'),
            wa_provider: res.wa_provider || 'fonnte',
            wa_gateway_url: res.wa_gateway_url || '',
            wa_group_id: res.wa_group_id || '',
            wa_jam_trigger: String(res.wa_jam_trigger ?? '6'),
            wa_template: res.wa_template || '',
            wa_token_configured: Boolean(res.wa_token_configured)
          });
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

  // Handler Settings & WA
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await api.admin.settingsUpdate({
        nama_keluarga: settingsForm.nama_keluarga,
        id_leluhur_utama: settingsForm.id_leluhur_utama,
        wa_aktif: settingsForm.wa_aktif === 'true',
        wa_provider: settingsForm.wa_provider,
        wa_gateway_url: settingsForm.wa_gateway_url,
        wa_group_id: settingsForm.wa_group_id,
        wa_jam_trigger: Number(settingsForm.wa_jam_trigger),
        wa_template: settingsForm.wa_template
      });
      setSettingsForm((prev) => ({
        ...prev,
        ...updated,
        wa_aktif: String(updated.wa_aktif),
        wa_jam_trigger: String(updated.wa_jam_trigger)
      }));
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
        <div className="space-y-4">
          {stats ? (
            <div className="flex flex-wrap gap-3">
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
                  className="w-full sm:w-[calc(50%-0.375rem)] bg-surface rounded-card border border-line p-4 shadow-card"
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
        <div className="space-y-4">
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
      )}

      {/* TAB 3: PENGATURAN & WA GATEWAY */}
      {tab === 'wa' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSaveSettings}
            className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3"
          >
            <h2 className="text-sm font-bold text-ink">{t('admin.settingsTitle')}</h2>

            <div>
              <label className="block text-xs font-bold text-muted mb-1">{t('admin.familyNameLabel')}</label>
              <input
                type="text"
                value={settingsForm.nama_keluarga}
                onChange={(e) => setSettingsForm((s) => ({ ...s, nama_keluarga: e.target.value }))}
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-1">{t('admin.mainAncestorLabel')}</label>
              <select
                value={settingsForm.id_leluhur_utama}
                onChange={(e) => setSettingsForm((s) => ({ ...s, id_leluhur_utama: e.target.value }))}
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
              >
                <option value="">{t('admin.noLinkOption')}</option>
                {activeMembers.map((a) => (
                  <option key={a.id_anggota} value={a.id_anggota}>
                    {a.nama_lengkap} (#{a.kode_unik})
                  </option>
                ))}
              </select>
            </div>

            <label className="min-h-touch flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.wa_aktif === 'true'}
                onChange={(e) =>
                  setSettingsForm((s) => ({ ...s, wa_aktif: e.target.checked ? 'true' : 'false' }))
                }
                className="w-5 h-5 rounded text-brand-700"
              />
              <span className="text-sm font-bold text-ink">{t('admin.waActiveLabel')}</span>
            </label>

            <div className="flex flex-wrap gap-3">
              <div className="w-40">
                <label className="block text-xs font-bold text-muted mb-1">{t('admin.waProviderLabel')}</label>
                <select
                  value={settingsForm.wa_provider}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, wa_provider: e.target.value }))}
                  className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                >
                  <option value="fonnte">Fonnte</option>
                  <option value="wablas">Wablas</option>
                  <option value="generic">Generic JSON</option>
                </select>
              </div>

              <div className="w-36">
                <label className="block text-xs font-bold text-muted mb-1">{t('admin.waHourLabel')}</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={settingsForm.wa_jam_trigger}
                  onChange={(e) => setSettingsForm((s) => ({ ...s, wa_jam_trigger: e.target.value }))}
                  className="w-full min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-1">{t('admin.waUrlLabel')}</label>
              <input
                type="url"
                value={settingsForm.wa_gateway_url}
                onChange={(e) => setSettingsForm((s) => ({ ...s, wa_gateway_url: e.target.value }))}
                placeholder="https://api.fonnte.com/send"
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-1">{t('admin.waGroupLabel')}</label>
              <input
                type="text"
                value={settingsForm.wa_group_id}
                onChange={(e) => setSettingsForm((s) => ({ ...s, wa_group_id: e.target.value }))}
                placeholder="120363000000@g.us"
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-1">{t('admin.waTemplateLabel')}</label>
              <textarea
                rows={4}
                value={settingsForm.wa_template}
                onChange={(e) => setSettingsForm((s) => ({ ...s, wa_template: e.target.value }))}
                className="w-full p-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-medium"
              />
              <p className="text-xs text-muted mt-1">{t('admin.waTemplateHint')}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingSettings || !isOnline}
                className="flex-1 min-w-[10rem] min-h-touch px-4 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-bold shadow-sm"
              >
                {savingSettings ? t('common.saving') : t('admin.saveSettingsBtn')}
              </button>

              <button
                type="button"
                onClick={handleWaTest}
                disabled={!isOnline}
                className="min-h-touch px-4 rounded-full bg-wa hover:bg-wa-hover disabled:opacity-50 text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>{t('admin.waTestBtn')}</span>
              </button>
            </div>
          </form>

          {/* Token Rahasia di PropertiesService */}
          <div className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3">
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

            <input
              type="password"
              value={waTokenInput}
              onChange={(e) => setWaTokenInput(e.target.value)}
              placeholder={t('admin.waTokenPlaceholder')}
              className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveWaToken}
                disabled={!isOnline}
                className="flex-1 min-w-[9rem] min-h-touch px-4 rounded-full bg-side text-[var(--on-side)] hover:opacity-95 text-xs font-bold"
              >
                {t('admin.saveTokenBtn')}
              </button>

              {settingsForm.wa_token_configured && (
                <button
                  type="button"
                  onClick={handleClearWaToken}
                  disabled={!isOnline}
                  className="min-h-touch px-4 rounded-full border border-rose-300/80 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold"
                >
                  {t('admin.clearTokenBtn')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DATA TERHAPUS (PEMULIHAN) */}
      {tab === 'deleted' && (
        <div className="space-y-4">
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
