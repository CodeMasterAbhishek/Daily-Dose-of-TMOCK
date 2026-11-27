/**
 * Single source of truth for Gokuldham Character Avatars across Leaderboard, Comments, Sidebar, and Onboarding.
 */

export const STORAGE_USER_AVATAR = 'tmkoc_user_avatar';

export const GOKULDHAM_AVATARS = [
    { id: 'jethalal', name: 'Jethalal', photo: 'assets/avatars/jethalal.png?v=44', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', tagline: 'Gada Electronics' },
    { id: 'daya', name: 'Daya', photo: 'assets/avatars/daya.png?v=44', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.16)', tagline: 'Garba Queen' },
    { id: 'bhide', name: 'Bhide', photo: 'assets/avatars/bhide.png?v=44', color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)', tagline: 'Ekameva Secretary' },
    { id: 'popatlal', name: 'Popatlal', photo: 'assets/avatars/popatlal.png?v=44', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.16)', tagline: 'Toofan Express' },
    { id: 'sodhi', name: 'Sodhi', photo: 'assets/avatars/sodhi.png?v=44', color: '#f97316', bg: 'rgba(249, 115, 22, 0.16)', tagline: 'Balle Balle!' },
    { id: 'babita', name: 'Babita', photo: 'assets/avatars/babita.png?v=44', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)', tagline: 'Gokuldham Glam' },
    { id: 'champaklal', name: 'Bapuji', photo: 'assets/avatars/champaklal.png?v=44', color: '#d97706', bg: 'rgba(217, 119, 6, 0.16)', tagline: 'Champak Chacha' },
    { id: 'tapu', name: 'Tapu', photo: 'assets/avatars/tapu.png?v=44', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.16)', tagline: 'Tapu Sena Captain' },
    { id: 'hathi', name: 'Dr. Hathi', photo: 'assets/avatars/hathi.png?v=44', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.16)', tagline: 'Sahi Baat Hai!' },
    { id: 'mehta', name: 'Mehta Saheb', photo: 'assets/avatars/mehta.png?v=44', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.16)', tagline: 'Fire Brigade' }
];

const AVATAR_MAP = new Map(GOKULDHAM_AVATARS.map(a => [a.id, a]));
const MONOGRAM_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

function escapeAttr(str) {
    return String(str || '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

export function isValidAvatarId(id) {
    const clean = String(id || '').trim().toLowerCase();
    return clean === 'default' || AVATAR_MAP.has(clean);
}

export function normalizeAvatarId(id) {
    const clean = String(id || '').trim().toLowerCase();
    return isValidAvatarId(clean) ? clean : 'default';
}

export function getSelectedAvatarId() {
    try {
        return normalizeAvatarId(localStorage.getItem(STORAGE_USER_AVATAR) || 'default');
    } catch (e) {
        return 'default';
    }
}

export function setSelectedAvatarId(avatarId) {
    const clean = normalizeAvatarId(avatarId);
    try {
        localStorage.setItem(STORAGE_USER_AVATAR, clean);
    } catch (e) {}
    return clean;
}

export function getAvatarInfo(avatarId) {
    return AVATAR_MAP.get(normalizeAvatarId(avatarId)) || null;
}

export function getMonogramColor(handle) {
    const str = String(handle || 'G');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
}

/**
 * Render an accessible circular avatar badge HTML string (either character portrait or handle monogram).
 */
export function renderAvatarBadgeHTML(avatarId, handle = 'G', size = 'md', extraClass = '', idAttr = '') {
    const info = getAvatarInfo(avatarId);
    const idFragment = idAttr ? ` id="${escapeAttr(idAttr)}"` : '';
    const sizeClass = `gokuldham-avatar--${size}`;

    if (info && info.photo) {
        return `<span${idFragment} class="gokuldham-avatar gokuldham-avatar--photo ${sizeClass} ${extraClass}" data-avatar-id="${info.id}" title="${escapeAttr(info.name)} (${escapeAttr(info.tagline)})" style="background: ${info.bg}; border-color: ${info.color};"><img src="${escapeAttr(info.photo)}" alt="${escapeAttr(info.name)}" class="gokuldham-avatar-img" loading="lazy"></span>`;
    }

    const cleanHandle = String(handle || 'G').trim() || 'G';
    const initial = [...cleanHandle][0]?.toUpperCase() || 'G';
    const bg = getMonogramColor(cleanHandle);
    return `<span${idFragment} class="gokuldham-avatar ${sizeClass} gokuldham-avatar--monogram ${extraClass}" data-avatar-id="default" title="${escapeAttr(cleanHandle)}" style="background-color: ${bg};">${escapeAttr(initial)}</span>`;
}

/**
 * Render the interactive circular portrait avatar picker grid (including a Default monogram option).
 */
export function renderAvatarPickerHTML(selectedId = 'default', compact = false) {
    const active = normalizeAvatarId(selectedId);
    const defaultBtn = `
        <button type="button" class="avatar-picker-option ${active === 'default' ? 'is-selected' : ''}" data-avatar-choice="default" role="radio" aria-checked="${active === 'default'}" title="Initial Monogram" style="--avatar-accent: #6366f1;">
            <span class="avatar-picker-ring avatar-picker-ring--initial" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            ${compact ? '' : '<span class="avatar-picker-label">Initial</span>'}
        </button>
    `;
    const charBtns = GOKULDHAM_AVATARS.map(a => {
        const isSel = active === a.id;
        return `
            <button type="button" class="avatar-picker-option ${isSel ? 'is-selected' : ''}" data-avatar-choice="${a.id}" role="radio" aria-checked="${isSel}" title="${escapeAttr(a.name)} — ${escapeAttr(a.tagline)}" style="--avatar-accent: ${a.color};">
                <span class="avatar-picker-ring">
                    <img src="${escapeAttr(a.photo)}" alt="${escapeAttr(a.name)}" class="avatar-picker-photo" loading="lazy">
                </span>
                ${compact ? '' : `<span class="avatar-picker-label">${escapeAttr(a.name)}</span>`}
            </button>
        `;
    }).join('');
    return defaultBtn + charBtns;
}
