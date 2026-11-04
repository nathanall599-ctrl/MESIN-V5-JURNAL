/* ================================================================
   MechLog v7 — Main Application Logic
   Requires (loaded before this file):
     - js/auth.js   → window.MechAuth
     - js/data.js   → MATA_KULIAH, MK_META, TIPE_*, helpers (emptyPtm,
                      emptyMkExtras, migrateAppData, createFreshData,
                      loadDataForUser, saveDataForUser)
     - js/profile.js → initProfileModule, handleAvatarUpload, saveProfile,
                       removeAvatar, changePassword, renderAvatar
   ================================================================ */
'use strict';

/* ================================================================
   GLOBAL STATE
   ================================================================ */
let currentUser = null;
let currentUserEmail = null;
let appData = null;
let currentMK = null;
let currentMkTab = 'pertemuan';
let expandedPtm = new Set();
let notesView = 'write';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let tugasStatusF = 'semua';

let tmTugas = [];
let tmMateri = [];
let tmTugasView = 'card';
let tmTugasEditLampiranLocal = [];

let quillInstances = {};
let jurnalEditCtx = null;

const TM_TUGAS_KEY = 'mechlog_tugas_v2';
const TM_MATERI_KEY = 'mechlog_materi_v2';

/* ================================================================
   APP INIT
   ================================================================ */
async function initApp() {
    // Guard: harus login
    if (!MechAuth.isLoggedIn()) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = MechAuth.getCurrentUser();
    currentUserEmail = currentUser.email;

    // Load data milik user ini (IndexedDB)
    appData = await loadDataForUser(currentUserEmail);

    // Init profile module (render sidebar, avatar, form profil)
    initProfileModule();

    // Header info
    const topDate = document.getElementById('top-date');
    if (topDate) {
        topDate.textContent = new Date().toLocaleDateString('id-ID', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }
    const greetName = document.getElementById('greeting-name');
    if (greetName) {
        greetName.textContent = (currentUser.profile?.nama || 'Pengguna').split(' ')[0];
    }

    // Load legacy module data (namespaced per user)
    tmLoadAll();

    // Build UIs
    buildMkNav();
    buildTugasMKFilter();
    tmBuildFilterOptions();
    buildJurnalFilterOptions();
    renderCalendar();
    buildSchedule();
    refreshDashboard();
    showPage('dashboard');
}

/* ================================================================
   DATA PERSISTENCE WRAPPERS
   ================================================================ */
async function saveData(data) {
    if (!currentUserEmail) return;
    try {
        await saveDataForUser(currentUserEmail, data);
    } catch (e) {
        console.error('[saveData]', e);
        showToast('Gagal menyimpan data ke storage', 'error');
    }
}

function doLogout() {
    if (confirm('Yakin ingin keluar dari akun ini?')) {
        MechAuth.logout();
    }
}

/* ================================================================
   TM (TUGAS & MATERI MODULE) — namespaced per user
   ================================================================ */
function tmLoadAll() {
    const suffix = '_' + currentUserEmail;
    try {
        const t = localStorage.getItem(TM_TUGAS_KEY + suffix);
        tmTugas = t ? JSON.parse(t) : [];
    } catch (e) { tmTugas = []; }
    try {
        const m = localStorage.getItem(TM_MATERI_KEY + suffix);
        tmMateri = m ? JSON.parse(m) : [];
    } catch (e) { tmMateri = []; }
}
function tmSaveTugas() {
    try {
        localStorage.setItem(TM_TUGAS_KEY + '_' + currentUserEmail, JSON.stringify(tmTugas));
    } catch (e) {
        showToast('Gagal menyimpan tugas (storage penuh)', 'error');
    }
}
function tmSaveMateri() {
    try {
        localStorage.setItem(TM_MATERI_KEY + '_' + currentUserEmail, JSON.stringify(tmMateri));
    } catch (e) {
        showToast('Gagal menyimpan materi (storage penuh)', 'error');
    }
}
function tmSaveAll() { tmSaveTugas(); tmSaveMateri(); }

/* ================================================================
   NAVIGATION
   ================================================================ */
const PAGE_TITLES = {
    dashboard: 'Dashboard',
    jadwal: 'Jadwal Kuliah',
    kalender: 'Kalender',
    rekap: 'Rekap Absensi',
    jurnal: 'Jurnal Perkuliahan',
    'tugas-module': 'Modul Tugas',
    'materi-module': 'Modul Materi',
    tugas: 'Daftar Tugas',
    todo: 'To-Do List',
    pomodoro: 'Pomodoro',
    keuangan: 'Keuangan',
    misc: 'Folder MISC',
    settings: 'Pengaturan',
    'mk-detail': ''
};

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + id);
    if (el) el.classList.add('active');

    let title = PAGE_TITLES[id] || id;
    if (id === 'mk-detail' && currentMK) {
        const mk = getMKById(currentMK);
        title = mk ? mk.nama : '';
    }
    document.getElementById('page-title').textContent = title;
    document.querySelectorAll('.nav-item[data-page]').forEach(n => {
        n.classList.toggle('active', n.dataset.page === id);
    });

    if (id === 'tugas') buildTugasList();
    if (id === 'rekap') buildRekap();
    if (id === 'misc') renderMiscPhotos();
    if (id === 'todo') renderTodos();
    if (id === 'keuangan') renderFinance();
    if (id === 'pomodoro') pomoRefreshDisplay();
    if (id === 'tugas-module') renderTugasModule();
    if (id === 'materi-module') renderMateriModule();
    if (id === 'jurnal') renderJurnal();

    closeSidebar();
    window.scrollTo(0, 0);
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    sb.classList.toggle('open');
    ov.style.display = sb.classList.contains('open') ? 'block' : 'none';
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').style.display = 'none';
}

/* ================================================================
   HELPERS
   ================================================================ */
function getMKById(id) { return MATA_KULIAH.find(m => m.id === id); }

function calcAbsensi(mkId) {
    const ptms = appData[mkId].pertemuan;
    const hadir = ptms.filter(p => p.absensi === 'hadir').length;
    const izin = ptms.filter(p => p.absensi === 'izin').length;
    const sakit = 0;
    const alfa = ptms.filter(p => p.absensi === 'alfa').length;
    const done = hadir + izin + alfa;
    const pct = done === 0 ? 0 : Math.round((hadir / done) * 100);
    return { hadir, izin, sakit, alfa, done, pct };
}

function calcTugas(mkId) {
    const ptms = appData[mkId].pertemuan;
    const all = ptms.filter(p => (p.tugas || '').trim() !== '');
    const selesai = all.filter(p => p.statusTugas === 'selesai').length;
    const proses = all.filter(p => p.statusTugas === 'proses').length;
    const belum = all.filter(p => p.statusTugas === 'belum').length;
    return { total: all.length, selesai, proses, belum };
}

function countRes(mkId) {
    let n = 0;
    appData[mkId].pertemuan.forEach(p => {
        if ((p.materiUrl || '').trim()) n++;
        if (p.materiPdfData) n++;
        if ((p.tugasUrl || '').trim()) n++;
        if (p.tugasPdfData) n++;
        n += (p.materiPhotos || []).length;
        n += (p.tugasPhotos || []).length;
    });
    return n;
}

function fmtDate(d) {
    if (!d) return '–';
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function isOverdue(dl) {
    if (!dl) return false;
    return new Date(dl) < new Date(new Date().toDateString());
}
function daysUntil(dl) {
    if (!dl) return null;
    const now = new Date(new Date().toDateString());
    const dlDate = new Date(dl);
    return Math.ceil((dlDate - now) / (1000 * 60 * 60 * 24));
}
function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function fmtRupiah(n) {
    n = Number(n) || 0;
    return 'Rp' + n.toLocaleString('id-ID');
}
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ================================================================
   SIDEBAR BUILD
   ================================================================ */
function buildMkNav() {
    document.getElementById('mk-nav-list').innerHTML = MATA_KULIAH.map(mk => `
        <button class="nav-item" onclick="openMKDetail('${mk.id}')">
            <span class="icon">${MK_META[mk.id]?.emoji || '📖'}</span>
            <span class="label">${mk.nama}</span>
        </button>`).join('');
}
function buildTugasMKFilter() {
    const sel = document.getElementById('tugas-mk-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="semua">📚 Semua MK</option>' +
        MATA_KULIAH.map(mk => `<option value="${mk.id}">${MK_META[mk.id]?.emoji || '📖'} ${mk.nama}</option>`).join('');
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function refreshDashboard() {
    let totalH = 0, totalD = 0, tgSelesai = 0, tgTotal = 0, tgBelum = 0, res = 0;
    MATA_KULIAH.forEach(mk => {
        const ab = calcAbsensi(mk.id);
        const tg = calcTugas(mk.id);
        totalH += ab.hadir; totalD += ab.done;
        tgSelesai += tg.selesai; tgTotal += tg.total; tgBelum += tg.belum;
        res += countRes(mk.id);
    });
    const pH = totalD === 0 ? 0 : Math.round((totalH / totalD) * 100);
    const pT = tgTotal === 0 ? 0 : Math.round((tgSelesai / tgTotal) * 100);

    document.getElementById('stat-hadir').textContent = totalH;
    document.getElementById('stat-belum').textContent = tgBelum;
    document.getElementById('stat-res').textContent = res;

    const barH = document.getElementById('bar-hadir');
    barH.style.width = pH + '%';
    barH.className = 'progress-bar' + (pH < 50 ? ' danger' : pH < 75 ? ' warn' : '');
    document.getElementById('pct-hadir').textContent = pH + '%';
    document.getElementById('label-hadir').textContent = `${totalH} hadir dari ${totalD} pertemuan tercatat`;

    document.getElementById('pct-tugas').textContent = pT + '%';
    document.getElementById('bar-tugas').style.width = pT + '%';
    document.getElementById('label-tugas').textContent = `${tgSelesai} dari ${tgTotal} tugas selesai`;

    const badge = document.getElementById('tugas-badge');
    if (badge) {
        badge.textContent = tgBelum;
        badge.style.display = tgBelum > 0 ? 'inline' : 'none';
    }

    tmUpdateDashboardStats();
    renderDeadlineWarnings();
    buildMKGrid();
}

function tmUpdateDashboardStats() {
    const st = tmComputeTugasStats();
    const el1 = document.getElementById('tm-dash-total');
    if (el1) el1.textContent = st.total;
    const el2 = document.getElementById('tm-dash-selesai');
    if (el2) el2.textContent = st.selesai;
    const el3 = document.getElementById('tm-dash-terlambat');
    if (el3) el3.textContent = st.terlambat;
    const el4 = document.getElementById('tm-dash-minggu');
    if (el4) el4.textContent = st.minggu;

    const t = tmMateri.length;
    const dip = tmMateri.filter(m => m.status === 'dipelajari').length;
    const belum = t - dip;
    const elt = document.getElementById('tm-mat-total');
    if (elt) elt.textContent = t;
    const eld = document.getElementById('tm-mat-dipelajari');
    if (eld) eld.textContent = dip;
    const elb = document.getElementById('tm-mat-belum');
    if (elb) elb.textContent = belum;

    const belumT = st.belum;
    const b1 = document.getElementById('tugas-module-badge');
    if (b1) { b1.textContent = belumT; b1.style.display = belumT > 0 ? 'inline' : 'none'; }
    const b2 = document.getElementById('materi-module-badge');
    if (b2) { b2.textContent = belum; b2.style.display = belum > 0 ? 'inline' : 'none'; }
}

function buildMKGrid() {
    document.getElementById('mk-dashboard-grid').innerHTML = MATA_KULIAH.map(mk => {
        const ab = calcAbsensi(mk.id);
        const tg = calcTugas(mk.id);
        const r = countRes(mk.id);
        const bc = ab.pct < 50 ? 'danger' : ab.pct < 75 ? 'warn' : '';
        const meta = MK_META[mk.id] || { emoji: '📖', grad: 'linear-gradient(135deg,var(--surface3),var(--surface2))' };
        const thumbContent = meta.img
            ? `<img src="${meta.img}" alt="${mk.nama}" loading="lazy"/>`
            : `<span class="mk-thumb-emoji">${meta.emoji}</span>`;
        return `
            <div class="mk-card" onclick="openMKDetail('${mk.id}')">
                <div class="mk-thumb" style="background:${meta.grad}">${thumbContent}</div>
                <div class="mk-name">${mk.nama}</div>
                <div class="mk-meta">${mk.sks} SKS · ${mk.ruang}</div>
                <div class="mk-progress-label"><span>Kehadiran</span><span>${ab.hadir}/${ab.done} (${ab.pct}%)</span></div>
                <div class="progress-wrap"><div class="progress-bar ${bc}" style="width:${ab.pct}%"></div></div>
                <div class="mk-badges">
                    <span class="badge badge-green">✅ ${ab.hadir}</span>
                    <span class="badge badge-yellow">📋 ${ab.izin}</span>
                    <span class="badge badge-red">❌ ${ab.alfa}</span>
                    ${tg.belum > 0 ? `<span class="badge badge-red">📝 ${tg.belum} tugas</span>` : ''}
                    ${r > 0 ? `<span class="badge badge-purple">📎 ${r}</span>` : ''}
                </div>
            </div>`;
    }).join('');
}

function renderDeadlineWarnings() {
    const container = document.getElementById('deadline-warnings-container');
    const upcoming = [];
    MATA_KULIAH.forEach(mk => {
        appData[mk.id].pertemuan.forEach(p => {
            if (!p.tugas.trim() || p.statusTugas === 'selesai' || !p.tugasDeadline) return;
            const days = daysUntil(p.tugasDeadline);
            if (days !== null && days <= 30) {
                upcoming.push({ mk, p, days });
            }
        });
    });
    tmTugas.forEach(t => {
        if (t.status === 'selesai' || !t.deadline) return;
        const days = daysUntil(t.deadline);
        if (days !== null && days <= 30) {
            const mk = getMKById(t.mkId);
            upcoming.push({
                mk,
                p: { no: t.pertemuan, tugas: t.judul, tipeTugas: 'tugas', tugasDeadline: t.deadline },
                days
            });
        }
    });

    if (!upcoming.length) { container.innerHTML = ''; return; }
    upcoming.sort((a, b) => a.days - b.days);

    const itemsHtml = upcoming.map(({ mk, p, days }) => {
        let daysText, daysClass;
        if (days < 0) { daysText = `${Math.abs(days)}h lewat`; daysClass = 'overdue'; }
        else if (days === 0) { daysText = 'Hari ini!'; daysClass = 'overdue'; }
        else if (days === 1) { daysText = 'Besok!'; daysClass = 'urgent'; }
        else { daysText = `${days} hari`; daysClass = 'soon'; }
        const tipeLbl = TIPE_TUGAS.find(t => t.val === p.tipeTugas)?.label || '';
        return `<div class="deadline-item">
                    <div class="deadline-item-days ${daysClass}">${daysText}</div>
                    <div class="deadline-item-info">
                        <div class="deadline-item-task">${escapeHtml(p.tugas)}</div>
                        <div class="deadline-item-mk">${mk?.nama || '–'} · Ptm ${p.no} · ${tipeLbl} · Deadline: ${fmtDate(p.tugasDeadline)}</div>
                    </div>
                    <button class="btn-sm" style="font-size:.7rem;padding:4px 10px;flex-shrink:0" onclick="openMKDetail('${mk?.id}')">Lihat MK →</button>
                </div>`;
    }).join('');

    container.innerHTML = `
        <div class="deadline-section mb-3">
            <div class="deadline-section-header">
                <div class="deadline-section-title">⚠️ Peringatan Deadline <span class="deadline-pulse">${upcoming.length}</span></div>
                <span class="text-muted" style="margin-left:auto;font-size:.72rem">${upcoming.length} tugas dalam 30 hari ke depan</span>
            </div>
            <div class="deadline-items">${itemsHtml}</div>
        </div>`;
}

/* ================================================================
   JADWAL
   ================================================================ */
function buildSchedule() {
    const container = document.getElementById('schedule-grid');
    if (!container) return;
    const todayDay = new Date().getDay();
    const colors = ['orange', 'blue', 'orange', 'blue', 'green', 'purple', 'red'];
    let html = '<div></div>';
    HARI_NAMES.forEach((h, i) => {
        const isToday = (i + 1) === todayDay;
        html += `<div class="schedule-head ${isToday ? 'today' : ''}">${h}${isToday ? ' ●' : ''}</div>`;
    });
    const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
    timeSlots.forEach(time => {
        html += `<div class="time-slot">${time}</div>`;
        for (let h = 1; h <= 5; h++) {
            const mks = MATA_KULIAH.filter(m => m.jadwal.some(j => j.hari === h && j.jam === time));
            html += '<div class="schedule-cell">';
            mks.forEach((mk, idx) => {
                const col = colors[(idx + h) % colors.length];
                html += `<div class="sched-item ${col}" onclick="openMKDetail('${mk.id}')">
                            <div class="sched-name">${mk.nama}</div>
                            <div class="sched-room">${mk.ruang}</div>
                        </div>`;
            });
            html += '</div>';
        }
    });
    container.innerHTML = html;
}

/* ================================================================
   KALENDER
   ================================================================ */
function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    const MN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const DN = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    document.getElementById('cal-title').textContent = `${MN[calMonth]} ${calYear}`;

    const events = {};
    MATA_KULIAH.forEach(mk => {
        appData[mk.id].pertemuan.forEach(p => {
            if (p.tanggal) {
                if (!events[p.tanggal]) events[p.tanggal] = [];
                const shortName = mk.nama.length > 20 ? mk.nama.substring(0, 18) + '…' : mk.nama;
                events[p.tanggal].push({ type: 'meeting', label: shortName, mkId: mk.id });
            }
            if (p.tugasDeadline) {
                if (!events[p.tugasDeadline]) events[p.tugasDeadline] = [];
                const shortName = (p.tugas.length > 15 ? p.tugas.substring(0, 12) + '…' : p.tugas) || 'Tugas';
                events[p.tugasDeadline].push({ type: 'deadline', label: '⏰ ' + shortName, mkId: mk.id });
            }
        });
    });
    tmTugas.forEach(t => {
        if (t.deadline) {
            if (!events[t.deadline]) events[t.deadline] = [];
            const shortName = t.judul.length > 15 ? t.judul.substring(0, 12) + '…' : t.judul;
            events[t.deadline].push({ type: 'deadline', label: '⏰ ' + shortName, mkId: t.mkId });
        }
    });

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let html = DN.map(d => `<div class="cal-day-head">${d}</div>`).join('');
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="cal-cell other-month"><div class="cal-date">${daysInPrev - firstDay + i + 1}</div></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isT = ds === todayStr;
        const evs = events[ds] || [];
        let evHtml = '';
        const maxShow = 4;
        evs.slice(0, maxShow).forEach(e => {
            const cls = e.type === 'deadline' ? 'deadline' : 'meeting';
            const onclick = e.mkId ? `onclick="openMKDetail('${e.mkId}')"` : '';
            evHtml += `<div class="cal-event ${cls}" ${onclick} title="${e.label}">${e.label}</div>`;
        });
        if (evs.length > maxShow) evHtml += `<div class="cal-event-extra">+${evs.length - maxShow} lagi</div>`;
        html += `<div class="cal-cell ${isT ? 'today' : ''}"><div class="cal-date">${d}</div>${evHtml}</div>`;
    }
    const rem = (firstDay + daysInMonth) % 7 === 0 ? 0 : 7 - ((firstDay + daysInMonth) % 7);
    for (let i = 1; i <= rem; i++) {
        html += `<div class="cal-cell other-month"><div class="cal-date">${i}</div></div>`;
    }
    grid.innerHTML = html;
}
function calPrev() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
}
function calNext() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
}

/* ================================================================
   REKAP
   ================================================================ */
function buildRekap() {
    const tbody = document.getElementById('rekap-tbody');
    if (!tbody) return;
    let html = '';
    MATA_KULIAH.forEach(mk => {
        const ab = calcAbsensi(mk.id);
        const pct = ab.pct;
        let statusText, statusClass;
        if (pct >= 80) { statusText = 'Aman'; statusClass = 'status-aman'; }
        else if (pct >= 60) { statusText = 'Hampir Bahaya'; statusClass = 'status-hampir'; }
        else if (pct >= 40) { statusText = 'Waspada'; statusClass = 'status-waspada'; }
        else { statusText = 'Bahaya'; statusClass = 'status-bahaya'; }
        html += `<tr onclick="openMKDetail('${mk.id}')" style="cursor:pointer;">
                    <td class="mk-cell">${mk.nama}</td>
                    <td>${ab.done}</td>
                    <td style="color:var(--green);font-weight:700;">${ab.hadir}</td>
                    <td style="color:var(--yellow);">${ab.izin}</td>
                    <td>${ab.sakit}</td>
                    <td style="color:var(--red);">${ab.alfa}</td>
                    <td style="font-family:var(--font-mono);font-weight:700;color:${pct < 60 ? 'var(--red)' : pct < 80 ? 'var(--yellow)' : 'var(--green)'}">${pct}%</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                </tr>`;
    });
    tbody.innerHTML = html;
}

/* ================================================================
   JURNAL PERKULIAHAN
   ================================================================ */
function buildJurnalFilterOptions() {
    const mkSel = document.getElementById('jurnal-filter-mk');
    if (mkSel) {
        mkSel.innerHTML = '<option value="semua">📚 Semua MK</option>' +
            MATA_KULIAH.map(mk => `<option value="${mk.id}">${MK_META[mk.id]?.emoji || '📖'} ${mk.nama}</option>`).join('');
    }
    const ptmSel = document.getElementById('jurnal-filter-ptm');
    if (ptmSel) {
        let opts = '<option value="semua">Semua Pertemuan</option>';
        for (let i = 1; i <= TOTAL_PTM; i++) opts += `<option value="${i}">Pertemuan ${i}</option>`;
        ptmSel.innerHTML = opts;
    }
}

function renderJurnal() {
    const tbody = document.getElementById('jurnal-tbody');
    if (!tbody) return;

    const q = (document.getElementById('jurnal-search')?.value || '').toLowerCase();
    const fMk = document.getElementById('jurnal-filter-mk')?.value || 'semua';
    const fPtm = document.getElementById('jurnal-filter-ptm')?.value || 'semua';
    const fStart = document.getElementById('jurnal-filter-start')?.value || '';
    const fEnd = document.getElementById('jurnal-filter-end')?.value || '';

    let entries = [];
    MATA_KULIAH.forEach(mk => {
        appData[mk.id].pertemuan.forEach((p, idx) => {
            if (!p.tanggal && !p.tugas && !p.catatan && p.absensi === 'belum' && !p.checklistDone) return;
            entries.push({ mk, p, idx });
        });
    });

    entries = entries.filter(({ mk, p }) => {
        if (fMk !== 'semua' && mk.id !== fMk) return false;
        if (fPtm !== 'semua' && p.no != fPtm) return false;
        if (fStart && p.tanggal && p.tanggal < fStart) return false;
        if (fEnd && p.tanggal && p.tanggal > fEnd) return false;
        if (q) {
            const blob = `${p.tugas || ''} ${p.catatan || ''} ${mk.nama || ''} ${p.tanggal || ''}`.toLowerCase();
            if (!blob.includes(q)) return false;
        }
        return true;
    });

    entries.sort((a, b) => {
        if (a.p.tanggal && b.p.tanggal) return b.p.tanggal.localeCompare(a.p.tanggal);
        if (a.p.tanggal) return -1;
        if (b.p.tanggal) return 1;
        return a.mk.nama.localeCompare(b.mk.nama);
    });

    if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">Belum ada jurnal. Klik "Tambah Jurnal" untuk mulai mencatat.</td></tr>`;
        return;
    }

    const absMap = { hadir: '✅ Hadir', izin: '📋 Izin', alfa: '❌ Alfa', belum: '– Belum' };

    tbody.innerHTML = entries.map(({ mk, p, idx }) => {
        let topik = p.tugas ? p.tugas.substring(0, 40) : (p.catatan ? p.catatan.substring(0, 40).replace(/\n/g, ' ') : '–');
        if (topik.length >= 40) topik += '…';
        const absLabel = absMap[p.absensi] || '–';
        const absClass = p.absensi === 'hadir' ? 'badge-green' : p.absensi === 'izin' ? 'badge-yellow' : p.absensi === 'alfa' ? 'badge-red' : 'badge-gray';

        return `<tr>
            <td class="j-tanggal">${p.tanggal ? fmtDate(p.tanggal) : '–'}</td>
            <td class="j-mk">${mk.nama}</td>
            <td class="j-ptm">${p.no}</td>
            <td class="j-topic">${escapeHtml(topik)}</td>
            <td><span class="badge ${absClass}">${absLabel}</span></td>
            <td>
                <div class="jurnal-actions">
                    <button class="edit" onclick="openJurnalModal('${mk.id}', ${idx})">✏ Edit</button>
                    <button class="dup" onclick="duplicateJurnal('${mk.id}', ${idx})">📋 Duplikat</button>
                    <button class="del" onclick="deleteJurnal('${mk.id}', ${idx})">🗑</button>
                    <button class="print" onclick="printJurnalPertemuan('${mk.id}', ${idx})">🖨️ Print</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function resetJurnalFilter() {
    ['jurnal-search', 'jurnal-filter-start', 'jurnal-filter-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['jurnal-filter-mk', 'jurnal-filter-ptm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'semua';
    });
    renderJurnal();
}

function openJurnalModal(mkId, ptmIdx) {
    const modal = document.getElementById('jurnal-modal');
    const titleEl = document.getElementById('jurnal-modal-title');
    const mkSel = document.getElementById('jurnal-input-mk');
    const ptmSel = document.getElementById('jurnal-input-ptm');

    mkSel.innerHTML = MATA_KULIAH.map(mk =>
        `<option value="${mk.id}">${MK_META[mk.id]?.emoji || '📖'} ${mk.nama}</option>`
    ).join('');

    let ptmOpts = '';
    for (let i = 1; i <= TOTAL_PTM; i++) ptmOpts += `<option value="${i}">Pertemuan ${i}</option>`;
    ptmSel.innerHTML = ptmOpts;

    if (mkId !== undefined && ptmIdx !== undefined) {
        const p = appData[mkId].pertemuan[ptmIdx];
        titleEl.textContent = '✏ Edit Jurnal Perkuliahan';
        document.getElementById('jurnal-edit-mk-id').value = mkId;
        document.getElementById('jurnal-edit-ptm-idx').value = ptmIdx;
        mkSel.value = mkId;
        ptmSel.value = p.no;
        document.getElementById('jurnal-input-tanggal').value = p.tanggal || '';
        document.getElementById('jurnal-input-absensi').value = p.absensi || 'belum';
        document.getElementById('jurnal-input-topik').value = p.tugas || '';
        document.getElementById('jurnal-input-catatan').value = p.catatan || '';
        jurnalEditCtx = { mkId, ptmIdx };
    } else {
        titleEl.textContent = '➕ Tambah Jurnal Perkuliahan';
        document.getElementById('jurnal-edit-mk-id').value = '';
        document.getElementById('jurnal-edit-ptm-idx').value = '';
        mkSel.value = MATA_KULIAH[0].id;
        ptmSel.value = 1;
        document.getElementById('jurnal-input-tanggal').value = new Date().toISOString().slice(0, 10);
        document.getElementById('jurnal-input-absensi').value = 'hadir';
        document.getElementById('jurnal-input-topik').value = '';
        document.getElementById('jurnal-input-catatan').value = '';
        jurnalEditCtx = null;
    }

    modal.classList.add('open');
}

function closeJurnalModal() {
    document.getElementById('jurnal-modal').classList.remove('open');
}
function onJurnalMkChange() { }
function onJurnalPtmChange() { }

function saveJurnalForm() {
    const editMkId = document.getElementById('jurnal-edit-mk-id').value;
    const editPtmIdx = document.getElementById('jurnal-edit-ptm-idx').value;

    const mkId = document.getElementById('jurnal-input-mk').value;
    const ptmNo = parseInt(document.getElementById('jurnal-input-ptm').value);
    const tanggal = document.getElementById('jurnal-input-tanggal').value;
    const absensi = document.getElementById('jurnal-input-absensi').value;
    const topik = document.getElementById('jurnal-input-topik').value.trim();
    const catatan = document.getElementById('jurnal-input-catatan').value.trim();

    if (!mkId || !ptmNo) { showToast('Mata Kuliah dan Pertemuan wajib diisi', 'error'); return; }
    const ptmIdx = ptmNo - 1;

    if (editMkId !== '' && editPtmIdx !== '') {
        const oldMkId = editMkId;
        const oldIdx = parseInt(editPtmIdx);

        if (oldMkId === mkId && oldIdx === ptmIdx) {
            const p = appData[mkId].pertemuan[ptmIdx];
            p.tanggal = tanggal;
            p.absensi = absensi;
            p.tugas = topik;
            p.tugasHtml = topik;
            p.catatan = catatan;
            p.catatanHtml = catatan;
            p.checklistDone = true;
        } else {
            const oldP = appData[oldMkId].pertemuan[oldIdx];
            oldP.tanggal = ''; oldP.absensi = 'belum';
            oldP.tugas = ''; oldP.tugasHtml = '';
            oldP.catatan = ''; oldP.catatanHtml = '';
            oldP.checklistDone = false;

            const newP = appData[mkId].pertemuan[ptmIdx];
            newP.tanggal = tanggal;
            newP.absensi = absensi;
            newP.tugas = topik;
            newP.tugasHtml = topik;
            newP.catatan = catatan;
            newP.catatanHtml = catatan;
            newP.checklistDone = true;
        }
        showToast('Jurnal diperbarui ✅', 'success');
    } else {
        const p = appData[mkId].pertemuan[ptmIdx];
        p.tanggal = tanggal;
        p.absensi = absensi;
        p.tugas = topik;
        p.tugasHtml = topik;
        p.catatan = catatan;
        p.catatanHtml = catatan;
        p.checklistDone = true;
        showToast('Jurnal ditambahkan ➕', 'success');
    }

    saveData(appData);
    closeJurnalModal();
    renderJurnal();
    refreshDashboard();
    renderCalendar();
}

function duplicateJurnal(mkId, ptmIdx) {
    const p = appData[mkId].pertemuan[ptmIdx];
    let targetIdx = -1;
    for (let i = 0; i < TOTAL_PTM; i++) {
        if (i === ptmIdx) continue;
        const q = appData[mkId].pertemuan[i];
        if (!q.tanggal && !q.tugas && !q.catatan && q.absensi === 'belum' && !q.checklistDone) {
            targetIdx = i; break;
        }
    }
    if (targetIdx === -1) targetIdx = (ptmIdx + 1) % TOTAL_PTM;
    const target = appData[mkId].pertemuan[targetIdx];
    target.tanggal = p.tanggal;
    target.absensi = p.absensi;
    target.tugas = p.tugas;
    target.tugasHtml = p.tugasHtml;
    target.catatan = p.catatan;
    target.catatanHtml = p.catatanHtml;
    target.checklistDone = true;
    target.tipeTugas = p.tipeTugas;
    target.statusTugas = p.statusTugas;
    target.tugasDibuat = p.tugasDibuat;
    target.tugasDeadline = p.tugasDeadline;
    target.tugasUrl = p.tugasUrl;
    target.tugasPdfData = p.tugasPdfData;
    target.tugasPdfName = p.tugasPdfName;
    target.tugasPhotos = JSON.parse(JSON.stringify(p.tugasPhotos || []));
    target.materiUrl = p.materiUrl;
    target.materiPdfData = p.materiPdfData;
    target.materiPdfName = p.materiPdfName;
    target.materiPhotos = JSON.parse(JSON.stringify(p.materiPhotos || []));
    target.tipePertemuan = p.tipePertemuan;

    saveData(appData);
    renderJurnal();
    refreshDashboard();
    renderCalendar();
    showToast(`Jurnal diduplikat ke Pertemuan ${target.no} 📋`, 'success');
}

async function deleteJurnal(mkId, ptmIdx) {
    if (!confirm('Hapus jurnal ini? Data pertemuan akan dikosongkan.')) return;
    const p = appData[mkId].pertemuan[ptmIdx];
    p.tanggal = ''; p.absensi = 'belum';
    p.tugas = ''; p.tugasHtml = '';
    p.catatan = ''; p.catatanHtml = '';
    p.checklistDone = false;
    p.tipeTugas = 'tugas'; p.statusTugas = 'belum'; p.tugasDibuat = '';
    p.tugasDeadline = ''; p.tugasUrl = ''; p.tugasPdfData = null; p.tugasPdfName = '';
    p.tugasPhotos = []; p.materiUrl = ''; p.materiPdfData = null; p.materiPdfName = '';
    p.materiPhotos = []; p.tipePertemuan = 'tatap-muka';

    await saveData(appData);
    renderJurnal();
    refreshDashboard();
    renderCalendar();
    showToast('Jurnal dihapus 🗑', 'success');
}

/* ================================================================
   PRINT JURNAL PER PERTEMUAN
   ================================================================ */
function printJurnalPertemuan(mkId, ptmIdx) {
    const mk = getMKById(mkId);
    const p = appData[mkId].pertemuan[ptmIdx];
    if (!mk || !p) return;

    const prof = currentUser.profile || {};
    const nama = prof.nama || 'Mahasiswa';
    const nim = prof.nim || '–';
    const jurusan = prof.jurusan || 'Teknik Mesin';
    const fakultas = prof.fakultas || 'Fakultas Teknik';
    const universitas = prof.universitas || '';

    const tipeLabel = TIPE_PERTEMUAN.find(t => t.val === p.tipePertemuan)?.label || p.tipePertemuan;
    const absMap = { hadir: 'HADIR (Terverifikasi)', izin: 'IZIN', alfa: 'ALFA / TIDAK HADIR', belum: 'BELUM DICATAT' };
    const absStatus = absMap[p.absensi] || '–';
    const absCls = p.absensi === 'hadir' ? 'status-hadir' : p.absensi === 'izin' ? 'status-izin' : p.absensi === 'alfa' ? 'status-alfa' : 'status-belum';

    let tglFormatted = '–';
    if (p.tanggal) {
        try {
            const d = new Date(p.tanggal);
            const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            const blnArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            tglFormatted = `${hariArr[d.getDay()]}, ${d.getDate()} ${blnArr[d.getMonth()]} ${d.getFullYear()}`;
        } catch (e) { tglFormatted = p.tanggal; }
    }

    let formattedCatatan = '';
    if (p.catatanHtml && p.catatanHtml.trim()) {
        formattedCatatan = p.catatanHtml;
    } else if (p.catatan && p.catatan.trim()) {
        const paragraphs = p.catatan.split('\n\n');
        formattedCatatan = paragraphs.map(pg => {
            const lines = pg.split('\n');
            if (lines.length > 1 && lines[0].startsWith('-')) {
                return '<ul>' + lines.map(l => `<li>${escapeHtml(l.replace(/^[-\*]\s*/, ''))}</li>`).join('') + '</ul>';
            }
            return `<p>${escapeHtml(pg).replace(/\n/g, '<br/>')}</p>`;
        }).join('');
    } else {
        formattedCatatan = '<p style="color:#64748b;font-style:italic;">Tidak ada catatan materi pada pertemuan ini.</p>';
    }

    let formattedTugas = '';
    if (p.tugasHtml && p.tugasHtml.trim()) {
        formattedTugas = p.tugasHtml;
    } else if (p.tugas && p.tugas.trim()) {
        formattedTugas = `<p>${escapeHtml(p.tugas).replace(/\n/g, '<br/>')}</p>`;
    } else {
        formattedTugas = '<p style="color:#64748b;font-style:italic;">Tidak ada penugasan atau kuis untuk pertemuan ini.</p>';
    }

    const win = window.open('', '_blank');
    if (!win) { showToast('Popup diblokir browser', 'error'); return; }

    const printHtml = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Lembar Jurnal - ${escapeHtml(mk.nama)} - Pertemuan ${p.no}</title>
<style>
@page { size: A4 portrait; margin: 15mm 20mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.65; color: #1e293b; background: #fff; padding: 20px; }
.kop-header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; text-align: center; }
.kop-title h1 { font-size: 15pt; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; margin-bottom: 2px; text-transform: uppercase; }
.kop-title h2 { font-size: 12pt; font-weight: 600; color: #475569; margin-bottom: 2px; }
.kop-title h3 { font-size: 10.5pt; font-weight: 600; color: #475569; margin-bottom: 2px; }
.kop-title p { font-size: 9pt; color: #64748b; }
.meta-container { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; background: #f8fafc; margin-bottom: 20px; page-break-inside: avoid; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 10pt; }
.meta-item { display: flex; }
.meta-label { width: 140px; font-weight: 600; color: #475569; flex-shrink: 0; }
.meta-val { color: #0f172a; font-weight: 500; }
.status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-weight: 700; font-size: 8.5pt; text-transform: uppercase; border: 1px solid #cbd5e1; }
.status-hadir { background: #dcfce7; color: #166534; border-color: #86efac; }
.status-izin { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.status-alfa { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.status-belum { background: #f1f5f9; color: #64748b; border-color: #cbd5e1; }
.content-section { margin-bottom: 22px; }
.section-heading { font-size: 11pt; font-weight: 700; color: #0f172a; border-left: 4px solid #f0883e; padding-left: 10px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.notes-content-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; background: #fff; font-size: 10.5pt; line-height: 1.75; color: #1e293b; word-break: break-word; }
.notes-content-box p { margin-bottom: 10px; text-align: justify; }
.notes-content-box p:last-child { margin-bottom: 0; }
.notes-content-box h1, .notes-content-box h2, .notes-content-box h3 { color: #0f172a; margin-top: 14px; margin-bottom: 6px; font-weight: 700; }
.notes-content-box ul, .notes-content-box ol { margin-left: 24px; margin-bottom: 10px; }
.notes-content-box blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #475569; font-style: italic; margin: 10px 0; background: #f8fafc; padding: 8px 12px; border-radius: 0 4px 4px 0; }
.notes-content-box pre, .notes-content-box code { font-family: 'Courier New', monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 9.5pt; }
.resource-list { margin-top: 8px; font-size: 9.5pt; color: #475569; }
.resource-list a { color: #2563eb; text-decoration: underline; }
.signature-wrap { margin-top: 36px; display: flex; justify-content: space-between; page-break-inside: avoid; }
.sig-box { width: 220px; text-align: center; font-size: 10pt; }
.sig-space { height: 70px; }
.sig-line { border-top: 1px solid #0f172a; padding-top: 4px; font-weight: 700; }
@media print {
  body { padding: 0; }
  .kop-header { border-bottom: 2px solid #000; }
  .meta-container { border: 1px solid #94a3b8; background: #fff; }
  .notes-content-box { border: 1px solid #cbd5e1; }
}
</style>
</head>
<body>
<div class="kop-header">
    <div class="kop-title">
        <h1>LEMBAR CATATAN & JURNAL PERKULIAHAN</h1>
        <h2>${escapeHtml(jurusan.toUpperCase())}</h2>
        <h3>${escapeHtml(fakultas)}</h3>
        ${universitas ? `<p>${escapeHtml(universitas)}</p>` : ''}
    </div>
</div>
<div class="meta-container">
    <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Mata Kuliah:</span><span class="meta-val"><b>${escapeHtml(mk.nama)}</b></span></div>
        <div class="meta-item"><span class="meta-label">Pertemuan Ke:</span><span class="meta-val"><b>Pertemuan ke-${p.no}</b></span></div>
        <div class="meta-item"><span class="meta-label">Dosen Pengampu:</span><span class="meta-val">${escapeHtml(mk.dosen)}</span></div>
        <div class="meta-item"><span class="meta-label">Hari / Tanggal:</span><span class="meta-val">${tglFormatted}</span></div>
        <div class="meta-item"><span class="meta-label">Kode & SKS:</span><span class="meta-val">${escapeHtml(mk.kode)} (${mk.sks} SKS) - ${escapeHtml(mk.ruang)}</span></div>
        <div class="meta-item"><span class="meta-label">Tipe & Kehadiran:</span><span class="meta-val">${escapeHtml(tipeLabel)} · <span class="status-badge ${absCls}">${absStatus}</span></span></div>
    </div>
</div>
<div class="content-section">
    <div class="section-heading">I. Uraian & Catatan Materi</div>
    <div class="notes-content-box">${formattedCatatan}</div>
    ${p.materiUrl ? `<div class="resource-list">🔗 <b>Tautan Referensi Materi:</b> <a href="${escapeHtml(p.materiUrl)}" target="_blank">${escapeHtml(p.materiUrl)}</a></div>` : ''}
</div>
<div class="content-section">
    <div class="section-heading">II. Tugas, Latihan Soal & Evaluasi</div>
    <div class="notes-content-box">
        <div style="margin-bottom:8px;font-size:9.5pt;color:#475569;">
            <b>Jenis:</b> ${escapeHtml(p.tipeTugas || 'Tugas')} |
            <b>Status:</b> ${p.statusTugas === 'selesai' ? 'SELESAI DIVERIFIKASI' : p.statusTugas === 'proses' ? 'SEDANG DIKERJAKAN' : 'BELUM SELESAI'} |
            <b>Deadline:</b> ${p.tugasDeadline ? fmtDate(p.tugasDeadline) : '–'}
        </div>
        ${formattedTugas}
    </div>
    ${p.tugasUrl ? `<div class="resource-list">🔗 <b>Tautan Tugas:</b> <a href="${escapeHtml(p.tugasUrl)}" target="_blank">${escapeHtml(p.tugasUrl)}</a></div>` : ''}
</div>
<div class="signature-wrap">
    <div class="sig-box">
        <div>Mahasiswa,</div>
        <div class="sig-space"></div>
        <div class="sig-line">${escapeHtml(nama)}</div>
        <div style="font-size:8.5pt;color:#64748b;">NIM: ${escapeHtml(nim)}</div>
    </div>
    <div class="sig-box">
        <div>Dosen Pengampu,</div>
        <div class="sig-space"></div>
        <div class="sig-line">${escapeHtml(mk.dosen.split('/')[0].trim())}</div>
        <div style="font-size:8.5pt;color:#64748b;">Dosen Mata Kuliah</div>
    </div>
</div>
</body>
</html>`;

    win.document.write(printHtml);
    win.document.close();
    setTimeout(() => { win.print(); }, 350);
}

/* ================================================================
   DAFTAR TUGAS (LEGACY)
   ================================================================ */
function setStatusFilter(btn) {
    tugasStatusF = btn.dataset.status;
    document.querySelectorAll('#page-tugas .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    buildTugasList();
}
function buildTugasList() {
    const filterMk = document.getElementById('tugas-mk-filter').value;
    const filterJenis = document.getElementById('tugas-jenis-filter').value;
    const container = document.getElementById('tugas-list');
    let html = '';
    let total = 0;
    MATA_KULIAH.forEach(mk => {
        if (filterMk !== 'semua' && filterMk !== mk.id) return;
        appData[mk.id].pertemuan.forEach(p => {
            if (!p.tugas.trim()) return;
            if (tugasStatusF !== 'semua' && p.statusTugas !== tugasStatusF) return;
            if (filterJenis !== 'semua' && p.tipeTugas !== filterJenis) return;
            total++;
            const stMap = {
                belum: { cls: 'badge-red', icon: '🔴', label: 'Belum Dikerjakan' },
                proses: { cls: 'badge-yellow', icon: '🟡', label: 'Sedang Dikerjakan' },
                selesai: { cls: 'badge-green', icon: '🟢', label: 'Selesai' }
            };
            const st = stMap[p.statusTugas] || stMap.belum;
            const overdue = isOverdue(p.tugasDeadline) && p.statusTugas !== 'selesai';
            const tipeLbl = TIPE_TUGAS.find(t => t.val === p.tipeTugas)?.label || p.tipeTugas;
            const urlBtn = p.tugasUrl.trim() ? `<a href="${p.tugasUrl}" target="_blank" class="btn-sm" style="font-size:.68rem;border-radius:5px;padding:3px 8px">🔗 URL</a>` : '';
            const fileBtn = p.tugasPdfData ? `<button onclick="openFileModal('${p.tugasPdfData}','${(p.tugasPdfName || 'File').replace(/'/g, '&apos;')}')" class="btn-sm" style="font-size:.68rem;border-radius:5px;padding:3px 8px">📎 ${p.tugasPdfName || 'File'}</button>` : '';
            html += `<div class="tugas-item" style="${overdue ? 'border-color:rgba(248,81,73,.4)' : ''}">
                        <div class="tugas-item-header">
                            <span class="tugas-mk-badge">${mk.nama}</span>
                            <span class="tugas-title">${escapeHtml(p.tugas)}</span>
                            <span class="badge ${st.cls}">${st.icon} ${st.label}</span>
                        </div>
                        <div class="tugas-meta">
                            <span>${tipeLbl}</span>
                            <span>📅 Dibuat: ${fmtDate(p.tugasDibuat)}</span>
                            <span style="color:${overdue ? 'var(--red)' : 'inherit'}">⏰ Deadline: <b>${fmtDate(p.tugasDeadline)}${overdue ? ' ⚠️' : ''}</b></span>
                            <span class="text-muted">Pertemuan ${p.no}</span>
                        </div>
                        ${urlBtn || fileBtn ? `<div class="tugas-resources">${urlBtn}${fileBtn}</div>` : ''}
                    </div>`;
        });
    });
    if (!total) html = `<div class="empty-state"><span class="emoji">🎉</span><div>Tidak ada tugas ditemukan!</div></div>`;
    container.innerHTML = html;
}

/* ================================================================
   DETAIL MATA KULIAH
   ================================================================ */
function openMKDetail(mkId, tab) {
    currentMK = mkId;
    const mk = getMKById(mkId);
    if (!mk) return;
    document.getElementById('detail-mk-name').textContent = mk.nama;
    document.getElementById('detail-mk-kode').textContent = mk.kode || '–';
    document.getElementById('detail-mk-sks').textContent = mk.sks + ' SKS';
    document.getElementById('detail-mk-dosen').textContent = mk.dosen;
    document.getElementById('detail-mk-ruang').textContent = mk.ruang;
    renderPertemuan(mkId);
    updateDetailStats(mkId);
    showPage('mk-detail');
    switchMkTab(tab || 'pertemuan');
}
function switchMkTab(tab) {
    currentMkTab = tab;
    document.querySelectorAll('.mk-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mktab === tab));
    document.querySelectorAll('.mk-tab-panel').forEach(p => p.classList.toggle('active', p.id === 'mktab-' + tab));
    if (!currentMK) return;
    if (tab === 'materi') renderMateriRepo(currentMK);
    if (tab === 'catatan') renderNotesTab(currentMK);
}

/* ================================================================
   PERTEMUAN CARDS
   ================================================================ */
function renderPertemuan(mkId) {
    const container = document.getElementById('pertemuan-cards');
    if (!container) return;
    const ptms = appData[mkId].pertemuan;

    container.innerHTML = ptms.map((p, i) => {
        const abOpts = [
            { v: 'belum', l: '– Pilih –' },
            { v: 'hadir', l: '✅ Hadir' },
            { v: 'izin', l: '📋 Izin' },
            { v: 'alfa', l: '❌ Alfa' }
        ].map(o => `<option value="${o.v}" ${p.absensi === o.v ? 'selected' : ''}>${o.l}</option>`).join('');
        const tpOpts = TIPE_PERTEMUAN.map(t => `<option value="${t.val}" ${p.tipePertemuan === t.val ? 'selected' : ''}>${t.label}</option>`).join('');
        const stOpts = [
            { v: 'belum', l: '🔴 Belum' },
            { v: 'proses', l: '🟡 Proses' },
            { v: 'selesai', l: '🟢 Selesai' }
        ].map(o => `<option value="${o.v}" ${p.statusTugas === o.v ? 'selected' : ''}>${o.l}</option>`).join('');
        const jtOpts = TIPE_TUGAS.map(t => `<option value="${t.val}" ${p.tipeTugas === t.val ? 'selected' : ''}>${t.label}</option>`).join('');
        const tipeLabel = TIPE_PERTEMUAN.find(t => t.val === p.tipePertemuan)?.label || p.tipePertemuan;
        const overdue = isOverdue(p.tugasDeadline) && p.statusTugas !== 'selesai';

        let dots = '';
        if (p.catatanHtml && p.catatanHtml.trim()) dots += `<div class="ptm-card-dot" style="background:var(--accent2)" title="Ada catatan"></div>`;
        if (p.tugasHtml && p.tugasHtml.trim()) dots += `<div class="ptm-card-dot" style="background:${overdue ? 'var(--red)' : 'var(--yellow)'}" title="Ada tugas${overdue ? ' (overdue)' : ''}"></div>`;
        if (p.materiPdfData || p.tugasPdfData) dots += `<div class="ptm-card-dot" style="background:var(--accent)" title="Ada file"></div>`;
        if ((p.materiPhotos || []).length + (p.tugasPhotos || []).length > 0) dots += `<div class="ptm-card-dot" style="background:var(--purple)" title="Ada foto"></div>`;

        const mFile = p.materiPdfData
            ? `<button class="pdf-view-btn" onclick="openFileModal('${p.materiPdfData}','${(p.materiPdfName || 'File').replace(/'/g, '&apos;')}')">👁 Lihat</button>
               <button class="pdf-del-btn" onclick="delFile('${mkId}',${i},'materi')">🗑</button>
               <span class="pdf-name" title="${p.materiPdfName || ''}">${p.materiPdfName || 'File'}</span>`
            : `<label class="pdf-label" for="mfile-${mkId}-${i}">📎 Upload File<input type="file" id="mfile-${mkId}-${i}" accept="*" onchange="handleFileUpload(event,'${mkId}',${i},'materi')"/></label>`;

        const tFile = p.tugasPdfData
            ? `<button class="pdf-view-btn" onclick="openFileModal('${p.tugasPdfData}','${(p.tugasPdfName || 'File').replace(/'/g, '&apos;')}')">👁 Lihat</button>
               <button class="pdf-del-btn" onclick="delFile('${mkId}',${i},'tugas')">🗑</button>
               <span class="pdf-name" title="${p.tugasPdfName || ''}">${p.tugasPdfName || 'File'}</span>`
            : `<label class="pdf-label" for="tfile-${mkId}-${i}">📎 Upload File<input type="file" id="tfile-${mkId}-${i}" accept="*" onchange="handleFileUpload(event,'${mkId}',${i},'tugas')"/></label>`;

        const mPhotos = p.materiPhotos || [];
        const mPhotoThumbs = mPhotos.map((ph, pi) =>
            `<div class="photo-thumb-wrap"><img class="photo-thumb" src="${ph.data}" alt="${ph.name}" onclick="openPhotoModal('${mkId}',${i},'materi',${pi})"/><button class="photo-del-x" onclick="delPhoto('${mkId}',${i},'materi',${pi})">×</button></div>`
        ).join('');
        const tPhotos = p.tugasPhotos || [];
        const tPhotoThumbs = tPhotos.map((ph, pi) =>
            `<div class="photo-thumb-wrap"><img class="photo-thumb" src="${ph.data}" alt="${ph.name}" onclick="openPhotoModal('${mkId}',${i},'tugas',${pi})"/><button class="photo-del-x" onclick="delPhoto('${mkId}',${i},'tugas',${pi})">×</button></div>`
        ).join('');

        const isExpanded = expandedPtm.has(mkId + '-' + i);
        const catatanEditorId = `quill-catatan-${mkId}-${i}`;
        const tugasEditorId = `quill-tugas-${mkId}-${i}`;

        return `<div class="ptm-card${isExpanded ? ' expanded' : ''}" id="ptm-card-${mkId}-${i}">
                    <div class="ptm-card-head" onclick="togglePtmCard('${mkId}',${i})">
                        <div class="ptm-card-num">${p.no}</div>
                        <div class="ptm-card-summary">
                            <span class="ptm-card-date">${p.tanggal ? fmtDate(p.tanggal) : '––/––/––––'}</span>
                            <span class="ptm-card-type">${tipeLabel}</span>
                        </div>
                        <label class="ptm-check-wrap${p.checklistDone ? ' done' : ''}" onclick="event.stopPropagation()">
                            <input type="checkbox" ${p.checklistDone ? 'checked' : ''} onchange="toggleChecklistDone('${mkId}',${i},this)"/> Tercatat
                        </label>
                        <select class="absen-select-mini ${p.absensi !== 'belum' ? p.absensi : ''}" onclick="event.stopPropagation()" onchange="updateAbsensiMini('${mkId}',${i},this)">${abOpts}</select>
                        <div class="ptm-card-indicators">${dots}</div>
                        <button class="ptm-eye-btn" onclick="event.stopPropagation();openPtmDesktop('${mkId}',${i})">👁</button>
                        <button class="btn-toggle-card" onclick="event.stopPropagation();togglePtmCard('${mkId}',${i})">${isExpanded ? '▲ Tutup' : '▼ Detail'}</button>
                    </div>
                    <div class="ptm-card-body">
                        <button class="btn-desktop-view mb-2" onclick="openPtmDesktop('${mkId}',${i})">🖥️ Buka Desktop View</button>
                        <button class="btn-sm btn-print-ptm mb-2" style="margin-left:6px;background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.3);color:var(--green);" onclick="event.stopPropagation();printJurnalPertemuan('${mkId}',${i})">🖨️ Cetak Jurnal</button>
                        <div class="ptm-body-grid">
                            <div>
                                <div class="ptm-section">
                                    <div class="ptm-section-label">📋 Info Pertemuan</div>
                                    <div class="form-row-2 mb-2">
                                        <div><div class="form-label-mini">Tanggal</div><input type="date" class="date-input" style="width:100%" value="${p.tanggal || ''}" onchange="updateField('${mkId}',${i},'tanggal',this.value)"/></div>
                                        <div><div class="form-label-mini">Tipe Pertemuan</div><select class="type-select" style="width:100%" onchange="updateField('${mkId}',${i},'tipePertemuan',this.value)">${tpOpts}</select></div>
                                    </div>
                                </div>
                                <div class="ptm-section">
                                    <div class="ptm-section-label">📝 Catatan Materi</div>
                                    <div id="${catatanEditorId}" style="background:var(--surface);border-radius:var(--radius);"></div>
                                </div>
                                <div class="ptm-section">
                                    <div class="ptm-section-label">🔗 Resource Materi</div>
                                    <div class="resource-cell">
                                        <div class="url-row"><input type="url" class="url-input" placeholder="https://..." value="${p.materiUrl}" onchange="updateField('${mkId}',${i},'materiUrl',this.value)"/>${p.materiUrl ? `<a href="${p.materiUrl}" target="_blank" class="url-open-btn">🔗</a>` : ''}</div>
                                        <div class="pdf-row">${mFile}</div>
                                        <div>
                                            <label class="photo-upload-label" for="mphoto-${mkId}-${i}">🖼 Foto${mPhotos.length > 0 ? ` (${mPhotos.length})` : ''}<input type="file" id="mphoto-${mkId}-${i}" accept="image/*" multiple onchange="handlePhotoUpload(event,'${mkId}',${i},'materi')"/></label>
                                            ${mPhotos.length > 0 ? `<div class="photo-gallery">${mPhotoThumbs}</div>` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div class="ptm-section">
                                    <div class="ptm-section-label">📝 Tugas / Kuis</div>
                                    <div id="${tugasEditorId}" style="background:var(--surface);border-radius:var(--radius);"></div>
                                    <div class="form-row-2 mt-2">
                                        <div><div class="form-label-mini">Jenis Tugas</div><select class="task-type-select" style="width:100%" onchange="updateField('${mkId}',${i},'tipeTugas',this.value)">${jtOpts}</select></div>
                                        <div><div class="form-label-mini">Status</div><select class="task-status-select ${p.statusTugas}" style="width:100%" onchange="updateStatusTugas('${mkId}',${i},this)">${stOpts}</select></div>
                                    </div>
                                    <div class="form-row-2 mt-2">
                                        <div><div class="form-label-mini">Tgl Dibuat</div><input type="date" class="date-input" style="width:100%" value="${p.tugasDibuat || ''}" onchange="updateField('${mkId}',${i},'tugasDibuat',this.value)"/></div>
                                        <div><div class="form-label-mini" style="color:${overdue ? 'var(--red)' : 'var(--muted)'}">Deadline${overdue ? ' ⚠️' : ''}</div><input type="date" class="date-input" style="width:100%;border-color:${overdue ? 'var(--red)' : 'var(--border)'}" value="${p.tugasDeadline || ''}" onchange="updateField('${mkId}',${i},'tugasDeadline',this.value)"/></div>
                                    </div>
                                </div>
                                <div class="ptm-section">
                                    <div class="ptm-section-label">🔗 Resource Tugas</div>
                                    <div class="resource-cell">
                                        <div class="url-row"><input type="url" class="url-input" placeholder="https://..." value="${p.tugasUrl}" onchange="updateField('${mkId}',${i},'tugasUrl',this.value)"/>${p.tugasUrl ? `<a href="${p.tugasUrl}" target="_blank" class="url-open-btn">🔗</a>` : ''}</div>
                                        <div class="pdf-row">${tFile}</div>
                                        <div>
                                            <label class="photo-upload-label" for="tphoto-${mkId}-${i}">🖼 Foto${tPhotos.length > 0 ? ` (${tPhotos.length})` : ''}<input type="file" id="tphoto-${mkId}-${i}" accept="image/*" multiple onchange="handlePhotoUpload(event,'${mkId}',${i},'tugas')"/></label>
                                            ${tPhotos.length > 0 ? `<div class="photo-gallery">${tPhotoThumbs}</div>` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
    }).join('');

    // Init Quill editors after DOM ready
    setTimeout(() => {
        ptms.forEach((p, i) => {
            const catId = `quill-catatan-${mkId}-${i}`;
            const tugasId = `quill-tugas-${mkId}-${i}`;
            const catContainer = document.getElementById(catId);
            const tugasContainer = document.getElementById(tugasId);

            if (catContainer && !quillInstances[catId]) {
                const q = new Quill(catContainer, {
                    theme: 'snow',
                    placeholder: 'Tulis catatan materi di sini...',
                    modules: {
                        toolbar: [
                            [{ 'header': [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                            ['blockquote', 'code-block'],
                            ['link', 'image'],
                            [{ 'table': 'table' }],
                            ['clean']
                        ]
                    }
                });
                q.root.innerHTML = p.catatanHtml || p.catatan || '';
                q.on('text-change', function () {
                    appData[mkId].pertemuan[i].catatanHtml = q.root.innerHTML;
                    appData[mkId].pertemuan[i].catatan = q.getText();
                    saveData(appData);
                });
                quillInstances[catId] = q;
            }
            if (tugasContainer && !quillInstances[tugasId]) {
                const q = new Quill(tugasContainer, {
                    theme: 'snow',
                    placeholder: 'Deskripsi tugas/kuis...',
                    modules: {
                        toolbar: [
                            [{ 'header': [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline', 'strike'],
                            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                            ['blockquote', 'code-block'],
                            ['link', 'image'],
                            [{ 'table': 'table' }],
                            ['clean']
                        ]
                    }
                });
                q.root.innerHTML = p.tugasHtml || p.tugas || '';
                q.on('text-change', function () {
                    appData[mkId].pertemuan[i].tugasHtml = q.root.innerHTML;
                    appData[mkId].pertemuan[i].tugas = q.getText();
                    saveData(appData);
                });
                quillInstances[tugasId] = q;
            }
        });
    }, 50);

    const doneCount = ptms.filter(p => p.checklistDone).length;
    const progLbl = document.getElementById('ptm-checklist-label');
    if (progLbl) progLbl.textContent = `${doneCount}/${ptms.length} tercatat`;
}

function togglePtmCard(mkId, idx) {
    const key = mkId + '-' + idx;
    const card = document.getElementById(`ptm-card-${mkId}-${idx}`);
    const isExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded', !isExpanded);
    if (isExpanded) expandedPtm.delete(key); else expandedPtm.add(key);
    const btn = card.querySelector('.btn-toggle-card');
    if (btn) btn.textContent = !isExpanded ? '▲ Tutup' : '▼ Detail';
}

async function toggleChecklistDone(mkId, idx, cb) {
    appData[mkId].pertemuan[idx].checklistDone = cb.checked;
    await saveData(appData);
    cb.closest('.ptm-check-wrap').classList.toggle('done', cb.checked);
    const ptms = appData[mkId].pertemuan;
    const doneCount = ptms.filter(p => p.checklistDone).length;
    const progLbl = document.getElementById('ptm-checklist-label');
    if (progLbl) progLbl.textContent = `${doneCount}/${ptms.length} tercatat`;
    showToast(cb.checked ? 'Pertemuan ditandai tercatat ✅' : 'Tanda tercatat dibatalkan');
}

async function updateAbsensiMini(mkId, idx, sel) {
    const val = sel.value;
    appData[mkId].pertemuan[idx].absensi = val;
    await saveData(appData);
    sel.className = 'absen-select-mini ' + (val !== 'belum' ? val : '');
    updateDetailStats(mkId);
    refreshDashboard();
    showToast('Absensi tersimpan ✅', 'success');
}

function updateDetailStats(mkId) {
    const ab = calcAbsensi(mkId);
    document.getElementById('d-hadir').textContent = ab.hadir;
    document.getElementById('d-izin').textContent = ab.izin;
    document.getElementById('d-alfa').textContent = ab.alfa;
    document.getElementById('d-pct').textContent = ab.pct + '%';
    const bar = document.getElementById('d-bar');
    bar.style.width = ab.pct + '%';
    bar.className = 'progress-bar' + (ab.pct < 50 ? ' danger' : ab.pct < 75 ? ' warn' : '');
}

async function updateField(mkId, idx, field, value) {
    appData[mkId].pertemuan[idx][field] = value;
    await saveData(appData);
    refreshDashboard();
    updateDetailStats(mkId);
    renderCalendar();
    renderJurnal();
    showToast('Tersimpan ✅');
}

async function updateStatusTugas(mkId, idx, sel) {
    const val = sel.value;
    appData[mkId].pertemuan[idx].statusTugas = val;
    await saveData(appData);
    sel.className = 'task-status-select ' + val;
    refreshDashboard();
    showToast('Status diperbarui ✅', 'success');
}

/* ================================================================
   FILE UPLOAD (Pertemuan)
   ================================================================ */
async function handleFileUpload(event, mkId, idx, target) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast('File terlalu besar (maks 15 MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async function (e) {
        const b64 = e.target.result;
        if (target === 'materi') {
            appData[mkId].pertemuan[idx].materiPdfData = b64;
            appData[mkId].pertemuan[idx].materiPdfName = file.name;
        } else {
            appData[mkId].pertemuan[idx].tugasPdfData = b64;
            appData[mkId].pertemuan[idx].tugasPdfName = file.name;
        }
        await saveData(appData);
        refreshDashboard();
        renderPertemuan(mkId);
        showToast(`File "${file.name}" berhasil diupload 📎`, 'success');
    };
    reader.onerror = () => showToast('Gagal membaca file', 'error');
    reader.readAsDataURL(file);
}

async function delFile(mkId, idx, target) {
    if (!confirm('Hapus file ini?')) return;
    if (target === 'materi') {
        appData[mkId].pertemuan[idx].materiPdfData = null;
        appData[mkId].pertemuan[idx].materiPdfName = '';
    } else {
        appData[mkId].pertemuan[idx].tugasPdfData = null;
        appData[mkId].pertemuan[idx].tugasPdfName = '';
    }
    await saveData(appData);
    refreshDashboard();
    renderPertemuan(mkId);
    showToast('File dihapus 🗑');
}

function openFileModal(b64, filename) {
    document.getElementById('pdf-modal-title').textContent = '📎 ' + (filename || 'File');
    const embed = document.getElementById('pdf-embed');
    if (embed) embed.src = b64;
    document.getElementById('pdf-modal').classList.add('open');
    const dl = document.getElementById('pdf-download-btn');
    if (b64 && b64.startsWith('data:application/')) {
        dl.href = b64;
        dl.download = filename || 'file.pdf';
        dl.style.display = 'inline-block';
    } else dl.style.display = 'none';
}
function maybeClosePdf(e) {
    if (e.target === document.getElementById('pdf-modal')) closePdfModal();
}
function closePdfModal() {
    document.getElementById('pdf-modal').classList.remove('open');
    document.getElementById('pdf-modal-body').innerHTML = `<embed id="pdf-embed" src="" type="application/pdf"/>`;
}

/* ================================================================
   PHOTOS — compress & upload
   ================================================================ */
const MAX_PHOTOS = 50;

function compressImage(file, maxW = 1400, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let w = img.width, h = img.height;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            resolve(canvas.toDataURL(mime, quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
        img.src = url;
    });
}

async function handlePhotoUpload(event, mkId, idx, target) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const ptm = appData[mkId].pertemuan[idx];
    const key = target === 'materi' ? 'materiPhotos' : 'tugasPhotos';
    if (!ptm[key]) ptm[key] = [];
    const existing = ptm[key].length;
    const allowed = MAX_PHOTOS - existing;
    if (allowed <= 0) { showToast(`Maksimal ${MAX_PHOTOS} foto tercapai`, 'error'); return; }
    const toProcess = files.filter(f => f.type.startsWith('image/')).slice(0, allowed);
    if (!toProcess.length) { showToast('Pilih file gambar valid', 'error'); return; }
    showToast(`Mengompres ${toProcess.length} foto... ⏳`, 'success');
    let added = 0, errors = 0;
    for (const file of toProcess) {
        try {
            const compressed = await compressImage(file);
            ptm[key].push({ data: compressed, name: file.name });
            added++;
        } catch (e) { errors++; }
    }
    try { await saveData(appData); } catch (e) {
        if (e.name === 'QuotaExceededError') {
            showToast('Storage hampir penuh! Hapus foto lama.', 'error');
            while (ptm[key].length > existing) {
                ptm[key].pop();
                try { await saveData(appData); break; } catch (e2) { }
            }
            renderPertemuan(mkId);
            return;
        }
    }
    refreshDashboard();
    renderPertemuan(mkId);
    event.target.value = '';
    if (added > 0) showToast(`${added} foto berhasil diupload 🖼`, 'success');
    if (errors > 0) showToast(`${errors} foto gagal diproses`, 'error');
}

async function delPhoto(mkId, idx, target, photoIdx) {
    if (!confirm('Hapus foto ini?')) return;
    const key = target === 'materi' ? 'materiPhotos' : 'tugasPhotos';
    const ptm = appData[mkId].pertemuan[idx];
    if (!ptm[key]) return;
    ptm[key].splice(photoIdx, 1);
    await saveData(appData);
    renderPertemuan(mkId);
    showToast('Foto dihapus 🗑');
}

/* ================================================================
   PHOTO LIGHTBOX
   ================================================================ */
let _photoCtx = null;
function openPhotoModal(mkId, idx, target, photoIdx) {
    _photoCtx = { mkId, idx, target, photoIdx };
    _renderPhotoModal();
    document.getElementById('photo-modal').classList.add('open');
}
function _renderPhotoModal() {
    if (!_photoCtx) return;
    const { mkId, idx, target, photoIdx } = _photoCtx;
    const key = target === 'materi' ? 'materiPhotos' : 'tugasPhotos';
    const photos = appData[mkId].pertemuan[idx][key] || [];
    const ph = photos[photoIdx];
    if (!ph) { closePhotoModal(); return; }
    document.getElementById('photo-modal-img').src = ph.data;
    document.getElementById('photo-modal-info').textContent = `${photoIdx + 1} / ${photos.length} — ${ph.name}`;
}
function photoNav(dir) {
    if (!_photoCtx) return;
    const { mkId, idx, target, photoIdx } = _photoCtx;
    const key = target === 'materi' ? 'materiPhotos' : 'tugasPhotos';
    const photos = appData[mkId].pertemuan[idx][key] || [];
    _photoCtx.photoIdx = (photoIdx + dir + photos.length) % photos.length;
    _renderPhotoModal();
}
function maybeClosePhoto(e) {
    if (e.target === document.getElementById('photo-modal')) closePhotoModal();
}
function closePhotoModal() {
    document.getElementById('photo-modal').classList.remove('open');
    document.getElementById('photo-modal-img').src = '';
    _photoCtx = null;
}

/* ================================================================
   DESKTOP VIEW (Pertemuan)
   ================================================================ */
let _pdCtx = null;
function openPtmDesktop(mkId, idx) {
    _pdCtx = { mkId, idx };
    _renderPtmDesktop();
    document.getElementById('ptm-desktop').classList.add('open');
    document.body.style.overflow = 'hidden';
}
async function pdToggleChecklist(cb) {
    if (!_pdCtx) return;
    const { mkId, idx } = _pdCtx;
    appData[mkId].pertemuan[idx].checklistDone = cb.checked;
    await saveData(appData);
    cb.closest('.ptm-check-wrap').classList.toggle('done', cb.checked);
    renderPertemuan(mkId);
}
async function pdDelFile(target) {
    if (!_pdCtx) return;
    if (!confirm('Hapus file ini?')) return;
    const { mkId, idx } = _pdCtx;
    if (target === 'materi') {
        appData[mkId].pertemuan[idx].materiPdfData = null;
        appData[mkId].pertemuan[idx].materiPdfName = '';
    } else {
        appData[mkId].pertemuan[idx].tugasPdfData = null;
        appData[mkId].pertemuan[idx].tugasPdfName = '';
    }
    await saveData(appData);
    _renderPtmDesktop();
    renderPertemuan(mkId);
    showToast('File dihapus 🗑');
}
function pdUploadFile(event, target) {
    if (!_pdCtx) return;
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast('File terlalu besar (maks 15 MB)', 'error'); return; }
    const { mkId, idx } = _pdCtx;
    const reader = new FileReader();
    reader.onload = async function (e) {
        const b64 = e.target.result;
        if (target === 'materi') {
            appData[mkId].pertemuan[idx].materiPdfData = b64;
            appData[mkId].pertemuan[idx].materiPdfName = file.name;
        } else {
            appData[mkId].pertemuan[idx].tugasPdfData = b64;
            appData[mkId].pertemuan[idx].tugasPdfName = file.name;
        }
        await saveData(appData);
        _renderPtmDesktop();
        renderPertemuan(mkId);
        showToast(`File "${file.name}" berhasil diupload 📎`, 'success');
    };
    reader.onerror = () => showToast('Gagal membaca file', 'error');
    reader.readAsDataURL(file);
    event.target.value = '';
}
async function pdDelPhoto(target, photoIdx) {
    if (!_pdCtx) return;
    if (!confirm('Hapus foto ini?')) return;
    const { mkId, idx } = _pdCtx;
    const key = target === 'materi' ? 'materiPhotos' : 'tugasPhotos';
    appData[mkId].pertemuan[idx][key].splice(photoIdx, 1);
    await saveData(appData);
    _renderPtmDesktop();
    renderPertemuan(mkId);
    showToast('Foto dihapus 🗑');
}
async function pdUploadPhoto(event, target) {
    if (!_pdCtx) return;
    const { mkId, idx } = _pdCtx;
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const key = target === 'materi' ? 'materiPhotos' : 'tugasPhotos';
    const p = appData[mkId].pertemuan[idx];
    if (!p[key]) p[key] = [];
    const allowed = MAX_PHOTOS - p[key].length;
    if (allowed <= 0) { showToast(`Maksimal ${MAX_PHOTOS} foto tercapai`, 'error'); return; }
    const toProcess = files.filter(f => f.type.startsWith('image/')).slice(0, allowed);
    for (const file of toProcess) {
        try {
            const compressed = await compressImage(file);
            p[key].push({ data: compressed, name: file.name });
        } catch (e) { }
    }
    await saveData(appData);
    _renderPtmDesktop();
    renderPertemuan(mkId);
    event.target.value = '';
    showToast('Foto diupload 🖼', 'success');
}
function closePtmDesktop() {
    document.getElementById('ptm-desktop').classList.remove('open');
    document.body.style.overflow = '';
    _pdCtx = null;
}
function maybeClosePtmDesktop(e) {
    if (e.target === document.getElementById('ptm-desktop')) closePtmDesktop();
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.getElementById('ptm-desktop').classList.contains('open')) closePtmDesktop();
        if (document.getElementById('pdf-modal').classList.contains('open')) closePdfModal();
        if (document.getElementById('tugas-modal').classList.contains('open')) closeTugasModal();
        if (document.getElementById('materi-modal').classList.contains('open')) closeMateriModal();
        if (document.getElementById('jurnal-modal').classList.contains('open')) closeJurnalModal();
    }
});

function _renderPtmDesktop() {
    if (!_pdCtx) return;
    const { mkId, idx } = _pdCtx;
    const p = appData[mkId].pertemuan[idx];
    const mk = getMKById(mkId);
    document.getElementById('pd-num').textContent = p.no;
    document.getElementById('pd-title').textContent = mk ? mk.nama : mkId;
    const tipeLabel = TIPE_PERTEMUAN.find(t => t.val === p.tipePertemuan)?.label || p.tipePertemuan;
    document.getElementById('pd-meta').textContent = `Pertemuan ${p.no} · ${p.tanggal ? fmtDate(p.tanggal) : 'Tanggal belum diisi'} · ${tipeLabel}`;

    const abEl = document.getElementById('pd-absen');
    const abMap = { hadir: '✅ Hadir', izin: '📋 Izin / Sakit', alfa: '❌ Alfa', belum: '– Belum dicatat' };
    abEl.textContent = abMap[p.absensi] || '– Belum dicatat';
    abEl.className = `ptm-d-absen ${p.absensi}`;
    document.getElementById('pd-tipe').textContent = tipeLabel;

    const cb = document.getElementById('pd-checklist-cb');
    cb.checked = !!p.checklistDone;
    cb.closest('.ptm-check-wrap').classList.toggle('done', !!p.checklistDone);

    const catEl = document.getElementById('pd-catatan');
    const catHtml = p.catatanHtml || p.catatan || '';
    if (catHtml.trim()) {
        catEl.innerHTML = `<div class="ql-editor-readonly">${catHtml}</div>`;
        catEl.classList.remove('empty');
    } else {
        catEl.textContent = 'Belum ada catatan materi untuk pertemuan ini.';
        catEl.classList.add('empty');
    }

    const mResEl = document.getElementById('pd-materi-res');
    let mResHtml = '';
    if (p.materiUrl && p.materiUrl.trim()) {
        mResHtml += `<a href="${p.materiUrl}" target="_blank" class="ptm-d-res-btn ptm-d-res-url">🔗 Buka URL Materi</a>`;
    }
    if (p.materiPdfData) {
        mResHtml += `<div class="pd-file-row"><button onclick="openFileModal('${p.materiPdfData}','${(p.materiPdfName || 'File').replace(/'/g, '&apos;')}')" class="ptm-d-res-btn ptm-d-res-pdf">📎 ${p.materiPdfName || 'Lihat File'}</button><button class="pd-file-del" onclick="pdDelFile('materi')">🗑 Hapus</button></div>`;
    } else {
        mResHtml += `<div class="pd-file-row"><label class="pdf-label" for="pd-materi-file-input">📎 Upload File<input type="file" id="pd-materi-file-input" accept="*" onchange="pdUploadFile(event,'materi')"/></label></div>`;
    }
    mResEl.innerHTML = mResHtml || '<span class="ptm-d-res-none">Belum ada resource materi.</span>';

    const mGalEl = document.getElementById('pd-materi-gallery');
    const mPhotos = p.materiPhotos || [];
    let mGalHtml = mPhotos.map((ph, pi) =>
        `<div class="photo-thumb-wrap"><img class="ptm-d-photo" src="${ph.data}" alt="${ph.name}" onclick="openPhotoModal('${mkId}',${idx},'materi',${pi})"/><button class="photo-del-x" onclick="pdDelPhoto('materi',${pi})">×</button></div>`
    ).join('');
    mGalHtml += `<label class="photo-upload-label" for="pd-materi-photo-input" style="margin-top:0;">➕ Foto<input type="file" id="pd-materi-photo-input" accept="image/*" multiple onchange="pdUploadPhoto(event,'materi')"/></label>`;
    mGalEl.innerHTML = mGalHtml;

    const tWrapEl = document.getElementById('pd-tugas-wrap');
    const tugasHtml = p.tugasHtml || p.tugas || '';
    if (tugasHtml.trim()) {
        const stMap = { belum: '🔴 Belum', proses: '🟡 Sedang dikerjakan', selesai: '🟢 Selesai' };
        const tipeLbl = TIPE_TUGAS.find(t => t.val === p.tipeTugas)?.label || p.tipeTugas;
        const overdue = isOverdue(p.tugasDeadline) && p.statusTugas !== 'selesai';
        tWrapEl.className = 'ptm-d-task';
        tWrapEl.innerHTML = `<div class="ptm-d-task-title">${p.tugas}</div>
            <div class="ptm-d-task-meta">
                <span>${tipeLbl}</span>
                <span>📅 Dibuat: ${fmtDate(p.tugasDibuat)}</span>
                <span style="color:${overdue ? 'var(--red)' : 'inherit'}">⏰ Deadline: <b>${fmtDate(p.tugasDeadline)}${overdue ? ' ⚠️' : ''}</b></span>
                <span class="badge ${p.statusTugas === 'selesai' ? 'badge-green' : p.statusTugas === 'proses' ? 'badge-yellow' : 'badge-red'}">${stMap[p.statusTugas] || '–'}</span>
            </div>
            <div class="ptm-d-task-body">${tugasHtml}</div>`;
    } else {
        tWrapEl.className = 'ptm-d-task no-task';
        tWrapEl.textContent = 'Tidak ada tugas / kuis pada pertemuan ini.';
    }

    const tResEl = document.getElementById('pd-tugas-res');
    let tResHtml = '';
    if (p.tugasUrl && p.tugasUrl.trim()) {
        tResHtml += `<a href="${p.tugasUrl}" target="_blank" class="ptm-d-res-btn ptm-d-res-url">🔗 Buka URL Tugas</a>`;
    }
    if (p.tugasPdfData) {
        tResHtml += `<div class="pd-file-row"><button onclick="openFileModal('${p.tugasPdfData}','${(p.tugasPdfName || 'File').replace(/'/g, '&apos;')}')" class="ptm-d-res-btn ptm-d-res-pdf">📎 ${p.tugasPdfName || 'Lihat File'}</button><button class="pd-file-del" onclick="pdDelFile('tugas')">🗑 Hapus</button></div>`;
    } else {
        tResHtml += `<div class="pd-file-row"><label class="pdf-label" for="pd-tugas-file-input">📎 Upload File<input type="file" id="pd-tugas-file-input" accept="*" onchange="pdUploadFile(event,'tugas')"/></label></div>`;
    }
    tResEl.innerHTML = tResHtml || '<span class="ptm-d-res-none">Belum ada resource tugas.</span>';

    const tGalEl = document.getElementById('pd-tugas-gallery');
    const tPhotos = p.tugasPhotos || [];
    let tGalHtml = tPhotos.map((ph, pi) =>
        `<div class="photo-thumb-wrap"><img class="ptm-d-photo" src="${ph.data}" alt="${ph.name}" onclick="openPhotoModal('${mkId}',${idx},'tugas',${pi})"/><button class="photo-del-x" onclick="pdDelPhoto('tugas',${pi})">×</button></div>`
    ).join('');
    tGalHtml += `<label class="photo-upload-label" for="pd-tugas-photo-input" style="margin-top:0;">➕ Foto<input type="file" id="pd-tugas-photo-input" accept="image/*" multiple onchange="pdUploadPhoto(event,'tugas')"/></label>`;
    tGalEl.innerHTML = tGalHtml;
}

/* ================================================================
   EXPORT / IMPORT / RESET
   ================================================================ */
function exportData() {
    const payload = {
        appData,
        tmTugas,
        tmMateri,
        _meta: { version: 2, exportedAt: new Date().toISOString(), user: currentUserEmail }
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mechlog-${currentUserEmail.split('@')[0]}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data lengkap diekspor! 📦', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            let appImp = parsed, tugasImp = [], materiImp = [];
            if (parsed._meta) {
                appImp = parsed.appData;
                tugasImp = parsed.tmTugas || [];
                materiImp = parsed.tmMateri || [];
            }
            if (!confirm('Impor data ini? Data saat ini akan digantikan.')) return;
            appData = migrateAppData(appImp);
            await saveData(appData);
            tmTugas = tugasImp;
            tmMateri = materiImp;
            tmSaveAll();
            refreshDashboard();
            renderCalendar();
            renderTugasModule();
            renderMateriModule();
            renderJurnal();
            showToast('Data lengkap berhasil diimpor! ✅', 'success');
        } catch (err) {
            console.error(err);
            showToast('File JSON tidak valid.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function resetAllData() {
    if (!confirm('⚠️ Reset semua data? Ini tidak dapat dibatalkan!')) return;
    if (!confirm('Yakin? Semua catatan, tugas, dan materi akan hilang!')) return;
    appData = createFreshData();
    tmTugas = [];
    tmMateri = [];
    expandedPtm.clear();
    await saveData(appData);
    tmSaveAll();
    refreshDashboard();
    renderCalendar();
    renderTugasModule();
    renderMateriModule();
    renderJurnal();
    showToast('Semua data direset. 🗑️', 'success');
}

/* ================================================================
   MISC GALLERY
   ================================================================ */
async function handleMiscPhotoUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    if (!appData.misc) appData.misc = { photos: [] };
    const existing = appData.misc.photos.length;
    const allowed = MAX_PHOTOS - existing;
    if (allowed <= 0) { showToast(`Maksimal ${MAX_PHOTOS} foto tercapai`, 'error'); return; }
    const toProcess = files.filter(f => f.type.startsWith('image/')).slice(0, allowed);
    if (!toProcess.length) { showToast('Pilih file gambar valid', 'error'); return; }
    let added = 0, errors = 0;
    for (const file of toProcess) {
        try {
            const compressed = await compressImage(file);
            appData.misc.photos.push({ data: compressed, name: file.name });
            added++;
        } catch (e) { errors++; }
    }
    try { await saveData(appData); } catch (e) { showToast('Storage penuh!', 'error'); }
    renderMiscPhotos();
    event.target.value = '';
    if (added > 0) showToast(`${added} foto berhasil diupload 🖼`, 'success');
    if (errors > 0) showToast(`${errors} foto gagal diproses`, 'error');
}

function renderMiscPhotos() {
    const container = document.getElementById('misc-gallery-container');
    if (!container) return;
    const photos = appData.misc?.photos || [];
    if (!photos.length) {
        container.innerHTML = `<div class="misc-gallery-empty"><span class="emoji">🖼️</span><div>Belum ada foto di folder MISC.</div></div>`;
        return;
    }
    let html = '<div class="misc-gallery-grid">';
    photos.forEach((ph, idx) => {
        html += `<div class="misc-gallery-item"><img src="${ph.data}" alt="${ph.name}" onclick="openMiscPhotoModal(${idx})"/><button class="del-btn" onclick="deleteMiscPhoto(${idx})">✕</button></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function openMiscPhotoModal(idx) {
    const photos = appData.misc?.photos || [];
    if (!photos[idx]) return;
    _photoCtx = { misc: true, idx };
    document.getElementById('photo-modal-img').src = photos[idx].data;
    document.getElementById('photo-modal-info').textContent = `${idx + 1} / ${photos.length} — ${photos[idx].name}`;
    document.getElementById('photo-modal').classList.add('open');
}

async function deleteMiscPhoto(idx) {
    if (!confirm('Hapus foto ini dari folder MISC?')) return;
    const photos = appData.misc?.photos || [];
    photos.splice(idx, 1);
    await saveData(appData);
    renderMiscPhotos();
    showToast('Foto dihapus 🗑');
}

/* ================================================================
   TOAST
   ================================================================ */
let toastTimer;
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    document.getElementById('toast-icon').textContent = type === 'error' ? '❌' : '✅';
    document.getElementById('toast-msg').textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

/* ================================================================
   TO-DO LIST
   ================================================================ */
async function addTodo() {
    const textEl = document.getElementById('todo-input-text');
    const text = textEl.value.trim();
    if (!text) { showToast('Tulis dulu to-do-nya', 'error'); return; }
    const priority = document.getElementById('todo-input-priority').value;
    const deadline = document.getElementById('todo-input-deadline').value;
    appData.todos.push({ id: uid(), text, done: false, priority, deadline });
    await saveData(appData);
    textEl.value = '';
    document.getElementById('todo-input-deadline').value = '';
    renderTodos();
    showToast('To-do ditambahkan ➕', 'success');
}

async function toggleTodo(id, cb) {
    const t = appData.todos.find(x => x.id === id);
    if (!t) return;
    t.done = cb.checked;
    await saveData(appData);
    renderTodos();
}

async function delTodo(id) {
    if (!confirm('Hapus to-do ini?')) return;
    appData.todos = appData.todos.filter(x => x.id !== id);
    await saveData(appData);
    renderTodos();
    showToast('To-do dihapus 🗑');
}

function renderTodos() {
    const list = appData.todos || [];
    const container = document.getElementById('todo-list');
    if (!container) return;
    const badge = document.getElementById('todo-badge');
    const belum = list.filter(t => !t.done).length;
    if (badge) {
        badge.textContent = belum;
        badge.style.display = belum > 0 ? 'inline-flex' : 'none';
    }
    document.getElementById('todo-progress-label').textContent = `${list.length - belum}/${list.length} selesai`;
    if (!list.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">✅</span><div>Belum ada to-do. Tambahkan yang pertama!</div></div>`;
        return;
    }
    const prioMap = { tinggi: '🔴', normal: '🔵', rendah: '⚪' };
    const sorted = [...list].sort((a, b) => a.done - b.done);
    container.innerHTML = sorted.map(t => {
        const overdue = t.deadline && isOverdue(t.deadline) && !t.done;
        return `<div class="todo-row">
                    <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTodo('${t.id}',this)"/>
                    <span class="todo-text${t.done ? ' done' : ''}">${prioMap[t.priority] || ''} ${escapeHtml(t.text)}</span>
                    ${t.deadline ? `<span class="todo-deadline${overdue ? ' overdue' : ''}">📅 ${fmtDate(t.deadline)}${overdue ? ' ⚠️' : ''}</span>` : ''}
                    <button class="x-del" onclick="delTodo('${t.id}')">✕</button>
                </div>`;
    }).join('');
}

/* ================================================================
   KEUANGAN
   ================================================================ */
async function addTransaksi() {
    const tanggal = document.getElementById('fin-input-tanggal').value;
    const ket = document.getElementById('fin-input-ket').value.trim();
    const kategori = document.getElementById('fin-input-kategori').value.trim();
    const tipe = document.getElementById('fin-input-tipe').value;
    const jumlah = parseFloat(document.getElementById('fin-input-jumlah').value);
    if (!ket || !jumlah || jumlah <= 0) { showToast('Isi keterangan & jumlah valid', 'error'); return; }
    appData.finance.transactions.push({
        id: uid(),
        tanggal: tanggal || new Date().toISOString().slice(0, 10),
        keterangan: ket, kategori, tipe, jumlah
    });
    await saveData(appData);
    document.getElementById('fin-input-ket').value = '';
    document.getElementById('fin-input-kategori').value = '';
    document.getElementById('fin-input-jumlah').value = '';
    renderFinance();
    showToast('Transaksi dicatat 💰', 'success');
}

async function delTransaksi(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    appData.finance.transactions = appData.finance.transactions.filter(x => x.id !== id);
    await saveData(appData);
    renderFinance();
    showToast('Transaksi dihapus 🗑');
}

function renderFinance() {
    const list = appData.finance.transactions || [];
    const masuk = list.filter(t => t.tipe === 'masuk').reduce((s, t) => s + t.jumlah, 0);
    const keluar = list.filter(t => t.tipe === 'keluar').reduce((s, t) => s + t.jumlah, 0);
    document.getElementById('fin-total-masuk').textContent = fmtRupiah(masuk);
    document.getElementById('fin-total-keluar').textContent = fmtRupiah(keluar);
    document.getElementById('fin-saldo').textContent = fmtRupiah(masuk - keluar);
    const container = document.getElementById('fin-list');
    if (!list.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">💰</span><div>Belum ada transaksi tercatat.</div></div>`;
        return;
    }
    const sorted = [...list].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    container.innerHTML = sorted.map(t => `
        <div class="fin-row">
            <span class="text-muted" style="font-size:.74rem;font-family:var(--font-mono)">${fmtDate(t.tanggal)}</span>
            <div class="fin-info"><div>${escapeHtml(t.keterangan)}</div>${t.kategori ? `<div class="text-muted" style="font-size:.72rem">${escapeHtml(t.kategori)}</div>` : ''}</div>
            <span class="fin-jumlah ${t.tipe}">${t.tipe === 'masuk' ? '+' : '−'}${fmtRupiah(t.jumlah)}</span>
            <button class="x-del" onclick="delTransaksi('${t.id}')">✕</button>
        </div>`).join('');
}

/* ================================================================
   POMODORO
   ================================================================ */
let pomoMode = '25-5';
let pomoPhase = 'focus';
let pomoSecondsLeft = 25 * 60;
let pomoRunning = false;
let pomoInterval = null;

function pomoDurations() {
    if (pomoMode === '25-5') return { focus: 25 * 60, brk: 5 * 60 };
    if (pomoMode === '50-10') return { focus: 50 * 60, brk: 10 * 60 };
    const f = parseInt(appData.pomodoro.customFocus) || 25;
    const b = parseInt(appData.pomodoro.customBreak) || 5;
    return { focus: f * 60, brk: b * 60 };
}
function pomoSetMode(mode) {
    pomoMode = mode;
    document.querySelectorAll('.pomo-mode-btn').forEach(b => b.classList.remove('active'));
    const idMap = { '25-5': 'pomo-btn-25', '50-10': 'pomo-btn-50', 'custom': 'pomo-btn-custom' };
    document.getElementById(idMap[mode]).classList.add('active');
    document.getElementById('pomo-custom-row').style.display = mode === 'custom' ? 'flex' : 'none';
    pomoReset();
}
async function pomoApplyCustom() {
    appData.pomodoro.customFocus = parseInt(document.getElementById('pomo-custom-focus').value) || 25;
    appData.pomodoro.customBreak = parseInt(document.getElementById('pomo-custom-break').value) || 5;
    await saveData(appData);
    if (pomoMode === 'custom') pomoReset();
}
function pomoRefreshDisplay() {
    const today = new Date().toDateString();
    if (appData.pomodoro.cyclesDate !== today) {
        appData.pomodoro.cyclesToday = 0;
        appData.pomodoro.cyclesDate = today;
        saveData(appData);
    }
    document.getElementById('pomo-cycle-count').textContent = appData.pomodoro.cyclesToday || 0;
    pomoUpdateTimeDisplay();
}
function pomoUpdateTimeDisplay() {
    const m = Math.floor(pomoSecondsLeft / 60).toString().padStart(2, '0');
    const s = (pomoSecondsLeft % 60).toString().padStart(2, '0');
    document.getElementById('pomo-time').textContent = `${m}:${s}`;
    document.getElementById('pomo-phase-label').textContent = pomoPhase === 'focus' ? 'Fokus Belajar' : 'Istirahat';
    const circle = document.getElementById('pomo-circle');
    circle.className = 'pomo-circle ' + (pomoPhase === 'focus' ? 'focus' : 'break');
}
function pomoReset() {
    pomoPause();
    const d = pomoDurations();
    pomoPhase = 'focus';
    pomoSecondsLeft = d.focus;
    pomoUpdateTimeDisplay();
}
function pomoToggleStart() { pomoRunning ? pomoPause() : pomoStart(); }
function pomoStart() {
    if (pomoRunning) return;
    pomoRunning = true;
    document.getElementById('pomo-start-btn').textContent = '⏸ Jeda';
    pomoInterval = setInterval(pomoTick, 1000);
}
function pomoPause() {
    pomoRunning = false;
    clearInterval(pomoInterval);
    const btn = document.getElementById('pomo-start-btn');
    if (btn) btn.textContent = '▶ Mulai';
}
function pomoTick() {
    pomoSecondsLeft--;
    if (pomoSecondsLeft <= 0) {
        if (pomoPhase === 'focus') {
            appData.pomodoro.cyclesToday = (appData.pomodoro.cyclesToday || 0) + 1;
            saveData(appData);
            document.getElementById('pomo-cycle-count').textContent = appData.pomodoro.cyclesToday;
            showToast('Sesi fokus selesai! Waktunya istirahat 🎉', 'success');
            pomoPhase = 'break';
            pomoSecondsLeft = pomoDurations().brk;
        } else {
            showToast('Istirahat selesai! Yuk fokus lagi 💪', 'success');
            pomoPhase = 'focus';
            pomoSecondsLeft = pomoDurations().focus;
        }
    }
    pomoUpdateTimeDisplay();
}
function pomoSkip() {
    pomoSecondsLeft = 1;
    pomoTick();
}

/* ================================================================
   REPOSITORY MATERI (per MK)
   ================================================================ */
async function addMateri() {
    if (!currentMK) return;
    const kategori = document.getElementById('materi-input-kategori').value;
    const topik = document.getElementById('materi-input-topik').value.trim();
    const judul = document.getElementById('materi-input-judul').value.trim();
    const url = document.getElementById('materi-input-url').value.trim();
    const fileInput = document.getElementById('materi-input-file');
    const file = fileInput.files[0];
    if (!judul) { showToast('Isi judul materi', 'error'); return; }

    const save = async (fileData, fileName) => {
        appData[currentMK].materials.push({
            id: uid(), kategori, topik, judul, url,
            fileData: fileData || null, fileName: fileName || ''
        });
        await saveData(appData);
        document.getElementById('materi-input-topik').value = '';
        document.getElementById('materi-input-judul').value = '';
        document.getElementById('materi-input-url').value = '';
        fileInput.value = '';
        renderMateriRepo(currentMK);
        showToast('Materi ditambahkan ke repository 📦', 'success');
    };
    if (file) {
        if (file.size > 15 * 1024 * 1024) { showToast('File terlalu besar (maks 15 MB)', 'error'); return; }
        const reader = new FileReader();
        reader.onload = e => save(e.target.result, file.name);
        reader.onerror = () => showToast('Gagal membaca file', 'error');
        reader.readAsDataURL(file);
    } else save(null, '');
}

async function delMateri(mkId, id) {
    if (!confirm('Hapus materi ini dari repository?')) return;
    appData[mkId].materials = appData[mkId].materials.filter(m => m.id !== id);
    await saveData(appData);
    renderMateriRepo(mkId);
    showToast('Materi dihapus 🗑');
}

function renderMateriRepo(mkId) {
    const container = document.getElementById('materi-repo-list');
    if (!container) return;
    const materials = appData[mkId].materials || [];
    if (!materials.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">📦</span><div>Repository materi masih kosong.</div></div>`;
        return;
    }
    let html = '';
    MATERI_KATEGORI.forEach(kat => {
        const items = materials.filter(m => m.kategori === kat.val);
        if (!items.length) return;
        html += `<div class="materi-kat-group"><div class="materi-kat-title">${kat.label} (${items.length})</div>`;
        items.forEach(m => {
            html += `<div class="materi-item">
                        <div class="materi-item-info">
                            <div class="materi-item-title">${escapeHtml(m.judul)}</div>
                            ${m.topik ? `<div class="materi-item-topik">🏷 ${escapeHtml(m.topik)}</div>` : ''}
                        </div>
                        ${m.url ? `<a href="${m.url}" target="_blank" class="btn-sm">🔗 Buka Link</a>` : ''}
                        ${m.fileData ? `<button class="btn-sm" onclick="openFileModal('${m.fileData}','${(m.fileName || 'File').replace(/'/g, '&apos;')}')">📎 ${m.fileName || 'Lihat File'}</button>` : ''}
                        <button class="x-del" onclick="delMateri('${mkId}','${m.id}')">✕</button>
                    </div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html || `<div class="empty-state"><span class="emoji">📦</span><div>Repository materi masih kosong.</div></div>`;
}

/* ================================================================
   CATATAN & CHECKLIST (per MK)
   ================================================================ */
function simpleMarkdownToHtml(md) {
    if (!md) return '<span class="text-muted">Belum ada catatan.</span>';
    let esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = esc.split('\n');
    let html = '', inList = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    const inlineMd = t => t
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
    lines.forEach(line => {
        let l = line;
        if (/^###\s+/.test(l)) { closeList(); html += `<h3>${l.replace(/^###\s+/, '')}</h3>`; return; }
        if (/^##\s+/.test(l)) { closeList(); html += `<h2>${l.replace(/^##\s+/, '')}</h2>`; return; }
        if (/^#\s+/.test(l)) { closeList(); html += `<h1>${l.replace(/^#\s+/, '')}</h1>`; return; }
        if (/^[-*]\s+/.test(l)) {
            if (!inList) { html += '<ul>'; inList = true; }
            html += `<li>${inlineMd(l.replace(/^[-*]\s+/, ''))}</li>`;
            return;
        }
        closeList();
        if (l.trim() === '') html += '<br/>';
        else html += `<p>${inlineMd(l)}</p>`;
    });
    closeList();
    return html;
}

function notesSetView(view) {
    notesView = view;
    const w = document.getElementById('notes-tab-write');
    const p = document.getElementById('notes-tab-preview');
    if (w) {
        w.style.background = view === 'write' ? 'var(--accent)' : '';
        w.style.color = view === 'write' ? '#fff' : '';
    }
    if (p) {
        p.style.background = view === 'preview' ? 'var(--accent)' : '';
        p.style.color = view === 'preview' ? '#fff' : '';
    }
    const area = document.getElementById('notes-catatan-area');
    if (area) area.style.display = view === 'write' ? 'block' : 'none';
    const box = document.getElementById('notes-preview-box');
    if (box) {
        box.classList.toggle('show', view === 'preview');
        if (view === 'preview' && currentMK) box.innerHTML = simpleMarkdownToHtml(appData[currentMK].notes.catatan);
    }
}

async function saveNotesCatatan() {
    if (!currentMK) return;
    appData[currentMK].notes.catatan = document.getElementById('notes-catatan-area').value;
    await saveData(appData);
    showToast('Catatan tersimpan ✅');
}

async function addTopikChecklist() {
    if (!currentMK) return;
    const inp = document.getElementById('topik-input');
    const label = inp.value.trim();
    if (!label) return;
    appData[currentMK].notes.topikChecklist.push({ id: uid(), label, done: false });
    await saveData(appData);
    inp.value = '';
    renderTopikChecklist(currentMK);
}

async function toggleTopikChecklist(mkId, id, cb) {
    const t = appData[mkId].notes.topikChecklist.find(x => x.id === id);
    if (!t) return;
    t.done = cb.checked;
    await saveData(appData);
    renderTopikChecklist(mkId);
}

async function delTopikChecklist(mkId, id) {
    appData[mkId].notes.topikChecklist = appData[mkId].notes.topikChecklist.filter(x => x.id !== id);
    await saveData(appData);
    renderTopikChecklist(mkId);
}

function renderTopikChecklist(mkId) {
    const list = appData[mkId].notes.topikChecklist || [];
    const container = document.getElementById('topik-checklist-list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Belum ada topik.</div>';
        return;
    }
    container.innerHTML = list.map(t => `
        <div class="checklist-row">
            <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTopikChecklist('${mkId}','${t.id}',this)"/>
            <span class="${t.done ? 'done' : ''}">${escapeHtml(t.label)}</span>
            <button class="x-del" onclick="delTopikChecklist('${mkId}','${t.id}')">✕</button>
        </div>`).join('');
}

async function addBookmark() {
    if (!currentMK) return;
    const label = document.getElementById('bookmark-input-label').value.trim();
    const halaman = document.getElementById('bookmark-input-halaman').value.trim();
    if (!label) return;
    appData[currentMK].notes.bookmarks.push({ id: uid(), label, halaman });
    await saveData(appData);
    document.getElementById('bookmark-input-label').value = '';
    document.getElementById('bookmark-input-halaman').value = '';
    renderBookmarks(currentMK);
}

async function delBookmark(mkId, id) {
    appData[mkId].notes.bookmarks = appData[mkId].notes.bookmarks.filter(x => x.id !== id);
    await saveData(appData);
    renderBookmarks(mkId);
}

function renderBookmarks(mkId) {
    const list = appData[mkId].notes.bookmarks || [];
    const container = document.getElementById('bookmark-list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Belum ada bookmark.</div>';
        return;
    }
    container.innerHTML = list.map(b => `
        <div class="bookmark-row">
            <div style="flex:1;"><b>${escapeHtml(b.label)}</b>${b.halaman ? ` <span class="text-muted">· hal. ${escapeHtml(b.halaman)}</span>` : ''}</div>
            <button class="x-del" onclick="delBookmark('${mkId}','${b.id}')">✕</button>
        </div>`).join('');
}

async function addRumus() {
    if (!currentMK) return;
    const judul = document.getElementById('rumus-input-judul').value.trim();
    const isi = document.getElementById('rumus-input-isi').value.trim();
    if (!judul || !isi) { showToast('Isi nama & rumus terlebih dahulu', 'error'); return; }
    appData[currentMK].notes.rumus.push({ id: uid(), judul, isi });
    await saveData(appData);
    document.getElementById('rumus-input-judul').value = '';
    document.getElementById('rumus-input-isi').value = '';
    renderRumus(currentMK);
}

async function delRumus(mkId, id) {
    appData[mkId].notes.rumus = appData[mkId].notes.rumus.filter(x => x.id !== id);
    await saveData(appData);
    renderRumus(mkId);
}

function renderRumus(mkId) {
    const list = appData[mkId].notes.rumus || [];
    const container = document.getElementById('rumus-list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<div class="text-muted" style="font-size:.82rem">Belum ada rumus/definisi.</div>';
        return;
    }
    container.innerHTML = list.map(r => `
        <div class="rumus-item">
            <div class="rumus-item-body">
                <div class="rumus-item-title">${escapeHtml(r.judul)}</div>
                <div>${r.isi}</div>
            </div>
            <button class="x-del" onclick="delRumus('${mkId}','${r.id}')">✕</button>
        </div>`).join('');
}

async function handleNotesLampiranUpload(event) {
    if (!currentMK) return;
    const files = Array.from(event.target.files);
    if (!files.length) return;
    const notes = appData[currentMK].notes;
    const allowed = MAX_PHOTOS - notes.lampiran.length;
    if (allowed <= 0) { showToast(`Maksimal ${MAX_PHOTOS} lampiran tercapai`, 'error'); return; }
    const toProcess = files.filter(f => f.type.startsWith('image/')).slice(0, allowed);
    for (const file of toProcess) {
        try {
            const compressed = await compressImage(file);
            notes.lampiran.push({ data: compressed, name: file.name });
        } catch (e) { }
    }
    await saveData(appData);
    renderLampiran(currentMK);
    event.target.value = '';
    showToast('Lampiran diupload 🖼', 'success');
}

async function delLampiran(mkId, idx) {
    appData[mkId].notes.lampiran.splice(idx, 1);
    await saveData(appData);
    renderLampiran(mkId);
}

function renderLampiran(mkId) {
    const list = appData[mkId].notes.lampiran || [];
    const container = document.getElementById('lampiran-gallery');
    if (!container) return;
    container.innerHTML = list.map((ph, i) => `
        <div class="photo-thumb-wrap">
            <img class="photo-thumb" src="${ph.data}" alt="${ph.name}" onclick="window.open('${ph.data}','_blank')"/>
            <button class="photo-del-x" onclick="delLampiran('${mkId}',${i})">×</button>
        </div>`).join('') || '<div class="text-muted" style="font-size:.8rem">Belum ada lampiran.</div>';
}

function renderNotesTab(mkId) {
    const notes = appData[mkId].notes;
    document.getElementById('notes-catatan-area').value = notes.catatan || '';
    notesSetView('write');
    renderTopikChecklist(mkId);
    renderBookmarks(mkId);
    renderRumus(mkId);
    renderLampiran(mkId);
}

/* ================================================================
   MODUL TUGAS
   ================================================================ */
function tmBuildFilterOptions() {
    const mkOpts = '<option value="semua">📚 Semua MK</option>' +
        MATA_KULIAH.map(mk => `<option value="${mk.id}">${MK_META[mk.id]?.emoji || '📖'} ${mk.nama}</option>`).join('');
    const el1 = document.getElementById('tm-filter-mk'); if (el1) el1.innerHTML = mkOpts;
    const el2 = document.getElementById('tm-mat-filter-mk'); if (el2) el2.innerHTML = mkOpts;

    const ptmOpts = Array.from({ length: TOTAL_PTM }, (_, i) => `<option value="${i + 1}">Pertemuan ${i + 1}</option>`).join('');
    const elT = document.getElementById('tm-tugas-pertemuan'); if (elT) elT.innerHTML = ptmOpts;
    const elM = document.getElementById('tm-materi-pertemuan'); if (elM) elM.innerHTML = ptmOpts;

    const mkOptsFull = MATA_KULIAH.map(mk => `<option value="${mk.id}">${MK_META[mk.id]?.emoji || '📖'} ${mk.nama}</option>`).join('');
    const elTmk = document.getElementById('tm-tugas-mk'); if (elTmk) elTmk.innerHTML = mkOptsFull;
    const elMmk = document.getElementById('tm-materi-mk'); if (elMmk) elMmk.innerHTML = mkOptsFull;
}

function tmComputeTugasStats() {
    const now = new Date(new Date().toDateString());
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    let total = tmTugas.length, selesai = 0, belum = 0, terlambat = 0, minggu = 0;
    tmTugas.forEach(t => {
        if (t.status === 'selesai') selesai++; else belum++;
        if (t.deadline && t.status !== 'selesai') {
            const d = new Date(t.deadline);
            if (d < now) terlambat++;
            else if (d <= weekEnd) minggu++;
        }
    });
    return { total, selesai, belum, terlambat, minggu };
}

function tmComputeMateriStats() {
    const total = tmMateri.length;
    const dipelajari = tmMateri.filter(m => m.status === 'dipelajari').length;
    return { total, dipelajari, belum: total - dipelajari };
}

function renderTugasModule() {
    const statsEl = document.getElementById('tm-stats');
    if (!statsEl) return;
    const st = tmComputeTugasStats();
    statsEl.innerHTML = `
        <div class="tm-stat" style="--tm-color:var(--accent2)"><div class="tm-stat-icon">📋</div><div class="tm-stat-val">${st.total}</div><div class="tm-stat-lbl">Total Tugas</div></div>
        <div class="tm-stat" style="--tm-color:var(--green)"><div class="tm-stat-icon">✅</div><div class="tm-stat-val">${st.selesai}</div><div class="tm-stat-lbl">Tugas Selesai</div></div>
        <div class="tm-stat" style="--tm-color:var(--yellow)"><div class="tm-stat-icon">⏳</div><div class="tm-stat-val">${st.belum}</div><div class="tm-stat-lbl">Belum Selesai</div></div>
        <div class="tm-stat" style="--tm-color:var(--red)"><div class="tm-stat-icon">⚠️</div><div class="tm-stat-val">${st.terlambat}</div><div class="tm-stat-lbl">Terlambat</div></div>
        <div class="tm-stat" style="--tm-color:var(--purple)"><div class="tm-stat-icon">📅</div><div class="tm-stat-val">${st.minggu}</div><div class="tm-stat-lbl">Deadline Pekan Ini</div></div>
    `;

    const q = (document.getElementById('tm-search').value || '').toLowerCase();
    const fStatus = document.getElementById('tm-filter-status').value;
    const fPrio = document.getElementById('tm-filter-prio').value;
    const fMk = document.getElementById('tm-filter-mk').value;
    const sortBy = document.getElementById('tm-sort').value;

    let arr = tmTugas.filter(t => {
        if (fStatus !== 'semua' && t.status !== fStatus) return false;
        if (fPrio !== 'semua' && t.prioritas !== fPrio) return false;
        if (fMk !== 'semua' && t.mkId !== fMk) return false;
        if (q) {
            const blob = `${t.judul || ''} ${t.deskripsi || ''} ${t.catatan || ''}`.toLowerCase();
            if (!blob.includes(q)) return false;
        }
        return true;
    });

    const prioRank = { tinggi: 0, normal: 1, rendah: 2 };
    arr.sort((a, b) => {
        if (sortBy === 'deadline') {
            const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
            const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
            return da - db;
        }
        if (sortBy === 'prioritas') return (prioRank[a.prioritas] ?? 1) - (prioRank[b.prioritas] ?? 1);
        if (sortBy === 'judul') return (a.judul || '').localeCompare(b.judul || '');
        const ta = a.dibuat ? new Date(a.dibuat).getTime() : 0;
        const tb = b.dibuat ? new Date(b.dibuat).getTime() : 0;
        return tb - ta;
    });

    const container = document.getElementById('tm-tugas-list');
    if (!arr.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">📋</span><div>Belum ada tugas yang cocok. Klik "Tambah Tugas" untuk memulai.</div></div>`;
        return;
    }

    container.innerHTML = arr.map(t => {
        const mk = getMKById(t.mkId);
        const stMap = {
            belum: { lbl: '🔴 Belum', cls: 'badge-red' },
            proses: { lbl: '🟡 Proses', cls: 'badge-yellow' },
            selesai: { lbl: '🟢 Selesai', cls: 'badge-green' }
        };
        const prioMap = {
            tinggi: { lbl: '🔴 Prioritas Tinggi', cls: 'badge-red' },
            normal: { lbl: '🔵 Normal', cls: 'badge-blue' },
            rendah: { lbl: '⚪ Rendah', cls: 'badge-gray' }
        };
        const s = stMap[t.status] || stMap.belum;
        const p = prioMap[t.prioritas] || prioMap.normal;

        let dlBadge = '';
        if (t.deadline) {
            const days = daysUntil(t.deadline);
            let cls = 'aman', txt = '';
            if (t.status === 'selesai') { cls = 'aman'; txt = '✔ ' + fmtDate(t.deadline); }
            else if (days === null) { cls = 'aman'; txt = fmtDate(t.deadline); }
            else if (days < 0) { cls = 'lewat'; txt = `LEWAT ${Math.abs(days)}h`; }
            else if (days === 0) { cls = 'mendesak'; txt = 'HARI INI'; }
            else if (days === 1) { cls = 'mendesak'; txt = 'BESOK'; }
            else if (days <= 3) { cls = 'dekat'; txt = `${days} hari lagi`; }
            else if (days <= 7) { cls = 'dekat'; txt = `${days} hari lagi`; }
            else { cls = 'aman'; txt = `${days} hari lagi`; }
            dlBadge = `<span class="tm-deadline-badge ${cls}">⏰ ${txt}</span>`;
        }

        const lampiranHtml = (t.lampiran || []).map((l, i) =>
            l.type && l.type.startsWith('image/')
                ? `<a href="javascript:;" onclick="tmShowLampiran('${t.id}',${i})">🖼 ${escapeHtml(l.name)}</a>`
                : `<a href="${l.data}" download="${escapeHtml(l.name)}">📎 ${escapeHtml(l.name)}</a>`
        ).join('');

        return `<div class="tm-card status-${t.status} prio-${t.prioritas}">
                    <div class="tm-card-head">
                        <div class="tm-card-title ${t.status === 'selesai' ? 'done' : ''}">${escapeHtml(t.judul || '(tanpa judul)')}</div>
                        <div class="tm-card-badges">
                            <span class="badge ${s.cls}">${s.lbl}</span>
                            <span class="badge ${p.cls}">${p.lbl}</span>
                        </div>
                    </div>
                    <div class="tm-card-meta">
                        <span>${mk ? mk.nama : '–'}</span>
                        <span>Pertemuan ${t.pertemuan || '-'}</span>
                        ${t.dibuat ? `<span>📅 Dibuat: ${fmtDate(t.dibuat)}</span>` : ''}
                        ${dlBadge}
                    </div>
                    ${t.deskripsi ? `<div class="tm-card-desc">${escapeHtml(t.deskripsi).slice(0, 200)}${t.deskripsi.length > 200 ? '…' : ''}</div>` : ''}
                    ${lampiranHtml ? `<div class="tm-card-lampiran">${lampiranHtml}</div>` : ''}
                    <div class="tm-card-actions">
                        ${t.status !== 'selesai'
                            ? `<button class="done" onclick="tmToggleTugas('${t.id}')">✔ Tandai Selesai</button>`
                            : `<button class="done" onclick="tmToggleTugas('${t.id}')">↺ Batalkan Selesai</button>`}
                        <button onclick="openTugasModal('${t.id}')">✏ Edit</button>
                        <button class="del" onclick="tmDeleteTugas('${t.id}')">🗑 Hapus</button>
                    </div>
                </div>`;
    }).join('');
}

function tmToggleTugas(id) {
    const t = tmTugas.find(x => x.id === id);
    if (!t) return;
    t.status = t.status === 'selesai' ? 'belum' : 'selesai';
    tmSaveTugas();
    renderTugasModule();
    tmUpdateDashboardStats();
    showToast(t.status === 'selesai' ? 'Tugas ditandai selesai ✅' : 'Status tugas dikembalikan', 'success');
}

function tmDeleteTugas(id) {
    if (!confirm('Hapus tugas ini?')) return;
    tmTugas = tmTugas.filter(x => x.id !== id);
    tmSaveTugas();
    renderTugasModule();
    tmUpdateDashboardStats();
    showToast('Tugas dihapus 🗑');
}

function tmShowLampiran(id, idx) {
    const t = tmTugas.find(x => x.id === id);
    if (!t || !t.lampiran || !t.lampiran[idx]) return;
    const l = t.lampiran[idx];
    const w = window.open('', '_blank');
    if (!w) { showToast('Popup diblokir browser', 'error'); return; }
    w.document.write(`<title>${escapeHtml(l.name)}</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${l.data}" style="max-width:95vw;max-height:95vh;"/></body>`);
}

function openTugasModal(id) {
    tmBuildFilterOptions();
    tmTugasEditLampiranLocal = [];
    const modal = document.getElementById('tugas-modal');
    const titleEl = document.getElementById('tugas-modal-title');
    if (id) {
        const t = tmTugas.find(x => x.id === id);
        if (!t) return;
        titleEl.textContent = '✏ Edit Tugas';
        document.getElementById('tm-tugas-id').value = t.id;
        document.getElementById('tm-tugas-judul').value = t.judul || '';
        document.getElementById('tm-tugas-mk').value = t.mkId || 'mk1';
        document.getElementById('tm-tugas-pertemuan').value = t.pertemuan || 1;
        document.getElementById('tm-tugas-status').value = t.status || 'belum';
        document.getElementById('tm-tugas-prio').value = t.prioritas || 'normal';
        document.getElementById('tm-tugas-dibuat').value = t.dibuat || '';
        document.getElementById('tm-tugas-deadline').value = t.deadline || '';
        document.getElementById('tm-tugas-deskripsi').value = t.deskripsi || '';
        document.getElementById('tm-tugas-catatan').value = t.catatan || '';
        tmTugasEditLampiranLocal = JSON.parse(JSON.stringify(t.lampiran || []));
    } else {
        titleEl.textContent = '➕ Tambah Tugas';
        document.getElementById('tm-tugas-id').value = '';
        document.getElementById('tm-tugas-judul').value = '';
        document.getElementById('tm-tugas-mk').value = 'mk1';
        document.getElementById('tm-tugas-pertemuan').value = 1;
        document.getElementById('tm-tugas-status').value = 'belum';
        document.getElementById('tm-tugas-prio').value = 'normal';
        document.getElementById('tm-tugas-dibuat').value = new Date().toISOString().slice(0, 10);
        document.getElementById('tm-tugas-deadline').value = '';
        document.getElementById('tm-tugas-deskripsi').value = '';
        document.getElementById('tm-tugas-catatan').value = '';
    }
    document.getElementById('tm-tugas-lampiran').value = '';
    tmRenderLampiranList();
    modal.classList.add('open');
}
function closeTugasModal() {
    document.getElementById('tugas-modal').classList.remove('open');
}
function tmRenderLampiranList() {
    const el = document.getElementById('tm-tugas-lampiran-list');
    if (!el) return;
    if (!tmTugasEditLampiranLocal.length) { el.innerHTML = ''; return; }
    el.innerHTML = tmTugasEditLampiranLocal.map((l, i) =>
        `<span class="badge badge-blue" style="cursor:pointer;padding:4px 10px;" onclick="tmRemoveLampiranLocal(${i})">📎 ${escapeHtml(l.name)} ✕</span>`
    ).join('');
}
function tmRemoveLampiranLocal(i) {
    tmTugasEditLampiranLocal.splice(i, 1);
    tmRenderLampiranList();
}

document.addEventListener('change', async function (e) {
    if (e.target && e.target.id === 'tm-tugas-lampiran') {
        const files = Array.from(e.target.files || []);
        for (const f of files) {
            if (f.size > 5 * 1024 * 1024) { showToast(`"${f.name}" > 5 MB, dilewati`, 'error'); continue; }
            const reader = new FileReader();
            reader.onload = (ev) => {
                tmTugasEditLampiranLocal.push({ name: f.name, type: f.type, data: ev.target.result });
                tmRenderLampiranList();
            };
            reader.readAsDataURL(f);
        }
        e.target.value = '';
    }
});

function saveTugasForm() {
    const id = document.getElementById('tm-tugas-id').value;
    const judul = document.getElementById('tm-tugas-judul').value.trim();
    if (!judul) { showToast('Judul tugas wajib diisi', 'error'); return; }
    const data = {
        id: id || uid(),
        judul,
        mkId: document.getElementById('tm-tugas-mk').value,
        pertemuan: parseInt(document.getElementById('tm-tugas-pertemuan').value) || 1,
        status: document.getElementById('tm-tugas-status').value,
        prioritas: document.getElementById('tm-tugas-prio').value,
        dibuat: document.getElementById('tm-tugas-dibuat').value,
        deadline: document.getElementById('tm-tugas-deadline').value,
        deskripsi: document.getElementById('tm-tugas-deskripsi').value,
        catatan: document.getElementById('tm-tugas-catatan').value,
        lampiran: tmTugasEditLampiranLocal
    };
    if (id) {
        const idx = tmTugas.findIndex(x => x.id === id);
        tmTugas[idx] = data;
        showToast('Tugas diperbarui ✅', 'success');
    } else {
        tmTugas.push(data);
        showToast('Tugas ditambahkan ➕', 'success');
    }
    tmSaveTugas();
    closeTugasModal();
    renderTugasModule();
    tmUpdateDashboardStats();
    renderDeadlineWarnings();
}

/* ================================================================
   MODUL MATERI
   ================================================================ */
function tmSetView(v) {
    tmTugasView = v;
    document.getElementById('tm-view-card').classList.toggle('active', v === 'card');
    document.getElementById('tm-view-timeline').classList.toggle('active', v === 'timeline');
    renderMateriModule();
}

function renderMateriModule() {
    const statsEl = document.getElementById('tm-materi-stats');
    if (!statsEl) return;
    const st = tmComputeMateriStats();
    statsEl.innerHTML = `
        <div class="tm-stat" style="--tm-color:var(--purple)"><div class="tm-stat-icon">📖</div><div class="tm-stat-val">${st.total}</div><div class="tm-stat-lbl">Total Materi</div></div>
        <div class="tm-stat" style="--tm-color:var(--green)"><div class="tm-stat-icon">✅</div><div class="tm-stat-val">${st.dipelajari}</div><div class="tm-stat-lbl">Sudah Dipelajari</div></div>
        <div class="tm-stat" style="--tm-color:var(--yellow)"><div class="tm-stat-icon">⏳</div><div class="tm-stat-val">${st.belum}</div><div class="tm-stat-lbl">Belum Dipelajari</div></div>
    `;

    const q = (document.getElementById('tm-mat-search').value || '').toLowerCase();
    const fKat = document.getElementById('tm-mat-filter-kat').value;
    const fStat = document.getElementById('tm-mat-filter-status').value;
    const fMk = document.getElementById('tm-mat-filter-mk').value;

    let arr = tmMateri.filter(m => {
        if (fKat !== 'semua' && m.kategori !== fKat) return false;
        if (fStat !== 'semua' && m.status !== fStat) return false;
        if (fMk !== 'semua' && m.mkId !== fMk) return false;
        if (q) {
            const blob = `${m.judul || ''} ${m.topik || ''} ${m.catatanMarkdown || ''} ${m.rumusLatex || ''}`.toLowerCase();
            if (!blob.includes(q)) return false;
        }
        return true;
    });

    const container = document.getElementById('tm-materi-container');
    if (!arr.length) {
        container.innerHTML = `<div class="empty-state"><span class="emoji">📖</span><div>Belum ada materi. Klik "Tambah Materi" untuk memulai.</div></div>`;
        return;
    }

    if (tmTugasView === 'card') {
        arr.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
        container.innerHTML = `<div class="tm-materi-grid">${arr.map(m => tmRenderMateriCard(m)).join('')}</div>`;
    } else {
        const groups = {};
        arr.forEach(m => {
            const key = `${m.mkId}||${m.pertemuan || 0}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });
        const keys = Object.keys(groups).sort((a, b) => {
            const [mkA, ptA] = a.split('||');
            const [mkB, ptB] = b.split('||');
            if (mkA !== mkB) return mkA.localeCompare(mkB);
            return parseInt(ptA) - parseInt(ptB);
        });
        container.innerHTML = `<div class="tm-timeline">${keys.map(k => {
            const [mkId, pt] = k.split('||');
            const mk = getMKById(mkId);
            const items = groups[k].sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
            return `<div class="tm-tl-group">
                <div class="tm-tl-title">${mk ? mk.nama : '–'} — Pertemuan ${pt || '?'}</div>
                ${items.map(m => `<div class="tm-tl-item" onclick="openMateriModal('${m.id}')">
                    <span class="tgl">${m.tanggal ? fmtDate(m.tanggal) : '–'}</span>
                    <span class="judul">${escapeHtml(m.judul)}</span>
                    <span class="kat">${MATERI_KATEGORI.find(c => c.val === m.kategori)?.label || m.kategori}</span>
                    <span class="badge ${m.status === 'dipelajari' ? 'badge-green' : 'badge-yellow'}">${m.status === 'dipelajari' ? '✅' : '⏳'}</span>
                </div>`).join('')}
            </div>`;
        }).join('')}</div>`;
    }
}

function tmRenderMateriCard(m) {
    const mk = getMKById(m.mkId);
    const kat = MATERI_KATEGORI.find(c => c.val === m.kategori) || { label: m.kategori };
    const ringkas = (m.catatanMarkdown || '').replace(/[#*`$]/g, '').trim().slice(0, 160);
    return `<div class="tm-materi-card">
                <div class="kat-chip">${kat.label}</div>
                <div class="judul">${escapeHtml(m.judul)}</div>
                ${mk ? `<div class="mk-chip">${MK_META[m.mkId]?.emoji || '📖'} ${mk.nama} · Ptm ${m.pertemuan || '-'}</div>` : ''}
                ${m.tanggal ? `<div class="text-muted" style="font-size:.7rem;font-family:var(--font-mono)">📅 ${fmtDate(m.tanggal)}</div>` : ''}
                ${m.rumusLatex ? `<div class="rumus-box">${escapeHtml(m.rumusLatex)}</div>` : ''}
                ${ringkas ? `<div class="ringkas">${escapeHtml(ringkas)}</div>` : ''}
                <div class="footer">
                    <button class="status-pill ${m.status === 'dipelajari' ? 'dipelajari' : 'belum'}" onclick="tmToggleMateriStatus('${m.id}')">
                        ${m.status === 'dipelajari' ? '✅ Sudah Dipelajari' : '⏳ Belum Dipelajari'}
                    </button>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;">
                        ${m.link ? `<a href="${m.link}" target="_blank" class="btn-sm" style="padding:3px 9px;font-size:.7rem;">🔗 Link</a>` : ''}
                        <button class="btn-sm" style="padding:3px 9px;font-size:.7rem;" onclick="openMateriModal('${m.id}')">✏</button>
                        <button class="btn-sm" style="padding:3px 9px;font-size:.7rem;color:var(--red);border-color:var(--red)" onclick="tmDeleteMateri('${m.id}')">🗑</button>
                    </div>
                </div>
            </div>`;
}

function tmToggleMateriStatus(id) {
    const m = tmMateri.find(x => x.id === id);
    if (!m) return;
    m.status = m.status === 'dipelajari' ? 'belum' : 'dipelajari';
    tmSaveMateri();
    renderMateriModule();
    tmUpdateDashboardStats();
    showToast(m.status === 'dipelajari' ? 'Materi ditandai dipelajari ✅' : 'Status materi dibalik', 'success');
}

function tmDeleteMateri(id) {
    if (!confirm('Hapus materi ini?')) return;
    tmMateri = tmMateri.filter(x => x.id !== id);
    tmSaveMateri();
    renderMateriModule();
    tmUpdateDashboardStats();
    showToast('Materi dihapus 🗑');
}

function openMateriModal(id) {
    tmBuildFilterOptions();
    const modal = document.getElementById('materi-modal');
    const titleEl = document.getElementById('materi-modal-title');
    if (id) {
        const m = tmMateri.find(x => x.id === id);
        if (!m) return;
        titleEl.textContent = '✏ Edit Materi';
        document.getElementById('tm-materi-id').value = m.id;
        document.getElementById('tm-materi-judul').value = m.judul || '';
        document.getElementById('tm-materi-mk').value = m.mkId || 'mk1';
        document.getElementById('tm-materi-pertemuan').value = m.pertemuan || 1;
        document.getElementById('tm-materi-kategori').value = m.kategori || 'catatan';
        document.getElementById('tm-materi-tanggal').value = m.tanggal || '';
        document.getElementById('tm-materi-status').value = m.status || 'belum';
        document.getElementById('tm-materi-catatan').value = m.catatanMarkdown || '';
        document.getElementById('tm-materi-rumus').value = m.rumusLatex || '';
        document.getElementById('tm-materi-link').value = m.link || '';
    } else {
        titleEl.textContent = '➕ Tambah Materi';
        document.getElementById('tm-materi-id').value = '';
        document.getElementById('tm-materi-judul').value = '';
        document.getElementById('tm-materi-mk').value = 'mk1';
        document.getElementById('tm-materi-pertemuan').value = 1;
        document.getElementById('tm-materi-kategori').value = 'catatan';
        document.getElementById('tm-materi-tanggal').value = new Date().toISOString().slice(0, 10);
        document.getElementById('tm-materi-status').value = 'belum';
        document.getElementById('tm-materi-catatan').value = '';
        document.getElementById('tm-materi-rumus').value = '';
        document.getElementById('tm-materi-link').value = '';
    }
    modal.classList.add('open');
}
function closeMateriModal() {
    document.getElementById('materi-modal').classList.remove('open');
}

function saveMateriForm() {
    const id = document.getElementById('tm-materi-id').value;
    const judul = document.getElementById('tm-materi-judul').value.trim();
    if (!judul) { showToast('Judul materi wajib diisi', 'error'); return; }
    const data = {
        id: id || uid(),
        judul,
        mkId: document.getElementById('tm-materi-mk').value,
        pertemuan: parseInt(document.getElementById('tm-materi-pertemuan').value) || 1,
        kategori: document.getElementById('tm-materi-kategori').value,
        tanggal: document.getElementById('tm-materi-tanggal').value,
        status: document.getElementById('tm-materi-status').value,
        catatanMarkdown: document.getElementById('tm-materi-catatan').value,
        rumusLatex: document.getElementById('tm-materi-rumus').value,
        link: document.getElementById('tm-materi-link').value
    };
    if (id) {
        const idx = tmMateri.findIndex(x => x.id === id);
        tmMateri[idx] = data;
        showToast('Materi diperbarui ✅', 'success');
    } else {
        tmMateri.push(data);
        showToast('Materi ditambahkan ➕', 'success');
    }
    tmSaveMateri();
    closeMateriModal();
    renderMateriModule();
    tmUpdateDashboardStats();
}

/* ================================================================
   PRINT JURNAL (GLOBAL)
   ================================================================ */
function printJurnal() {
    const win = window.open('', '_blank');
    if (!win) { showToast('Popup diblokir browser', 'error'); return; }
    const now = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prof = currentUser.profile || {};

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Jurnal MechLog</title>
        <style>
            @page { size: A4 portrait; margin: 15mm 20mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.65; color: #1e293b; background: #fff; padding: 20px; }
            h1 { font-size: 15pt; font-weight: 800; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 6px; text-transform: uppercase; }
            .kop-sub { font-size: 10pt; color: #475569; margin-bottom: 16px; }
            h2 { font-size: 12pt; font-weight: 700; color: #b45309; border-left: 4px solid #f0883e; padding-left: 10px; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; }
            h3 { font-size: 11pt; font-weight: 700; color: #0f172a; margin-top: 16px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
            .item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; page-break-inside: avoid; background: #fff; }
            .item b { font-size: 11pt; color: #0f172a; }
            .meta { font-size: 9.5pt; color: #475569; margin-top: 6px; display: flex; flex-wrap: wrap; gap: 10px; }
            .badge { display: inline-block; padding: 2px 10px; border-radius: 100px; font-size: 8.5pt; font-weight: 700; border: 1px solid #cbd5e1; }
            .badge.merah { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
            .badge.hijau { background: #dcfce7; color: #166534; border-color: #86efac; }
            .badge.kuning { background: #fef3c7; color: #92400e; border-color: #fde68a; }
            .pre { white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 10pt; background: #f8fafc; padding: 10px 12px; border-radius: 6px; margin-top: 8px; border-left: 3px solid #cbd5e1; color: #334155; }
        </style></head><body>`;
    html += `<h1>📓 Jurnal MechLog</h1>`;
    html += `<div class="kop-sub">${escapeHtml(prof.nama || '')} · ${escapeHtml(prof.nim || '')} · ${escapeHtml(prof.jurusan || '')} · ${escapeHtml(prof.universitas || '')}<br/>Dicetak: ${now}</div>`;

    html += `<h2>📋 Daftar Tugas (${tmTugas.length})</h2>`;
    if (!tmTugas.length) html += `<p><i>Tidak ada tugas.</i></p>`;
    else {
        const grouped = {};
        tmTugas.forEach(t => {
            const key = t.mkId || 'lain';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(t);
        });
        Object.keys(grouped).forEach(mkId => {
            const mk = getMKById(mkId);
            html += `<h3>${mk ? mk.nama : mkId}</h3>`;
            grouped[mkId].forEach(t => {
                const stCls = t.status === 'selesai' ? 'hijau' : t.status === 'proses' ? 'kuning' : 'merah';
                html += `<div class="item">
                    <b>${escapeHtml(t.judul)}</b>
                    <div class="meta">
                        <span class="badge ${stCls}">${t.status}</span>
                        <span class="badge">${t.prioritas}</span>
                        <span>Pertemuan ${t.pertemuan || '-'}</span>
                        ${t.deadline ? `<span>⏰ Deadline: <b>${fmtDate(t.deadline)}</b></span>` : ''}
                    </div>
                    ${t.deskripsi ? `<div class="pre">${escapeHtml(t.deskripsi)}</div>` : ''}
                    ${t.catatan ? `<div class="pre"><b>Catatan:</b>\n${escapeHtml(t.catatan)}</div>` : ''}
                </div>`;
            });
        });
    }

    html += `<h2>📖 Daftar Materi (${tmMateri.length})</h2>`;
    if (!tmMateri.length) html += `<p><i>Tidak ada materi.</i></p>`;
    else {
        const grouped = {};
        tmMateri.forEach(m => {
            const key = m.mkId || 'lain';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(m);
        });
        Object.keys(grouped).forEach(mkId => {
            const mk = getMKById(mkId);
            html += `<h3>${mk ? mk.nama : mkId}</h3>`;
            grouped[mkId].sort((a, b) => (a.pertemuan || 0) - (b.pertemuan || 0)).forEach(m => {
                const statusCls = m.status === 'dipelajari' ? 'hijau' : 'kuning';
                html += `<div class="item">
                    <b>${escapeHtml(m.judul)}</b>
                    <div class="meta">
                        <span class="badge ${statusCls}">${m.status}</span>
                        <span class="badge">${m.kategori}</span>
                        <span>Pertemuan ${m.pertemuan || '-'}</span>
                        ${m.tanggal ? `<span>📅 ${fmtDate(m.tanggal)}</span>` : ''}
                    </div>
                    ${m.rumusLatex ? `<div class="pre"><b>Rumus:</b> ${escapeHtml(m.rumusLatex)}</div>` : ''}
                    ${m.catatanMarkdown ? `<div class="pre">${escapeHtml(m.catatanMarkdown)}</div>` : ''}
                    ${m.link ? `<div class="meta">🔗 <a href="${escapeHtml(m.link)}" target="_blank" style="color:#2563eb;">${escapeHtml(m.link)}</a></div>` : ''}
                </div>`;
            });
        });
    }

    html += `</body></html>`;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 400);
}

/* ================================================================
   GLOBAL SEARCH
   ================================================================ */
function doGlobalSearch(query) {
    const panel = document.getElementById('global-search-results');
    if (!panel) return;
    const q = (query || '').trim().toLowerCase();
    if (!q) { panel.classList.remove('open'); panel.innerHTML = ''; return; }

    const results = {
        mk: [], tugas: [], materi: [], catatan: [], todo: [], keuangan: [],
        tmTugas: [], tmMateri: [], jurnal: []
    };

    MATA_KULIAH.forEach(mk => {
        if (mk.nama.toLowerCase().includes(q) || (mk.kode || '').toLowerCase().includes(q) || (mk.dosen || '').toLowerCase().includes(q)) {
            results.mk.push({
                label: mk.nama,
                sub: `${mk.kode || ''} · ${mk.dosen || ''}`,
                action: () => openMKDetail(mk.id)
            });
        }
        (appData[mk.id]?.pertemuan || []).forEach(p => {
            if (p.tugas && p.tugas.toLowerCase().includes(q)) {
                results.tugas.push({
                    label: p.tugas,
                    sub: `${mk.nama} · Pertemuan ${p.no}`,
                    action: () => openMKDetail(mk.id)
                });
            }
            if (p.catatan && p.catatan.toLowerCase().includes(q)) {
                results.catatan.push({
                    label: p.catatan.slice(0, 60),
                    sub: `${mk.nama} · Pertemuan ${p.no}`,
                    action: () => openMKDetail(mk.id)
                });
            }
            if ((p.tanggal || p.absensi !== 'belum') && (p.tugas || p.catatan)) {
                const blob = `${p.tugas || ''} ${p.catatan || ''} ${p.tanggal || ''}`.toLowerCase();
                if (blob.includes(q)) {
                    results.jurnal.push({
                        label: p.tugas || p.catatan.slice(0, 50),
                        sub: `${mk.nama} · Jurnal`,
                        action: () => { showPage('jurnal'); setTimeout(() => openJurnalModal(mk.id, p.no - 1), 200); }
                    });
                }
            }
        });
        (appData[mk.id]?.materials || []).forEach(m => {
            if (m.judul.toLowerCase().includes(q) || (m.topik || '').toLowerCase().includes(q)) {
                results.materi.push({
                    label: m.judul,
                    sub: `${mk.nama} · Repository Materi`,
                    action: () => openMKDetail(mk.id, 'materi')
                });
            }
        });
        if ((appData[mk.id]?.notes?.catatan || '').toLowerCase().includes(q)) {
            results.catatan.push({
                label: appData[mk.id].notes.catatan.slice(0, 60),
                sub: `${mk.nama} · Catatan`,
                action: () => openMKDetail(mk.id, 'catatan')
            });
        }
    });

    tmTugas.forEach(t => {
        const blob = `${t.judul || ''} ${t.deskripsi || ''} ${t.catatan || ''}`.toLowerCase();
        if (blob.includes(q)) {
            const mk = getMKById(t.mkId);
            results.tmTugas.push({
                label: t.judul,
                sub: `${mk?.nama || '–'} · Modul Tugas`,
                action: () => { showPage('tugas-module'); setTimeout(() => openTugasModal(t.id), 200); }
            });
        }
    });
    tmMateri.forEach(m => {
        const blob = `${m.judul || ''} ${m.catatanMarkdown || ''} ${m.rumusLatex || ''}`.toLowerCase();
        if (blob.includes(q)) {
            const mk = getMKById(m.mkId);
            results.tmMateri.push({
                label: m.judul,
                sub: `${mk?.nama || '–'} · Modul Materi`,
                action: () => { showPage('materi-module'); setTimeout(() => openMateriModal(m.id), 200); }
            });
        }
    });
    (appData.todos || []).forEach(t => {
        if (t.text.toLowerCase().includes(q)) {
            results.todo.push({ label: t.text, sub: 'To-Do List', action: () => showPage('todo') });
        }
    });
    (appData.finance?.transactions || []).forEach(t => {
        if (t.keterangan.toLowerCase().includes(q)) {
            results.keuangan.push({
                label: t.keterangan,
                sub: `Keuangan · ${t.kategori || ''}`,
                action: () => showPage('keuangan')
            });
        }
    });

    const groups = [
        { key: 'tmTugas', title: '📋 Modul Tugas' },
        { key: 'tmMateri', title: '📖 Modul Materi' },
        { key: 'mk', title: '📚 Mata Kuliah' },
        { key: 'tugas', title: '📝 Tugas (Pertemuan)' },
        { key: 'materi', title: '📦 Materi (Pertemuan)' },
        { key: 'catatan', title: '📝 Catatan' },
        { key: 'jurnal', title: '📓 Jurnal' },
        { key: 'todo', title: '✅ To-Do' },
        { key: 'keuangan', title: '💰 Keuangan' }
    ];
    let html = '', total = 0;
    groups.forEach(g => {
        const items = results[g.key];
        if (!items.length) return;
        total += items.length;
        html += `<div class="gsr-group-title">${g.title}</div>`;
        items.slice(0, 5).forEach((it, i) => {
            html += `<button class="gsr-item" data-gkey="${g.key}" data-gidx="${i}"><b>${escapeHtml(it.label)}</b><small>${escapeHtml(it.sub)}</small></button>`;
        });
    });
    if (!total) html = `<div class="gsr-empty">Tidak ditemukan hasil untuk "${escapeHtml(query)}"</div>`;
    panel.innerHTML = html;
    panel.classList.add('open');

    panel.querySelectorAll('.gsr-item').forEach(btn => {
        btn.onclick = () => {
            const gkey = btn.dataset.gkey;
            const gidx = parseInt(btn.dataset.gidx);
            results[gkey][gidx].action();
            panel.classList.remove('open');
            document.getElementById('global-search-input').value = '';
        };
    });
}

document.addEventListener('click', e => {
    const wrap = document.querySelector('.global-search-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const panel = document.getElementById('global-search-results');
        if (panel) panel.classList.remove('open');
    }
});

/* ================================================================
   PRINT CURRENT PAGE
   ================================================================ */
function printCurrentPage() {
    const originalTitle = document.title;
    const pageTitle = document.getElementById('page-title').textContent;
    document.title = 'MechLog - ' + pageTitle;
    window.print();
    document.title = originalTitle;
}

/* ================================================================
   BOOT
   ================================================================ */
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});
