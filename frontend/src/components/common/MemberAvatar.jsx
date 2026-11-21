import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie.js';
import { getCachedPhoto } from '../../db/sync.js';
import { getInitials } from '../../lib/format.js';

const SIZE_CLASSES = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl'
};

export function MemberAvatar({
  fileId = '',
  name = '',
  gender = 'L',
  isLiving = true,
  size = 'md',
  className = '',
  previewUrl = ''
}) {
  const cached = useLiveQuery(
    () => (fileId && !previewUrl ? db.fotos.get(fileId) : undefined),
    [fileId, previewUrl]
  );
  const [fetchedUrl, setFetchedUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (!fileId || previewUrl || cached?.data_url) {
      setFetchedUrl('');
      return undefined;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return undefined;

    getCachedPhoto(fileId)
      .then((url) => {
        if (active && url) setFetchedUrl(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [fileId, previewUrl, cached?.data_url]);

  const imgSrc = previewUrl || cached?.data_url || fetchedUrl;
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const deceasedCls = isLiving === false ? 'grayscale opacity-80' : '';
  const fallbackBg =
    gender === 'P'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 ring-rose-300/60 dark:ring-rose-800/60'
      : 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200 ring-brand-300/60 dark:ring-brand-800/60';

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt={name}
        loading="lazy"
        className={`${sizeCls} ${deceasedCls} shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-sm ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeCls} ${deceasedCls} ${fallbackBg} shrink-0 rounded-full ring-1 font-bold flex items-center justify-center select-none ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
