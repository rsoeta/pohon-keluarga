import { db } from '../db/dexie.js';
import { api } from '../lib/api.js';

let inFlightSync = null;

/**
 * Menyinkronkan Data_Anggota & Data_Pernikahan dari GAS ke IndexedDB (Dexie.js).
 * Memakai mutex agar sinkronisasi tidak berjalan ganda secara bersamaan.
 */
export async function syncFamilyData({ forceFull = false, userId = '' } = {}) {
  if (inFlightSync && !forceFull) return inFlightSync;

  const run = async () => {
    const [lastSyncMeta, syncedUserMeta] = await Promise.all([
      db.meta.get('last_sync_at'),
      db.meta.get('synced_user_id')
    ]);

    const sameUser = !userId || !syncedUserMeta?.value || syncedUserMeta.value === userId;
    const since = !forceFull && sameUser ? lastSyncMeta?.value || null : null;

    const res = await api.data.sync(since);

    await db.transaction('rw', db.anggota, db.pernikahan, db.meta, async () => {
      const anggotaItems = Array.isArray(res.anggota) ? res.anggota : [];
      const nikahItems = Array.isArray(res.pernikahan) ? res.pernikahan : [];

      if (res.full) {
        await db.anggota.clear();
        await db.pernikahan.clear();
        const activeAnggota = anggotaItems.filter((a) => !a.is_deleted);
        const activeNikah = nikahItems.filter((m) => !m.is_deleted);
        if (activeAnggota.length) await db.anggota.bulkPut(activeAnggota);
        if (activeNikah.length) await db.pernikahan.bulkPut(activeNikah);
      } else {
        const delAnggota = [];
        const putAnggota = [];
        for (const a of anggotaItems) {
          if (a.is_deleted) delAnggota.push(a.id_anggota);
          else putAnggota.push(a);
        }
        if (delAnggota.length) await db.anggota.bulkDelete(delAnggota);
        if (putAnggota.length) await db.anggota.bulkPut(putAnggota);

        const delNikah = [];
        const putNikah = [];
        for (const m of nikahItems) {
          if (m.is_deleted) delNikah.push(m.id_pernikahan);
          else putNikah.push(m);
        }
        if (delNikah.length) await db.pernikahan.bulkDelete(delNikah);
        if (putNikah.length) await db.pernikahan.bulkPut(putNikah);
      }

      await db.meta.bulkPut([
        { key: 'last_sync_at', value: res.server_time },
        { key: 'pengaturan', value: res.pengaturan || {} },
        { key: 'synced_user_id', value: res.me?.id_user || userId || '' }
      ]);
    });

    const [anggotaCount, pernikahanCount] = await Promise.all([
      db.anggota.count(),
      db.pernikahan.count()
    ]);

    return {
      server_time: res.server_time,
      full: Boolean(res.full),
      anggotaCount,
      pernikahanCount,
      pengaturan: res.pengaturan || {}
    };
  };

  inFlightSync = run().finally(() => {
    inFlightSync = null;
  });
  return inFlightSync;
}

/** Mengambil foto dari cache Dexie terlebih dahulu; bila belum ada ambil dari GAS. */
export async function getCachedPhoto(fileId) {
  if (!fileId) return null;
  const cached = await db.fotos.get(fileId);
  if (cached?.data_url) return cached.data_url;

  const res = await api.foto.get({ file_id: fileId });
  if (res?.data_url) {
    await db.fotos.put({
      file_id: fileId,
      mime_type: res.mime_type || 'image/jpeg',
      data_url: res.data_url,
      fetched_at: Date.now()
    });
    return res.data_url;
  }
  return null;
}

/** Mengambil banyak foto sekaligus (maks 20 per batch) dan menyimpan ke Dexie. */
export async function prefetchPhotos(fileIds) {
  const unique = [...new Set((fileIds || []).filter(Boolean))];
  if (!unique.length) return {};

  const existing = await db.fotos.bulkGet(unique);
  const result = {};
  const missing = [];
  unique.forEach((id, idx) => {
    if (existing[idx]?.data_url) result[id] = existing[idx].data_url;
    else missing.push(id);
  });

  for (let i = 0; i < missing.length; i += 20) {
    const chunk = missing.slice(i, i + 20);
    const res = await api.foto.getBatch(chunk);
    const fotos = res?.fotos || {};
    const toPut = [];
    Object.keys(fotos).forEach((fid) => {
      if (fotos[fid]?.data_url) {
        result[fid] = fotos[fid].data_url;
        toPut.push({
          file_id: fid,
          mime_type: fotos[fid].mime_type || 'image/jpeg',
          data_url: fotos[fid].data_url,
          fetched_at: Date.now()
        });
      }
    });
    if (toPut.length) await db.fotos.bulkPut(toPut);
  }
  return result;
}
