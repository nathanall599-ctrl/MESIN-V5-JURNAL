/* ================================================================
   MechLog v7 — Profile Management
   ================================================================ */

let _profileData = null;

function initProfileModule() {
    _profileData = MechAuth.getCurrentUser();
    if (!_profileData) return;
    renderSidebarProfile();
    renderProfilePage();
}

function renderSidebarProfile() {
    const p = _profileData?.profile || {};
    const namaEl = document.getElementById('user-name-display');
    const nimEl = document.getElementById('user-nim-display');
    if (namaEl) namaEl.textContent = p.nama || 'Pengguna';
    if (nimEl) nimEl.textContent = p.nim ? `NIM: ${p.nim}` : (p.jurusan || '');
    renderAvatar();
}

function renderAvatar() {
    const avatarData = _profileData?.profile?.avatar || null;
    const placeholders = ['avatar-placeholder', 'avatar-placeholder-settings'];
    const imgs = ['avatar-img', 'avatar-img-settings'];
    const initial = (_profileData?.profile?.nama || 'U').trim().charAt(0).toUpperCase();
    placeholders.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = initial; el.style.display = avatarData ? 'none' : 'flex'; }
    });
    imgs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (avatarData) { el.src = avatarData; el.style.display = 'block'; }
            else { el.style.display = 'none'; el.src = ''; }
        }
    });
}

function renderProfilePage() {
    const p = _profileData?.profile || {};
    const map = {
        'profile-nama': p.nama || '',
        'profile-nim': p.nim || '',
        'profile-jurusan': p.jurusan || '',
        'profile-fakultas': p.fakultas || '',
        'profile-universitas': p.universitas || '',
        'profile-email': _profileData?.email || ''
    };
    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });
}

async function saveProfile() {
    const updates = {
        nama: document.getElementById('profile-nama').value.trim(),
        nim: document.getElementById('profile-nim').value.trim(),
        jurusan: document.getElementById('profile-jurusan').value.trim(),
        fakultas: document.getElementById('profile-fakultas').value.trim(),
        universitas: document.getElementById('profile-universitas').value.trim()
    };
    if (!updates.nama) { showToast('Nama tidak boleh kosong', 'error'); return; }
    try {
        _profileData = await MechAuth.updateProfile(updates);
        renderSidebarProfile();
        showToast('Profil berhasil diperbarui ✅', 'success');
    } catch (e) {
        showToast(e.message || 'Gagal menyimpan profil', 'error');
    }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Pilih file gambar', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Maksimal 5 MB', 'error'); return; }
    try {
        const dataUrl = await compressAvatar(file);
        _profileData = await MechAuth.updateProfile({ avatar: dataUrl });
        renderAvatar();
        showToast('Foto profil diperbarui 🖼️', 'success');
    } catch (e) {
        showToast('Gagal upload foto', 'error');
    }
    event.target.value = '';
}

function compressAvatar(file, maxSize = 400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let w = img.width, h = img.height;
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal baca gambar')); };
        img.src = url;
    });
}

async function removeAvatar() {
    if (!confirm('Hapus foto profil?')) return;
    _profileData = await MechAuth.updateProfile({ avatar: null });
    renderAvatar();
    showToast('Foto profil dihapus 🗑');
}

function changePassword() {
    const oldPass = prompt('Masukkan password lama:');
    if (!oldPass) return;
    const newPass = prompt('Masukkan password baru (min 6 karakter):');
    if (!newPass) return;
    MechAuth.changePassword(oldPass, newPass)
        .then(() => showToast('Password berhasil diubah 🔐', 'success'))
        .catch(e => showToast(e.message, 'error'));
}
