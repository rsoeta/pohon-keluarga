# Panduan Deployment & Operasional — Pohon Keluarga

Dokumen ini berisi langkah lengkap untuk mendeploy backend **Google Apps Script (GAS)** dan frontend **PWA (`www.altasim.studio-pasti.net`)** secara aman untuk lingkungan produksi.

---

## Bagian 1 — Persiapan & Deployment Backend (Google Apps Script)

### 1.1 Buat Google Spreadsheet & Proyek GAS
1. Buka Google Drive dengan akun Google pengelola keluarga, buat **Google Spreadsheet** baru (mis. beri nama `Database - Pohon Keluarga`).
2. Di Spreadsheet tersebut, buka menu **Extensions → Apps Script** (membuat *bound script*).
3. Salin seluruh file dari folder `/backend-gas`:
   - `Code.gs`, `Config.gs`, `Utils.gs`, `Db.gs`, `Auth.gs`, `Rbac.gs`, `AuditLog.gs`, `Anggota.gs`, `Pernikahan.gs`, `Nasab.gs`, `Gedcom.gs`, `DriveUpload.gs`, `BirthdayTrigger.gs`, `Admin.gs`, `SetupSheets.gs`.
4. Aktifkan visibilitas manifes di editor GAS (**Project Settings → Show "appsscript.json" manifest file in editor**), lalu ganti isinya dengan isi `backend-gas/appsscript.json`.
   *(Alternatif CLI via `clasp`: pastikan `.clasp.json` dan `.clasprc.json` tetap diabaikan Git dan jalankan `clasp push` dari folder `backend-gas`.)*

### 1.2 Jalankan Inisialisasi Otomatis (`setupSheets`)
1. *(Opsional)* Sebelum menjalankan, Anda bisa mengisi **Script Properties** `BOOTSTRAP_ADMIN_USERNAME` dan `BOOTSTRAP_ADMIN_PASSWORD` di **Project Settings → Script Properties** bila ingin memilih password awal sendiri.
2. Di editor Apps Script, pilih fungsi **`setupSheets`** di bilah atas lalu klik **Run** (berikan izin Google Sheets, Drive, Eksternal Request, dan Triggers).
3. Fungsi `setupSheets()` secara otomatis & idempoten:
   - Membuat ke-5 *sheet*: `Data_Anggota`, `Data_Pernikahan`, `Data_Pengguna`, `Log_Aktivitas`, `Pengaturan_Sistem`.
   - Membangkitkan `SESSION_SECRET` dan `PASSWORD_PEPPER` secara acak di **Script Properties**.
   - Menyetel `DEBUG_MODE = false`.
   - Membuat folder Google Drive privat `"Pohon Keluarga - Foto Profil"` dan menyimpan `FOTO_FOLDER_ID`.
   - Membuat akun `Admin` pertama di `Data_Pengguna` (jika password tidak diset di property, lihat **Execution Log** satu kali untuk mencatat password acak yang dihasilkan, lalu **segera ganti password** setelah login pertama).
4. Verifikasi di **Project Settings → Script Properties** bahwa `DEBUG_MODE` bernilai `false` dan `BOOTSTRAP_ADMIN_PASSWORD` (jika sempat diisi) sudah terhapus otomatis.

### 1.3 Deploy sebagai Web App
1. Klik **Deploy → New deployment** → pilih tipe **Web app**.
2. Konfigurasi wajib:
   - **Execute as:** `Me` (akun pengelola pemilik Spreadsheet & folder Drive).
   - **Who has access:** `Anyone` *(keamanan endpoint ditegakkan oleh token sesi HMAC aplikasi, bukan sesi Google user)*.
3. Klik **Deploy** dan salin **Web App URL** berakhiran `/exec`.

### 1.4 Konfigurasi WhatsApp Gateway & Trigger Ulang Tahun
1. Setel token/API key WA Gateway secara aman melalui salah satu cara:
   - Masuk ke aplikasi sebagai Admin → **Setelan → Panel Administrator → Tab WA Gateway → API Key / Token** (tersimpan di `PropertiesService`, tidak pernah masuk ke Sheet atau frontend), **atau**
   - Jalankan fungsi helper `setWaGatewayToken('TOKEN_ANDA')` sekali di editor GAS.
2. Di **Panel Administrator → Tab WA Gateway**, isi `URL Endpoint Gateway` (wajib `https://`), `ID Grup / Nomor Target WA`, jam trigger WIB (`0–23`), centang **Aktifkan Pengingat Ulang Tahun Harian WA**, simpan, lalu klik **Kirim Pesan Tes WA**.
3. GAS akan memasang *Time-driven Trigger* harian untuk `runDailyBirthdayJob` secara otomatis (juga dapat dipastikan lewat menu **Triggers** di editor GAS).

---

## Bagian 2 — Build & Hosting Frontend PWA (`www.altasim.studio-pasti.net`)

### 2.1 Konfigurasi `.env` & Build Produksi
1. Salin `frontend/.env.example` menjadi `frontend/.env`:
   ```env
   VITE_API_URL=https://script.google.com/macros/s/DEPLOYMENT_ID_ANDA/exec
   VITE_APP_DOMAIN=www.altasim.studio-pasti.net
   VITE_DEBUG=false
   ```
   > **PERINGATAN:** Jangan pernah menaruh token WA Gateway, `SESSION_SECRET`, atau `PASSWORD_PEPPER` di `frontend/.env` maupun file frontend mana pun.
2. Jalankan build produksi dari folder `frontend`:
   ```bash
   npm ci
   npm run build
   ```
3. Seluruh artefak produksi siap unggah berada di folder `frontend/dist/` (termasuk `index.html`, `manifest.webmanifest`, `sw.js`, `theme-init.js`, `icons/`, `assets/`, serta `.htaccess`, `_headers`, `_redirects`).

### 2.2 Opsi Hosting & Konfigurasi Domain HTTPS

#### Opsi A: Shared Hosting / cPanel / Apache / LiteSpeed (Auto-Deploy GitHub via SSH)

Repositori sudah dilengkapi workflow GitHub Actions di `.github/workflows/deploy-cpanel.yml` dan konfigurasi server di `frontend/public/.htaccess` (yang otomatis ikut tersalin ke `dist/.htaccess`). Setiap kali Anda melakukan `git push` ke branch `main` (pada perubahan folder `frontend/`), GitHub Actions akan membangun ulang PWA dan menyinkronkannya ke cPanel secara otomatis via SSH.

##### Langkah 1 — Konfigurasi Domain & SSL HTTPS di cPanel
1. Masuk ke **cPanel** hosting Anda → buka menu **Domains** (atau *Addon Domains* / *Subdomains*).
2. Pastikan domain `www.altasim.studio-pasti.net` (dan DNS `A` / `CNAME` dari `altasim.studio-pasti.net`) sudah mengarah ke IP server hosting Anda.
3. Catat **Document Root** untuk `www.altasim.studio-pasti.net` (misalnya `/home/usernamecpanel/www.altasim.studio-pasti.net` atau `/home/usernamecpanel/public_html`). Path ini yang akan dipakai sebagai `CPANEL_TARGET_DIR`.
4. Buka menu **SSL/TLS Status** di cPanel → centang `www.altasim.studio-pasti.net` (dan `altasim.studio-pasti.net` jika ada) → klik **Run AutoSSL** hingga ikon gembok berubah hijau (*AutoSSL Domain Validated*).
   > Catatan: File `.htaccess` sudah mengecualikan `/.well-known/` dari redirect paksa & fallback SPA agar perpanjangan otomatis AutoSSL / Let's Encrypt tetap berjalan lancar.

##### Langkah 2 — Buat SSH Key Khusus Deploy & Otorisasi di cPanel
Jalankan perintah berikut di terminal lokal (PowerShell / Git Bash) untuk membuat pasangan kunci SSH khusus deployment (tanpa passphrase agar bisa dipakai GitHub Actions):
```bash
ssh-keygen -t ed25519 -C "github-actions-pohon-keluarga" -f ~/.ssh/cpanel_pohon_keluarga -N ""
```
Ini menghasilkan dua file:
- `~/.ssh/cpanel_pohon_keluarga` (**Private Key** — masuk ke GitHub Secrets, JANGAN dibagikan ke siapa pun)
- `~/.ssh/cpanel_pohon_keluarga.pub` (**Public Key** — diimpor ke cPanel)

Selanjutnya di **cPanel**:
1. Buka **SSH Access** → **Manage SSH Keys** → **Import Key**.
2. Isi nama kunci (mis. `github-deploy`), tempelkan isi file `~/.ssh/cpanel_pohon_keluarga.pub` ke kolom **Public Key** (kolom Private Key biarkan kosong), lalu klik **Import**.
3. Kembali ke daftar Public Keys, klik **Manage** di sebelah kunci `github-deploy` → klik **Authorize**.
4. Cek port SSH shared hosting Anda (umumnya `22`, atau port khusus seperti `2222` / `21098` yang tertera di panel informasi akun cPanel / penyedia hosting).
5. *(Direkomendasikan)* Ambil *host key fingerprint* server cPanel untuk verifikasi ketat agar kebal MITM:
   ```bash
   ssh-keyscan -p PORT_SSH HOST_CPANEL
   ```
   Simpan outputnya untuk secret `SSH_KNOWN_HOSTS`.

##### Langkah 3 — Isi GitHub Repository Secrets
Buat repositori privat di GitHub, lalu masuk ke **Settings → Secrets and variables → Actions → New repository secret** dan tambahkan:

| Nama Secret | Contoh / Keterangan |
| :--- | :--- |
| `VITE_API_URL` | `https://script.google.com/macros/s/DEPLOYMENT_ID_ANDA/exec` (URL Web App GAS dari Bagian 1.3) |
| `SSH_HOST` | Hostname server cPanel atau IP hosting (mis. `server123.hostinganda.com`) |
| `SSH_PORT` | Port SSH hosting Anda (mis. `22` atau `21098`) |
| `SSH_USERNAME` | Username login cPanel Anda (mis. `u1234567`) |
| `SSH_PRIVATE_KEY` | Seluruh isi file private key `~/.ssh/cpanel_pohon_keluarga` (dari `-----BEGIN OPENSSH PRIVATE KEY-----` hingga `-----END OPENSSH PRIVATE KEY-----`) |
| `CPANEL_TARGET_DIR` | Path **Document Root** domain dari Langkah 1 (mis. `/home/u1234567/www.altasim.studio-pasti.net`) |
| `SSH_KNOWN_HOSTS` | *(Opsional, disarankan)* Output dari `ssh-keyscan -p PORT_SSH HOST_CPANEL` |

##### Langkah 4 — Hubungkan Git & Push Pertama
Dari folder root proyek (`c:\laragon\www\pohon-keluarga`):
```bash
git init
git branch -M main
git status
```
Pastikan file `.env` dan `frontend/.env` **tidak muncul** di `git status` (sudah diabaikan oleh `.gitignore`). Lalu commit dan push ke GitHub:
```bash
git add .
git commit -m "chore: inisialisasi Pohon Keluarga PWA dan auto-deploy cPanel"
git remote add origin https://github.com/USERNAME_ANDA/REPO_ANDA.git
git push -u origin main
```

##### Langkah 5 — Verifikasi Pasca-Deploy
1. Buka tab **Actions** di repositori GitHub Anda dan pantau workflow **Deploy PWA ke Shared Hosting / cPanel via SSH** hingga centang hijau (Anda juga dapat menjalankannya manual kapan saja lewat tombol **Run workflow**).
2. Verifikasi HTTPS, header keamanan, dan fallback SPA:
   - Buka `https://www.altasim.studio-pasti.net` di browser HP/desktop → pastikan tidak ada peringatan sertifikat SSL.
   - Buka langsung `https://www.altasim.studio-pasti.net/daftar` lalu tekan refresh (`F5`) → harus tetap memuat aplikasi tanpa error `404` (diteruskan oleh `.htaccess`).
   - Jalankan `curl -I https://www.altasim.studio-pasti.net` → pastikan muncul header `Strict-Transport-Security`, `Content-Security-Policy`, dan `X-Frame-Options: DENY`.
   - Jalankan `curl -I https://www.altasim.studio-pasti.net/sw.js` → pastikan `Cache-Control` bernilai `no-cache, no-store, must-revalidate`.
3. *(Jika masih ingin unggah manual tanpa GitHub)*: Anda tetap bisa menjalankan `npm ci && npm run build` di folder `frontend` lalu mengunggah isi `frontend/dist/` (termasuk file tersembunyi `.htaccess`) ke *Document Root* melalui File Manager cPanel.

#### Opsi B: Cloudflare Pages / Netlify
1. Hubungkan repositori atau unggah folder `frontend/dist/` sebagai output direktori build (`npm run build`, output: `dist`).
2. Pasang custom domain `www.altasim.studio-pasti.net` (HTTPS otomatis).
3. File `_headers` dan `_redirects` di `frontend/dist/` otomatis menerapkan header keamanan CSP/HSTS dan *rewrite* SPA.

#### Opsi C: VPS Nginx
Gunakan blok server berikut (dengan sertifikat SSL HTTPS aktif):
```nginx
server {
    listen 443 ssl http2;
    server_name www.altasim.studio-pasti.net;
    root /var/www/pohon-keluarga/dist;
    index index.html;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;

    location ~* ^/(index\.html|sw\.js|manifest\.webmanifest)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Bagian 3 — Instalasi PWA di Ponsel Anggota Keluarga

- **Android (Chrome / Edge):** Buka `https://www.altasim.studio-pasti.net` → ketuk tombol **"Instal Aplikasi ke Layar Utama"** di halaman Login/Setelan, atau ketuk menu `⋮` → **Install app / Add to Home screen**.
- **iOS (Safari):** Buka `https://www.altasim.studio-pasti.net` → ketuk tombol **Share** (`□↑`) → pilih **Add to Home Screen**.

---

## Bagian 4 — Checklist Keamanan Pra-Rilis & Tanggap Darurat

- [ ] Password Admin awal sudah diganti melalui **Setelan → Ubah Password**.
- [ ] `DEBUG_MODE` pada Script Properties bernilai `false` dan `VITE_DEBUG=false`.
- [ ] Folder Drive `"Pohon Keluarga - Foto Profil"` **tidak** dibagikan secara publik (*Restricted*).
- [ ] File `.env`, `.clasp.json`, `.clasprc.json` tidak masuk ke repositori Git.
- **Jika akun perangkat hilang / dicurigai bocor:** Admin buka **Panel Administrator → Pengguna → Cabut Sesi** (menaikkan `token_version` sehingga seluruh token perangkat tersebut langsung ditolak `401`).
- **Jika terjadi kompromi global:** Ganti `SESSION_SECRET` di **Apps Script → Project Settings → Script Properties** untuk mencabut seluruh sesi semua pengguna secara instan, dan periksa `Log_Aktivitas` di Google Sheets.
- **Backup berkala:** Buat salinan berkala file Google Spreadsheet dan folder Drive foto profil ke penyimpanan aman pengelola keluarga.
