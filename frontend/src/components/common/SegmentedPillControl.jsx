import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const TONE_INDICATOR_CLASS = {
  brand: 'bg-brand-700',
  pine: 'bg-side',
  heritage: 'bg-heritage-700'
};

const TONE_ACTIVE_TEXT = {
  brand: 'text-white',
  pine: 'text-[var(--on-side)]',
  heritage: 'text-white'
};

/**
 * Kontrol tab/filter/pilihan dengan indikator pill yang bergeser halus 2D.
 * Mengukur koordinat nyata via getBoundingClientRect + ResizeObserver (aman untuk multi-baris di mobile).
 */
export function SegmentedPillControl({
  options = [],
  value,
  onChange,
  tone = 'brand',
  fullWidth = false,
  role = 'group',
  ariaLabel,
  leading = null,
  className = '',
  buttonClassName = ''
}) {
  const containerRef = useRef(null);
  const itemRefs = useRef(new Map());
  const hasMeasuredRef = useRef(false);

  const [indicator, setIndicator] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
    animate: false
  });

  const optionsKey = options
    .map((opt) => `${String(opt.value)}:${String(opt.label)}:${opt.disabled ? '1' : '0'}`)
    .join('|');

  const measure = useCallback(() => {
    const container = containerRef.current;
    const activeEl = itemRefs.current.get(String(value));
    if (!container || !activeEl) {
      setIndicator((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }

    const cRect = container.getBoundingClientRect();
    const bRect = activeEl.getBoundingClientRect();
    const left = bRect.left - cRect.left - container.clientLeft;
    const top = bRect.top - cRect.top - container.clientTop;
    const width = bRect.width;
    const height = bRect.height;

    const shouldAnimate = hasMeasuredRef.current;

    setIndicator((prev) => {
      if (
        prev.left === left &&
        prev.top === top &&
        prev.width === width &&
        prev.height === height &&
        prev.ready &&
        prev.animate === shouldAnimate
      ) {
        return prev;
      }
      return { left, top, width, height, ready: true, animate: shouldAnimate };
    });

    if (!hasMeasuredRef.current) {
      window.requestAnimationFrame(() => {
        hasMeasuredRef.current = true;
        setIndicator((prev) => (prev.ready && !prev.animate ? { ...prev, animate: true } : prev));
      });
    }
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, optionsKey, leading]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(container);
    }

    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [measure]);

  const indicatorBg = TONE_INDICATOR_CLASS[tone] || TONE_INDICATOR_CLASS.brand;
  const activeText = TONE_ACTIVE_TEXT[tone] || TONE_ACTIVE_TEXT.brand;
  const isTablist = role === 'tablist';

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      className={`relative ${
        fullWidth ? 'flex w-full' : 'inline-flex'
      } flex-wrap items-center gap-1 rounded-[24px] bg-surface border border-line p-1 shadow-card ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 z-0 rounded-full shadow-sm ${indicatorBg} ${
          indicator.animate ? 'sliding-pill-indicator' : ''
        }`}
        style={{
          width: `${indicator.width}px`,
          height: `${indicator.height}px`,
          transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
          opacity: indicator.ready ? 1 : 0
        }}
      />

      {leading && <span className="relative z-10 flex items-center">{leading}</span>}

      {options.map((opt) => {
        const isActive = opt.value === value;
        const Icon = opt.icon;

        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              const k = String(opt.value);
              if (el) itemRefs.current.set(k, el);
              else itemRefs.current.delete(k);
            }}
            type="button"
            role={isTablist ? 'tab' : undefined}
            aria-selected={isTablist ? isActive : undefined}
            aria-pressed={!isTablist ? isActive : undefined}
            aria-label={opt.ariaLabel}
            disabled={Boolean(opt.disabled)}
            onClick={() => {
              if (!opt.disabled && !isActive) onChange?.(opt.value);
            }}
            className={`relative z-10 ${
              fullWidth ? 'flex-1' : ''
            } min-h-touch px-3.5 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors duration-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              isActive
                ? activeText
                : 'text-ink hover:bg-[var(--well)] disabled:hover:bg-transparent'
            } ${buttonClassName}`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
