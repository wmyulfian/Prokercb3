# Program Kerja CB3

Website statis berbasis HTML, CSS, dan JavaScript dengan Firebase Authentication dan Cloud Firestore.

## File
- `index.html` — aplikasi web, sudah berisi konfigurasi Firebase Web App untuk project `database-gencita`.
- `firestore.rules` — aturan keamanan Firestore.
- `PETUNJUK-FIREBASE.txt` — panduan aktivasi Firebase, pembuatan akun admin, dan akun pengurus.

## Sebelum digunakan
1. Aktifkan Email/Password pada Firebase Authentication.
2. Tambahkan hostname website ke Authentication > Settings > Authorized domains.
3. Buat Cloud Firestore jika belum ada.
4. Publish isi `firestore.rules` ke Firestore > Rules.
5. Buat akun admin di Authentication, lalu buat dokumen `users/{UID}` dengan `role: "admin"` dan `nama: "Administrator"`.
6. Ikuti panduan pembuatan akun pengurus pada `PETUNJUK-FIREBASE.txt`.

**Penting:** konfigurasi Firebase frontend bukan rahasia server. Jangan pernah memasukkan Service Account JSON atau private key ke repository. Akses data dilindungi melalui Firebase Authentication dan Firestore Security Rules.
