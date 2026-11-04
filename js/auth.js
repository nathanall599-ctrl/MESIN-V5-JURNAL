/* ================================================================
   MechLog v7 — Authentication Module
   Client-side auth dengan SHA-256 hashing (subtle.crypto)
   Disimpan di localStorage — bukan untuk production!
   ================================================================ */
(function () {
    'use strict';

    const SALT = 'mechlog_v7_secure_salt_2026';
    const USERS_KEY = 'mechlog_users';
    const SESSION_KEY = 'mechlog_session';

    async function sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text + SALT);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function getUsers() {
        try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); }
        catch (e) { return {}; }
    }

    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    async function register(email, password, profile) {
        email = (email || '').trim().toLowerCase();
        if (!email) throw new Error('Email wajib diisi');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Format email tidak valid');
        if (!password || password.length < 6) throw new Error('Password minimal 6 karakter');

        const users = getUsers();
        if (users[email]) throw new Error('Email sudah terdaftar. Silakan masuk.');

        const passwordHash = await sha256(password);
        users[email] = {
            email,
            passwordHash,
            profile: {
                nama: profile.nama || '',
                nim: profile.nim || '',
                jurusan: profile.jurusan || '',
                fakultas: profile.fakultas || '',
                universitas: profile.universitas || '',
                avatar: null
            },
            createdAt: new Date().toISOString()
        };
        saveUsers(users);
        return users[email];
    }

    async function login(email, password) {
        email = (email || '').trim().toLowerCase();
        if (!email || !password) throw new Error('Email dan password wajib diisi');

        const users = getUsers();
        const user = users[email];
        if (!user) throw new Error('Email belum terdaftar');

        const passwordHash = await sha256(password);
        if (user.passwordHash !== passwordHash) throw new Error('Password salah');

        sessionStorage.setItem(SESSION_KEY, email);
        return user;
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.href = 'index.html';
    }

    function getCurrentUser() {
        const email = sessionStorage.getItem(SESSION_KEY);
        if (!email) return null;
        const users = getUsers();
        return users[email] || null;
    }

    function isLoggedIn() {
        return !!getCurrentUser();
    }

    async function updateProfile(updates) {
        const current = getCurrentUser();
        if (!current) throw new Error('Sesi tidak ditemukan');
        const users = getUsers();
        if (!users[current.email]) throw new Error('User tidak ditemukan');
        Object.assign(users[current.email].profile, updates);
        saveUsers(users);
        return users[current.email];
    }

    async function changePassword(oldPassword, newPassword) {
        const current = getCurrentUser();
        if (!current) throw new Error('Sesi tidak ditemukan');
        const users = getUsers();
        const user = users[current.email];
        const oldHash = await sha256(oldPassword);
        if (user.passwordHash !== oldHash) throw new Error('Password lama salah');
        if (!newPassword || newPassword.length < 6) throw new Error('Password baru minimal 6 karakter');
        user.passwordHash = await sha256(newPassword);
        saveUsers(users);
        return true;
    }

    window.MechAuth = {
        register,
        login,
        logout,
        getCurrentUser,
        isLoggedIn,
        updateProfile,
        changePassword,
        getUsers
    };
})();
