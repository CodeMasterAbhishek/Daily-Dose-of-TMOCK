"""
Gokuldham Avatar Studio - Interactive Face Cropper & Avatar Adjuster
Runs a lightweight local web server on http://127.0.0.1:5050 allowing the user
to select, pan, zoom, rotate, and save exact character avatar faces one by one.
"""

import http.server
import socketserver
import json
import os
import sys
import re
import base64
import urllib.parse
import webbrowser
from io import BytesIO

PORT = 5050
WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
AVATARS_DIR = os.path.join(WORKSPACE_DIR, 'assets', 'avatars')
BRAIN_DIR = r'C:\Users\perso\.gemini\antigravity\brain\e95d3760-3d6b-4f6a-980e-abd00ddd20da'
USER_UPLOADED_DIR = os.path.join(BRAIN_DIR, '.user_uploaded')
DOWNLOADED_REFS_DIR = os.path.join(BRAIN_DIR, 'scratch', 'downloaded_refs')
STUDIO_UPLOADS_DIR = os.path.join(BRAIN_DIR, 'scratch', 'studio_uploads')
os.makedirs(STUDIO_UPLOADS_DIR, exist_ok=True)

# 37 Gokuldham characters in exact display order
CHARACTERS = [
    { "id": "jethalal", "name": "Jethalal", "color": "#f59e0b", "bg": "rgba(245, 158, 11, 0.16)", "tagline": "Gada Electronics" },
    { "id": "daya", "name": "Daya", "color": "#ec4899", "bg": "rgba(236, 72, 153, 0.16)", "tagline": "Garba Queen" },
    { "id": "champaklal", "name": "Bapuji", "color": "#eab308", "bg": "rgba(234, 179, 8, 0.16)", "tagline": "Champak Chacha" },
    { "id": "tapu", "name": "Tapu", "color": "#ef4444", "bg": "rgba(239, 68, 68, 0.16)", "tagline": "Tapu Sena Captain" },
    { "id": "mehta", "name": "Taarak", "color": "#10b981", "bg": "rgba(16, 185, 129, 0.16)", "tagline": "Fire Brigade & Writer" },
    { "id": "anjali", "name": "Anjali", "color": "#f97316", "bg": "rgba(249, 115, 22, 0.16)", "tagline": "Diet Specialist" },
    { "id": "bhide", "name": "Bhide", "color": "#d97706", "bg": "rgba(217, 119, 6, 0.16)", "tagline": "Ekameva Secretary" },
    { "id": "madhavi", "name": "Madhavi", "color": "#f59e0b", "bg": "rgba(245, 158, 11, 0.16)", "tagline": "Achar Papad Queen" },
    { "id": "sonu", "name": "Sonu", "color": "#ec4899", "bg": "rgba(236, 72, 153, 0.16)", "tagline": "Tapu Sena" },
    { "id": "sodhi", "name": "Sodhi", "color": "#0284c7", "bg": "rgba(2, 132, 199, 0.16)", "tagline": "Balle Balle!" },
    { "id": "roshan", "name": "Roshan", "color": "#be185d", "bg": "rgba(190, 24, 93, 0.16)", "tagline": "Roshan Bhabhi" },
    { "id": "gogi", "name": "Gogi", "color": "#06b6d4", "bg": "rgba(6, 182, 212, 0.16)", "tagline": "Chhota Sardar" },
    { "id": "hathi", "name": "Dr. Hathi", "color": "#4338ca", "bg": "rgba(67, 56, 202, 0.16)", "tagline": "Sahi Baat Hai!" },
    { "id": "komal", "name": "Komal", "color": "#a855f7", "bg": "rgba(168, 85, 247, 0.16)", "tagline": "Oh Come On!" },
    { "id": "goli", "name": "Goli", "color": "#ea580c", "bg": "rgba(234, 88, 12, 0.16)", "tagline": "Khaane Ka Shaukeen" },
    { "id": "iyer", "name": "Iyer", "color": "#7c3aed", "bg": "rgba(124, 58, 237, 0.16)", "tagline": "Scientist" },
    { "id": "babita", "name": "Babita", "color": "#db2777", "bg": "rgba(219, 39, 119, 0.16)", "tagline": "Gokuldham Glam" },
    { "id": "popatlal", "name": "Popatlal", "color": "#f97316", "bg": "rgba(249, 115, 22, 0.16)", "tagline": "Duniya Hila Dunga!" },
    { "id": "pinku", "name": "Pinku", "color": "#059669", "bg": "rgba(5, 150, 105, 0.16)", "tagline": "Tapu Sena" },
    { "id": "abdul", "name": "Abdul", "color": "#d97706", "bg": "rgba(217, 119, 6, 0.16)", "tagline": "All-in-One Soda Shop" },
    { "id": "nattukaka", "name": "Nattu Kaka", "color": "#0d9488", "bg": "rgba(13, 148, 136, 0.16)", "tagline": "Sethji Salary Badhao!" },
    { "id": "bagha", "name": "Bagha", "color": "#e11d48", "bg": "rgba(225, 29, 72, 0.16)", "tagline": "Jaisi Jiski Soch" },
    { "id": "bawri", "name": "Bawri", "color": "#0d9488", "bg": "rgba(13, 148, 136, 0.16)", "tagline": "Galti Se Mistake" },
    { "id": "chalupandey", "name": "Chalu Pandey", "color": "#991b1b", "bg": "rgba(153, 27, 27, 0.16)", "tagline": "Inspector Chalu Pandey" },
    { "id": "sundar", "name": "Sundar", "color": "#059669", "bg": "rgba(5, 150, 105, 0.16)", "tagline": "Sundar Topi King" },
    { "id": "magan", "name": "Magan", "color": "#475569", "bg": "rgba(71, 85, 105, 0.16)", "tagline": "Gada Electronics" },
    { "id": "rita", "name": "Rita", "color": "#0284c7", "bg": "rgba(2, 132, 199, 0.16)", "tagline": "Kal Tak Reporter" },
    { "id": "asitmodi", "name": "Asit Modi", "color": "#6366f1", "bg": "rgba(99, 102, 241, 0.16)", "tagline": "Creator of Gokuldham" },
    { "id": "baka", "name": "Baka", "color": "#eab308", "bg": "rgba(234, 179, 8, 0.16)", "tagline": "Kem Palanpur!" },
    { "id": "gafur", "name": "Gafur Ghisela", "color": "#dc2626", "bg": "rgba(220, 38, 38, 0.16)", "tagline": "Ghisela Bhai" },
    { "id": "mohanlal", "name": "Mohanlal", "color": "#16a34a", "bg": "rgba(22, 163, 74, 0.16)", "tagline": "Matka King" },
    { "id": "jaldevta", "name": "Jaldevta", "color": "#0284c7", "bg": "rgba(2, 132, 199, 0.16)", "tagline": "Paani Bachao!" },
    { "id": "mrdiwan", "name": "Mr. Diwan", "color": "#1e3a8a", "bg": "rgba(30, 58, 138, 0.16)", "tagline": "Secret Agent Diwan" },
    { "id": "ratan", "name": "Ratan", "color": "#2563eb", "bg": "rgba(37, 99, 235, 0.16)", "tagline": "Saree Merchant" },
    { "id": "roopa", "name": "Roopa", "color": "#e11d48", "bg": "rgba(225, 29, 72, 0.16)", "tagline": "Roopa Binjola" },
    { "id": "veer", "name": "Veer", "color": "#f59e0b", "bg": "rgba(245, 158, 11, 0.16)", "tagline": "Veer Binjola" },
    { "id": "bansari", "name": "Bansari", "color": "#db2777", "bg": "rgba(219, 39, 119, 0.16)", "tagline": "Bansari Binjola" }
]

def get_character_sources(char_id):
    sources = []
    # 1. Custom uploaded sources
    custom_dir = os.path.join(STUDIO_UPLOADS_DIR, char_id)
    if os.path.exists(custom_dir):
        for f in os.listdir(custom_dir):
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                sources.append({
                    "name": f"Uploaded: {f}",
                    "type": "custom",
                    "file": f"{char_id}/{f}",
                    "isDefault": True
                })

    # 2. Known raw high-res source images
    known_refs = {
        'baka': [
            {"name": "⭐ New Portrait Photo (Uploaded)", "type": "uploaded", "file": "media_1795814747511_69dd62b7.jpg", "isDefault": True},
            {"name": "Previous Raw Photo", "type": "uploaded", "file": "media_1795804166421_368a9f1f.jpg"}
        ],
        'mrdiwan': [
            {"name": "⭐ Indoor High-Res Photo", "type": "uploaded", "file": "media_1795810513754_5ebf3616.jpg", "isDefault": True}
        ],
        'jaldevta': [
            {"name": "⭐ Indoor Sequence Photo", "type": "uploaded", "file": "media_1795810752382_e25eaace.jpg", "isDefault": True}
        ],
        'veer': [
            {"name": "⭐ Indoor Sequence Photo", "type": "uploaded", "file": "media_1795810839663_afdd175a.png", "isDefault": True}
        ],
        'bansari': [
            {"name": "⭐ Indoor Sequence Photo", "type": "uploaded", "file": "media_1795810839663_afdd175a.png", "isDefault": True}
        ],
        'ratan': [
            {"name": "⭐ Instagram Source Photo", "type": "ref", "file": "ratan.jpg", "isDefault": True}
        ],
        'roopa': [
            {"name": "⭐ ABP Live Group Photo (Solo Roopa on left)", "type": "ref", "file": "roopa.jpg", "isDefault": True}
        ],
        'goli': [
            {"name": "⭐ Patrika Article Photo", "type": "ref", "file": "goli.jpg", "isDefault": True}
        ],
        'tapu': [
            {"name": "⭐ Koimoi Article Photo", "type": "ref", "file": "tapu.jpg", "isDefault": True}
        ],
        'anjali': [
            {"name": "⭐ Pinterest Photo", "type": "ref", "file": "anjali.jpg", "isDefault": True}
        ],
        'roshan': [
            {"name": "⭐ Instagram Photo", "type": "ref", "file": "roshan.jpg", "isDefault": True}
        ],
        'gafur': [
            {"name": "⭐ Navbharat Times Photo", "type": "ref", "file": "gafur.jpg", "isDefault": True}
        ],
        'mohanlal': [
            {"name": "⭐ Reddit Photo", "type": "ref", "file": "mohanlal.jpg", "isDefault": True}
        ]
    }

    if char_id in known_refs:
        for ref in known_refs[char_id]:
            # Verify file actually exists
            file_path = None
            if ref['type'] == 'uploaded':
                file_path = os.path.join(USER_UPLOADED_DIR, ref['file'])
            elif ref['type'] == 'ref':
                file_path = os.path.join(DOWNLOADED_REFS_DIR, ref['file'])
            if file_path and os.path.exists(file_path):
                sources.append(ref)

    # 3. Always include Current Avatar
    cur_avatar = os.path.join(AVATARS_DIR, f"{char_id}.png")
    if os.path.exists(cur_avatar):
        is_default = len(sources) == 0
        sources.append({
            "name": "Current Avatar (assets/avatars)",
            "type": "avatar",
            "file": f"{char_id}.png",
            "isDefault": is_default
        })

    return sources

def resolve_image_path(src_type, file_name):
    if src_type == 'avatar':
        return os.path.join(AVATARS_DIR, file_name)
    elif src_type == 'uploaded':
        return os.path.join(USER_UPLOADED_DIR, file_name)
    elif src_type == 'ref':
        return os.path.join(DOWNLOADED_REFS_DIR, file_name)
    elif src_type == 'custom':
        return os.path.join(STUDIO_UPLOADS_DIR, file_name)
    return None

STUDIO_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gokuldham Avatar Studio</title>
    <style>
        :root {
            --bg-dark: #0f172a;
            --panel-bg: #1e293b;
            --panel-border: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #f59e0b;
            --accent-glow: rgba(245, 158, 11, 0.25);
            --success: #10b981;
            --primary: #3b82f6;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg-dark);
            color: var(--text-main);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            user-select: none;
        }
        header {
            background: #1e293b;
            border-bottom: 1px solid var(--panel-border);
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 50;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .brand h1 {
            font-size: 1.25rem;
            font-weight: 700;
            background: linear-gradient(135deg, #f59e0b, #ec4899);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .brand .badge {
            background: #334155;
            color: #f1f5f9;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .header-controls {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .char-nav {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #0f172a;
            padding: 4px 8px;
            border-radius: 8px;
            border: 1px solid #334155;
        }
        select.char-select {
            background: #1e293b;
            color: #fff;
            border: 1px solid #475569;
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            outline: none;
        }
        .nav-btn {
            background: #334155;
            color: #fff;
            border: none;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        .nav-btn:hover { background: #475569; }
        .nav-btn:active { transform: scale(0.96); }

        /* Main Workspace */
        main {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 380px;
            gap: 24px;
            padding: 24px;
            max-width: 1440px;
            margin: 0 auto;
            width: 100%;
        }
        @media (max-width: 1024px) {
            main { grid-template-columns: 1fr; }
        }

        .studio-card {
            background: var(--panel-bg);
            border: 1px solid var(--panel-border);
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        /* Canvas Viewport */
        .viewport-wrapper {
            position: relative;
            width: 100%;
            height: 520px;
            background: #020617;
            border-radius: 10px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #1e293b;
            cursor: grab;
        }
        .viewport-wrapper.grabbing { cursor: grabbing; }
        canvas#studio-canvas {
            display: block;
            touch-action: none;
        }
        .canvas-hint {
            position: absolute;
            bottom: 12px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(4px);
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 0.75rem;
            color: #94a3b8;
            pointer-events: none;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* Controls Toolbar */
        .controls-toolbar {
            display: flex;
            flex-direction: column;
            gap: 14px;
            background: #0f172a;
            padding: 16px;
            border-radius: 8px;
            border: 1px solid #1e293b;
        }
        .control-row {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .control-label {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-muted);
            width: 80px;
            flex-shrink: 0;
        }
        .slider-wrapper {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        input[type="range"] {
            flex: 1;
            accent-color: var(--accent);
            cursor: pointer;
        }
        .value-pill {
            font-size: 0.8rem;
            font-family: monospace;
            background: #1e293b;
            padding: 2px 8px;
            border-radius: 4px;
            color: #e2e8f0;
            min-width: 50px;
            text-align: center;
        }
        .btn-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .action-btn {
            background: #1e293b;
            color: #f1f5f9;
            border: 1px solid #334155;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .action-btn:hover {
            background: #334155;
            border-color: #475569;
        }
        .action-btn:active { transform: scale(0.97); }

        /* Source selector pills */
        .source-selector {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .source-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .source-pill {
            background: #0f172a;
            border: 1px solid #334155;
            color: #cbd5e1;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.15s;
        }
        .source-pill.active {
            background: #1e3a8a;
            border-color: #3b82f6;
            color: #fff;
            font-weight: 600;
        }

        /* Right Panel: Live Preview & Save */
        .preview-sidebar {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .char-info-box {
            display: flex;
            align-items: center;
            gap: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--panel-border);
        }
        .char-info-box .avatar-mini {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            overflow: hidden;
            border: 3px solid var(--accent);
            flex-shrink: 0;
            background: rgba(245, 158, 11, 0.15);
        }
        .char-info-box .avatar-mini img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .char-info-box .details h2 {
            font-size: 1.15rem;
            font-weight: 700;
            color: #fff;
        }
        .char-info-box .details p {
            font-size: 0.85rem;
            color: var(--text-muted);
        }

        .preview-section {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .preview-section h3 {
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
        }

        .badge-grid {
            display: flex;
            align-items: flex-end;
            justify-content: space-around;
            background: #0f172a;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #1e293b;
        }
        .badge-preview-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .badge-preview-item span.size-label {
            font-size: 0.7rem;
            color: var(--text-muted);
            font-family: monospace;
        }

        /* Simulated Badge Circles */
        .live-circle {
            border-radius: 50%;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid var(--accent);
            background: rgba(245, 158, 11, 0.15);
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
        }
        .live-circle.large { width: 110px; height: 110px; border-width: 4px; }
        .live-circle.medium { width: 68px; height: 68px; border-width: 3px; }
        .live-circle.small { width: 42px; height: 42px; border-width: 2px; }
        .live-circle canvas { width: 100%; height: 100%; }

        /* Mockup Leaderboard row */
        .mockup-row {
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .mockup-row .rank {
            font-weight: 700;
            color: #eab308;
            font-size: 0.95rem;
            width: 24px;
        }
        .mockup-row .name-wrap {
            flex: 1;
        }
        .mockup-row .name-wrap .name {
            font-size: 0.9rem;
            font-weight: 600;
            color: #fff;
        }
        .mockup-row .name-wrap .stat {
            font-size: 0.75rem;
            color: var(--text-muted);
        }

        /* Action Buttons */
        .save-controls {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: auto;
        }
        .btn-save-primary {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #fff;
            border: none;
            padding: 14px;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.15s;
        }
        .btn-save-primary:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
        }
        .btn-save-primary:active { transform: translateY(0); }

        .btn-save-next {
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: #fff;
            border: none;
            padding: 12px;
            border-radius: 8px;
            font-size: 0.95rem;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.15s;
        }
        .btn-save-next:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
        }
        .btn-save-next:active { transform: translateY(0); }

        .btn-download-fallback {
            background: transparent;
            color: var(--text-muted);
            border: 1px solid #334155;
            padding: 8px;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            text-align: center;
        }
        .btn-download-fallback:hover {
            background: #1e293b;
            color: #fff;
        }

        /* Toast notification */
        #toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #10b981;
            color: #fff;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 999;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #toast.show {
            transform: translateY(0);
            opacity: 1;
        }
        #toast.error { background: #ef4444; }
    </style>
</head>
<body>
    <header>
        <div class="brand">
            <h1>🎬 Gokuldham Avatar Studio</h1>
            <span class="badge" id="progress-badge">37 Characters</span>
        </div>
        <div class="header-controls">
            <div class="char-nav">
                <button class="nav-btn" id="prev-btn" title="Previous Character (Left Arrow)">◀ Prev</button>
                <select id="char-select" class="char-select"></select>
                <button class="nav-btn" id="next-btn" title="Next Character (Right Arrow)">Next ▶</button>
            </div>
        </div>
    </header>

    <main>
        <!-- Left: Interactive Studio Canvas -->
        <div class="studio-card">
            <div class="source-selector">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.85rem; font-weight:600; color:var(--text-muted);">Choose Source Photo:</span>
                    <label class="action-btn" style="cursor:pointer;">
                        📁 Upload Any Image from PC
                        <input type="file" id="custom-file-input" accept="image/*" style="display:none;">
                    </label>
                </div>
                <div class="source-pills" id="source-pills-container"></div>
            </div>

            <div class="viewport-wrapper" id="viewport-wrapper">
                <canvas id="studio-canvas" width="500" height="500"></canvas>
                <div class="canvas-hint">🖱️ Drag to pan • Scroll to zoom • Paste (Ctrl+V) from clipboard</div>
            </div>

            <!-- Controls Toolbar -->
            <div class="controls-toolbar">
                <div class="control-row">
                    <span class="control-label">🔍 Zoom</span>
                    <div class="slider-wrapper">
                        <button class="action-btn" id="zoom-out-btn" style="padding:4px 8px;">−</button>
                        <input type="range" id="zoom-slider" min="0.2" max="4.0" step="0.01" value="1.0">
                        <button class="action-btn" id="zoom-in-btn" style="padding:4px 8px;">+</button>
                        <span class="value-pill" id="zoom-val">1.00x</span>
                    </div>
                </div>

                <div class="control-row">
                    <span class="control-label">🔄 Rotate</span>
                    <div class="slider-wrapper">
                        <input type="range" id="rotate-slider" min="-180" max="180" step="1" value="0">
                        <span class="value-pill" id="rotate-val">0°</span>
                        <button class="action-btn" id="reset-rot-btn" style="padding:4px 8px;" title="Reset Rotation">0°</button>
                    </div>
                </div>

                <div class="control-row" style="margin-top: 4px;">
                    <span class="control-label">⚡ Presets</span>
                    <div class="btn-group">
                        <button class="action-btn" id="center-face-btn">🎯 Center</button>
                        <button class="action-btn" id="fit-width-btn">↔️ Fit</button>
                        <button class="action-btn" id="rot-90-left-btn">↺ -90°</button>
                        <button class="action-btn" id="rot-90-right-btn">↻ +90°</button>
                        <button class="action-btn" id="flip-h-btn">🪞 Flip H</button>
                        <button class="action-btn" id="reset-all-btn">↺ Reset All</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Right: Real-time Live Badge Previews & Save Button -->
        <div class="studio-card preview-sidebar">
            <div class="char-info-box">
                <div class="avatar-mini" id="mini-current-badge">
                    <img id="mini-current-img" src="" alt="">
                </div>
                <div class="details">
                    <h2 id="active-char-name">Character Name</h2>
                    <p id="active-char-tagline">Tagline</p>
                </div>
            </div>

            <div class="preview-section">
                <h3>Live Gokuldham Badges</h3>
                <div class="badge-grid">
                    <div class="badge-preview-item">
                        <div class="live-circle large" id="live-circle-lg">
                            <canvas id="prev-canvas-lg" width="110" height="110"></canvas>
                        </div>
                        <span class="size-label">Profile (110px)</span>
                    </div>
                    <div class="badge-preview-item">
                        <div class="live-circle medium" id="live-circle-md">
                            <canvas id="prev-canvas-md" width="68" height="68"></canvas>
                        </div>
                        <span class="size-label">Leaderboard (68px)</span>
                    </div>
                    <div class="badge-preview-item">
                        <div class="live-circle small" id="live-circle-sm">
                            <canvas id="prev-canvas-sm" width="42" height="42"></canvas>
                        </div>
                        <span class="size-label">Nav (42px)</span>
                    </div>
                </div>
            </div>

            <div class="preview-section">
                <h3>In-App Appearance</h3>
                <div class="mockup-row">
                    <span class="rank">#1</span>
                    <div class="live-circle small" id="mockup-circle">
                        <canvas id="prev-canvas-mock" width="42" height="42"></canvas>
                    </div>
                    <div class="name-wrap">
                        <div class="name" id="mockup-name">Jethalal</div>
                        <div class="stat">Gokuldham Superfan • 131 Episodes</div>
                    </div>
                </div>
            </div>

            <!-- Save Action Buttons -->
            <div class="save-controls">
                <button class="btn-save-primary" id="save-btn">
                    💾 Save Avatar to Project
                </button>
                <button class="btn-save-next" id="save-next-btn">
                    💾 Save & Next Character ➔
                </button>
                <button class="btn-download-fallback" id="download-btn">
                    ⬇️ Download 256x256 PNG to PC
                </button>
            </div>
        </div>
    </main>

    <div id="toast">✅ Avatar saved successfully!</div>

    <script>
        // State
        let characters = [];
        let currentIndex = 0; // Starts with Baka by default
        let currentSources = [];
        let activeSourceIndex = 0;

        let activeImage = new Image();
        let isImageLoaded = false;

        // Transform parameters
        let imgX = 250;
        let imgY = 250;
        let scale = 1.0;
        let rotation = 0;
        let flipH = false;

        // Dragging state
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let imgStartX = 0;
        let imgStartY = 0;

        const canvas = document.getElementById('studio-canvas');
        const ctx = canvas.getContext('2d');
        const wrapper = document.getElementById('viewport-wrapper');

        // Offscreen export canvas (exact 256x256 target)
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 256;
        exportCanvas.height = 256;
        const expCtx = exportCanvas.getContext('2d');

        // Preview canvases
        const prevCanvasLg = document.getElementById('prev-canvas-lg');
        const prevCtxLg = prevCanvasLg.getContext('2d');
        const prevCanvasMd = document.getElementById('prev-canvas-md');
        const prevCtxMd = prevCanvasMd.getContext('2d');
        const prevCanvasSm = document.getElementById('prev-canvas-sm');
        const prevCtxSm = prevCanvasSm.getContext('2d');
        const prevCanvasMock = document.getElementById('prev-canvas-mock');
        const prevCtxMock = prevCanvasMock.getContext('2d');

        // Initialize from API
        async function init() {
            try {
                const res = await fetch('/api/avatars');
                const data = await res.json();
                characters = data.characters;

                // Populate dropdown
                const select = document.getElementById('char-select');
                select.innerHTML = '';
                characters.forEach((c, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.textContent = `${idx + 1}. ${c.name}`;
                    select.appendChild(opt);
                });

                // Default to Baka (character id == 'baka')
                const bakaIdx = characters.findIndex(c => c.id === 'baka');
                if (bakaIdx !== -1) {
                    currentIndex = bakaIdx;
                } else {
                    currentIndex = 0;
                }

                select.value = currentIndex;
                loadCharacter(currentIndex);
            } catch (err) {
                showToast('Failed to load character list', true);
            }
        }

        async function loadCharacter(idx) {
            currentIndex = idx;
            document.getElementById('char-select').value = idx;
            const char = characters[idx];

            document.getElementById('active-char-name').textContent = char.name;
            document.getElementById('active-char-tagline').textContent = char.tagline;
            document.getElementById('mockup-name').textContent = char.name;

            // Set ring colors
            const circles = [
                document.getElementById('live-circle-lg'),
                document.getElementById('live-circle-md'),
                document.getElementById('live-circle-sm'),
                document.getElementById('mockup-circle'),
                document.getElementById('mini-current-badge')
            ];
            circles.forEach(c => {
                if (c) {
                    c.style.borderColor = char.color;
                    c.style.background = char.bg;
                }
            });

            // Mini current badge image
            document.getElementById('mini-current-img').src = `/image?type=avatar&file=${char.id}.png&t=${Date.now()}`;

            // Fetch available sources for this character
            const res = await fetch(`/api/sources?id=${char.id}`);
            currentSources = await res.json();

            // Render source pills
            const container = document.getElementById('source-pills-container');
            container.innerHTML = '';
            let defaultIdx = currentSources.findIndex(s => s.isDefault);
            if (defaultIdx === -1) defaultIdx = 0;
            activeSourceIndex = defaultIdx;

            currentSources.forEach((src, sIdx) => {
                const btn = document.createElement('button');
                btn.className = `source-pill ${sIdx === defaultIdx ? 'active' : ''}`;
                btn.textContent = src.name;
                btn.onclick = () => selectSource(sIdx);
                container.appendChild(btn);
            });

            if (currentSources.length > 0) {
                loadImageSource(currentSources[defaultIdx]);
            }
        }

        function selectSource(sIdx) {
            activeSourceIndex = sIdx;
            const pills = document.querySelectorAll('.source-pill');
            pills.forEach((p, i) => p.classList.toggle('active', i === sIdx));
            loadImageSource(currentSources[sIdx]);
        }

        function loadImageSource(src) {
            isImageLoaded = false;
            activeImage = new Image();
            activeImage.crossOrigin = 'anonymous';
            activeImage.onload = () => {
                isImageLoaded = true;
                resetTransformToFit();
                renderAll();
            };
            activeImage.onerror = () => {
                showToast('Failed to load source image', true);
            };

            if (src.dataUrl) {
                activeImage.src = src.dataUrl;
            } else {
                activeImage.src = `/image?type=${encodeURIComponent(src.type)}&file=${encodeURIComponent(src.file)}&t=${Date.now()}`;
            }
        }

        function resetTransformToFit() {
            imgX = 250;
            imgY = 250;
            rotation = 0;
            flipH = false;

            document.getElementById('rotate-slider').value = 0;
            document.getElementById('rotate-val').textContent = '0°';

            if (activeImage && activeImage.width > 0) {
                const cropDiameter = 340;
                // Fit so shortest side covers circle with comfortable 20% margin
                const minSide = Math.min(activeImage.width, activeImage.height);
                scale = (cropDiameter * 1.15) / minSide;
            } else {
                scale = 1.0;
            }

            document.getElementById('zoom-slider').value = scale;
            document.getElementById('zoom-val').textContent = scale.toFixed(2) + 'x';
        }

        // Render Studio Canvas
        function renderStudio() {
            ctx.clearRect(0, 0, 500, 500);

            if (isImageLoaded && activeImage.width > 0) {
                ctx.save();
                ctx.translate(imgX, imgY);
                ctx.rotate((rotation * Math.PI) / 180);
                if (flipH) ctx.scale(-1, 1);
                ctx.drawImage(
                    activeImage,
                    -(activeImage.width * scale) / 2,
                    -(activeImage.height * scale) / 2,
                    activeImage.width * scale,
                    activeImage.height * scale
                );
                ctx.restore();
            }

            // Dark mask vignette outside 340px circle
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, 500, 500);
            ctx.arc(250, 250, 170, 0, Math.PI * 2, true);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            ctx.fill();

            // Avatar ring border
            const char = characters[currentIndex] || { color: '#f59e0b' };
            ctx.beginPath();
            ctx.arc(250, 250, 170, 0, Math.PI * 2);
            ctx.strokeStyle = char.color;
            ctx.lineWidth = 6;
            ctx.stroke();

            // Subtle center guide crosshair
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 1;
            ctx.moveTo(250, 230); ctx.lineTo(250, 270);
            ctx.moveTo(230, 250); ctx.lineTo(270, 250);
            ctx.stroke();
            ctx.restore();
        }

        // Render 256x256 Export and Live Previews
        function renderExportAndPreviews() {
            if (!isImageLoaded || !activeImage.width) return;

            // Mapping display (circle diameter 340 at 250,250) to export (circle diameter 256 at 128,128)
            const factor = 256 / 340;
            const expScale = scale * factor;
            const expX = (imgX - 250) * factor + 128;
            const expY = (imgY - 250) * factor + 128;

            expCtx.clearRect(0, 0, 256, 256);
            expCtx.save();
            expCtx.translate(expX, expY);
            expCtx.rotate((rotation * Math.PI) / 180);
            if (flipH) expCtx.scale(-1, 1);
            expCtx.drawImage(
                activeImage,
                -(activeImage.width * expScale) / 2,
                -(activeImage.height * expScale) / 2,
                activeImage.width * expScale,
                activeImage.height * expScale
            );
            expCtx.restore();

            // Draw to previews
            function drawPreview(pCtx, size) {
                pCtx.clearRect(0, 0, size, size);
                pCtx.drawImage(exportCanvas, 0, 0, 256, 256, 0, 0, size, size);
            }

            drawPreview(prevCtxLg, 110);
            drawPreview(prevCtxMd, 68);
            drawPreview(prevCtxSm, 42);
            drawPreview(prevCtxMock, 42);
        }

        function renderAll() {
            renderStudio();
            renderExportAndPreviews();
        }

        // Canvas drag / pan handlers
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            wrapper.classList.add('grabbing');
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            imgStartX = imgX;
            imgStartY = imgY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            imgX = imgStartX + dx;
            imgY = imgStartY + dy;
            renderAll();
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                wrapper.classList.remove('grabbing');
            }
        });

        // Wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? 0.92 : 1.08;
            setZoom(scale * zoomDelta);
        });

        function setZoom(newScale) {
            scale = Math.min(Math.max(newScale, 0.2), 4.0);
            document.getElementById('zoom-slider').value = scale;
            document.getElementById('zoom-val').textContent = scale.toFixed(2) + 'x';
            renderAll();
        }

        // Sliders
        document.getElementById('zoom-slider').addEventListener('input', (e) => {
            scale = parseFloat(e.target.value);
            document.getElementById('zoom-val').textContent = scale.toFixed(2) + 'x';
            renderAll();
        });

        document.getElementById('zoom-in-btn').addEventListener('click', () => setZoom(scale * 1.1));
        document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(scale * 0.9));

        document.getElementById('rotate-slider').addEventListener('input', (e) => {
            rotation = parseInt(e.target.value, 10);
            document.getElementById('rotate-val').textContent = rotation + '°';
            renderAll();
        });

        document.getElementById('reset-rot-btn').addEventListener('click', () => {
            rotation = 0;
            document.getElementById('rotate-slider').value = 0;
            document.getElementById('rotate-val').textContent = '0°';
            renderAll();
        });

        // Presets
        document.getElementById('center-face-btn').addEventListener('click', () => {
            imgX = 250;
            imgY = 250;
            renderAll();
        });

        document.getElementById('fit-width-btn').addEventListener('click', () => {
            if (activeImage && activeImage.width > 0) {
                scale = 340 / activeImage.width;
                setZoom(scale);
            }
        });

        document.getElementById('rot-90-left-btn').addEventListener('click', () => {
            rotation = (rotation - 90) % 360;
            document.getElementById('rotate-slider').value = rotation;
            document.getElementById('rotate-val').textContent = rotation + '°';
            renderAll();
        });

        document.getElementById('rot-90-right-btn').addEventListener('click', () => {
            rotation = (rotation + 90) % 360;
            document.getElementById('rotate-slider').value = rotation;
            document.getElementById('rotate-val').textContent = rotation + '°';
            renderAll();
        });

        document.getElementById('flip-h-btn').addEventListener('click', () => {
            flipH = !flipH;
            renderAll();
        });

        document.getElementById('reset-all-btn').addEventListener('click', () => {
            resetTransformToFit();
            renderAll();
        });

        // File upload from computer
        document.getElementById('custom-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const customSource = {
                    name: `📁 ${file.name}`,
                    dataUrl: evt.target.result,
                    isDefault: true
                };
                currentSources.unshift(customSource);
                selectSource(0);
                showToast(`Loaded ${file.name}!`);
            };
            reader.readAsDataURL(file);
        });

        // Clipboard Paste (Ctrl+V)
        window.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        const pasteSource = {
                            name: '📋 Pasted Image',
                            dataUrl: evt.target.result,
                            isDefault: true
                        };
                        currentSources.unshift(pasteSource);
                        selectSource(0);
                        showToast('Pasted image from clipboard!');
                    };
                    reader.readAsDataURL(blob);
                    break;
                }
            }
        });

        // Character navigation
        document.getElementById('char-select').addEventListener('change', (e) => {
            loadCharacter(parseInt(e.target.value, 10));
        });

        document.getElementById('prev-btn').addEventListener('click', () => {
            const prevIdx = (currentIndex - 1 + characters.length) % characters.length;
            loadCharacter(prevIdx);
        });

        document.getElementById('next-btn').addEventListener('click', () => {
            const nextIdx = (currentIndex + 1) % characters.length;
            loadCharacter(nextIdx);
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                document.getElementById('prev-btn').click();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                document.getElementById('next-btn').click();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('save-btn').click();
            }
        });

        // Save Avatar action
        async function saveCurrentAvatar(advanceToNext = false) {
            const char = characters[currentIndex];
            const dataUrl = exportCanvas.toDataURL('image/png');

            try {
                const res = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: char.id,
                        name: char.name,
                        image: dataUrl
                    })
                });
                const result = await res.json();
                if (result.success) {
                    showToast(`✅ Saved ${char.name} avatar!`);
                    // Update mini current badge immediately
                    document.getElementById('mini-current-img').src = `/image?type=avatar&file=${char.id}.png&t=${Date.now()}`;
                    if (advanceToNext) {
                        setTimeout(() => {
                            const nextIdx = (currentIndex + 1) % characters.length;
                            loadCharacter(nextIdx);
                        }, 250);
                    }
                } else {
                    showToast(result.error || 'Failed to save', true);
                }
            } catch (err) {
                showToast('Network error while saving avatar', true);
            }
        }

        document.getElementById('save-btn').addEventListener('click', () => saveCurrentAvatar(false));
        document.getElementById('save-next-btn').addEventListener('click', () => saveCurrentAvatar(true));

        // Download PNG fallback
        document.getElementById('download-btn').addEventListener('click', () => {
            const char = characters[currentIndex];
            const link = document.createElement('a');
            link.download = `${char.id}.png`;
            link.href = exportCanvas.toDataURL('image/png');
            link.click();
        });

        // Toast
        let toastTimeout;
        function showToast(msg, isError = false) {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.className = isError ? 'show error' : 'show';
            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                toast.className = '';
            }, 3000);
        }

        // Start
        init();
    </script>
</body>
</html>
"""

class AvatarStudioHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Clean console output
        pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == '/' or path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(STUDIO_HTML.encode('utf-8'))

        elif path == '/api/avatars':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            data = { "characters": CHARACTERS }
            self.wfile.write(json.dumps(data).encode('utf-8'))

        elif path == '/api/sources':
            char_id = params.get('id', [''])[0]
            sources = get_character_sources(char_id)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps(sources).encode('utf-8'))

        elif path == '/image':
            src_type = params.get('type', [''])[0]
            file_name = params.get('file', [''])[0]
            full_path = resolve_image_path(src_type, file_name)

            if full_path and os.path.exists(full_path):
                self.send_response(200)
                ext = os.path.splitext(full_path)[1].lower()
                content_type = 'image/png' if ext == '.png' else ('image/jpeg' if ext in ['.jpg', '.jpeg'] else 'application/octet-stream')
                self.send_header('Content-Type', content_type)
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                with open(full_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/save':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                char_id = data.get('id')
                char_name = data.get('name', char_id)
                image_data = data.get('image', '')

                if not char_id or not image_data.startswith('data:image'):
                    raise ValueError('Invalid character ID or image data')

                # Base64 decode
                header, b64data = image_data.split(',', 1)
                img_bytes = base64.b64decode(b64data)

                # Save directly to assets/avatars/{char_id}.png
                target_path = os.path.join(AVATARS_DIR, f"{char_id}.png")
                with open(target_path, 'wb') as f:
                    f.write(img_bytes)

                # Bump cache buster timestamp query in js/avatars.js
                avatars_js_path = os.path.join(WORKSPACE_DIR, 'js', 'avatars.js')
                if os.path.exists(avatars_js_path):
                    with open(avatars_js_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    pattern = rf"id:\s*'{char_id}',\s*name:\s*'[^']+',\s*photo:\s*'assets/avatars/{char_id}\.png(?:\?v=\d+)?'"
                    replacement = f"id: '{char_id}', name: '{char_name}', photo: 'assets/avatars/{char_id}.png?v={int(os.path.getmtime(target_path))}'"
                    content = re.sub(pattern, replacement, content)
                    with open(avatars_js_path, 'w', encoding='utf-8') as f:
                        f.write(content)

                print(f"[Gokuldham Avatar Studio] Saved {char_id}.png ({len(img_bytes)} bytes)")

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True,
                    "id": char_id,
                    "name": char_name,
                    "message": f"Saved {char_name} avatar successfully!"
                }).encode('utf-8'))

            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({ "success": False, "error": str(e) }).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), AvatarStudioHandler) as httpd:
        url = f"http://127.0.0.1:{PORT}"
        print("=" * 65)
        print("🎬 GOKULDHAM AVATAR STUDIO IS LIVE!")
        print(f"👉 Local URL: {url}")
        print("=" * 65)
        print("Features:")
        print("  • Drag to pan face into dead center")
        print("  • Mouse wheel or slider to zoom in/out")
        print("  • Baka's new uploaded photo is pre-loaded as active source")
        print("  • Real-time Gokuldham badge previews (large, medium, small)")
        print("  • One-click Save directly updates assets/avatars/{id}.png")
        print("  • Press Ctrl+C in terminal when finished.")
        print("=" * 65)

        # Open in default web browser
        webbrowser.open(url)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down Gokuldham Avatar Studio.")

if __name__ == '__main__':
    run_server()
