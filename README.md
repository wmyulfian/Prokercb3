# Program Kerja CB3

Aplikasi web statis (HTML/CSS/JavaScript) dengan dua jenis autentikasi:

- **Admin:** Firebase Authentication (Email/Password dan Google).
- **Pengurus:** login internal menggunakan nama login dan password yang dibuat Admin. Pengurus tidak dibuat sebagai pengguna Firebase Authentication.

Data utama tersimpan di Cloud Firestore project `database-gencita`. Proses login internal dan akses data Pengurus dijalankan melalui Vercel Functions menggunakan Firebase Admin SDK.

## Isi paket

- `index.html` — aplikasi web.
- `api/` — endpoint Vercel untuk login, sesi, ganti password, usulan, dan pengelolaan akun Pengurus.
- `lib/server.js` — verifikasi Admin, sesi Pengurus, hash password, dan akses server ke Firestore.
- `firestore.rules` — aturan akses browser; data organisasi hanya dapat dibaca/ditulis langsung oleh Admin.
- `vercel.json` — mempertahankan rewrite Firebase Auth handler untuk domain `www.cb3.web.id`.
- `package.json` — dependency Firebase Admin SDK dan persyaratan Node.js 22.
- `.env.example` — nama variabel lingkungan tanpa nilai rahasia.
- `PETUNJUK-LOGIN-INTERNAL-PENGURUS.md` — panduan deploy dan konfigurasi server.

## Arsitektur autentikasi

1. Admin login melalui Firebase Authentication. Profil Admin harus ada di `users/{UID}` dengan `role: "admin"`.
2. Pengurus login ke `/api/pengurus/login` dengan nama login dan password. Password disimpan sebagai hash scrypt + salt pada `akun_pengurus/{loginName}`.
3. Server memberi cookie sesi `HttpOnly`, `Secure`, `SameSite=Lax`, dengan masa berlaku 8 jam.
4. Vercel API memeriksa sesi sebelum mengambil data program atau usulan Pengurus.
5. Pengurus hanya menerima program dengan `penanggungJawabId` miliknya dan usulan dengan `pengurusId` miliknya.
6. Pengurus dapat mengganti password sendiri melalui menu **Ganti password**. Admin dapat membuat akun awal, mereset password, dan menonaktifkan/mengaktifkan akun.

## Mulai deploy

Ikuti seluruh langkah dalam `PETUNJUK-LOGIN-INTERNAL-PENGURUS.md`. Jangan langsung menerapkan `firestore.rules` baru sebelum seluruh file API di-deploy dan variabel lingkungan Vercel sudah diatur.

**Jangan pernah memasukkan Service Account JSON/private key atau nilai `PENGURUS_SESSION_SECRET` ke GitHub, `index.html`, atau chat.** Simpan keduanya hanya sebagai Environment Variables pada proyek Vercel.
