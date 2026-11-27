/**
 * Single source of truth for Gokuldham Character Avatars across Leaderboard, Comments, Sidebar, and Onboarding.
 */

export const STORAGE_USER_AVATAR = 'tmkoc_user_avatar';

export const GOKULDHAM_AVATARS = [
    { id: 'jethalal', name: 'Jethalal', photo: 'assets/avatars/jethalal.png?v=43', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', tagline: 'Gada Electronics' },
    { id: 'sodhi', name: 'Sodhi', photo: 'assets/avatars/sodhi.png?v=43', color: '#f97316', bg: 'rgba(249, 115, 22, 0.16)', tagline: 'Balle Balle!' },
    { id: 'babita', name: 'Babita', photo: 'assets/avatars/babita.png?v=43', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)', tagline: 'Gokuldham Glam' }
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
