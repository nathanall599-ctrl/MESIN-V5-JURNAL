/* ================================================================
   MechLog v7 — Constants & Storage
   ================================================================ */

const MATA_KULIAH = [
    { id: 'mk1', nama: 'STANDARISASI & KONTROL KUALITAS', kode: 'TMS-101', sks: 2, dosen: 'Mner Jenly Manongko / Timoty Kapoh', ruang: 'TM01', jadwal: [{ hari: 1, jam: '09:00' }] },
    { id: 'mk2', nama: 'MATEMATIKA TEKNIK III', kode: 'TMS-102', sks: 2, dosen: 'Mner Hendrik Sumarauw / Nci Deva Risma', ruang: 'TM02', jadwal: [{ hari: 1, jam: '13:00' }] },
    { id: 'mk3', nama: 'ANALISA NUMERIK', kode: 'TMS-103', sks: 2, dosen: 'Prof Parabelem Rompas / Mner Charles', ruang: 'TM03', jadwal: [{ hari: 3, jam: '13:00' }] },
    { id: 'mk4', nama: 'MESIN KONVERSI ENERGI', kode: 'TMS-104', sks: 3, dosen: 'Mner Davidsen Mapaliey', ruang: 'TM04', jadwal: [{ hari: 2, jam: '10:00' }] },
    { id: 'mk5', nama: 'PEMILIHAN BAHAN DAN PRROSES', kode: 'TMS-105', sks: 2, dosen: 'Mner Rampo / Filian Mumek', ruang: 'TM05', jadwal: [{ hari: 3, jam: '08:00' }] },
    { id: 'mk6', nama: 'MEKANIKA FLUIDA', kode: 'TMS-106', sks: 3, dosen: 'Prof Parabelem Rompas / Mner Charles', ruang: 'TM06', jadwal: [{ hari: 3, jam: '10:00' }] },
    { id: 'mk7', nama: 'MEKANIKA KEKUATAN MATERIAL', kode: 'TMS-107', sks: 2, dosen: 'Nci Zuldesmi / Nci Deva Risma', ruang: 'TM07', jadwal: [{ hari: 4, jam: '09:00' }] },
    { id: 'mk8', nama: 'TTG', kode: 'TMS-108', sks: 1, dosen: 'Mner Jenly Manongko', ruang: 'TM08', jadwal: [{ hari: 1, jam: '08:00' }] },
    { id: 'mk9', nama: 'PERPINDAHAN PANASI', kode: 'TMS-109', sks: 2, dosen: 'Prof Parabelem / Mner Charles', ruang: 'TM09', jadwal: [{ hari: 4, jam: '12:00' }] },
    { id: 'mk10', nama: 'ELEMEN MESIN I', kode: 'TMS-110', sks: 3, dosen: 'Mner Rampo / Mner Davidsen', ruang: 'TM10', jadwal: [{ hari: 4, jam: '10:00' }] }
];

const MK_META = {
    mk1: { emoji: '📊', grad: 'linear-gradient(135deg,#f0883e 0%,#e85d04 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQIGiaIIw-3V-dBlOAlqZOUtSm2RdL0E8U2HhiY2SUYww&s=10' },
    mk2: { emoji: '∫', grad: 'linear-gradient(135deg,#bc8cff 0%,#6d28d9 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQL0o86fT6oNY_-46AMpdy6F8lhvrW6y-cudUAD4xugaA&s=10' },
    mk3: { emoji: '📈', grad: 'linear-gradient(135deg,#ec4899 0%,#be185d 100%)', img: 'https://fairuzelsaid.wordpress.com/wp-content/uploads/2010/10/metode-numerik.png' },
    mk4: { emoji: '🔥', grad: 'linear-gradient(135deg,#22d3ee 0%,#0e7490 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQkpdzA5chbLkroyM-glArAe0eI4tm6iQoSuMl3T4LsfA&s' },
    mk5: { emoji: '🧪', grad: 'linear-gradient(135deg,#10b981 0%,#059669 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4pjQ0wVzbWHbfbWUR87tsruXXtOItwGDOai_wBbo3VQ&s=10' },
    mk6: { emoji: '💧', grad: 'linear-gradient(135deg,#6366f1 0%,#4338ca 100%)', img: 'https://www.trasfello.com/wp-content/uploads/2025/01/apa-itu-mekanika-fluida.jpg' },
    mk7: { emoji: '🛠️', grad: 'linear-gradient(135deg,#f0883e 0%,#e85d04 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTHWlTf3z2yHx-o34vo1vYb33w_qtrNWkJ9EwaeYAxkQw&s=10' },
    mk8: { emoji: '🌱', grad: 'linear-gradient(135deg,#8b5cf6 0%,#6d28d9 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQK1ZarAd6aKYxN_SH4112ZybLq0gopGrWOSD8aiaiZGQ&s=10' },
    mk9: { emoji: '🌡️', grad: 'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT5fza8F5VZumCx-qP_ATt4maUNFZiRG3ODYL3irr26SQ&s=10' },
    mk10: { emoji: '⚙️', grad: 'linear-gradient(135deg,#3b82f6 0%,#1a56db 100%)', img: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQbLp5-wCx5Pkx5XeMOI-e-Slr73a1PSQzEG6BJYJS1eQ&s=10' }
};

const HARI_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
const TOTAL_PTM = 16;

const TIPE_PERTEMUAN = [
    { val: 'tatap-muka', label: '🏫 Tatap Muka' },
    { val: 'zoom', label: '💻 Zoom/Online' },
    { val: 'kuis', label: '📝 Kuis' },
    { val: 'ujian', label: '📋 Ujian' },
    { val: 'praktikum', label: '🔬 Praktikum' },
    { val: 'presentasi', label: '🎤 Presentasi' },
    { val: 'libur', label: '🏖️ Libur' }
];

const TIPE_TUGAS = [
    { val: 'tugas', label: '📝 Tugas' },
    { val: 'kuis', label: '❓ Kuis' },
    { val: 'proyek', label: '🔧 Proyek' },
    { val: 'laporan', label: '📄 Laporan' },
    { val: 'presentasi', label: '🎤 Presentasi' },
    { val: 'tidak ada tugas', label: '❌ Tidak Ada Tugas' }
];

const MATERI_KATEGORI = [
    { val: 'pdf', label: '📕 PDF Modul' },
    { val: 'slide', label: '🖥 Slide Presentasi' },
    { val: 'video', label: '🎥 Video Pembelajaran' },
    { val: 'link', label: '🔗 Link Referensi' },
    { val: 'catatan', label: '📝 Catatan Pribadi' },
    { val: 'cad', label: '📐 File CAD / Laporan Praktikum' },
    { val: 'rekaman', label: '🎙 Rekaman Kuliah' }
];

/* ============ HELPERS ============ */
function emptyPtm(no) {
    return {
        no, tanggal: '', absensi: 'belum', tipePertemuan: 'tatap-muka',
        catatan: '', catatanHtml: '', tugas: '', tugasHtml: '',
        checklistDone: false, materiUrl: '', materiPdfData: null, materiPdfName: '',
        materiPhotos: [], tipeTugas: 'tugas', statusTugas: 'belum',
        tugasDibuat: '', tugasDeadline: '', tugasUrl: '',
        tugasPdfData: null, tugasPdfName: '', tugasPhotos: []
    };
}

function emptyMkExtras() {
    return {
        materials: [],
        notes: { catatan: '', topikChecklist: [], bookmarks: [], rumus: [], lampiran: [] }
    };
}

function migrateAppData(d) {
    if (!d.misc) d.misc = { photos: [] };
    MATA_KULIAH.forEach(mk => {
        if (!d[mk.id]) d[mk.id] = { pertemuan: Array.from({ length: TOTAL_PTM }, (_, i) => emptyPtm(i + 1)), ...emptyMkExtras() };
        if (!d[mk.id].pertemuan) d[mk.id].pertemuan = Array.from({ length: TOTAL_PTM }, (_, i) => emptyPtm(i + 1));
        d[mk.id].pertemuan.forEach(p => {
            if (typeof p.checklistDone === 'undefined') p.checklistDone = false;
            if (typeof p.catatanHtml === 'undefined') p.catatanHtml = p.catatan || '';
            if (typeof p.tugasHtml === 'undefined') p.tugasHtml = p.tugas || '';
        });
        if (!d[mk.id].materials) d[mk.id].materials = [];
        if (!d[mk.id].notes) d[mk.id].notes = { catatan: '', topikChecklist: [], bookmarks: [], rumus: [], lampiran: [] };
        const n = d[mk.id].notes;
        if (typeof n.catatan === 'undefined') n.catatan = '';
        if (!n.topikChecklist) n.topikChecklist = [];
        if (!n.bookmarks) n.bookmarks = [];
        if (!n.rumus) n.rumus = [];
        if (!n.lampiran) n.lampiran = [];
    });
    if (!d.todos) d.todos = [];
    if (!d.finance) d.finance = { transactions: [] };
    if (!d.pomodoro) d.pomodoro = { customFocus: 25, customBreak: 5, cyclesToday: 0, cyclesDate: new Date().toDateString() };
    return d;
}

/* ============ INDEXEDDB ============ */
const DB_NAME = 'MechLogDB_v7';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
    return _dbPromise;
}

async function saveDataForUser(email, data) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ id: 'user_' + email, data });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (e) {
        console.error('Save failed', e);
        throw e;
    }
}

async function loadDataForUser(email) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const result = await new Promise((res, rej) => {
            const req = tx.objectStore(STORE_NAME).get('user_' + email);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        if (result && result.data) return migrateAppData(result.data);
    } catch (e) {
        console.error('Load failed', e);
    }
    const fresh = createFreshData();
    await saveDataForUser(email, fresh);
    return fresh;
}

function createFreshData() {
    const d = {
        misc: { photos: [] },
        todos: [],
        finance: { transactions: [] },
        pomodoro: { customFocus: 25, customBreak: 5, cyclesToday: 0, cyclesDate: new Date().toDateString() }
    };
    MATA_KULIAH.forEach(mk => {
        d[mk.id] = {
            pertemuan: Array.from({ length: TOTAL_PTM }, (_, i) => emptyPtm(i + 1)),
            ...emptyMkExtras()
        };
    });
    return d;
}
