/**
 * Client-side HTML5 Canvas generator for 9:16 (1080x1920) TMKOC Superfan Status Cards.
 * Pure local rendering with zero external CORS dependencies or video/image uploads.
 */
import { getAvatarInfo, getMonogramColor } from './avatars.js?v=41';

function traceRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, width, height, r);
        return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function drawFittedCenteredText(ctx, text, centerX, y, maxWidth, baseSize, minSize, fontWeight = 800, color = '#ffffff') {
    let size = baseSize;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    while (size > minSize) {
        ctx.font = `${fontWeight} ${size}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
        if (ctx.measureText(text).width <= maxWidth) break;
        size -= 2;
    }
    ctx.font = `${fontWeight} ${size}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
    ctx.fillText(text, centerX, y, maxWidth);
}

function drawStatTile(ctx, x, y, w, h, emoji, label, value, accentHex) {
    traceRoundRect(ctx, x, y, w, h, 32);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 34px "Plus Jakarta Sans", "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(emoji, x + 36, y + 60);

    ctx.font = '700 26px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(label.toUpperCase(), x + 36, y + 116);

    let valSize = 54;
    ctx.fillStyle = accentHex || '#ffffff';
    while (valSize > 32) {
        ctx.font = `900 ${valSize}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
        if (ctx.measureText(String(value)).width <= w - 72) break;
        valSize -= 2;
    }
    ctx.fillText(String(value), x + 36, y + 184, w - 72);
}

/**
 * Draw a 1080x1920 WhatsApp Status / Instagram Story certificate onto the target (or new) canvas.
 */
export async function generateFanCardCanvas(stats, targetCanvas = null) {
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) {}
    }

    const canvas = targetCanvas || document.createElement('canvas');
    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    const handle = String(stats.handle || '@TMKOCSuperfan').trim() || '@TMKOCSuperfan';
    const avatarInfo = getAvatarInfo(stats.avatarId);
    const accentColor = avatarInfo ? avatarInfo.color : '#f59e0b';
    const cx = W / 2;

    // 1. Rich background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#070b14');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#05070d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle atmospheric glows
    const topGlow = ctx.createRadialGradient(cx, 440, 40, cx, 440, 520);
    topGlow.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
    topGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, 1000);

    const botGlow = ctx.createRadialGradient(cx, 1500, 30, cx, 1500, 480);
    botGlow.addColorStop(0, 'rgba(37, 99, 235, 0.16)');
    botGlow.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = botGlow;
    ctx.fillRect(0, 1000, W, 920);

    // 2. Outer certificate border card
    traceRoundRect(ctx, 52, 56, W - 104, H - 112, 48);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.stroke();

    // Inner hairline accent
    traceRoundRect(ctx, 68, 72, W - 136, H - 144, 38);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // 3. Top Pill & Brand Title
    const pillW = 470;
    const pillH = 58;
    traceRoundRect(ctx, cx - pillW / 2, 136, pillW, pillH, 29);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.14)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.stroke();

    drawFittedCenteredText(ctx, '★ OFFICIAL SUPERFAN CERTIFICATE ★', cx, 166, pillW - 36, 22, 16, 800, '#fbbf24');
    drawFittedCenteredText(ctx, 'Daily Dose of TMKOC', cx, 260, W - 180, 58, 36, 900, '#ffffff');
    drawFittedCenteredText(ctx, 'Gokuldham Society Watch Archive', cx, 316, W - 200, 28, 20, 600, '#94a3b8');

    // Subtle divider
    ctx.beginPath();
    ctx.moveTo(180, 368);
    ctx.lineTo(W - 180, 368);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Centerpiece Avatar Medallion
    const medY = 540;
    const medR = 124;

    ctx.beginPath();
    ctx.arc(cx, medY, medR + 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, medY, medR, 0, Math.PI * 2);
    if (avatarInfo) {
        ctx.fillStyle = avatarInfo.bg;
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = accentColor;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '112px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        ctx.fillText(avatarInfo.emoji, cx, medY + 6);
    } else {
        ctx.fillStyle = getMonogramColor(handle);
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();

        const initial = [...handle][0]?.toUpperCase() || 'G';
        drawFittedCenteredText(ctx, initial, cx, medY + 4, 160, 108, 72, 900, '#ffffff');
    }

    // Character subtitle badge
    const charLabel = avatarInfo
        ? `${avatarInfo.name.toUpperCase()} • ${avatarInfo.tagline.toUpperCase()}`
        : 'GOKULDHAM RESIDENT BADGE';
    const charPillW = Math.min(620, Math.max(360, ctx.measureText(charLabel).width + 90));
    traceRoundRect(ctx, cx - charPillW / 2, 694, charPillW, 46, 23);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    drawFittedCenteredText(ctx, charLabel, cx, 718, charPillW - 36, 22, 14, 800, accentColor);

    // 5. Handle & Fan Tier
    drawFittedCenteredText(ctx, handle, cx, 804, W - 160, 68, 34, 900, '#ffffff');

    const tierText = `⭐ ${String(stats.fanTier || 'Gokuldham Resident').toUpperCase()}`;
    const tierW = 480;
    traceRoundRect(ctx, cx - tierW / 2, 864, tierW, 56, 28);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
    ctx.stroke();
    drawFittedCenteredText(ctx, tierText, cx, 893, tierW - 36, 24, 16, 800, '#fbbf24');

    // 6. Featured Global Rank Banner
    const rankBoxX = 110;
    const rankBoxY = 972;
    const rankBoxW = W - 220;
    const rankBoxH = 196;
    traceRoundRect(ctx, rankBoxX, rankBoxY, rankBoxW, rankBoxH, 34);
    const rankGrad = ctx.createLinearGradient(rankBoxX, rankBoxY, rankBoxX + rankBoxW, rankBoxY + rankBoxH);
    rankGrad.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
    rankGrad.addColorStop(1, 'rgba(217, 119, 6, 0.06)');
    ctx.fillStyle = rankGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.stroke();

    drawFittedCenteredText(ctx, 'GLOBAL LEADERBOARD STANDING', cx, rankBoxY + 56, rankBoxW - 60, 25, 18, 800, '#fcd34d');
    const rankDisplay = stats.rank ? `#${stats.rank}` : 'ACTIVE FAN';
    drawFittedCenteredText(ctx, rankDisplay, cx, rankBoxY + 128, rankBoxW - 60, 82, 46, 900, '#ffffff');

    // 7. 2x2 Bento Stats Grid
    const gridX = 110;
    const gridY = 1202;
    const gap = 26;
    const tileW = (W - 220 - gap) / 2;
    const tileH = 228;

    drawStatTile(ctx, gridX, gridY, tileW, tileH, '📺', 'Full Episodes', stats.watchedCount ?? 0, '#ffffff');
    drawStatTile(ctx, gridX + tileW + gap, gridY, tileW, tileH, '⏱️', 'Watch Time', stats.watchTimeText || '0s', '#34d399');

    const fourthEmoji = (stats.shortsCount || 0) > 0 ? '🎬' : '▶️';
    const fourthLabel = (stats.shortsCount || 0) > 0 ? 'Completed Clips' : 'Episodes Started';
    const fourthValue = (stats.shortsCount || 0) > 0 ? stats.shortsCount : (stats.uniqueStarted ?? 0);

    drawStatTile(ctx, gridX, gridY + tileH + gap, tileW, tileH, '🔥', 'Current Streak', `${stats.streakDays ?? 0} days`, '#fbbf24');
    drawStatTile(ctx, gridX + tileW + gap, gridY + tileH + gap, tileW, tileH, fourthEmoji, fourthLabel, fourthValue, '#60a5fa');

    // 8. Verification Footer
    const dateLabel = stats.dateStr || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    drawFittedCenteredText(ctx, `✓ Certified Watch Record  •  ${dateLabel}`, cx, 1734, W - 180, 26, 18, 700, '#10b981');
    drawFittedCenteredText(ctx, 'codemasterabhishek.github.io/Daily-Dose-of-TMOCK', cx, 1796, W - 180, 26, 18, 700, '#94a3b8');

    return canvas;
}

/**
 * Render and trigger a crisp PNG file download for the user's Superfan Status Card.
 */
export async function downloadFanCardPNG(stats) {
    const canvas = await generateFanCardCanvas(stats);
    const safeName = String(stats.handle || 'Superfan')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'Superfan';
    const filename = `TMKOC_Superfan_${safeName}.png`;

    await new Promise((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Could not generate PNG image.'));
                    return;
                }
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
                resolve();
            }, 'image/png');
        } else {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve();
        }
    });

    return filename;
}
