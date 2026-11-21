/**
 * Helper RBAC sisi UI (cerminan Rbac.gs; penegakan mutlak tetap di server GAS).
 */

export function isAdmin(user) {
  return Boolean(user && user.role === 'Admin');
}

export function getEditableAnggotaIds(user, anggotaList = [], pernikahanList = []) {
  const set = new Set();
  if (!user) return set;

  const activeMap = new Map();
  for (const a of anggotaList) {
    if (a && !a.is_deleted && a.id_anggota) activeMap.set(a.id_anggota, a);
  }

  if (isAdmin(user)) {
    for (const id of activeMap.keys()) set.add(id);
    return set;
  }

  const me = user.id_anggota;
  if (!me || !activeMap.has(me)) return set;
  set.add(me);

  // Pasangan di Data_Pernikahan (Aktif/Wafat, bukan Cerai)
  for (const m of pernikahanList) {
    if (!m || m.is_deleted || m.status_pernikahan === 'Cerai') continue;
    const partnerId = m.id_suami === me ? m.id_istri : m.id_istri === me ? m.id_suami : '';
    if (partnerId && activeMap.has(partnerId)) set.add(partnerId);
  }

  // Anak kandung/angkat milik user sendiri
  for (const a of activeMap.values()) {
    if (a.id_ayah === me || a.id_ibu === me) set.add(a.id_anggota);
  }

  return set;
}

export function canEditAnggota(user, targetId, anggotaList = [], pernikahanList = []) {
  if (!user || !targetId) return false;
  if (isAdmin(user)) return true;
  return getEditableAnggotaIds(user, anggotaList, pernikahanList).has(targetId);
}

export function canDelete(user) {
  return isAdmin(user);
}
