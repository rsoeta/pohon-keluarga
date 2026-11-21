/**
 * Kompresi gambar di sisi klien (Canvas API) sebelum diunggah ke GAS DriveUpload.gs.
 * Menjamin format akhir adalah JPG/PNG/WebP dan ukuran pasca-kompresi < 2MB.
 */

const ALLOWED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HARD_MAX_BYTES = 2 * 1024 * 1024;
const TARGET_MAX_BYTES = Math.floor(1.75 * 1024 * 1024);

function base64ByteLength(b64) {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const err = new Error('INVALID_IMAGE_FILE');
      err.code = 'INVALID_IMAGE_FILE';
      reject(err);
    };
    img.src = url;
  });
}

function renderToDataUrl(img, maxDim, preferWebp, quality) {
  const srcW = img.naturalWidth || img.width || 1;
  const srcH = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');

  // Latar putih untuk mencegah transparansi PNG berubah hitam bila fallback ke JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let mimeType = preferWebp ? 'image/webp' : 'image/jpeg';
  let dataUrl = canvas.toDataURL(mimeType, quality);

  // Safari/browser lama bisa diam-diam fallback ke image/png saat diminta image/webp
  if (preferWebp && !dataUrl.startsWith('data:image/webp')) {
    mimeType = 'image/jpeg';
    dataUrl = canvas.toDataURL(mimeType, quality);
  }

  const base64 = dataUrl.split(',')[1] || '';
  return {
    mime_type: mimeType,
    data_base64: base64,
    data_url: dataUrl,
    size: base64ByteLength(base64),
    width,
    height
  };
}

export async function compressImageFile(file, { maxDim = 1024, maxBytes = TARGET_MAX_BYTES } = {}) {
  if (!file || !ALLOWED_INPUT_TYPES.includes(file.type)) {
    const err = new Error('INVALID_IMAGE_TYPE');
    err.code = 'INVALID_IMAGE_TYPE';
    throw err;
  }

  const img = await loadImageFromFile(file);
  const attempts = [
    [maxDim, true, 0.85],
    [maxDim, true, 0.72],
    [maxDim, true, 0.58],
    [Math.min(maxDim, 760), false, 0.72],
    [600, false, 0.6]
  ];

  let last = null;
  for (const [dim, webp, q] of attempts) {
    last = renderToDataUrl(img, dim, webp, q);
    if (last.size <= maxBytes && last.size <= HARD_MAX_BYTES) {
      return last;
    }
  }

  if (last && last.size <= HARD_MAX_BYTES) return last;

  const err = new Error('PAYLOAD_TOO_LARGE');
  err.code = 'PAYLOAD_TOO_LARGE';
  throw err;
}
