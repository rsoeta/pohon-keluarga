import Swal from 'sweetalert2';

function themeColors() {
  const dark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');
  return dark
    ? {
        background: '#121d1c',
        color: '#e5efec',
        confirmButtonColor: '#0d5c55',
        cancelButtonColor: '#243634'
      }
    : {
        background: '#fbfcfb',
        color: '#10231f',
        confirmButtonColor: '#0d5c55',
        cancelButtonColor: '#5e706b'
      };
}

const BASE_CLASSES = {
  popup: 'nasab-swal-popup',
  title: 'nasab-swal-title',
  htmlContainer: 'nasab-swal-text',
  confirmButton: 'nasab-swal-confirm',
  cancelButton: 'nasab-swal-cancel',
  denyButton: 'nasab-swal-deny'
};

function fireToast(icon, title) {
  const c = themeColors();
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title: String(title || ''),
    showConfirmButton: false,
    timer: 2800,
    timerProgressBar: true,
    background: c.background,
    color: c.color,
    customClass: {
      popup: 'nasab-swal-toast',
      title: 'nasab-swal-title'
    }
  });
}

export function toastSuccess(message) {
  return fireToast('success', message);
}

export function toastError(message) {
  return fireToast('error', message);
}

export function toastInfo(message) {
  return fireToast('info', message);
}

export function alertSuccess(title, text = '') {
  const c = themeColors();
  return Swal.fire({
    icon: 'success',
    title: String(title || ''),
    text: text ? String(text) : undefined,
    confirmButtonText: 'OK',
    background: c.background,
    color: c.color,
    confirmButtonColor: c.confirmButtonColor,
    customClass: BASE_CLASSES
  });
}

export function alertError(title, text = '') {
  const c = themeColors();
  return Swal.fire({
    icon: 'error',
    title: String(title || ''),
    text: text ? String(text) : undefined,
    confirmButtonText: 'OK',
    background: c.background,
    color: c.color,
    confirmButtonColor: c.confirmButtonColor,
    customClass: BASE_CLASSES
  });
}

export async function confirmAction({
  title,
  text = '',
  confirmText = 'Ya',
  cancelText = 'Batal',
  danger = false,
  icon = 'question'
}) {
  const c = themeColors();
  const res = await Swal.fire({
    icon: danger ? 'warning' : icon,
    title: String(title || ''),
    text: text ? String(text) : undefined,
    showCancelButton: true,
    confirmButtonText: String(confirmText),
    cancelButtonText: String(cancelText),
    reverseButtons: true,
    focusCancel: danger,
    background: c.background,
    color: c.color,
    confirmButtonColor: danger ? '#dc2626' : c.confirmButtonColor,
    cancelButtonColor: c.cancelButtonColor,
    customClass: BASE_CLASSES
  });
  return Boolean(res.isConfirmed);
}

export function alertInfo(title, text = '') {
  const c = themeColors();
  return Swal.fire({
    icon: 'info',
    title: String(title || ''),
    text: text ? String(text) : undefined,
    confirmButtonText: 'OK',
    background: c.background,
    color: c.color,
    confirmButtonColor: c.confirmButtonColor,
    customClass: BASE_CLASSES
  });
}

export async function chooseTwoActions({ title, text = '', primaryText, secondaryText, cancelText = 'Batal' }) {
  const c = themeColors();
  const res = await Swal.fire({
    icon: 'question',
    title: String(title || ''),
    text: text ? String(text) : undefined,
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: String(primaryText),
    denyButtonText: String(secondaryText),
    cancelButtonText: String(cancelText),
    background: c.background,
    color: c.color,
    confirmButtonColor: c.confirmButtonColor,
    denyButtonColor: '#d97706',
    cancelButtonColor: c.cancelButtonColor,
    customClass: BASE_CLASSES
  });
  if (res.isConfirmed) return 'primary';
  if (res.isDenied) return 'secondary';
  return null;
}

export async function selectOption({ title, text = '', options, initialValue, confirmText = 'OK', cancelText = 'Batal' }) {
  const c = themeColors();
  const res = await Swal.fire({
    title: String(title || ''),
    text: text ? String(text) : undefined,
    input: 'select',
    inputOptions: options,
    inputValue: initialValue,
    showCancelButton: true,
    confirmButtonText: String(confirmText),
    cancelButtonText: String(cancelText),
    background: c.background,
    color: c.color,
    confirmButtonColor: c.confirmButtonColor,
    cancelButtonColor: c.cancelButtonColor,
    customClass: BASE_CLASSES
  });
  return res.isConfirmed ? res.value : null;
}

export async function promptInput({
  title,
  text = '',
  inputType = 'text',
  placeholder = '',
  confirmText = 'Simpan',
  cancelText = 'Batal',
  validator
}) {
  const c = themeColors();
  const res = await Swal.fire({
    title: String(title || ''),
    text: text ? String(text) : undefined,
    input: inputType,
    inputPlaceholder: String(placeholder || ''),
    inputValidator: validator,
    showCancelButton: true,
    confirmButtonText: String(confirmText),
    cancelButtonText: String(cancelText),
    background: c.background,
    color: c.color,
    confirmButtonColor: c.confirmButtonColor,
    cancelButtonColor: c.cancelButtonColor,
    customClass: BASE_CLASSES
  });
  return res.isConfirmed ? res.value : null;
}
