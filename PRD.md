# Product Requirements Document (PRD): Aplikasi Pohon Keluarga (Pohon Keluarga)

**Versi Dokumen:** 2.0 (Final — Audited)  
**Domain Aplikasi:** `www.altasim.studio-pasti.net` (PWA)  
**Target Peluncuran:** Menjelang Reuni Keluarga / Hari Raya  
**Arsitektur:** Frontend PWA (Mobile-First) + Backend Google Apps Script (GAS) + Database Google Spreadsheets + Storage Google Drive + WhatsApp API Gateway

---

## 1. Ringkasan Eksekutif & Tujuan Produk

**Pohon Keluarga** adalah aplikasi silsilah digital privat (internal) untuk mendokumentasikan, memvisualisasikan, dan menjaga keterhubungan satu keluarga besar lintas generasi (skala ratusan anggota). Aplikasi ini mengakomodasi struktur keluarga kompleks (pernikahan lebih dari satu kali dan anak angkat), dilengkapi pelacak hubungan kekerabatan otomatis (Kalkulator Nasab), ekspor bagan ke PDF, impor data massal GEDCOM, serta pengingat ulang tahun otomatis ke grup WhatsApp keluarga.

---

## 2. Profil Pengguna & Matriks Hak Akses (RBAC)

Aplikasi bersifat **tertutup (privat)**. Tidak ada pendaftaran mandiri; Admin membuatkan dan membagikan akun (_username_ & _password_) secara langsung kepada anggota keluarga.

### Profil Pengguna Utama

1. **Anggota Keluarga (User):** Anggota keluarga besar lintas generasi yang mengakses aplikasi lewat ponsel (PWA) untuk menelusuri silsilah, mengecek panggilan kekerabatan, melihat kontak/ulang tahun kerabat, serta memperbarui data keluarga intinya sendiri (diri sendiri, pasangan, dan anak).
2. **Administrator Keluarga (Admin):** Pengurus silsilah terpilih (1–3 orang) yang mengelola akun login, mengimpor data awal GEDCOM, mengonfigurasi WA Gateway, memoderasi seluruh cabang, dan memegang hak eksklusif untuk menghapus data.

### Matriks Hak Akses

| Fitur / Aksi                                                                                   | Anggota Keluarga (User)      | Administrator (Admin) |
| :--------------------------------------------------------------------------------------------- | :--------------------------- | :-------------------- |
| Lihat Nasab, Daftar, Profil Detail (domisili, tgl lahir, no. WA), Kalkulator Nasab, Ekspor PDF | Ya (Terbuka penuh)           | Ya (Terbuka penuh)    |
| Tambah & Edit Data Keluarga Inti (Diri sendiri, pasangan, anak) + Unggah Foto                  | Ya (Terbatas cabang sendiri) | Ya (Seluruh cabang)   |
| Hapus Data (Soft Delete) & Pemulihan Data                                                      | **Tidak**                    | **Ya**                |
| Panel Administrator (Kelola Akun, Impor GEDCOM, Setting WA Gateway)                            | **Tidak**                    | **Ya**                |

---

## 3. User Stories

**Anggota Keluarga (User):**

1. Sebagai **Anggota Keluarga**, saya ingin melihat bagan silsilah dalam tampilan mendatar atau menurun serta melakukan _zoom_, supaya saya dapat menelusuri garis keturunan keluarga besar dengan nyaman dari layar ponsel.
2. Sebagai **Anggota Keluarga**, saya ingin menggunakan fitur Lihat Hubungan antara profil saya dan anggota keluarga lain, supaya saya langsung tahu panggilan kekerabatan yang tepat (seperti Paman atau Sepupu) saat bertemu di acara reuni.
3. Sebagai **Anggota Keluarga**, saya ingin menambah atau mengedit data diri sendiri, pasangan, dan anak (kandung maupun angkat) termasuk mengunggah foto profil, supaya informasi keluarga inti saya selalu akurat tanpa harus merepotkan Admin.
4. Sebagai **Anggota Keluarga**, saya ingin menyimpan bagan silsilah yang sedang dilihat ke dalam format PDF, supaya saya bisa mencetaknya atau menyimpannya sebagai arsip pribadi.
5. Sebagai **Anggota Keluarga**, saya ingin melihat daftar anggota yang berulang tahun hari ini maupun mendatang beserta domisili dan nomor WhatsApp-nya, supaya saya bisa langsung mengirimkan ucapan selamat.

**Administrator Keluarga (Admin):** 6. Sebagai **Administrator**, saya ingin membuatkan dan membagikan akun login yang terhubung langsung ke profil masing-masing anggota, supaya privasi data keluarga besar tetap terjaga secara internal. 7. Sebagai **Administrator**, saya ingin mengimpor data silsilah secara massal menggunakan file GEDCOM (`.ged`) serta memegang hak eksklusif untuk menghapus data, supaya proses input ratusan anggota menjadi cepat dan data aman dari penghapusan tidak sengaja. 8. Sebagai **Administrator**, saya ingin mengatur pengiriman pesan pengingat ulang tahun otomatis ke grup WhatsApp keluarga melalui _WA Gateway_, supaya seluruh keluarga selalu ingat merayakan hari lahir kerabatnya tanpa harus membuka aplikasi setiap hari.

---

## 4. Prioritas Fitur MVP

### A. Wajib (Inti Rilis Perdana)

1. **Autentikasi Privat & Object-Level RBAC:** Login tertutup dengan akun buatan Admin; User hanya bisa mengedit keluarga inti sendiri + unggah foto ke Google Drive; hak hapus khusus Admin.
2. **Nasab Silsilah Interaktif & Kasus Khusus:** Tampilan Mendatar/Menurun, _zoom_, pencarian data, serta dukungan pernikahan lebih dari satu kali (poligami/menikah lagi) dan anak angkat.
3. **Profil Detail & Kalkulator Nasab (Lihat Hubungan):** Biodata lengkap (foto, tanggal lahir, domisili, no. WA) dan pelacak hubungan otomatis berbasis algoritma BFS/LCA.
4. **Impor Massal GEDCOM (`.ged`) untuk Admin:** Unggah file standar `.ged` dengan pratinjau/validasi untuk pemetaan otomatis ke Google Sheets.
5. **Dasbor Ulang Tahun & Notifikasi WhatsApp Otomatis:** Daftar ulang tahun hari ini & mendatang di aplikasi + _Time-driven Trigger_ GAS ke WA API Gateway setiap pagi.

### B. Bagus Kalau Ada (Jika Waktu Menuju Hari-H Mencukupi)

- **Ekspor Bagan ke PDF:** Cetak cabang silsilah yang sedang difokuskan (3–4 generasi) dalam format A4/A3.
- **Multi-Bahasa (ID / EN):** Alih bahasa antarmuka di halaman Login dan Setelan.
- **Mode Gelap (Dark Mode):** Sakelar tema terang/gelap di _header_.
- **Optimasi PWA Penuh:** Instalasi ke layar utama HP dan _local caching_.

### C. Nanti Dulu (Fase Pengembangan Berikutnya)

- Dasbor visual _Audit Log_ di web (tahap awal cukup dipantau Admin langsung di Google Sheets).
- Pengingat otomatis Hari Wafat (Haul) ke grup WhatsApp.
- Album foto dokumentasi reuni lintas generasi.

---

## 5. Alur Pengguna (User Flow) & Daftar Halaman

### Alur Utama

1. **Login:** Buka `www.altasim.studio-pasti.net` → Masukkan _Username_ & _Password_ dari Admin → Centang _Ingat Saya_ (opsional, sesi 30 hari; standar 24 jam) → Masuk.
2. **Eksplorasi Nasab:** Tampil Nasab Silsilah (Fokus Utama di profil sendiri/leluhur) → Pilih Mendatar/Menurun, _Zoom_, atau ketuk kartu untuk ke Profil Detail.
3. **Cek Hubungan:** Dari Profil Detail/Daftar → Tekan _Lihat Hubungan_ → Modal menampilkan jalur keturunan dan kesimpulan status hubungan.
4. **Update Cabang Sendiri:** Pada profil diri sendiri/pasangan/anak → Tekan _Edit_ atau tombol `+` → Ubah data / unggah foto (terkompresi otomatis) → Simpan.
5. **Admin:** Masuk ke _Setelan_ → _Panel Administrator_ → Impor GEDCOM, buat/reset akun, atau atur _WA Gateway_.

### Daftar Halaman & Komponen

| No  | Halaman                  | Isi Utama                                                                                                                                                                                           |
| :-- | :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Login**                | Logo, alih bahasa (`ID`/`EN`), input _Username_, _Password_ (ikon intip), _Ingat Saya_, tombol _Masuk_, info hubungi Admin.                                                                         |
| 2   | **Nasab Silsilah**       | _Header_ (logo, _Dark Mode_, avatar), sakelar Mendatar/Menurun, kanvas bagan (Fokus Utama, Pasangan, `+ Tambah`), kontrol melayang (PDF, Zoom In/Out, %), navigasi bawah.                           |
| 3   | **Daftar & Pencarian**   | Kolom cari (nama/kode unik/domisili), filter (JK, status hidup), kartu anggota dengan pintasan Profil, Lihat Hubungan, dan Fokus Nasab.                                                             |
| 4   | **Profil Detail**        | Tombol Kembali, 3 aksi cepat (Hubungan, Nasab, Edit), foto, nama, kode unik (`#IWRPQ`) + tombol salin, JK, urutan & status anak, tgl lahir, domisili, no. WA, daftar Orang Tua, Pasangan, dan Anak. |
| 5   | **Modal Lihat Hubungan** | Kesimpulan status hubungan (misal: _Paman_), diagram vertikal dari Profil Anda ke Target dengan panah berlabel relasi dan penanda `(Sudah Meninggal)` / `(Anak Angkat)`.                            |
| 6   | **Form Tambah / Edit**   | Input biodata, unggah foto (kompresi klien), status hidup, status anak (Kandung/Angkat), data pernikahan (Aktif/Cerai/Wafat). Tombol Hapus khusus Admin.                                            |
| 7   | **Ulang Tahun (Ultah)**  | Seksi _Ulang Tahun Hari Ini_ dan _Mendatang (Semua Jadwal)_ dengan _badge_ hitung mundur hari.                                                                                                      |
| 8   | **Setelan**              | Preferensi Bahasa, Manajemen Data (Unggah GEDCOM khusus Admin), Logout, dan akses Panel Administrator.                                                                                              |
| 9   | **Panel Administrator**  | Kelola Pengguna (buat/reset akun, tautkan `id_anggota`), Pengaturan WA Gateway (ID Grup, jam _trigger_, tes kirim), statistik keluarga.                                                             |

---

## 6. Rancangan Database (Google Spreadsheets)

Satu file Google Spreadsheet terdiri dari **5 Sheet** dengan kunci utama **UUID**:

1. **`Data_Anggota`:** `id_anggota` (PK, UUID), `kode_unik`, `gedcom_xref_id`, `nama_lengkap`, `jenis_kelamin` (`L`/`P`), `tgl_lahir` (mendukung `YYYY-MM-DD`, `YYYY`, atau kosong), `status_hidup` (Boolean), `urutan_anak` (Int), `status_anak` (`Kandung`/`Angkat`), `domisili`, `no_wa`, `foto_file_id`, `id_ayah` (FK), `id_ibu` (FK), `id_pernikahan_ortu` (FK), `is_deleted` (Boolean).
2. **`Data_Pernikahan`:** `id_pernikahan` (PK, UUID), `id_suami` (FK), `id_istri` (FK), `status_pernikahan` (`Aktif`/`Cerai`/`Wafat`), `urutan_pasangan` (Int), `is_deleted` (Boolean).
3. **`Data_Pengguna`:** `id_user` (PK, UUID), `username` (Unik), `password_hash` (Salted Hash), `id_anggota` (FK), `role` (`Admin`/`User`), `status_aktif` (Boolean), `token_version` (Int, untuk mencabut sesi).
4. **`Log_Aktivitas`:** `id_log` (PK, UUID), `timestamp`, `id_user` (FK), `aksi` (`CREATE`/`UPDATE`/`SOFT_DELETE`/`IMPORT_GEDCOM`), `target_id`, `detail` (JSON).
5. **`Pengaturan_Sistem`:** `kunci` (PK), `nilai` (ID Grup WA, jam _trigger_, nama keluarga). _Catatan: Token/API Key WA Gateway tidak disimpan di sini, melainkan di GAS `PropertiesService`._

---

## 7. Penanganan Edge Cases, Keamanan & Persyaratan Teknis

### Penanganan Edge Cases

- **Anti-Looping (Cycle Detection):** Sebelum menyimpan `id_ayah`/`id_ibu`, server wajib memverifikasi bahwa target bukan merupakan keturunan dari profil yang sedang diedit.
- **Pernikahan Antar-Kerabat (Sepupu):** Kalkulator Nasab menggunakan algoritma _Breadth-First Search_ (BFS) untuk menemukan jalur kekerabatan terpendek tanpa _loop_ tak terbatas.
- **Anak Angkat:** Jalur Nasab yang melewati anak angkat wajib diberi label `(Anak Angkat)` agar tidak rancu dengan Nasab biologis.
- **Tanggal Lahir Parsial & Kabisat:** Anggota tanpa tanggal/bulan lahir lengkap diabaikan oleh _trigger_ ulang tahun. Ulang tahun **29 Februari** otomatis dikirim pada **28 Februari** di tahun non-kabisat.
- **Konkurensi (Race Condition):** Seluruh operasi tulis (`POST`/`PUT`/`DELETE`) di GAS wajib dibungkus dengan `LockService.getScriptLock()`.
- **Soft Delete:** Penghapusan oleh Admin hanya mengubah `is_deleted = TRUE` agar tidak merusak referensi `id_ayah`/`id_ibu` pada data lain.
- **Impor GEDCOM Aman:** Mendukung pencocokan via `gedcom_xref_id` dan pratinjau jumlah data sebelum eksekusi agar tidak menimbulkan duplikasi massal.

### Standar Keamanan & UI/UX

- **Object-Level RBAC Ketat:** Setiap _endpoint_ GAS memvalidasi token sesi di sisi server. User biasa hanya boleh mengubah `id_anggota` miliknya, pasangannya di `Data_Pernikahan`, atau anak kandung/angkatnya—dan dilarang mengubah `id_ayah`/`id_ibu` milik profil lain. Pelanggaran mengembalikan `403 Forbidden` generik.
- **Anti-Formula Injection:** Seluruh input teks dari pengguna yang diawali karakter `=`, `+`, `-`, atau `@` otomatis diberi awalan tanda petik tunggal (`'`) sebelum ditulis ke Google Sheets.
- **Keamanan Kredensial & Foto:** _Password_ disimpan terenkripsi di _sheet_ `Data_Pengguna`; _API Key_ WA Gateway disimpan di `PropertiesService` GAS; unggahan foto dibatasi format (JPG/PNG/WebP) dan ukuran (maks. 2MB pasca-kompresi klien).
- **Mobile-First & UI:** Menggunakan _fluid Flexbox_ (target sentuh min. `48x48px`, tanpa _horizontal scroll_ pada daftar/tabel) serta **SweetAlert2** sebagai standar notifikasi dan dialog konfirmasi.
