import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext.jsx';
import {
  buildCalendarCells,
  formatIsoDate,
  getLocalTodayIso,
  getMonthNames,
  getWeekdayLabels,
  parseIsoDate
} from '../../lib/calendar.js';
import { formatTglLahir } from '../../lib/format.js';

/**
 * DatePicker kustom selaras desain Organic Pine / Teal (bebas <input type="date">).
 * Mendukung lompat bulan & tahun historis (mis. tahun kelahiran leluhur) secara cepat.
 */
export function DatePicker({
  id,
  value = '',
  onChange,
  placeholder,
  maxDate,
  minYear = 1000,
  disabled = false,
  clearable = true,
  ariaLabel,
  className = ''
}) {
  const { lang, t } = useI18n();

  const todayIso = getLocalTodayIso();
  const effectiveMax = maxDate || todayIso;
  const parsedMax = useMemo(() => parseIsoDate(effectiveMax), [effectiveMax]);
  const maxYear = parsedMax ? parsedMax.year : new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState('days'); // 'days' | 'months' | 'years'
  const [viewYear, setViewYear] = useState(() => Number(todayIso.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(todayIso.slice(5, 7)));
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(Number(todayIso.slice(0, 4)) / 12) * 12);
  const [yearJumpInput, setYearJumpInput] = useState('');

  const triggerRef = useRef(null);
  const closeBtnRef = useRef(null);

  const openPicker = () => {
    if (disabled) return;
    const base = parseIsoDate(value) || parseIsoDate(effectiveMax) || {
      year: Number(todayIso.slice(0, 4)),
      month: Number(todayIso.slice(5, 7)),
      day: Number(todayIso.slice(8, 10))
    };
    const clampedY = Math.max(minYear, Math.min(maxYear, base.year));
    setViewYear(clampedY);
    setViewMonth(base.month);
    setYearPageStart(Math.max(minYear, Math.floor(clampedY / 12) * 12));
    setYearJumpInput(String(clampedY));
    setViewMode('days');
    setOpen(true);
  };

  const closePicker = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      try {
        triggerRef.current?.focus({ preventScroll: true });
      } catch {
        // Abaikan jika tombol sudah terlepas
      }
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeBtnRef.current?.focus(), 10);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePicker();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, closePicker]);

  const { full: monthFullNames, short: monthShortNames } = useMemo(() => getMonthNames(lang), [lang]);
  const weekdayLabels = useMemo(() => getWeekdayLabels(lang), [lang]);

  const cells = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const canGoPrevMonth = viewYear > minYear || (viewYear === minYear && viewMonth > 1);
  const canGoNextMonth = !parsedMax || viewYear < parsedMax.year || (viewYear === parsedMax.year && viewMonth < parsedMax.month);

  const goPrevMonth = () => {
    if (!canGoPrevMonth) return;
    if (viewMonth === 1) {
      setViewYear((y) => Math.max(minYear, y - 1));
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (!canGoNextMonth) return;
    if (viewMonth === 12) {
      setViewYear((y) => Math.min(maxYear, y + 1));
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectIso = (iso) => {
    if (!iso || iso > effectiveMax) return;
    onChange?.(iso);
    closePicker();
  };

  const handleJumpYear = () => {
    const num = Number(String(yearJumpInput || '').trim());
    if (!Number.isInteger(num) || num < minYear || num > maxYear) return;
    setViewYear(num);
    if (parsedMax && num === parsedMax.year && viewMonth > parsedMax.month) {
      setViewMonth(parsedMax.month);
    }
    setYearPageStart(Math.max(minYear, Math.floor(num / 12) * 12));
    setViewMode('months');
  };

  const yearsGrid = useMemo(() => {
    const start = Math.max(minYear, yearPageStart);
    const list = [];
    for (let i = 0; i < 12; i++) {
      const y = start + i;
      if (y <= maxYear) list.push(y);
    }
    return list;
  }, [minYear, maxYear, yearPageStart]);

  const hasValue = Boolean(parseIsoDate(value));
  const formattedDisplay = hasValue ? formatTglLahir(value, lang) : '';
  const todayAllowed = todayIso <= effectiveMax;

  return (
    <>
      <div className={`relative flex items-center w-full ${className}`}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={openPicker}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel || t('datepicker.dialogTitle')}
          className={`w-full min-h-touch pl-3.5 ${
            clearable && hasValue && !disabled ? 'pr-11' : 'pr-3.5'
          } py-1.5 rounded-tile border border-[var(--line-2)] bg-surface-2 hover:bg-[var(--well)] text-sm font-semibold flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-500`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Calendar
              className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0"
              aria-hidden="true"
            />
            <span className={`truncate ${hasValue ? 'text-ink' : 'text-faint font-medium'}`}>
              {hasValue ? formattedDisplay : placeholder || t('datepicker.placeholder')}
            </span>
          </span>
          {!hasValue && (
            <span className="text-[0.6875rem] font-mono font-bold text-faint shrink-0">
              YYYY-MM-DD
            </span>
          )}
        </button>

        {clearable && hasValue && !disabled && (
          <button
            type="button"
            onClick={() => onChange?.('')}
            aria-label={t('datepicker.clear')}
            title={t('datepicker.clear')}
            className="absolute right-1.5 h-7 w-7 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('datepicker.dialogTitle')}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#081513]/45 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePicker();
          }}
        >
          <div className="w-full sm:max-w-[22.5rem] bg-raised border-t sm:border border-line rounded-t-[24px] sm:rounded-card shadow-float overflow-hidden flex flex-col drawer-enter sm:palette-enter">
            {/* Header Dialog */}
            <div className="px-4 py-3 border-b border-line bg-surface flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-brand-700 dark:text-brand-300 shrink-0" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-300 truncate">
                  {t('datepicker.dialogTitle')}
                </span>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closePicker}
                aria-label={t('common.close')}
                className="h-8 w-8 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-[var(--well)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigasi Bulan & Tahun */}
            <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-1.5">
              {viewMode === 'days' && (
                <button
                  type="button"
                  disabled={!canGoPrevMonth}
                  onClick={goPrevMonth}
                  aria-label={t('datepicker.prevMonth')}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink disabled:opacity-35"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {viewMode === 'years' && (
                <button
                  type="button"
                  disabled={yearPageStart <= minYear}
                  onClick={() => setYearPageStart((s) => Math.max(minYear, s - 12))}
                  aria-label={t('datepicker.prevYears')}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink disabled:opacity-35"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setViewMode((m) => (m === 'months' ? 'days' : 'months'))}
                  aria-label={t('datepicker.chooseMonth')}
                  className={`min-h-ctl px-3 rounded-full text-xs sm:text-sm font-bold border transition-colors ${
                    viewMode === 'months'
                      ? 'bg-brand-700 text-white border-brand-700'
                      : 'bg-surface-2 hover:bg-[var(--well)] border-line text-ink'
                  }`}
                >
                  {monthFullNames[viewMonth - 1]}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setYearJumpInput(String(viewYear));
                    setYearPageStart(Math.max(minYear, Math.floor(viewYear / 12) * 12));
                    setViewMode((m) => (m === 'years' ? 'days' : 'years'));
                  }}
                  aria-label={t('datepicker.chooseYear')}
                  className={`min-h-ctl px-3 rounded-full text-xs sm:text-sm font-bold font-mono border transition-colors ${
                    viewMode === 'years'
                      ? 'bg-brand-700 text-white border-brand-700'
                      : 'bg-surface-2 hover:bg-[var(--well)] border-line text-ink'
                  }`}
                >
                  {viewYear}
                </button>
              </div>

              {viewMode === 'days' && (
                <button
                  type="button"
                  disabled={!canGoNextMonth}
                  onClick={goNextMonth}
                  aria-label={t('datepicker.nextMonth')}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink disabled:opacity-35"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {viewMode === 'years' && (
                <button
                  type="button"
                  disabled={yearPageStart + 12 > maxYear}
                  onClick={() => setYearPageStart((s) => Math.min(maxYear, s + 12))}
                  aria-label={t('datepicker.nextYears')}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-surface-2 hover:bg-[var(--well)] border border-line text-ink disabled:opacity-35"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Area Isi Kalender */}
            <div className="px-3.5 pb-3.5">
              {viewMode === 'days' && (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-7 gap-1 text-center pt-1">
                    {weekdayLabels.map((wd) => (
                      <span
                        key={wd}
                        className="text-[0.6875rem] font-bold uppercase tracking-wide text-faint py-1"
                      >
                        {wd}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((cell) => {
                      const isDisabled = !cell.iso || cell.iso > effectiveMax;
                      const isSelected = Boolean(value && cell.iso === value);
                      const isToday = cell.iso === todayIso;

                      return (
                        <button
                          key={cell.iso || `${cell.year}-${cell.month}-${cell.day}`}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => handleSelectIso(cell.iso)}
                          aria-label={cell.iso ? formatTglLahir(cell.iso, lang) : undefined}
                          aria-pressed={isSelected}
                          className={`h-9 rounded-full text-xs font-bold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            isSelected
                              ? 'bg-brand-700 text-white shadow-sm'
                              : isToday
                              ? 'bg-brand-100/80 dark:bg-brand-950/60 text-brand-800 dark:text-brand-200 ring-1 ring-brand-500'
                              : cell.inCurrentMonth
                              ? 'text-ink hover:bg-surface-2'
                              : 'text-faint/70 hover:bg-surface-2'
                          }`}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {viewMode === 'months' && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-3 gap-1.5">
                    {monthShortNames.map((mLabel, idx) => {
                      const mNum = idx + 1;
                      const isMonthDisabled = Boolean(parsedMax && viewYear === parsedMax.year && mNum > parsedMax.month);
                      const isCurrent = mNum === viewMonth;
                      return (
                        <button
                          key={mLabel}
                          type="button"
                          disabled={isMonthDisabled}
                          onClick={() => {
                            setViewMonth(mNum);
                            setViewMode('days');
                          }}
                          className={`min-h-ctl px-2 rounded-full text-xs font-bold border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                            isCurrent
                              ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                              : 'bg-surface-2 hover:bg-[var(--well)] border-line text-ink'
                          }`}
                        >
                          {mLabel}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewMode('days')}
                    className="w-full min-h-ctl rounded-full text-xs font-bold text-muted hover:text-ink hover:bg-surface-2"
                  >
                    {t('datepicker.backToCalendar')}
                  </button>
                </div>
              )}

              {viewMode === 'years' && (
                <div className="space-y-2.5 pt-1">
                  {/* Lompat Tahun Langsung (aman di dalam <form> induk) */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={minYear}
                      max={maxYear}
                      value={yearJumpInput}
                      onChange={(e) => setYearJumpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleJumpYear();
                        }
                      }}
                      placeholder={t('datepicker.yearJumpPlaceholder')}
                      className="flex-1 min-w-0 min-h-ctl px-3 rounded-full border border-[var(--line-2)] bg-surface-2 text-ink placeholder:text-faint text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={handleJumpYear}
                      className="min-h-ctl px-3.5 rounded-full bg-side text-[var(--on-side)] text-xs font-bold hover:opacity-95 shrink-0"
                    >
                      {t('datepicker.applyYear')}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {yearsGrid.map((yr) => {
                      const isCurrent = yr === viewYear;
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            setViewYear(yr);
                            if (parsedMax && yr === parsedMax.year && viewMonth > parsedMax.month) {
                              setViewMonth(parsedMax.month);
                            }
                            setViewMode('months');
                          }}
                          className={`min-h-ctl px-2 rounded-full text-xs font-bold font-mono border transition-colors ${
                            isCurrent
                              ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                              : 'bg-surface-2 hover:bg-[var(--well)] border-line text-ink'
                          }`}
                        >
                          {yr}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewMode('days')}
                    className="w-full min-h-ctl rounded-full text-xs font-bold text-muted hover:text-ink hover:bg-surface-2"
                  >
                    {t('datepicker.backToCalendar')}
                  </button>
                </div>
              )}
            </div>

            {/* Footer Aksi Cepat */}
            <div className="px-3.5 py-2.5 border-t border-line bg-surface-2 flex flex-wrap items-center justify-between gap-2 pb-safe">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!todayAllowed}
                  onClick={() => handleSelectIso(todayIso)}
                  className="min-h-ctl px-3 rounded-full bg-brand-100/80 dark:bg-brand-950/50 text-brand-800 dark:text-brand-200 hover:bg-brand-100 text-xs font-bold disabled:opacity-40"
                >
                  {t('datepicker.today')}
                </button>
                {clearable && hasValue && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange?.('');
                      closePicker();
                    }}
                    className="min-h-ctl px-3 rounded-full border border-line bg-surface text-muted hover:text-ink text-xs font-bold"
                  >
                    {t('datepicker.clear')}
                  </button>
                )}
              </div>

              {hasValue && (
                <span className="text-[0.6875rem] font-bold text-muted px-2 py-0.5 rounded-full bg-surface border border-line">
                  {formattedDisplay}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
