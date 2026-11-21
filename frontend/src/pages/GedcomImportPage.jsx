import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileUp, GitFork, Play, SearchCheck, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { alertError, alertSuccess, confirmAction } from '../lib/swal.js';

const MAX_GEDCOM_BYTES = 5 * 1024 * 1024;

export function GedcomImportPage() {
  const { isOnline, triggerSync } = useAuth();
  const { t, translateError } = useI18n();

  const [fileInfo, setFileInfo] = useState(null);
  const [content, setContent] = useState('');
  const [mode, setMode] = useState('merge'); // merge | insert_only
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_GEDCOM_BYTES) {
      await alertError(t('gedcom.title'), t('gedcom.fileTooLarge'));
      return;
    }
    const text = await file.text();
    setContent(text);
    setFileInfo({ name: file.name, kb: Math.max(1, Math.round(file.size / 1024)) });
    setPreview(null);
    setImportResult(null);
  };

  const handlePreview = async () => {
    if (!content || busy) return;
    setBusy(true);
    setImportResult(null);
    try {
      const res = await api.gedcom.preview(content);
      setPreview(res);
    } catch (err) {
      await alertError(t('gedcom.previewBtn'), translateError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!content || !preview || busy) return;
    const ok = await confirmAction({
      title: t('gedcom.executeConfirmTitle'),
      text: t('gedcom.executeConfirmBody', {
        baru: preview.anggota_baru,
        update: mode === 'merge' ? preview.anggota_update : 0,
        nikah: preview.pernikahan_baru
      }),
      confirmText: t('gedcom.executeBtn'),
      cancelText: t('common.cancel')
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api.gedcom.import(content, mode);
      await triggerSync({ forceFull: true, silent: true });
      setImportResult(res);
      await alertSuccess(
        t('gedcom.importSuccessTitle'),
        t('gedcom.importSummary', {
          baru: res.anggota_baru,
          update: res.anggota_update,
          nikah: res.pernikahan_baru,
          linked: res.lineage_linked
        })
      );
    } catch (err) {
      await alertError(t('gedcom.title'), translateError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileUp className="w-5 h-5 text-brand-700 dark:text-brand-400" />
          <span>{t('gedcom.title')}</span>
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t('gedcom.subtitle')}</p>
      </div>

      {/* Pilih File & Mode */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <div>
          <label className="min-h-touch px-4 py-3 rounded-2xl border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-950/30 text-brand-800 dark:text-brand-200 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-brand-50">
            <FileUp className="w-5 h-5 shrink-0" />
            <span>{t('gedcom.fileLabel')}</span>
            <input
              type="file"
              accept=".ged,.gedcom,text/plain"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {fileInfo && (
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-2">
              {t('gedcom.fileLoaded', fileInfo)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('gedcom.modeLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ['merge', t('gedcom.modeMerge')],
              ['insert_only', t('gedcom.modeInsertOnly')]
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMode(val)}
                className={`flex-1 min-w-[12rem] min-h-touch px-3.5 py-2 rounded-xl text-xs font-bold border text-left ${
                  mode === val
                    ? 'bg-brand-700 text-white border-brand-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!content || busy || !isOnline}
          onClick={handlePreview}
          className="w-full min-h-touch px-4 py-3 rounded-xl bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 disabled:opacity-50 text-sm font-bold flex items-center justify-center gap-2"
        >
          <SearchCheck className="w-4 h-4" />
          <span>{busy && !preview ? t('gedcom.previewing') : t('gedcom.previewBtn')}</span>
        </button>
      </section>

      {/* Hasil Pratinjau */}
      {preview && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('gedcom.previewTitle')}
          </h2>

          <div className="flex flex-wrap gap-2.5">
            {[
              [t('gedcom.totalIndi'), preview.total_indi],
              [t('gedcom.newMembers'), preview.anggota_baru],
              [t('gedcom.updatedMembers'), mode === 'merge' ? preview.anggota_update : 0],
              [t('gedcom.totalFam'), preview.total_fam],
              [t('gedcom.newMarriages'), preview.pernikahan_baru],
              [t('gedcom.existingMarriages'), preview.pernikahan_existing]
            ].map(([label, val]) => (
              <div
                key={label}
                className="flex-1 min-w-[8.5rem] p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70"
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{val}</p>
              </div>
            ))}
          </div>

          {preview.sample_baru?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {t('gedcom.sampleNewTitle')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.sample_baru.map((s) => (
                  <span
                    key={s.xref}
                    className="px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-800 dark:text-brand-200 text-xs font-semibold"
                  >
                    {s.nama_lengkap} ({s.jenis_kelamin})
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.warnings?.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{t('gedcom.warningsTitle', { n: preview.warnings.length })}</span>
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                {preview.warnings.slice(0, 10).map((w, i) => (
                  <li key={`${w.xref}_${i}`}>
                    {w.xref}: {w.code}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled={busy || !isOnline}
            onClick={handleImport}
            className="w-full min-h-touch px-5 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-brand-700/20"
          >
            <Play className="w-4 h-4" />
            <span>{busy ? t('gedcom.executing') : t('gedcom.executeBtn')}</span>
          </button>
        </section>
      )}

      {/* Hasil Eksekusi Impor */}
      {importResult && (
        <section className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>{t('gedcom.importSuccessTitle')}</span>
          </div>
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            {t('gedcom.importSummary', {
              baru: importResult.anggota_baru,
              update: importResult.anggota_update,
              nikah: importResult.pernikahan_baru,
              linked: importResult.lineage_linked
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/pohon"
              className="min-h-touch px-4 rounded-xl bg-brand-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <GitFork className="w-4 h-4" />
              <span>{t('gedcom.openTreeBtn')}</span>
            </Link>
            <Link
              to="/daftar"
              className="min-h-touch px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>{t('gedcom.openDirectoryBtn')}</span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
