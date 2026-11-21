import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileUp, GitFork, Play, SearchCheck, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useI18n } from '../contexts/I18nContext.jsx';
import { alertError, alertSuccess, confirmAction } from '../lib/swal.js';
import { SegmentedPillControl } from '../components/common/SegmentedPillControl.jsx';

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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink flex items-center gap-2">
          <FileUp className="w-5 h-5 text-brand-700 dark:text-brand-300" />
          <span>{t('gedcom.title')}</span>
        </h1>
        <p className="text-sm text-muted mt-1">{t('gedcom.subtitle')}</p>
      </div>

      {/* Pilih File & Mode */}
      <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-4">
        <div>
          <label className="min-h-touch px-4 py-3 rounded-tile border-2 border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-950/30 text-brand-800 dark:text-brand-200 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-brand-100/50 dark:hover:bg-brand-950/50">
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
          <p className="text-xs font-bold uppercase tracking-wider text-faint">
            {t('gedcom.modeLabel')}
          </p>
          <SegmentedPillControl
            ariaLabel={t('gedcom.modeLabel')}
            value={mode}
            onChange={setMode}
            fullWidth
            tone="brand"
            className="bg-surface-2"
            buttonClassName="min-w-[12rem] py-2"
            options={[
              { value: 'merge', label: t('gedcom.modeMerge') },
              { value: 'insert_only', label: t('gedcom.modeInsertOnly') }
            ]}
          />
        </div>

        <button
          type="button"
          disabled={!content || busy || !isOnline}
          onClick={handlePreview}
          className="w-full min-h-touch px-4 py-3 rounded-full bg-side text-[var(--on-side)] disabled:opacity-50 text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:opacity-95"
        >
          <SearchCheck className="w-4 h-4" />
          <span>{busy && !preview ? t('gedcom.previewing') : t('gedcom.previewBtn')}</span>
        </button>
      </section>

      {/* Hasil Pratinjau */}
      {preview && (
        <section className="bg-surface rounded-card border border-line p-4 sm:p-5 shadow-card space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-faint">
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
                className="flex-1 min-w-[8.5rem] p-3 rounded-tile bg-surface-2 border border-line"
              >
                <p className="text-xs font-semibold text-muted">{label}</p>
                <p className="text-xl font-bold text-ink">{val}</p>
              </div>
            ))}
          </div>

          {preview.sample_baru?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted">{t('gedcom.sampleNewTitle')}</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.sample_baru.map((s) => (
                  <span
                    key={s.xref}
                    className="px-2.5 py-1 rounded-full bg-brand-100/80 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 text-xs font-semibold"
                  >
                    {s.nama_lengkap} ({s.jenis_kelamin})
                  </span>
                ))}
              </div>
            </div>
          )}

          {preview.warnings?.length > 0 && (
            <div className="p-3.5 rounded-tile bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1">
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
            className="w-full min-h-touch px-5 py-3 rounded-full bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
          >
            <Play className="w-4 h-4" />
            <span>{busy ? t('gedcom.executing') : t('gedcom.executeBtn')}</span>
          </button>
        </section>
      )}

      {/* Hasil Eksekusi Impor */}
      {importResult && (
        <section className="bg-emerald-50/90 dark:bg-emerald-950/30 rounded-card border border-emerald-200 dark:border-emerald-800 p-4 sm:p-5 space-y-3 shadow-card">
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
              className="min-h-touch px-4 rounded-full bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <GitFork className="w-4 h-4" />
              <span>{t('gedcom.openTreeBtn')}</span>
            </Link>
            <Link
              to="/daftar"
              className="min-h-touch px-4 rounded-full bg-surface border border-line text-ink text-xs font-bold inline-flex items-center gap-1.5"
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
