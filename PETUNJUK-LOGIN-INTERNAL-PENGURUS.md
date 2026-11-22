# Panduan deploy login internal Pengurus — Program Kerja CB3

## Gambaran arsitektur

- Admin: Firebase Authentication (Email/Password dan Google).
- Pengurus: login internal dengan nama login + password. Tidak dibuat sebagai user Firebase Authentication.
- Data: Cloud Firestore pada project `database-gencita`.
- Backend: Vercel Functions di domain utama `www.cb3.web.id`.
- Password Pengurus: hash scrypt + salt di koleksi privat `akun_pengurus`, bukan teks biasa.
- Sesi Pengurus: cookie `HttpOnly; Secure; SameSite=Lax`, masa berlaku 8 jam.

Pengurus dapat mengubah password sendiri dari menu **Ganti password**. Admin dapat membuat password awal, reset password, serta menonaktifkan/mengaktifkan akun.

## 1. File yang harus masuk ke repository

Upload file dan folder berikut ke root repository `wmyulfian/Prokercb3`:

```text
Prokercb3/
├── index.html
├── firestore.rules
├── vercel.json
├── package.json
├── .gitignore
├── .env.example
├── README.md
├── PETUNJUK-FIREBASE.txt
├── PETUNJUK-LOGIN-INTERNAL-PENGURUS.md
├── api/
│   ├── admin/
│   │   └── pengurus-accounts.js
│   └── pengurus/
│       ├── change-password.js
│       ├── data.js
│       ├── login.js
│       ├── logout.js
│       └── proposals.js
└── lib/
    └── server.js
```

Jangan mengunggah file backup, folder `node_modules`, `.env` berisi secret, atau file JSON Service Account.

## 2. Buat Firebase Service Account key

1. Buka Firebase Console untuk project `database-gencita`.
2. Klik ikon roda gigi **Project settings**.
3. Buka tab **Service accounts**.
4. Pilih Firebase Admin SDK.
5. Klik **Generate new private key** dan konfirmasi.
6. Simpan file JSON yang diunduh di tempat pribadi.

**KUNCI INI SANGAT RAHASIA.** Jangan unggah ke GitHub, jangan masukkan ke `index.html`, dan jangan kirim ke ChatGPT/orang lain. Jika key pernah terekspos di repository publik, hapus/revoke key tersebut dan buat yang baru.

## 3. Buat secret sesi Pengurus

Di komputer yang memiliki Node.js, buka Terminal/PowerShell lalu jalankan:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Salin hasilnya secara pribadi. Panjangnya harus sekurang-kurangnya 48 karakter. Jangan menggunakan nilai contoh atau membagikan secret itu.

## 4. Tambahkan Environment Variables di Vercel

1. Buka Vercel Dashboard.
2. Pilih project yang terhubung dengan repository `Prokercb3`.
3. Buka **Settings → Environment Variables**.
4. Tambahkan variabel di bawah untuk **Production**.

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Seluruh isi file JSON Service Account. Tempel sebagai satu nilai environment variable; jangan masukkan ke repository. |
| `PENGURUS_SESSION_SECRET` | Hasil acak dari perintah Node.js pada langkah 3. |
| `ALLOWED_APP_ORIGINS` (opsional) | `https://www.cb3.web.id,https://pages.cb3.web.id,https://prokercb3.vercel.app` |

Untuk `FIREBASE_SERVICE_ACCOUNT_JSON`, buka file JSON yang diunduh, salin seluruh `{ ... }`, dan tempel sebagai value. Jangan menambahkan tanda kutip tambahan di luar JSON.

5. Klik Save.
6. Setelah semua variabel tersimpan, lakukan **Redeploy** deployment Production. Vercel hanya menerapkan perubahan Environment Variables pada deployment baru.

## 5. Pilih Node.js 22.x

1. Pada project Vercel, buka **Settings**.
2. Buka bagian **Build & Development Settings** atau **General** sesuai tampilan dashboard.
3. Pada **Node.js Version**, pilih `22.x`.
4. Simpan dan redeploy.

Package ini menggunakan `firebase-admin` 14.5.1, yang mensyaratkan Node.js 22 atau lebih baru. Versi project dikunci ke Node 22.

## 6. Publikasikan API sebelum Firestore Rules baru

Setelah semua file diunggah, Environment Variables disimpan, dan Vercel dideploy:

1. Login Admin di `https://www.cb3.web.id`.
2. Pastikan dashboard Admin masih dapat dimuat.
3. Buka Firestore Console → Database → Rules.
4. Ganti seluruh aturan dengan isi file `firestore.rules` dari paket.
5. Klik Publish.
6. Login ulang Admin dan uji halaman Database Pengurus.

Rules baru membuat browser hanya dapat mengakses data organisasi secara langsung jika sesi Firebase adalah Admin. Browser Pengurus tidak diberi akses Firestore langsung; aksesnya melewati Vercel API.

## 7. Buat akun Pengurus baru

Admin login → Database Pengurus → Tambah Pengurus. Isi:

- Nama lengkap.
- Jabatan/dapukan.
- Bidang.
- Nama login unik (huruf kecil/angka/titik/garis bawah/tanda hubung, 3–40 karakter setelah normalisasi).
- Password awal minimal 10 karakter.

Klik **Simpan Pengurus**. Vercel API membuat data pengurus dan akun internal secara bersamaan. Berikan nama login dan password awal kepada Pengurus melalui saluran pribadi.

### Data Pengurus lama

Jika sudah ada dokumen Pengurus lama di Firestore tetapi belum memiliki akun internal, buka Database Pengurus. Klik **Buat akun** pada baris Pengurus tersebut, lalu masukkan nama login dan password awal minimal 10 karakter.

## 8. Pengalaman login Pengurus

1. Pada halaman login, pilih tab **Pengurus**.
2. Isi nama login (atau nama pengurus yang sama setelah dinormalisasi) dan password awal.
3. Klik Masuk.
4. Pengurus hanya menerima data program yang `penanggungJawabId`-nya sama dengan ID dokumen Pengurus dan usulan yang `pengurusId`-nya sama dengan miliknya.
5. Untuk mengganti password, pilih **Ganti password** di sidebar, masukkan password saat ini dan password baru dua kali. Password baru minimal 10 karakter.

Google Sign-In tetap hanya untuk Admin. Pengurus menggunakan akun internal.

## 9. Kelola akun Pengurus

Menu Database Pengurus menyediakan:

- Status akun Aktif/Nonaktif/Belum dibuat.
- Buat akun untuk data Pengurus lama.
- Reset password oleh Admin (sesi lama dicabut).
- Aktifkan/Nonaktifkan akun (sesi lama dicabut).

## 10. Checklist uji setelah deploy

- [ ] Admin dapat login Email/Password.
- [ ] Admin dapat login Google.
- [ ] Dashboard Admin dapat membaca program, usulan, dan pengurus.
- [ ] Admin dapat membuat Pengurus baru beserta password awal.
- [ ] Pengurus dapat login dengan nama login dan password.
- [ ] Pengurus hanya melihat program yang ditugaskan kepadanya.
- [ ] Pengurus dapat mengajukan usulan.
- [ ] Admin dapat melihat dan memproses usulan.
- [ ] Pengurus dapat mengganti password sendiri.
- [ ] Admin dapat reset/nonaktifkan akun Pengurus.

## Keamanan penting

- Firebase Admin SDK mempunyai hak istimewa dan melewati Firestore Security Rules. Karena itu endpoint server memvalidasi token Admin atau sesi Pengurus sebelum menjalankan operasi database.
- Password asli tidak disimpan. API menyimpan hash scrypt dan salt.
- Sesi disimpan dalam cookie HttpOnly Secure agar JavaScript browser tidak dapat membaca isi cookie.
- Jangan membuka Firestore dengan `allow read, write: if true`.
- Jangan membagikan Service Account JSON atau `PENGURUS_SESSION_SECRET`.
- GitHub Pages hanya menyajikan frontend statis. API Pengurus berada di Vercel pada `www.cb3.web.id`.
