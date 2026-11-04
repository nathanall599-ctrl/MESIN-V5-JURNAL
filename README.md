# ⚙️ MechLog v7

Sistem pencatatan kuliah untuk mahasiswa Teknik Mesin.

## ✨ Fitur
- 🔐 Register/Login dengan email (SHA-256 hashing)
- 👤 Profil lengkap: Nama, NIM, Jurusan, Fakultas, Universitas
- 📅 Jadwal & Kalender Akademik
- 📊 Rekap Absensi Otomatis
- 📋 Modul Tugas & Materi
- 📓 Jurnal Perkuliahan (cetak PDF-ready)
- 💰 Keuangan Mahasiswa
- 🍅 Pomodoro Timer
- 📁 Folder MISC (galeri foto)
- 🔍 Global Search
- 📤 Export/Import data JSON

## 🚀 Deploy ke GitHub Pages

1. **Buat repository baru** di GitHub
2. **Upload semua file** ke repository
3. Buka **Settings → Pages**
4. Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)`
5. **Save** → tunggu 1-2 menit
6. Akses: `https://username.github.io/repo-name/`

## ⚠️ Keamanan

Auth ini menggunakan **localStorage + SHA-256** (client-side saja).
Cocok untuk **personal/demo**. Untuk production, gunakan:
- Firebase Authentication
- Supabase Auth
- Auth0

## 📁 Struktur
