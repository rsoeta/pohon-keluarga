import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.jsx';

const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
let googleScriptPromise = null;

function loadGoogleGsiScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-gsi="true"]');
    const script = existing || document.createElement('script');

    const waitReady = (attempts = 0) => {
      if (window.google?.accounts?.id) {
        resolve(window.google);
        return;
      }
      if (attempts >= 40) {
        googleScriptPromise = null;
        reject(new Error('Google Identity Services unavailable'));
        return;
      }
      window.setTimeout(() => waitReady(attempts + 1), 50);
    };

    const onError = () => {
      googleScriptPromise = null;
      reject(new Error('Failed to load Google Identity script'));
    };

    script.addEventListener('load', () => waitReady(0), { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.src = GOOGLE_GSI_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.googleGsi = 'true';
      document.head.appendChild(script);
    } else if (window.google?.accounts?.id) {
      waitReady(0);
    }
  });

  return googleScriptPromise;
}

export function GoogleSignInButton({
  clientId,
  isDark = false,
  lang = 'id',
  disabled = false,
  onCredential
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    setLoadError(false);

    loadGoogleGsiScript()
      .then((google) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        el.replaceChildren();
        const width = Math.max(220, Math.min(360, Math.round(el.clientWidth || 320)));
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => {
            if (!cancelled) onCredentialRef.current?.(resp?.credential || '');
          },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true
        });
        google.accounts.id.renderButton(el, {
          type: 'standard',
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          locale: lang === 'en' ? 'en' : 'id',
          logo_alignment: 'left',
          width
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    const el = containerRef.current;
    return () => {
      cancelled = true;
      el?.replaceChildren();
    };
  }, [clientId, isDark, lang]);

  if (!clientId) return null;

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div
        ref={containerRef}
        aria-label={t('auth.googleOption')}
        className={`w-full min-h-[44px] flex items-center justify-center transition-opacity ${
          disabled ? 'pointer-events-none opacity-60' : ''
        }`}
      />
      {loadError && (
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 text-center">
          {t('auth.googleLoadFailed')}
        </p>
      )}
    </div>
  );
}
