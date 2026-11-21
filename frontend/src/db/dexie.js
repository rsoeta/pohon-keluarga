import Dexie from 'dexie';

export const db = new Dexie('NasabKeluargaDB');

db.version(1).stores({
  anggota:
    'id_anggota, kode_unik, nama_lengkap, jenis_kelamin, status_hidup, id_ayah, id_ibu, id_pernikahan_ortu, updated_at',
  pernikahan: 'id_pernikahan, id_suami, id_istri, status_pernikahan, updated_at',
  fotos: 'file_id, fetched_at',
  meta: 'key'
});

/**
 * Mengosongkan seluruh cache lokal saat logout atau sesi dicabut demi privasi data keluarga.
 */
export async function clearLocalDatabase() {
  await db.transaction('rw', db.anggota, db.pernikahan, db.fotos, db.meta, async () => {
    await db.anggota.clear();
    await db.pernikahan.clear();
    await db.fotos.clear();
    await db.meta.clear();
  });
}
