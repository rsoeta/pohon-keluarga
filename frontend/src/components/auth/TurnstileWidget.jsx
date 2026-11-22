import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.jsx';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileScriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.turnstile && typeof window.turnstile.render === 'function') {
    return Promise.resolve(window.turnstile);
  }
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-turnstile-script="true"]');
    const script = existing || document.createElement('script');

    const waitReady = (attempts = 0) => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        resolve(window.turnstile);
        return;
      }
      if (attempts >= 40) {
        turnstileScriptPromise = null;
        reject(new Error('Turnstile API unavailable'));
        return;
      }
      window.setTimeout(() => waitReady(attempts + 1), 50);
    };

    const onError = () => {
      turnstileScriptPromise = null;
      reject(new Error('Failed to load Turnstile script'));
    };

    script.addEventListener('load', () => waitReady(0), { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = 'true';
      document.head.appendChild(script);
    } else if (window.turnstile) {
      waitReady(0);
    }
  });

  return turnstileScriptPromise;
}

export function TurnstileWidget({
  siteKey,
  isDark = false,
  lang = 'id',
  resetKey = 0,
  onTokenChange
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;

  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    setLoadError(false);
    onTokenChangeRef.current?.('');

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: isDark ? 'dark' : 'light',
          language: lang === 'en' ? 'en' : 'id',
          callback: (token) => {
            if (!cancelled) onTokenChangeRef.current?.(token || '');
          },
          'expired-callback': () => {
            if (!cancelled) onTokenChangeRef.current?.('');
          },
          'error-callback': () => {
            if (!cancelled) {
              onTokenChangeRef.current?.('');
              setLoadError(true);
            }
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          onTokenChangeRef.current?.('');
          setLoadError(true);
        }
      });

    const containerEl = containerRef.current;
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Abaikan bila widget sudah terlepas
        }
      }
      widgetIdRef.current = null;
      containerEl?.replaceChildren();
    };
  }, [siteKey, isDark, lang]);

  useEffect(() => {
    if (!resetKey) return;
    onTokenChangeRef.current?.('');
    if (widgetIdRef.current !== null && window.turnstile?.reset) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // Abaikan jika widget belum siap
      }
    }
  }, [resetKey]);

  if (!siteKey) return null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        ref={containerRef}
        aria-label={t('auth.turnstileAriaLabel')}
        className="min-h-[65px] w-full flex items-center justify-center"
      />
      {loadError && (
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 text-center">
          {t('auth.turnstileLoadFailed')}
        </p>
      )}
    </div>
  );
}
