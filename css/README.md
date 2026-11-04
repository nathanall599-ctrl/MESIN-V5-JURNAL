# ⚙️ MechLog v7

Sistem pencatatan kuliah untuk mahasiswa Teknik Mesin — dibangun dengan HTML, CSS, dan JavaScript murni (tanpa framework, tanpa backend).

## ✨ Fitur

- 🔐 **Register / Login** dengan email + password (SHA-256 hashing via Web Crypto API)
- 👤 **Profil lengkap** — Nama, NIM, Jurusan, Fakultas, Universitas, foto profil
- 📊 **Multi-user** — setiap akun memiliki data terisolasi
- 📅 **Jadwal & Kalender** — mingguan + bulanan dengan deadline
- 📊 **Rekap Absensi** — per mata kuliah dengan status Aman/Hampir/Waspada/Bahaya
- 📋 **Modul Tugas** — CRUD lengkap, prioritas, deadline, lampiran
- 📖 **Modul Materi** — kartu & timeline, catatan Markdown, rumus LaTeX
- 📓 **Jurnal Perkuliahan** — per pertemuan, siap cetak (kop memakai data profil)
- 💰 **Keuangan Mahasiswa** — catat pemasukan & pengeluaran
- 🍅 **Pomodoro Timer** — 25/5, 50/10, atau kustom
- 📁 **Folder MISC** — galeri foto random perkuliahan
- 🔍 **Global Search** — cari MK, tugas, materi, catatan, jurnal
- 📤 **Export / Import JSON** — backup data per akun

## 🚀 Deploy ke GitHub Pages

1. **Buat repository baru** di [GitHub](https://github.com/new)
2. **Upload semua file** ke repository:
   - `index.html`
   - `app.html`
   - `css/auth.css`
   - `css/main.css`
   - `js/auth.js`
   - `js/data.js`
   - `js/profile.js`
   - `js/app.js`
   - `README.md`
3. Buka **Settings → Pages**
4. **Source**: `Deploy from a branch`
5. **Branch**: `main` → Folder: `/ (root)`
6. Klik **Save**
7. Tunggu 1–2 menit → akses di `https://USERNAME.github.io/NAMA-REPO/`

## 📁 Struktur Project
