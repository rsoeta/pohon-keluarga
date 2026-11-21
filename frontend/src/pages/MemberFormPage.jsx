import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Camera, Save, Trash2, X } from 'lucide-react';
import { db } from '../db/dexie.js';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { canDelete, canEditAnggota, isAdmin } from '../lib/rbac.js';
import { compressImageFile } from '../lib/imageCompress.js';
import { validateBirthDateInput } from '../lib/format.js';
import { alertError, confirmAction, toastError, toastSuccess } from '../lib/swal.js';
import { MemberAvatar } from '../components/common/MemberAvatar.jsx';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';

export function MemberFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isOnline, triggerSync } = useAuth();
  const { t, translateError } = useI18n();

  const admin = isAdmin(user);
  const anggotaList = useLiveQuery(() => db.anggota.toArray(), [], []);
  const pernikahanList = useLiveQuery(() => db.pernikahan.toArray(), [], []);

  const activeMembers = useMemo(
    () =>
      (anggotaList || [])
        .filter((a) => a && !a.is_deleted)
        .sort((a, b) => String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''))),
    [anggotaList]
  );

  const byId = useMemo(() => {
    const m = new Map();
    activeMembers.forEach((a) => m.set(a.id_anggota, a));
    return m;
  }, [activeMembers]);

  const existing = isEdit ? byId.get(id) || null : null;

  // Cek otorisasi edit di UI (penegakan akhir tetap di server GAS)
  const allowedEdit = !isEdit || canEditAnggota(user, id, anggotaList, pernikahanList);
  useEffect(() => {
    if (isEdit && anggotaList.length && !allowedEdit) {
      toastError(t('errors.FORBIDDEN'));
      navigate(`/profil/${id}`, { replace: true });
    }
  }, [isEdit, anggotaList.length, allowedEdit, id, navigate, t]);

  // Mode penambahan
  const qMode = searchParams.get('mode') || '';
  const qTarget = searchParams.get('target') || '';
  const initialMode = useMemo(() => {
    if (isEdit) return 'edit';
    if (!admin) return qMode === 'pasangan' ? 'spouse' : 'child';
    if (qMode === 'pasangan') return 'spouse';
    if (qMode === 'anak') return 'child';
    return 'independent';
  }, [isEdit, admin, qMode]);

  const [addMode, setAddMode] = useState(initialMode);
  const [targetId, setTargetId] = useState(() =>
    !admin ? user?.id_anggota || '' : qTarget || ''
  );

  // Field form biodata
  const [namaLengkap, setNamaLengkap] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState('L');
  const [birthMode, setBirthMode] = useState('empty'); // full | year | empty
  const [birthFull, setBirthFull] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [statusHidup, setStatusHidup] = useState(true);
  const [statusAnak, setStatusAnak] = useState('Kandung');
  const [urutanAnak, setUrutanAnak] = useState('');
  const [domisili, setDomisili] = useState('');
  const [noWa, setNoWa] = useState('');

  // Relasi pernikahan (saat mode === 'spouse')
  const [marriageStatus, setMarriageStatus] = useState('Aktif');
  const [spouseOrder, setSpouseOrder] = useState('');

  // Relasi orang tua (mode === 'child'/'independent' atau edit anak/admin)
  const [idAyah, setIdAyah] = useState('');
  const [idIbu, setIdIbu] = useState('');

  // Foto
  const [compressedPhoto, setCompressedPhoto] = useState(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [initializedForId, setInitializedForId] = useState('');

  // Inisialisasi nilai saat Edit
  useEffect(() => {
    if (!isEdit || !existing || initializedForId === existing.id_anggota) return;
    setNamaLengkap(existing.nama_lengkap || '');
    setJenisKelamin(existing.jenis_kelamin || 'L');
    const tgl = String(existing.tgl_lahir || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
      setBirthMode('full');
      setBirthFull(tgl);
      setBirthYear('');
    } else if (/^\d{4}$/.test(tgl)) {
      setBirthMode('year');
      setBirthYear(tgl);
      setBirthFull('');
    } else {
      setBirthMode('empty');
      setBirthFull('');
      setBirthYear('');
    }
    setStatusHidup(existing.status_hidup !== false);
    setStatusAnak(existing.status_anak === 'Angkat' ? 'Angkat' : 'Kandung');
    setUrutanAnak(existing.urutan_anak ? String(existing.urutan_anak) : '');
    setDomisili(existing.domisili || '');
    setNoWa(existing.no_wa || '');
    setIdAyah(existing.id_ayah || '');
    setIdIbu(existing.id_ibu || '');
    setCompressedPhoto(null);
    setRemoveExistingPhoto(false);
    setInitializedForId(existing.id_anggota);
  }, [isEdit, existing, initializedForId]);

  // Sinkronisasi targetId otomatis untuk user biasa / parameter URL
  useEffect(() => {
    if (isEdit) return;
    if (!admin) {
      setTargetId(user?.id_anggota || '');
    } else if (qTarget && byId.has(qTarget)) {
      setTargetId(qTarget);
    }
  }, [isEdit, admin, user?.id_anggota, qTarget, byId]);

  // Saat mode tambah pasangan: otomatis tentukan gender lawan jenis dari partner
  useEffect(() => {
    if (isEdit || addMode !== 'spouse' || !targetId) return;
    const partner = byId.get(targetId);
    if (partner) {
      setJenisKelamin(partner.jenis_kelamin === 'L' ? 'P' : 'L');
    }
  }, [isEdit, addMode, targetId, byId]);

  // Saat mode tambah anak: otomatis isi idAyah/idIbu berdasarkan targetId
  useEffect(() => {
    if (isEdit || addMode !== 'child' || !targetId) return;
    const parent = byId.get(targetId);
    if (!parent) return;
    if (parent.jenis_kelamin === 'L') {
      setIdAyah(parent.id_anggota);
      // Pilih pasangan aktif pertama jika tersedia
      const activeSp = (pernikahanList || []).find(
        (m) => !m.is_deleted && m.id_suami === parent.id_anggota && m.status_pernikahan === 'Aktif'
      );
      if (activeSp && !idIbu) setIdIbu(activeSp.id_istri);
    } else {
      setIdIbu(parent.id_anggota);
      const activeSp = (pernikahanList || []).find(
        (m) => !m.is_deleted && m.id_istri === parent.id_anggota && m.status_pernikahan === 'Aktif'
      );
      if (activeSp && !idAyah) setIdAyah(activeSp.id_suami);
    }
  }, [isEdit, addMode, targetId, byId, pernikahanList]);

  // Apakah gender terkunci pada mode edit?
  const genderLocked = useMemo(() => {
    if (!isEdit || !existing) return addMode === 'spouse' && Boolean(targetId);
    const hasChild = activeMembers.some((a) => a.id_ayah === existing.id_anggota || a.id_ibu === existing.id_anggota);
    const hasMar = (pernikahanList || []).some(
      (m) => !m.is_deleted && (m.id_suami === existing.id_anggota || m.id_istri === existing.id_anggota)
    );
    return hasChild || hasMar;
  }, [isEdit, existing, addMode, targetId, activeMembers, pernikahanList]);

  // Bolehkah mengedit id_ayah/id_ibu pada mode edit?
  const canEditLineageOnEdit = useMemo(() => {
    if (!isEdit || !existing) return false;
    if (admin) return true;
    const me = user?.id_anggota;
    return Boolean(me && existing.id_anggota !== me && (existing.id_ayah === me || existing.id_ibu === me));
  }, [isEdit, existing, admin, user?.id_anggota]);

  // Daftar pasangan yang sah untuk opsi orang tua kedua bagi user biasa
  const mySpouses = useMemo(() => {
    const me = user?.id_anggota;
    if (!me) return [];
    return (pernikahanList || [])
      .filter((m) => !m.is_deleted && (m.id_suami === me || m.id_istri === me))
      .map((m) => byId.get(m.id_suami === me ? m.id_istri : m.id_suami))
      .filter(Boolean);
  }, [user?.id_anggota, pernikahanList, byId]);

  const fatherOptions = useMemo(() => {
    if (admin) return activeMembers.filter((a) => a.jenis_kelamin === 'L' && a.id_anggota !== id);
    const me = byId.get(user?.id_anggota);
    const list = [me, ...mySpouses].filter((a) => a && a.jenis_kelamin === 'L');
    return list;
  }, [admin, activeMembers, id, byId, user?.id_anggota, mySpouses]);

  const motherOptions = useMemo(() => {
    if (admin) return activeMembers.filter((a) => a.jenis_kelamin === 'P' && a.id_anggota !== id);
    const me = byId.get(user?.id_anggota);
    const list = [me, ...mySpouses].filter((a) => a && a.jenis_kelamin === 'P');
    return list;
  }, [admin, activeMembers, id, byId, user?.id_anggota, mySpouses]);

  // Pernikahan terkait profil pada mode Edit (bisa diperbarui statusnya)
  const editableMarriages = useMemo(() => {
    if (!isEdit || !existing) return [];
    const me = user?.id_anggota;
    return (pernikahanList || [])
      .filter((m) => {
        if (!m || m.is_deleted) return false;
        if (m.id_suami !== existing.id_anggota && m.id_istri !== existing.id_anggota) return false;
        return admin || m.id_suami === me || m.id_istri === me;
      })
      .map((m) => ({
        pernikahan: m,
        partner: byId.get(m.id_suami === existing.id_anggota ? m.id_istri : m.id_suami) || null
      }))
      .filter((x) => x.partner);
  }, [isEdit, existing, pernikahanList, admin, user?.id_anggota, byId]);

  const [marriageEdits, setMarriageEdits] = useState({});
  useEffect(() => {
    const init = {};
    editableMarriages.forEach(({ pernikahan }) => {
      init[pernikahan.id_pernikahan] = {
        status_pernikahan: pernikahan.status_pernikahan || 'Aktif',
        urutan_pasangan: pernikahan.urutan_pasangan ? String(pernikahan.urutan_pasangan) : ''
      };
    });
    setMarriageEdits(init);
  }, [editableMarriages]);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const comp = await compressImageFile(file);
      setCompressedPhoto(comp);
      setRemoveExistingPhoto(false);
    } catch (err) {
      if (err?.code === 'INVALID_IMAGE_TYPE' || err?.code === 'INVALID_IMAGE_FILE') {
        await alertError(t('form.photoSection'), t('form.invalidPhotoType'));
      } else {
        await alertError(t('form.photoSection'), translateError(err));
      }
    }
  };

  const handleSaveMarriage = async (idPernikahan) => {
    const ed = marriageEdits[idPernikahan];
    if (!ed) return;
    try {
      await api.pernikahan.update(idPernikahan, {
        status_pernikahan: ed.status_pernikahan,
        urutan_pasangan: ed.urutan_pasangan ? Number(ed.urutan_pasangan) : null
      });
      await triggerSync({ forceFull: false, silent: true });
      toastSuccess(t('form.marriageUpdated'));
    } catch (err) {
      await alertError(t('form.manageMarriagesTitle'), translateError(err));
    }
  };

  const handleDeleteMember = async () => {
    if (!existing) return;
    const ok = await confirmAction({
      title: t('profile.deleteConfirmTitle', { name: existing.nama_lengkap }),
      text: t('profile.deleteConfirmBody'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;
    try {
      await api.anggota.delete(existing.id_anggota);
      await triggerSync({ forceFull: false, silent: true });
      toastSuccess(t('profile.deleteSuccess'));
      navigate('/daftar', { replace: true });
    } catch (err) {
      await alertError(t('profile.deleteBtn'), translateError(err));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const cleanName = namaLengkap.trim();
    if (cleanName.length < 2) {
      await alertError(t('common.requiredFields'));
      return;
    }

    const birthCheck = validateBirthDateInput(birthMode, birthFull, birthYear);
    if (!birthCheck.ok) {
      await alertError(t('form.birthModeLabel'), t('form.invalidBirthDate'));
      return;
    }

    const cleanWaRaw = noWa.trim();
    if (cleanWaRaw) {
      const digits = cleanWaRaw.replace(/[^\d]/g, '');
      if (digits.length < 8 || digits.length > 15) {
        await alertError(t('form.noWa'), t('form.invalidPhone'));
        return;
      }
    }

    if (!isEdit && addMode === 'spouse' && !targetId) {
      await alertError(t('form.marriageSection'), t('common.requiredFields'));
      return;
    }

    const dataPayload = {
      nama_lengkap: cleanName,
      jenis_kelamin: jenisKelamin,
      tgl_lahir: birthCheck.value,
      status_hidup: Boolean(statusHidup),
      status_anak: statusAnak,
      urutan_anak: urutanAnak ? Number(urutanAnak) : null,
      domisili: domisili.trim(),
      no_wa: cleanWaRaw
    };

    if (!isEdit && addMode !== 'spouse') {
      if (idAyah) dataPayload.id_ayah = idAyah;
      if (idIbu) dataPayload.id_ibu = idIbu;
    } else if (isEdit && canEditLineageOnEdit) {
      dataPayload.id_ayah = idAyah || '';
      dataPayload.id_ibu = idIbu || '';
    }

    setSaving(true);
    try {
      let targetAnggotaId = id;
      if (isEdit) {
        const res = await api.anggota.update(id, dataPayload);
        targetAnggotaId = res.anggota?.id_anggota || id;
      } else {
        const createPayload = { data: dataPayload };
        if (addMode === 'spouse') {
          createPayload.relasi = {
            jenis: 'PASANGAN',
            id_pasangan: targetId,
            status_pernikahan: marriageStatus,
            urutan_pasangan: spouseOrder ? Number(spouseOrder) : null
          };
        }
        const res = await api.anggota.create(createPayload);
        targetAnggotaId = res.anggota?.id_anggota;
      }

      if (targetAnggotaId) {
        if (compressedPhoto) {
          try {
            const up = await api.foto.upload({
              id_anggota: targetAnggotaId,
              mime_type: compressedPhoto.mime_type,
              data_base64: compressedPhoto.data_base64
            });
            if (up?.foto_file_id) {
              await db.fotos.put({
                file_id: up.foto_file_id,
                mime_type: compressedPhoto.mime_type,
                data_url: compressedPhoto.data_url,
                fetched_at: Date.now()
              });
            }
          } catch {
            toastError(t('form.photoWarning'));
          }
        } else if (isEdit && removeExistingPhoto && existing?.foto_file_id) {
          await api.foto.remove(targetAnggotaId).catch(() => {});
        }
      }

      await triggerSync({ forceFull: false, silent: true });
      toastSuccess(isEdit ? t('form.updateSuccess') : t('form.createSuccess'));
      navigate(targetAnggotaId ? `/profil/${targetAnggotaId}` : '/daftar', { replace: true });
    } catch (err) {
      await alertError(isEdit ? t('form.editTitle') : t('form.addTitle'), translateError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isEdit && !admin && !user?.id_anggota) {
    return (
      <div className="bg-surface rounded-card border border-line p-6 text-center space-y-3 shadow-card">
        <h1 className="text-lg font-bold text-ink">{t('form.needLinkedProfileTitle')}</h1>
        <p className="text-sm text-muted max-w-md mx-auto">{t('form.needLinkedProfileDesc')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="min-h-touch px-4 rounded-full bg-surface border border-line text-sm font-bold text-ink inline-flex items-center gap-2 shadow-card hover:bg-surface-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-ink">
          {isEdit ? t('form.editTitle') : t('form.addTitle')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Mode Tambah */}
        {!isEdit && (
          <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-faint">
              {t('form.modeLabel')}
            </p>
            <SegmentedPillControl
              ariaLabel={t('form.modeLabel')}
              value={addMode}
              onChange={setAddMode}
              fullWidth
              tone="brand"
              className="bg-surface-2"
              buttonClassName="min-w-[8.5rem]"
              options={
                !admin
                  ? [
                      { value: 'spouse', label: t('form.modeSelfSpouse') },
                      { value: 'child', label: t('form.modeSelfChild') }
                    ]
                  : [
                      { value: 'independent', label: t('form.modeIndependent') },
                      { value: 'spouse', label: t('form.modeSpouseFor') },
                      { value: 'child', label: t('form.modeChildFor') }
                    ]
              }
            />
          </section>
        )}

        {/* Unggah & Kompresi Foto Profil */}
        <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-faint">
            {t('form.photoSection')}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <MemberAvatar
              fileId={removeExistingPhoto ? '' : existing?.foto_file_id || ''}
              previewUrl={compressedPhoto?.data_url || ''}
              name={namaLengkap || 'P K'}
              gender={jenisKelamin}
              isLiving={statusHidup}
              size="xl"
            />
            <div className="flex-1 min-w-[12rem] space-y-2">
              <div className="flex flex-wrap gap-2">
                <label className="min-h-touch px-4 py-2 rounded-full bg-brand-100/80 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800 text-brand-800 dark:text-brand-200 text-xs font-bold inline-flex items-center gap-2 cursor-pointer hover:bg-brand-100">
                  <Camera className="w-4 h-4" />
                  <span>{t('form.choosePhoto')}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoSelect}
                    className="sr-only"
                  />
                </label>

                {(compressedPhoto || (isEdit && existing?.foto_file_id && !removeExistingPhoto)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompressedPhoto(null);
                      if (existing?.foto_file_id) setRemoveExistingPhoto(true);
                    }}
                    className="min-h-touch px-3.5 rounded-full border border-rose-300/80 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <X className="w-4 h-4" />
                    <span>{t('form.removePhoto')}</span>
                  </button>
                )}
              </div>

              <p className="text-xs text-muted">
                {compressedPhoto
                  ? t('form.compressedInfo', {
                      kb: Math.max(1, Math.round(compressedPhoto.size / 1024)),
                      mime: compressedPhoto.mime_type
                    })
                  : removeExistingPhoto
                  ? t('form.photoRemovedPending')
                  : t('form.photoHint')}
              </p>
            </div>
          </div>
        </section>

        {/* Relasi Pernikahan saat tambah pasangan */}
        {!isEdit && addMode === 'spouse' && (
          <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-faint">
              {t('form.marriageSection')}
            </p>
            {admin && (
              <div>
                <label className="block text-sm font-bold text-ink mb-1">{t('form.partnerWith')}</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                >
                  <option value="">{t('form.selectMember')}</option>
                  {activeMembers.map((a) => (
                    <option key={a.id_anggota} value={a.id_anggota}>
                      {a.nama_lengkap} (#{a.kode_unik})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[9rem]">
                <label className="block text-sm font-bold text-ink mb-1">{t('form.marriageStatus')}</label>
                <select
                  value={marriageStatus}
                  onChange={(e) => setMarriageStatus(e.target.value)}
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                >
                  <option value="Aktif">{t('common.marriedActive')}</option>
                  <option value="Cerai">{t('common.marriedDivorced')}</option>
                  <option value="Wafat">{t('common.marriedWidowed')}</option>
                </select>
              </div>
              <div className="w-36">
                <label className="block text-sm font-bold text-ink mb-1">{t('form.spouseOrder')}</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={spouseOrder}
                  onChange={(e) => setSpouseOrder(e.target.value)}
                  placeholder="1"
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
                />
              </div>
            </div>
          </section>
        )}

        {/* Biodata Utama */}
        <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-4">
          <div>
            <label htmlFor="f-nama" className="block text-sm font-bold text-ink mb-1.5">
              {t('form.fullName')} *
            </label>
            <input
              id="f-nama"
              type="text"
              required
              maxLength={120}
              value={namaLengkap}
              onChange={(e) => setNamaLengkap(e.target.value)}
              placeholder={t('form.fullNamePlaceholder')}
              className="w-full min-h-touch px-4 py-2.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-ink mb-1.5">{t('form.gender')}</label>
            <SegmentedPillControl
              ariaLabel={t('form.gender')}
              value={jenisKelamin}
              onChange={setJenisKelamin}
              fullWidth
              tone="brand"
              className="bg-surface-2"
              buttonClassName="min-w-[8rem] text-sm"
              options={[
                { value: 'L', label: t('common.male'), disabled: genderLocked },
                { value: 'P', label: t('common.female'), disabled: genderLocked }
              ]}
            />
            {genderLocked && isEdit && (
              <p className="text-xs text-muted mt-1">{t('form.genderLockedHint')}</p>
            )}
          </div>

          {/* Tanggal Lahir 3 Mode */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-ink">{t('form.birthModeLabel')}</label>
            <SegmentedPillControl
              ariaLabel={t('form.birthModeLabel')}
              value={birthMode}
              onChange={setBirthMode}
              fullWidth
              tone="brand"
              className="bg-surface-2"
              buttonClassName="min-w-[6.5rem]"
              options={[
                { value: 'full', label: t('form.birthModeFull') },
                { value: 'year', label: t('form.birthModeYear') },
                { value: 'empty', label: t('form.birthModeEmpty') }
              ]}
            />

            {birthMode === 'full' && (
              <input
                type="date"
                value={birthFull}
                onChange={(e) => setBirthFull(e.target.value)}
                className="w-full min-h-touch px-4 py-2.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold"
              />
            )}
            {birthMode === 'year' && (
              <input
                type="number"
                min="1000"
                max={new Date().getFullYear()}
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder={t('form.yearPlaceholder')}
                className="w-full min-h-touch px-4 py-2.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
              />
            )}
          </div>

          {/* Status Hidup & Anak */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-sm font-bold text-ink mb-1.5">{t('form.livingStatus')}</label>
              <SegmentedPillControl
                ariaLabel={t('form.livingStatus')}
                value={statusHidup}
                onChange={setStatusHidup}
                fullWidth
                tone="pine"
                className="bg-surface-2"
                options={[
                  { value: true, label: t('common.living') },
                  { value: false, label: t('common.deceased') }
                ]}
              />
            </div>

            <div className="flex-1 min-w-[12rem]">
              <label className="block text-sm font-bold text-ink mb-1.5">{t('form.childStatus')}</label>
              <SegmentedPillControl
                ariaLabel={t('form.childStatus')}
                value={statusAnak}
                onChange={setStatusAnak}
                fullWidth
                tone="heritage"
                className="bg-surface-2"
                options={[
                  { value: 'Kandung', label: t('common.biological') },
                  { value: 'Angkat', label: t('common.adopted') }
                ]}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-36">
              <label htmlFor="f-urutan" className="block text-sm font-bold text-ink mb-1">
                {t('form.childOrder')}
              </label>
              <input
                id="f-urutan"
                type="number"
                min="1"
                max="30"
                value={urutanAnak}
                onChange={(e) => setUrutanAnak(e.target.value)}
                placeholder={t('form.childOrderPlaceholder')}
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
              />
            </div>

            <div className="flex-1 min-w-[11rem]">
              <label htmlFor="f-domisili" className="block text-sm font-bold text-ink mb-1">
                {t('form.domicile')}
              </label>
              <input
                id="f-domisili"
                type="text"
                maxLength={120}
                value={domisili}
                onChange={(e) => setDomisili(e.target.value)}
                placeholder={t('form.domicilePlaceholder')}
                className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
              />
            </div>
          </div>

          <div>
            <label htmlFor="f-wa" className="block text-sm font-bold text-ink mb-1">
              {t('form.noWa')}
            </label>
            <input
              id="f-wa"
              type="tel"
              value={noWa}
              onChange={(e) => setNoWa(e.target.value)}
              placeholder={t('form.noWaPlaceholder')}
              className="w-full min-h-touch px-4 py-2.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-sm font-semibold"
            />
          </div>
        </section>

        {/* Orang Tua (ketika mode anak/mandiri atau edit anak/admin) */}
        {((!isEdit && addMode !== 'spouse') || canEditLineageOnEdit) && (
          <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-faint">
              {t('form.lineageSection')}
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[11rem]">
                <label className="block text-sm font-bold text-ink mb-1">{t('form.fatherLabel')}</label>
                <select
                  value={idAyah}
                  disabled={!admin && byId.get(user?.id_anggota)?.jenis_kelamin === 'L'}
                  onChange={(e) => setIdAyah(e.target.value)}
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold disabled:opacity-70"
                >
                  <option value="">{t('form.noneSelected')}</option>
                  {fatherOptions.map((a) => (
                    <option key={a.id_anggota} value={a.id_anggota}>
                      {a.nama_lengkap} (#{a.kode_unik})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 min-w-[11rem]">
                <label className="block text-sm font-bold text-ink mb-1">{t('form.motherLabel')}</label>
                <select
                  value={idIbu}
                  disabled={!admin && byId.get(user?.id_anggota)?.jenis_kelamin === 'P'}
                  onChange={(e) => setIdIbu(e.target.value)}
                  className="w-full min-h-touch px-3.5 rounded-tile border border-[var(--line-2)] bg-surface-2 text-ink text-sm font-semibold disabled:opacity-70"
                >
                  <option value="">{t('form.noneSelected')}</option>
                  {motherOptions.map((a) => (
                    <option key={a.id_anggota} value={a.id_anggota}>
                      {a.nama_lengkap} (#{a.kode_unik})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        <button
          type="submit"
          disabled={saving || !isOnline}
          className="w-full min-h-touch px-5 py-3 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white font-bold text-base flex items-center justify-center gap-2 shadow-sm"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? t('common.saving') : t('common.save')}</span>
        </button>
      </form>

      {/* Kelola Status Pernikahan Eksisting pada Mode Edit */}
      {isEdit && editableMarriages.length > 0 && (
        <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
            {t('form.manageMarriagesTitle')}
          </h2>
          {editableMarriages.map(({ pernikahan, partner }) => {
            const ed = marriageEdits[pernikahan.id_pernikahan] || {
              status_pernikahan: pernikahan.status_pernikahan,
              urutan_pasangan: String(pernikahan.urutan_pasangan || '')
            };
            return (
              <div
                key={pernikahan.id_pernikahan}
                className="p-3 rounded-tile bg-surface-2 border border-line flex flex-wrap items-center justify-between gap-2"
              >
                <p className="text-sm font-bold text-ink min-w-[8rem] flex-1">
                  {partner.nama_lengkap}
                </p>
                <select
                  value={ed.status_pernikahan}
                  onChange={(e) =>
                    setMarriageEdits((prev) => ({
                      ...prev,
                      [pernikahan.id_pernikahan]: { ...ed, status_pernikahan: e.target.value }
                    }))
                  }
                  className="min-h-touch px-3 rounded-tile border border-[var(--line-2)] bg-surface text-ink text-xs font-bold"
                >
                  <option value="Aktif">{t('common.marriedActive')}</option>
                  <option value="Cerai">{t('common.marriedDivorced')}</option>
                  <option value="Wafat">{t('common.marriedWidowed')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleSaveMarriage(pernikahan.id_pernikahan)}
                  disabled={!isOnline}
                  className="min-h-touch px-3.5 rounded-full bg-side text-[var(--on-side)] text-xs font-bold"
                >
                  {t('form.saveMarriageBtn')}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* Tombol Hapus Khusus Admin */}
      {isEdit && canDelete(user) && existing && (
        <button
          type="button"
          onClick={handleDeleteMember}
          disabled={!isOnline}
          className="w-full min-h-touch px-4 py-3 rounded-full border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-sm flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>{t('profile.deleteBtn')}</span>
        </button>
      )}
    </div>
  );
}
