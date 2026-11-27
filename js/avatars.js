/**
 * Single source of truth for Gokuldham Character Avatars across Leaderboard, Comments, Sidebar, and Onboarding.
 */

export const STORAGE_USER_AVATAR = 'tmkoc_user_avatar';

export const GOKULDHAM_AVATARS = [
    { id: 'jethalal', name: 'Jethalal', emoji: '🥸', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', tagline: 'Gada Electronics' },
    { id: 'daya', name: 'Daya', emoji: '💃', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.16)', tagline: 'Garba Queen' },
    { id: 'bhide', name: 'Bhide', emoji: '📋', color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)', tagline: 'Ekameva Secretary' },
    { id: 'popatlal', name: 'Popatlal', emoji: '☂️', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.16)', tagline: 'Toofan Express' },
    { id: 'sodhi', name: 'Sodhi', emoji: '🥳', color: '#f97316', bg: 'rgba(249, 115, 22, 0.16)', tagline: 'Balle Balle!' },
    { id: 'babita', name: 'Babita', emoji: '✨', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)', tagline: 'Gokuldham Glam' },
    { id: 'champaklal', name: 'Bapuji', emoji: '🦯', color: '#d97706', bg: 'rgba(217, 119, 6, 0.16)', tagline: 'Champak Chacha' },
    { id: 'tapu', name: 'Tapu', emoji: '🏏', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.16)', tagline: 'Tapu Sena Captain' },
    { id: 'hathi', name: 'Dr. Hathi', emoji: '🍔', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.16)', tagline: 'Sahi Baat Hai!' },
    { id: 'mehta', name: 'Mehta Saheb', emoji: '✒️', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.16)', tagline: 'Fire Brigade' }
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
 * Render an accessible circular avatar badge HTML string (either character emblem or handle monogram).
 */
export function renderAvatarBadgeHTML(avatarId, handle = 'G', size = 'md', extraClass = '', idAttr = '') {
    const info = getAvatarInfo(avatarId);
    const idFragment = idAttr ? ` id="${escapeAttr(idAttr)}"` : '';
    const sizeClass = `gokuldham-avatar--${size}`;

    if (info) {
        return `<span${idFragment} class="gokuldham-avatar ${sizeClass} ${extraClass}" data-avatar-id="${info.id}" title="${escapeAttr(info.name)} (${escapeAttr(info.tagline)})" style="background: ${info.bg}; border-color: ${info.color}; color: ${info.color};">${info.emoji}</span>`;
    }

    const cleanHandle = String(handle || 'G').trim() || 'G';
    const initial = [...cleanHandle][0]?.toUpperCase() || 'G';
    const bg = getMonogramColor(cleanHandle);
    return `<span${idFragment} class="gokuldham-avatar ${sizeClass} gokuldham-avatar--monogram ${extraClass}" data-avatar-id="default" title="${escapeAttr(cleanHandle)}" style="background-color: ${bg};">${escapeAttr(initial)}</span>`;
}

/**
 * Render the interactive Gokuldham character picker grid (including a Default initial option).
 */
export function renderAvatarPickerHTML(selectedId = 'default', compact = false) {
    const active = normalizeAvatarId(selectedId);
    const defaultBtn = `
        <button type="button" class="avatar-picker-option ${active === 'default' ? 'is-selected' : ''}" data-avatar-choice="default" role="radio" aria-checked="${active === 'default'}" title="Default Initial">
            <span class="avatar-picker-emoji">🔤</span>
            ${compact ? '' : '<span class="avatar-picker-label">Initial</span>'}
        </button>
    `;
    const charBtns = GOKULDHAM_AVATARS.map(a => {
        const isSel = active === a.id;
        return `
            <button type="button" class="avatar-picker-option ${isSel ? 'is-selected' : ''}" data-avatar-choice="${a.id}" role="radio" aria-checked="${isSel}" title="${escapeAttr(a.name)} — ${escapeAttr(a.tagline)}" style="--avatar-accent: ${a.color};">
                <span class="avatar-picker-emoji">${a.emoji}</span>
                ${compact ? '' : `<span class="avatar-picker-label">${escapeAttr(a.name)}</span>`}
            </button>
        `;
    }).join('');
    return defaultBtn + charBtns;
}
