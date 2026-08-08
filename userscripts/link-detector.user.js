// ==UserScript==
// @name         链接检测 + TXT预览
// @namespace    http://tampermonkey.net/
// @version      6.7
// @description  全面扫描磁力/ED2K链接 + 页面TXT附件快速预览；Android 上单条链接可通过 LinkHunterBridge 直达 115 下载入口
// @author       ray
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
// @updateURL    https://rosenray.github.io/userscripts/link-detector.user.js
// @downloadURL  https://rosenray.github.io/userscripts/link-detector.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    //  持久化配置
    // ─────────────────────────────────────────────
    const CFG = {
        get btnVisible()   { return GM_getValue('btnVisible', true); },
        set btnVisible(v)  { GM_setValue('btnVisible', v); },
        get dedupeHash()   { return GM_getValue('dedupeHash', true); },
        set dedupeHash(v)  { GM_setValue('dedupeHash', v); },
        // cacheResult: 开启后重新打开面板不重扫，手动刷新仍可更新
        get cacheResult()  { return GM_getValue('cacheResult', false); },
        set cacheResult(v) { GM_setValue('cacheResult', v); },
        // txtAutoScan: 页面加载完成后自动扫描 TXT 附件
        get txtAutoScan()  { return GM_getValue('txtAutoScan', true); },
        set txtAutoScan(v) { GM_setValue('txtAutoScan', v); },
        // fabPos: FAB 悬浮按钮位置 { side: 'left'|'right', y: 距底部px }
        get fabPos()  { return GM_getValue('fabPos', { side: 'right', y: 24 }); },
        set fabPos(v) { GM_setValue('fabPos', v); },
    };

    // ─────────────────────────────────────────────
    //  全局样式
    // ─────────────────────────────────────────────
    GM_addStyle(`
        /* ── 设计令牌 ── */
        :root {
            --lh-bg: #fbfaf7;
            --lh-surface: #ffffff;
            --lh-surface2: #f3f1ec;
            --lh-surface3: #e9e5dd;
            --lh-border: rgba(17,24,39,0.12);
            --lh-accent: #111827;
            --lh-accent-glow: rgba(17,24,39,0.18);
            --lh-ed2k: #0f766e;
            --lh-warm: #b45309;
            --lh-text: #111827;
            --lh-muted: #6b7280;
            --lh-dim: #9ca3af;
            --lh-radius: 12px;
            --lh-shadow: 0 22px 70px rgba(17,24,39,0.18), 0 8px 26px rgba(17,24,39,0.10);
            --lh-shadow-sm: 0 10px 26px rgba(17,24,39,0.16);
        }

        /* ══════════════════════════════════════
           磁力检测 FAB
        ══════════════════════════════════════ */
        #lh-fab {
            position: fixed;
            bottom: max(24px, env(safe-area-inset-bottom)); right: 16px;
            z-index: 2147483640;
            width: 54px; height: 54px;
            border-radius: 50%; border: 1px solid rgba(17,24,39,0.10);
            cursor: grab;
            background: rgba(255,255,255,0.94);
            box-shadow: var(--lh-shadow-sm);
            color: var(--lh-text);
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
            -webkit-tap-highlight-color: transparent; outline: none;
            touch-action: none;
            user-select: none; -webkit-user-select: none;
        }
        #lh-fab:active { cursor: grabbing; }
        #lh-fab:hover { transform: scale(1.06); box-shadow: 0 12px 32px rgba(17,24,39,0.18); }
        #lh-fab.dragging { transition: none; transform: scale(1.1); box-shadow: 0 16px 40px rgba(17,24,39,0.24); cursor: grabbing; }
        #lh-fab:active { transform: scale(0.95); }
        #lh-fab.has-links::after {
            content: attr(data-count);
            position: absolute; top: -4px; right: -4px;
            background: var(--lh-text); color: white;
            font-size: 10px; font-weight: 700;
            min-width: 18px; height: 18px; border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            padding: 0 4px; border: 2px solid white;
        }

        /* ══════════════════════════════════════
           磁力检测 主面板
        ══════════════════════════════════════ */
        #lh-panel {
            position: fixed; bottom: calc(86px + env(safe-area-inset-bottom)); right: 14px;
            z-index: 2147483639;
            width: min(420px, calc(100vw - 28px));
            max-height: min(74vh, 640px);
            background: var(--lh-bg);
            border: 1px solid var(--lh-border);
            border-radius: var(--lh-radius);
            box-shadow: var(--lh-shadow);
            display: none; flex-direction: column;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
            color: var(--lh-text); font-size: 13px;
            transform-origin: bottom right;
            overscroll-behavior: contain;
        }
        #lh-panel.visible {
            display: flex;
            animation: lh-panel-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes lh-panel-in {
            from { opacity: 0; transform: scale(0.88) translateY(12px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* 扫描遮罩 */
        #lh-scanning {
            position: absolute; inset: 0;
            background: rgba(251,250,247,0.88);
            display: none; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 10px; color: var(--lh-muted); font-size: 12px;
            z-index: 5; border-radius: var(--lh-radius);
            backdrop-filter: blur(2px);
        }
        #lh-scanning.active { display: flex; }

        /* 通用 spinner */
        .lh-spinner {
            width: 22px; height: 22px;
            border: 2px solid var(--lh-border);
            border-top-color: var(--lh-accent);
            border-radius: 50%;
            animation: lh-spin 0.7s linear infinite;
        }
        @keyframes lh-spin { to { transform: rotate(360deg); } }

        /* 拖拽手柄 */
        #lh-drag-handle {
            background: var(--lh-bg);
            padding: 12px 14px 10px;
            cursor: grab; border-bottom: 1px solid var(--lh-border);
            flex-shrink: 0;
        }
        #lh-drag-handle:active { cursor: grabbing; }

        /* 标题栏 */
        #lh-header {
            display: flex; align-items: center;
            justify-content: flex-end; gap: 8px;
        }
        #lh-header-actions { display: flex; gap: 4px; align-items: center; }
        .lh-icon-btn {
            background: transparent;
            border: 1px solid var(--lh-border);
            color: var(--lh-muted); border-radius: 999px;
            width: 34px; height: 34px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: all 0.15s;
            outline: none; flex-shrink: 0;
        }
        .lh-icon-btn:hover { color: var(--lh-text); background: rgba(17,24,39,0.04); border-color: rgba(17,24,39,0.18); }
        #lh-btn-refresh.spinning svg { animation: lh-spin 0.6s linear infinite; }

        /* 链接列表 */
        #lh-list {
            flex: 1; overflow-y: auto; padding: 8px 10px;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
        }
        #lh-list::-webkit-scrollbar { width: 4px; }
        #lh-list::-webkit-scrollbar-track { background: transparent; }
        #lh-list::-webkit-scrollbar-thumb { background: var(--lh-border); border-radius: 2px; }

        .lh-item {
            padding: 11px; display: flex; flex-direction: column;
            gap: 9px; border: 1px solid rgba(17,24,39,0.08);
            border-radius: 10px;
            background: rgba(255,255,255,0.76);
            transition: background 0.12s, border-color 0.12s, transform 0.12s;
        }
        .lh-item + .lh-item { margin-top: 8px; }
        .lh-item:hover { background: #fff; border-color: rgba(17,24,39,0.14); }
        .lh-item:active { transform: scale(0.992); }
        .lh-item-top { display: flex; align-items: flex-start; gap: 9px; }
        .lh-item-name { font-size: 13px; color: var(--lh-text); line-height: 1.45; flex: 1; min-width: 0; word-break: break-all; }
        .lh-filename { font-weight: 660; color: var(--lh-text); }
        .lh-item-meta {
            margin-top: 4px; display: flex; align-items: center; gap: 6px;
            color: var(--lh-muted); font-size: 11.5px; line-height: 1.35;
        }
        .lh-item-size {
            display: inline-flex; align-items: center; padding: 2px 7px;
            border-radius: 999px; background: var(--lh-surface2);
            border: 1px solid rgba(17,24,39,0.08); color: var(--lh-muted);
            font-weight: 650; white-space: nowrap;
        }
        .lh-hash {
            font-family: 'SF Mono','Fira Code',monospace; font-size: 10.5px; color: var(--lh-dim);
            margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .lh-item-actions { display: flex; gap: 8px; }
        .lh-btn {
            flex: 1; min-height: 36px; padding: 7px 10px; border-radius: 8px; border: none;
            font-size: 12px; font-weight: 650; cursor: pointer; transition: all 0.15s;
            display: flex; align-items: center; justify-content: center;
            gap: 4px; font-family: inherit; outline: none;
        }
        .lh-btn.copy { background: #f5f4f0; color: var(--lh-text); border: 1px solid rgba(17,24,39,0.08); }
        .lh-btn.copy:hover { background: #ece9e2; }
        .lh-btn.copy.copied { background: #edf7f4; color: var(--lh-ed2k); border-color: #cfe9e2; }
        .lh-btn.open { background: #fff7ed; color: var(--lh-warm); border: 1px solid #fed7aa; }
        .lh-btn.open:hover { background: #ffedd5; }

        /* 空状态 */
        #lh-empty {
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 42px 20px; color: var(--lh-muted); gap: 8px;
        }
        #lh-empty .lh-empty-icon { font-size: 32px; opacity: 0.4; }
        #lh-empty .lh-empty-text { font-size: 13px; }

        /* 底栏 */
        #lh-footer {
            padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
            border-top: 1px solid var(--lh-border);
            background: rgba(251,250,247,0.92); flex-shrink: 0;
            display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
            backdrop-filter: blur(18px);
        }
        .lh-footer-btn {
            width: 100%; min-height: 42px; padding: 9px 10px; border-radius: 8px;
            border: 1px solid var(--lh-accent-glow);
            background: rgba(255,255,255,0.74); color: var(--lh-text);
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.15s; font-family: inherit; outline: none;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            white-space: nowrap;
        }
        .lh-footer-btn:hover { background: #fff; border-color: rgba(17,24,39,0.22); }
        #lh-btn-copy-open {
            grid-column: 1 / -1;
            min-height: 48px;
            color: white;
            background: var(--lh-text);
            border-color: var(--lh-text);
            box-shadow: 0 10px 24px rgba(17,24,39,0.14);
        }
        #lh-btn-copy-open:hover { background: #000; }
        #lh-btn-open-downloader {
            background: #edf7f4; color: var(--lh-ed2k);
            border-color: #cfe9e2;
        }
        #lh-btn-open-downloader:hover { background: #e0f2ed; border-color: #b8ddd4; }

        /* Toast */
        #lh-toast {
            position: fixed; bottom: 100px; left: 50%;
            transform: translateX(-50%) translateY(12px);
            background: rgba(17,24,39,0.94); color: white;
            padding: 9px 18px; border-radius: 20px;
            z-index: 2147483647; font-size: 13px;
            font-family: 'SF Pro Display','PingFang SC',sans-serif;
            border: 1px solid rgba(255,255,255,0.12);
            box-shadow: 0 8px 32px rgba(17,24,39,0.22);
            opacity: 0; pointer-events: none;
            transition: opacity 0.2s, transform 0.2s; white-space: nowrap;
        }
        #lh-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (max-width: 520px) {
            #lh-panel.visible {
                animation: lh-sheet-in 0.22s cubic-bezier(0.2,0.8,0.2,1);
            }
            @keyframes lh-sheet-in {
                from { opacity: 0; transform: translateY(18px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            #lh-panel {
                left: 0; right: 0; bottom: 0;
                width: 100vw;
                max-height: min(86vh, 760px);
                border-radius: 18px 18px 0 0;
                border-left: none; border-right: none; border-bottom: none;
                transform-origin: bottom center;
            }
            #lh-drag-handle {
                padding-top: 14px;
                cursor: default;
            }
            #lh-drag-handle::before {
                content: '';
                display: block;
                width: 42px; height: 5px; border-radius: 999px;
                margin: 0 auto 10px;
                background: rgba(148,163,184,0.32);
            }
            #lh-header-actions { gap: 6px; }
            .lh-icon-btn { width: 38px; height: 38px; }
            #lh-list { padding: 8px 10px; }
            .lh-item { padding: 12px; }
            .lh-item-actions { gap: 8px; }
            .lh-btn { min-height: 42px; font-size: 13px; }
            #lh-footer { position: sticky; bottom: 0; }
            .lh-footer-btn { min-height: 48px; font-size: 14px; }
            #lh-btn-copy-open { min-height: 52px; }
            #lh-toast { bottom: calc(88px + env(safe-area-inset-bottom)); max-width: calc(100vw - 24px); white-space: normal; text-align: center; }

            /* TXT 预览框：移动端全屏底部抽屉 */
            .lh-txt-box {
                left: 0 !important; right: 0 !important; top: auto !important;
                bottom: 0; width: 100vw !important; max-height: 88vh !important; height: 88vh !important;
                border-radius: 18px 18px 0 0;
                border-left: none; border-right: none; border-bottom: none;
            }
            .lh-txt-resize { display: none; }
            .lh-txt-header { cursor: default; }
            .lh-txt-header:active { cursor: default; }
            .lh-txt-body { padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
        }

        /* 设置子面板 */
        #lh-settings {
            position: absolute; inset: 0;
            background: var(--lh-bg); border-radius: var(--lh-radius);
            display: none; flex-direction: column; z-index: 10;
            animation: lh-panel-in 0.15s ease;
        }
        #lh-settings.visible { display: flex; }
        #lh-settings-header {
            padding: 13px 14px; border-bottom: 1px solid var(--lh-border);
            display: flex; align-items: center; justify-content: space-between;
            font-weight: 750; font-size: 15px;
            background: var(--lh-bg);
            flex-shrink: 0;
        }
        #lh-settings-body { overflow-y: auto; flex: 1; }
        .lh-setting-section {
            padding: 14px 16px 5px;
            font-size: 11px; font-weight: 700; letter-spacing: 0.8px;
            color: var(--lh-dim); text-transform: uppercase;
        }
        .lh-setting-row {
            margin: 0 10px 8px; padding: 12px 12px; display: flex;
            align-items: center; justify-content: space-between;
            border: 1px solid rgba(17,24,39,0.08); gap: 12px;
            border-radius: 10px; background: rgba(255,255,255,0.72);
        }
        .lh-setting-label { font-size: 13px; color: var(--lh-text); flex: 1; font-weight: 650; }
        .lh-setting-desc { font-size: 11px; color: var(--lh-dim); margin-top: 3px; line-height: 1.35; }
        .lh-toggle { position: relative; width: 42px; height: 24px; flex-shrink: 0; }
        .lh-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
        .lh-toggle-track {
            position: absolute; inset: 0;
            background: rgba(17,24,39,0.16); border-radius: 999px;
            cursor: pointer; transition: background 0.2s;
        }
        .lh-toggle input:checked + .lh-toggle-track { background: var(--lh-ed2k); }
        .lh-toggle-track::after {
            content: ''; position: absolute;
            left: 3px; top: 3px; width: 18px; height: 18px;
            background: white; border-radius: 50%;
            transition: transform 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .lh-toggle input:checked + .lh-toggle-track::after { transform: translateX(18px); }

        /* ══════════════════════════════════════
           TXT 预览 — 触发按钮
        ══════════════════════════════════════ */
        .lh-txt-trigger {
            display: inline-flex !important;
            align-items: center !important;
            gap: 4px !important;
            margin-left: 8px !important;
            padding: 2px 8px !important;
            border-radius: 4px !important;
            border: 1px solid rgba(59,130,246,0.35) !important;
            background: rgba(59,130,246,0.1) !important;
            color: #60a5fa !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.15s !important;
            vertical-align: middle !important;
            line-height: 1.4 !important;
            text-decoration: none !important;
            white-space: nowrap !important;
            font-family: 'SF Pro Display','PingFang SC','Microsoft YaHei',sans-serif !important;
        }
        .lh-txt-trigger:hover {
            background: rgba(59,130,246,0.22) !important;
            border-color: rgba(59,130,246,0.6) !important;
        }
        .lh-txt-trigger.loading {
            color: var(--lh-muted, #64748b) !important;
            border-color: rgba(100,116,139,0.3) !important;
            background: rgba(100,116,139,0.08) !important;
            pointer-events: none !important;
        }
        .lh-txt-trigger.active {
            background: #edf7f4 !important;
            color: var(--lh-ed2k, #0f766e) !important;
            border-color: #cfe9e2 !important;
        }
        .lh-txt-trigger.scanned {
            border-color: rgba(15, 118, 110, 0.4) !important;
            color: var(--lh-ed2k, #0f766e) !important;
        }

        /* ══════════════════════════════════════
           TXT 预览框
        ══════════════════════════════════════ */
        .lh-txt-box {
            position: fixed;
            z-index: 2147483635;
            width: min(560px, calc(100vw - 32px));
            max-height: min(72vh, 520px);
            background: var(--lh-surface);
            border: 1px solid var(--lh-border);
            border-radius: var(--lh-radius);
            box-shadow: var(--lh-shadow);
            display: flex; flex-direction: column;
            overflow: hidden;
            font-family: 'SF Pro Display','PingFang SC','Microsoft YaHei',sans-serif;
            color: var(--lh-text); font-size: 13px;
            animation: lh-panel-in 0.18s cubic-bezier(0.34,1.56,0.64,1);
            /* 初始位置由 JS 设置 */
        }

        /* 预览框 — 顶栏（拖拽区 + 操作区合一） */
        .lh-txt-header {
            display: flex; align-items: center;
            gap: 6px; padding: 7px 10px;
            background: var(--lh-surface);
            border-bottom: 1px solid var(--lh-border);
            cursor: grab; flex-shrink: 0;
            min-height: 0;
        }
        .lh-txt-header:active { cursor: grabbing; }

        /* 复制按钮：顶栏左侧第一个 */
        .lh-txt-copy-btn {
            flex-shrink: 0;
            padding: 4px 10px; border-radius: 5px;
            border: 1px solid var(--lh-accent-glow);
            background: #f5f4f0; color: var(--lh-text);
            font-size: 11px; font-weight: 600;
            cursor: pointer; transition: all 0.15s;
            font-family: inherit; outline: none;
            display: flex; align-items: center; gap: 4px;
            white-space: nowrap;
        }
        .lh-txt-copy-btn:hover { background: #ece9e2; }
        .lh-txt-copy-btn.copied { background: #edf7f4; color: var(--lh-ed2k); border-color: #cfe9e2; }

        /* 编码标记 */
        .lh-txt-header .lh-txt-enc {
            flex-shrink: 0;
            font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
            padding: 2px 5px; border-radius: 4px;
            background: #fff7ed; color: var(--lh-warm);
            border: 1px solid #fed7aa;
        }
        .lh-txt-header .lh-txt-enc.utf8 {
            background: #edf7f4; color: var(--lh-ed2k);
            border-color: #cfe9e2;
        }

        /* 统计数字：顶栏中段，弹性占满剩余空间 */
        .lh-txt-stats {
            flex: 1; min-width: 0;
            font-size: 11px; color: var(--lh-muted);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            text-align: center;
            /* 文件名作为 title tooltip，不占布局宽度 */
        }

        .lh-txt-header-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }

        /* 预览框 — 内容 */
        .lh-txt-body {
            flex: 1; overflow-y: auto; padding: 12px 14px;
            font-family: 'SF Mono','Fira Code','Cascadia Code',Consolas,monospace;
            font-size: 12.5px; line-height: 1.7;
            white-space: pre-wrap; word-break: break-all;
            color: var(--lh-text); background: var(--lh-surface);
        }
        .lh-txt-body::-webkit-scrollbar { width: 5px; }
        .lh-txt-body::-webkit-scrollbar-track { background: transparent; }
        .lh-txt-body::-webkit-scrollbar-thumb { background: var(--lh-border); border-radius: 3px; }
        .lh-txt-body .lh-txt-loading {
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 12px; padding: 40px; color: var(--lh-muted);
            font-family: 'SF Pro Display','PingFang SC',sans-serif;
        }
        .lh-txt-body .lh-txt-error {
            color: #dc2626; font-family: 'SF Pro Display','PingFang SC',sans-serif;
        }

        /* 调整大小手柄 */
        .lh-txt-resize {
            position: absolute; bottom: 0; right: 0;
            width: 14px; height: 14px; cursor: se-resize;
            opacity: 0.3; transition: opacity 0.15s;
        }
        .lh-txt-resize:hover { opacity: 0.7; }
        .lh-txt-resize svg { display: block; }
    `);

    // ─────────────────────────────────────────────
    //  工具函数
    // ─────────────────────────────────────────────
    function makeMagnetReg() {
        return /magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,128}(?:&(?:dn|xl|tr|as|xs|kt|mt|so)=[^&"'\s<>[\]()]*)*/gi;
    }
    function makeEd2kReg() {
        return /ed2k:\/\/\|file\|[^|]+\|\d+\|[a-fA-F0-9]{32}\|(?:\/|h=[a-fA-F0-9]+\|\/)?/gi;
    }
    function extractHash(m) {
        const r = m.match(/xt=urn:[a-z0-9]+:([a-z0-9]{32,40})/i);
        return r ? r[1].toLowerCase() : null;
    }
    function extractDN(m) {
        const r = m.match(/[?&]dn=([^&]+)/i);
        if (!r) return null;
        try { return decodeURIComponent(r[1].replace(/\+/g, ' ')); }
        catch { return r[1].replace(/\+/g, ' '); }
    }
    function extractXL(m) {
        const r = m.match(/[?&]xl=(\d+)/i);
        if (!r) return null;
        const bytes = Number(r[1]);
        return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
    }
    function extractEd2kName(e) {
        const r = e.match(/\|file\|([^|]+)\|/);
        return r ? decodeURIComponent(r[1]) : null;
    }
    function extractEd2kSize(e) {
        const r = e.match(/\|file\|[^|]+\|(\d+)\|/);
        return r ? Number(r[1]) : null;
    }
    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes, idx = 0;
        while (size >= 1024 && idx < units.length - 1) { size /= 1024; idx++; }
        const digits = size >= 100 || idx === 0 ? 0 : size >= 10 ? 1 : 2;
        return `${size.toFixed(digits)} ${units[idx]}`;
    }
    function shortLink(link) {
        if (link.length <= 92) return link;
        return `${link.slice(0, 62)}...${link.slice(-18)}`;
    }
    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function copyText(text) {
        try { GM_setClipboard(text, 'text'); return true; } catch {}
        try {
            const ta = Object.assign(document.createElement('textarea'), { value: text });
            ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
            document.body.appendChild(ta);
            ta.select(); document.execCommand('copy');
            document.body.removeChild(ta); return true;
        } catch { return false; }
    }
    function svgIcon(d, size = 13) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    }
    const ICONS = {
        search: `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>`,
        refresh: `<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`,
        settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
        close: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
        copy: `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
        check: `<polyline points="20 6 9 17 4 12"/>`,
        open: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
        file: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`,
        resize: `<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>`,
    };
    const EMPTY_MAGNET_TRIGGER = 'magnet:?xt=urn:btih:';
    const LINKHUNTER_BRIDGE_OPEN = 'linkhunter://open?mode=115_download&url=';

    function isAndroidDevice() {
        return /Android/i.test(navigator.userAgent || '');
    }

    function canUseLinkHunterBridge(link) {
        return /^(?:magnet:\?|ed2k:\/\/)/i.test(link || '');
    }

    /**
     * Android 上优先交给 LinkHunterBridge；其他设备仍走原始协议唤起下载客户端。
     */
    function openDownloadLink(link) {
        if (!canUseLinkHunterBridge(link)) return false;
        if (isAndroidDevice()) {
            window.location.href = LINKHUNTER_BRIDGE_OPEN + encodeURIComponent(link);
            showToast('正在唤起 LinkHunterBridge...');
            return true;
        }
        window.location.href = link;
        showToast('正在唤起客户端...');
        return true;
    }

    // ─────────────────────────────────────────────
    //  BTIH Hash 检测与磁力链接合成
    //  应对"只在 data-hash/onclick 中放种子哈希，完整 magnet 由JS临时拼接"的站点
    // ─────────────────────────────────────────────
    const HEX_HASH_RE = /\b[a-fA-F0-9]{40}\b/;
    const B32_HASH_RE = /\b[A-Z2-7]{32}\b/;
    const HASH_CONTEXT_RE = /(hash|infohash|btih|magnet|torrent)/i;

    function looksLikeHashContext(attrName, el) {
        const ctx = `${attrName} ${el.className||''} ${el.id||''} ${el.getAttribute('data-testid')||''}`;
        return HASH_CONTEXT_RE.test(ctx);
    }
    // 复制按钮选择器集中维护；既用于查找按钮，也用于判断“一个结果卡片只包含一个复制按钮”
    const COPY_BUTTON_SELECTORS = [
        'button[aria-label="copy"]',
        'button[aria-label="Copy"]',
        'button[aria-label="复制"]',
        'button[aria-label="复制磁力"]',
        'button[aria-label="magnet"]',
        '[data-action="copy"]',
        '[class*="copyBtn"]',
        '[class*="copy-btn"]',
    ];
    const COPY_BUTTON_SELECTOR = COPY_BUTTON_SELECTORS.join(',');
    const GENERIC_ACTION_TEXT_RE = /^(?:copy|复制|复制磁力|magnet|磁力|download|下载|open|打开|详情|查看详情)$/i;
    const META_ONLY_TEXT_RE = /^(?:(?:大小|size|时间|date|创建时间|收录时间|热度|文件数|files?|seeders?|leechers?)\s*[:：]?\s*)?(?:\d+(?:\.\d+)?\s*(?:b|kb|mb|gb|tb)|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d+\s*(?:个文件|files?))$/i;

    const SIZE_TEXT_RE = /(?:^|[\s（(【\[])(?:(?:文件)?大小|容量|体积|size)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(bytes?|b|kib|kb|mib|mb|gib|gb|tib|tb)(?=$|[\s）)】\],，;；|])/i;

    function sizeUnitMultiplier(unit) {
        const normalized = String(unit || '').toLowerCase();
        const powers = {
            b: 0, byte: 0, bytes: 0,
            kb: 1, kib: 1,
            mb: 2, mib: 2,
            gb: 3, gib: 3,
            tb: 4, tib: 4,
        };
        return Object.prototype.hasOwnProperty.call(powers, normalized)
            ? 1024 ** powers[normalized]
            : null;
    }

    function parseSizeToBytes(value) {
        const raw = String(value || '').replace(/,/g, '').trim();
        if (!raw) return null;

        // data-size/data-length 一类属性有时直接存放字节数。
        if (/^\d{4,}$/.test(raw)) {
            const bytes = Number(raw);
            return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
        }

        const match = raw.match(SIZE_TEXT_RE) || raw.match(/^(\d+(?:\.\d+)?)\s*(bytes?|b|kib|kb|mib|mb|gib|gb|tib|tb)$/i);
        if (!match) return null;
        const amount = Number(match[1]);
        const multiplier = sizeUnitMultiplier(match[2]);
        if (!Number.isFinite(amount) || amount <= 0 || multiplier == null) return null;
        const bytes = Math.round(amount * multiplier);
        return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
    }

    function findSizeInsideResult(container, copyBtn) {
        if (!container) return null;

        // 先查稳定的大小字段或属性，避免标题中恰好出现“1080p/4K”等数字造成误判。
        const selectors = [
            '[data-size]', '[data-length]', '[data-filesize]', '[data-file-size]',
            '[class*="size"]', '[class*="Size"]',
            '[aria-label*="大小"]', '[aria-label*="size"]', '[aria-label*="Size"]',
            '[title*="大小"]', '[title*="size"]', '[title*="Size"]'
        ];
        for (const selector of selectors) {
            let nodes = [];
            try { nodes = container.querySelectorAll(selector); } catch {}
            for (const node of nodes) {
                if (node === copyBtn || node.contains(copyBtn)) continue;
                const values = [
                    node.getAttribute?.('data-size'),
                    node.getAttribute?.('data-length'),
                    node.getAttribute?.('data-filesize'),
                    node.getAttribute?.('data-file-size'),
                    node.getAttribute?.('aria-label'),
                    node.getAttribute?.('title'),
                    node.textContent,
                ];
                for (const value of values) {
                    const bytes = parseSizeToBytes(value);
                    if (bytes) return bytes;
                }
            }
        }

        // btsearch.love 的大小通常是结果卡片中的普通 Chakra Text，扫描可见文本兜底。
        const lines = String(container.innerText || container.textContent || '')
            .split(/\n+/)
            .map(line => line.trim())
            .filter(Boolean);
        for (const line of lines) {
            const bytes = parseSizeToBytes(line);
            if (bytes) return bytes;
        }
        return null;
    }

    function cleanDetectedName(value) {
        let name = String(value || '').replace(/\s+/g, ' ').trim();
        name = name.replace(/^(?:标题|名称|资源名|name|title)\s*[:：]\s*/i, '').trim();
        if (!name || GENERIC_ACTION_TEXT_RE.test(name)) return '';
        if (/^(?:magnet:\?|ed2k:\/\/)/i.test(name)) return '';
        if (/^[a-f0-9]{32,40}$/i.test(name) || /^[a-z2-7]{32}$/i.test(name)) return '';
        if (META_ONLY_TEXT_RE.test(name)) return '';
        // 防止误把整个结果列表或整页文本塞进 dn 参数
        if (name.length > 240) name = name.slice(0, 240).trim();
        return name;
    }

    function getNodeNameCandidate(node) {
        if (!node) return '';
        const attrs = ['data-title', 'data-name', 'title'];
        for (const attr of attrs) {
            const value = cleanDetectedName(node.getAttribute?.(attr));
            if (value) return value;
        }
        return cleanDetectedName(node.textContent);
    }

    function findNameInsideResult(container, copyBtn) {
        if (!container) return '';
        // 优先读取稳定的语义元素，不依赖 Chakra UI 每次构建生成的随机 class。
        const selectors = [
            '[data-title]', '[data-name]',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'a[href*="/detail"]', 'a[href*="/torrent"]', 'a[href*="/hash"]',
            'a[href*="/view"]',
            '[class*="title"]', '[class*="Title"]',
            '[class*="name"]', '[class*="Name"]'
        ];
        for (const selector of selectors) {
            let nodes = [];
            try { nodes = container.querySelectorAll(selector); } catch {}
            for (const node of nodes) {
                if (node === copyBtn || node.contains(copyBtn)) continue;
                const name = getNodeNameCandidate(node);
                if (name) return name;
            }
        }

        // btsearch.love 的标题有时只是普通 Chakra Text，没有 title class；
        // 此时从仅包含当前复制按钮的结果卡片中按可见文本行兜底。
        const visibleText = String(container.innerText || '').trim();
        if (visibleText) {
            const lines = visibleText.split(/\n+/).map(cleanDetectedName).filter(Boolean);
            for (const line of lines) {
                if (line.length >= 2 && !META_ONLY_TEXT_RE.test(line)) return line;
            }
        }
        return '';
    }

    function findResultContainerForCopyButton(copyBtn) {
        let firstSingleCopyAncestor = null;
        let node = copyBtn.parentElement;
        for (let depth = 0; node && node !== document.body && depth < 12; depth++, node = node.parentElement) {
            let copyCount = 0;
            try { copyCount = node.querySelectorAll(COPY_BUTTON_SELECTOR).length; } catch {}
            if (copyCount !== 1) continue;
            if (!firstSingleCopyAncestor) firstSingleCopyAncestor = node;

            // 找到同时包含有效标题或大小信息的祖先即可停止，避免继续扩大到整个列表。
            if (findNameInsideResult(node, copyBtn) || findSizeInsideResult(node, copyBtn)) return node;
        }
        return firstSingleCopyAncestor;
    }

    function findResultNameForCopyButton(copyBtn) {
        const direct = cleanDetectedName(
            copyBtn.getAttribute('data-title') ||
            copyBtn.getAttribute('data-name') ||
            copyBtn.getAttribute('title')
        );
        if (direct) return direct;
        return findNameInsideResult(findResultContainerForCopyButton(copyBtn), copyBtn);
    }

    function findResultSizeForCopyButton(copyBtn) {
        const directAttrs = [
            copyBtn.getAttribute('data-size'),
            copyBtn.getAttribute('data-length'),
            copyBtn.getAttribute('data-filesize'),
            copyBtn.getAttribute('data-file-size'),
        ];
        for (const value of directAttrs) {
            const bytes = parseSizeToBytes(value);
            if (bytes) return bytes;
        }

        // 大小信息可能位于标题区域的外层，因此独立向上查找，不能复用标题最先命中的容器。
        let node = copyBtn.parentElement;
        for (let depth = 0; node && node !== document.body && depth < 12; depth++, node = node.parentElement) {
            let copyCount = 0;
            try { copyCount = node.querySelectorAll(COPY_BUTTON_SELECTOR).length; } catch {}
            if (copyCount !== 1) continue;
            const bytes = findSizeInsideResult(node, copyBtn);
            if (bytes) return bytes;
        }
        return null;
    }

    function findNearbyName(el) {
        const own = cleanDetectedName(el.getAttribute('title'));
        if (own) return own;
        const container = el.closest('tr,li,article,[data-title],[data-name],div');
        return findNameInsideResult(container, el);
    }

    function synthesizeMagnet(hash, name, sizeBytes = null) {
        const cleanName = cleanDetectedName(name);
        const dn = cleanName ? `&dn=${encodeURIComponent(cleanName)}` : '';
        const xl = Number.isSafeInteger(sizeBytes) && sizeBytes > 0 ? `&xl=${sizeBytes}` : '';
        return `magnet:?xt=urn:btih:${hash.toUpperCase()}${dn}${xl}`;
    }

    function enrichLinkWithMetadata(link, name, sizeBytes) {
        if (!link.startsWith('magnet:?')) return link;
        let enriched = link;
        const cleanName = cleanDetectedName(name);
        if (cleanName && !extractDN(enriched)) enriched += `&dn=${encodeURIComponent(cleanName)}`;
        if (Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && !extractXL(enriched)) enriched += `&xl=${sizeBytes}`;
        return enriched;
    }

    function linkQualityScore(link) {
        if (!link.startsWith('magnet:?')) return link.length;
        return (extractDN(link) ? 100000 : 0) + (extractXL(link) ? 50000 : 0) + link.length;
    }

    function mergeMagnetMetadata(primary, secondary) {
        const best = linkQualityScore(primary) >= linkQualityScore(secondary) ? primary : secondary;
        const other = best === primary ? secondary : primary;
        return enrichLinkWithMetadata(best, extractDN(best) || extractDN(other), extractXL(best) || extractXL(other));
    }

    function mergeDetectedLinks(...groups) {
        const input = groups.flat().filter(Boolean);
        if (!CFG.dedupeHash) return [...new Set(input)];

        const orderedKeys = [];
        const bestByKey = new Map();
        for (const link of input) {
            const hash = link.startsWith('magnet:?') ? extractHash(link) : null;
            const key = hash ? `magnet:${hash}` : `link:${link}`;
            if (!bestByKey.has(key)) {
                orderedKeys.push(key);
                bestByKey.set(key, link);
            } else if (hash) {
                bestByKey.set(key, mergeMagnetMetadata(bestByKey.get(key), link));
            } else if (linkQualityScore(link) > linkQualityScore(bestByKey.get(key))) {
                bestByKey.set(key, link);
            }
        }
        return orderedKeys.map(key => bestByKey.get(key));
    }

    // ─────────────────────────────────────────────
    //  跨 Shadow DOM 收集元素（部分组件库用 shadow root 渲染）
    // ─────────────────────────────────────────────
    function collectAllRoots() {
        const roots = [document];
        const walk = (root) => {
            root.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) { roots.push(el.shadowRoot); walk(el.shadowRoot); }
            });
        };
        try { walk(document); } catch {}
        // 同源 iframe
        document.querySelectorAll('iframe').forEach(f => {
            try { if (f.contentDocument) roots.push(f.contentDocument); } catch {}
        });
        return roots;
    }
    function scanMagnetLinks() {
        const rawLinks = []; const seen = new Set();
        function add(url) {
            const c = (url || '').trim().replace(/['"<>\s]+$/, '');
            if (!c || seen.has(c)) return;
            if (!c.startsWith('magnet:?') && !c.startsWith('ed2k://')) return;
            seen.add(c); rawLinks.push(c);
        }
        function scan(text) {
            if (!text) return; let m;
            const mr = makeMagnetReg();
            while ((m = mr.exec(text))) add(m[0]);
            const er = makeEd2kReg();
            while ((m = er.exec(text))) add(m[0]);
        }

        const roots = collectAllRoots();
        const hashCandidates = new Map(); // hash -> name

        for (const root of roots) {
            try {
                for (const a of root.querySelectorAll('a')) { scan(a.getAttribute('href')); scan(a.textContent); }
                for (const el of root.querySelectorAll('[data-href],[data-link],[data-magnet],[data-src],[data-url],[onclick]'))
                    for (const attr of el.attributes) scan(attr.value);
                for (const el of root.querySelectorAll('input[value], textarea')) scan(el.value || el.getAttribute('value'));
                for (const s of root.querySelectorAll('script')) if (!s.src) scan(s.textContent);
                for (const m of root.querySelectorAll('meta')) scan(m.getAttribute('content'));

                // 全文本节点扫描
                try {
                    if (root.nodeType === 9) {
                        // 完整 document（如同源 iframe），用其自身 evaluate
                        const nodes = root.evaluate('//text()[not(ancestor::script) and not(ancestor::style)]',
                            root, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
                        for (let i = 0; i < nodes.snapshotLength; i++) scan(nodes.snapshotItem(i).nodeValue);
                    } else if (root.nodeType === 11) {
                        // shadow root，归属主 document，用 document.evaluate 以其为上下文
                        const nodes = document.evaluate('.//text()[not(ancestor::script) and not(ancestor::style)]',
                            root, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
                        for (let i = 0; i < nodes.snapshotLength; i++) scan(nodes.snapshotItem(i).nodeValue);
                    }
                } catch {}

                // ── Hash 合成：data-hash / data-infohash / data-btih 等属性
                for (const el of root.querySelectorAll('[data-hash],[data-infohash],[data-btih],[data-magnet-hash],[data-magnethash],[data-hash-info]')) {
                    for (const attr of el.attributes) {
                        const v = (attr.value || '').trim();
                        const hm = v.match(HEX_HASH_RE) || v.match(B32_HASH_RE);
                        if (hm && looksLikeHashContext(attr.name, el)) {
                            const h = hm[0];
                            if (!hashCandidates.has(h)) hashCandidates.set(h, findNearbyName(el));
                        }
                    }
                }
                // ── Hash 合成：onclick="copyMagnet('HASH','name')" 之类的内联调用
                for (const el of root.querySelectorAll('[onclick]')) {
                    const oc = el.getAttribute('onclick') || '';
                    if (HASH_CONTEXT_RE.test(oc)) {
                        const hm = oc.match(HEX_HASH_RE) || oc.match(B32_HASH_RE);
                        if (hm && !hashCandidates.has(hm[0])) hashCandidates.set(hm[0], findNearbyName(el));
                    }
                }
            } catch (e) { /* 跨域 iframe 等访问受限，忽略 */ }
        }

        // 把合成的磁力链接也加入结果（自动补 dn=文件名，若找不到则留空由 hash 兜底展示）
        for (const [hash, name] of hashCandidates) add(synthesizeMagnet(hash, name));

        if (CFG.dedupeHash) {
            const hashMap = new Map(), ed2ks = [];
            for (const link of rawLinks) {
                if (link.startsWith('magnet:?')) {
                    const h = extractHash(link);
                    if (!h) { hashMap.set(link, link); continue; }
                    const ex = hashMap.get(h);
                    hashMap.set(h, ex ? mergeMagnetMetadata(ex, link) : link);
                } else ed2ks.push(link);
            }
            return [...hashMap.values(), ...ed2ks];
        }
        return rawLinks;
    }

    // ─────────────────────────────────────────────
    //  磁力面板 DOM
    // ─────────────────────────────────────────────
    const fab = document.createElement('button');
    fab.id = 'lh-fab';
    fab.innerHTML = svgIcon(ICONS.search, 20);
    fab.setAttribute('aria-label', '链接检测'); fab.title = '链接检测';
    if (!CFG.btnVisible) fab.style.display = 'none';
    // 恢复上次拖拽后的位置
    (function () {
        const pos = CFG.fabPos;
        fab.style.bottom = Math.max(0, pos.y) + 'px';
        if (pos.side === 'left') { fab.style.left = '16px'; fab.style.right = 'auto'; }
        else { fab.style.right = '16px'; fab.style.left = 'auto'; }
    })();

    const toast = document.createElement('div'); toast.id = 'lh-toast';

    const panel = document.createElement('div'); panel.id = 'lh-panel';
    panel.innerHTML = `
        <div id="lh-scanning"><div class="lh-spinner"></div><span id="lh-scan-text">正在扫描页面…</span></div>
        <div id="lh-drag-handle">
            <div id="lh-header">
                <div id="lh-header-actions">
                    <button class="lh-icon-btn" id="lh-btn-refresh" title="重新扫描">${svgIcon(ICONS.refresh)}</button>
                    <button class="lh-icon-btn" id="lh-btn-settings" title="设置">${svgIcon(ICONS.settings)}</button>
                    <button class="lh-icon-btn" id="lh-btn-close" title="关闭">${svgIcon(ICONS.close)}</button>
                </div>
            </div>
        </div>
        <div id="lh-list"></div>
        <div id="lh-footer">
            <button class="lh-footer-btn" id="lh-btn-copy-open">
                ${svgIcon(ICONS.open)}
                <span>复制并唤起</span>
            </button>
            <button class="lh-footer-btn" id="lh-btn-copy-all">
                ${svgIcon(ICONS.copy)}
                <span id="lh-copy-all-label">复制全部</span>
            </button>
            <button class="lh-footer-btn" id="lh-btn-open-downloader">
                ${svgIcon(ICONS.open)}
                <span>唤起下载器</span>
            </button>
        </div>
        <div id="lh-settings">
            <div id="lh-settings-header">
                <span>设置</span>
                <button class="lh-icon-btn" id="lh-settings-close">${svgIcon(ICONS.close)}</button>
            </div>
            <div id="lh-settings-body">
                <div class="lh-setting-section">磁力检测</div>
                <div class="lh-setting-row">
                    <div><div class="lh-setting-label">显示悬浮按钮</div>
                    <div class="lh-setting-desc">关闭后可通过油猴菜单唤起</div></div>
                    <label class="lh-toggle"><input type="checkbox" id="lh-set-btn-visible" ${CFG.btnVisible?'checked':''}><span class="lh-toggle-track"></span></label>
                </div>
                <div class="lh-setting-row">
                    <div><div class="lh-setting-label">相同 Hash 去重</div>
                    <div class="lh-setting-desc">同一文件保留参数最完整的磁力链</div></div>
                    <label class="lh-toggle"><input type="checkbox" id="lh-set-dedupe" ${CFG.dedupeHash?'checked':''}><span class="lh-toggle-track"></span></label>
                </div>
                <div class="lh-setting-row">
                    <div><div class="lh-setting-label">缓存扫描结果</div>
                    <div class="lh-setting-desc">重新打开面板不重扫，刷新按钮可强制更新</div></div>
                    <label class="lh-toggle"><input type="checkbox" id="lh-set-cache" ${CFG.cacheResult?'checked':''}><span class="lh-toggle-track"></span></label>
                </div>
                <div class="lh-setting-section">TXT 附件预览</div>
                <div class="lh-setting-row">
                    <div><div class="lh-setting-label">自动扫描 TXT 附件</div>
                    <div class="lh-setting-desc">页面加载后自动在 TXT 附件旁添加预览按钮</div></div>
                    <label class="lh-toggle"><input type="checkbox" id="lh-set-txt" ${CFG.txtAutoScan?'checked':''}><span class="lh-toggle-track"></span></label>
                </div>
            </div>
        </div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    document.body.appendChild(toast);

    // ─────────────────────────────────────────────
    //  磁力面板状态与渲染
    // ─────────────────────────────────────────────
    let allLinks = [], txtExtractedLinks = [], toastTimer = null, hasScannedOnce = false;
    let suppressOutsideClose = false; // SPA 批量模拟点击期间禁止"点击外部关闭面板"
    let suppressLiveRescan   = false; // SPA 批量模拟点击期间禁止 liveObserver 触发重扫覆盖结果

    function showToast(msg, duration = 1800) {
        toast.textContent = msg; toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }
    function getFiltered() {
        return allLinks;
    }
    function updateCopyLabel() {
        const f = getFiltered();
        document.getElementById('lh-copy-all-label').textContent = `复制全部 (${f.length})`;
    }
    function updateSummary() {
        // No visible summary; the copy button and floating badge carry the only count.
    }
    function openDownloader() {
        const f = getFiltered();
        if (f.length === 1 && openDownloadLink(f[0])) return;
        window.location.href = EMPTY_MAGNET_TRIGGER;
        showToast('已尝试唤起下载器，可粘贴已复制的链接');
    }
    function copyAllLinks() {
        const f = getFiltered();
        if (!f.length) { showToast('没有可复制的链接'); return false; }
        copyText(f.join('\n'));
        showToast(`✓ 已复制 ${f.length} 个链接`);
        return true;
    }
    function copyAndOpenDownloader() {
        const f = getFiltered();
        if (!copyAllLinks()) return;
        if (f.length === 1 && openDownloadLink(f[0])) return;
        openDownloader();
    }
    // 面板弹出位置跟随 FAB 所在边缘
    function alignPanelToFab() {
        // 移动端全屏抽屉：不设置定位，交给 CSS (@media max-width:520px)
        if (innerWidth <= 520) {
            panel.style.left = '';
            panel.style.right = '';
            panel.style.bottom = '';
            panel.style.top = '';
            return;
        }
        const pos = CFG.fabPos;
        const MARGIN = 14;
        panel.style.left = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.style.top = '';
        const y = Math.max(MARGIN, pos.y + 54 + 14);
        panel.style.bottom = y + 'px';
        if (pos.side === 'left') {
            panel.style.left = MARGIN + 'px';
            panel.style.right = 'auto';
        } else {
            panel.style.right = MARGIN + 'px';
            panel.style.left = 'auto';
        }
    }
    function renderMagnetList() {
        const list = document.getElementById('lh-list');
        const filtered = getFiltered();
        allLinks.length > 0 ? (fab.classList.add('has-links'), fab.setAttribute('data-count', String(allLinks.length)))
                            : fab.classList.remove('has-links');
        updateCopyLabel();
        updateSummary();
        list.innerHTML = '';
        if (filtered.length === 0) {
            list.innerHTML = `<div id="lh-empty"><div class="lh-empty-icon">🔍</div><div class="lh-empty-text">未找到磁力或 ED2K 链接</div></div>`;
            return;
        }
        filtered.forEach((link, idx) => {
            const isMagnet = link.startsWith('magnet:?');
            const type = isMagnet ? 'magnet' : 'ed2k';
            const filename = isMagnet ? extractDN(link) : extractEd2kName(link);
            const hash = isMagnet ? extractHash(link) : null;
            const sizeBytes = isMagnet ? extractXL(link) : extractEd2kSize(link);
            const sizeText = formatBytes(sizeBytes);
            const displayName = filename || (hash ? hash.toUpperCase().substring(0,16)+'…' : link.substring(0,40)+'…');
            const item = document.createElement('div'); item.className = 'lh-item';
            item.innerHTML = `
                <div class="lh-item-top">
                    <div class="lh-item-name">
                        <div class="lh-filename">${idx+1}. ${escapeHtml(displayName)}</div>
                        ${sizeText ? `<div class="lh-item-meta"><span class="lh-item-size">大小 ${escapeHtml(sizeText)}</span></div>` : ''}
                    </div>
                </div>
                <div class="lh-item-actions"></div>`;
            const actions = item.querySelector('.lh-item-actions');
            // 复制
            const copyBtn = document.createElement('button');
            copyBtn.className = 'lh-btn copy';
            copyBtn.innerHTML = svgIcon(ICONS.copy, 12) + ' 复制';
            copyBtn.onclick = () => {
                copyText(link + '\n'); // 末尾加换行，多次单独复制后粘贴无需手动补换行
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = svgIcon(ICONS.check, 12) + ' 已复制';
                showToast('✓ 已复制');
                setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = svgIcon(ICONS.copy, 12) + ' 复制'; }, 2000);
            };
            actions.appendChild(copyBtn);
            // 打开：Android 通过 LinkHunterBridge 中转，其他设备沿用原始协议。
            const openBtn = document.createElement('button');
            openBtn.className = 'lh-btn open';
            openBtn.innerHTML = svgIcon(ICONS.open, 12) + ' 打开';
            openBtn.onclick = () => openDownloadLink(link);
            actions.appendChild(openBtn);
            list.appendChild(item);
        });
    }
    // ─────────────────────────────────────────────
    //  SPA 剪贴板拦截模块
    //  适用于磁力链接不在 DOM 中、只在点击复制按钮时由 JS 生成的站点
    //  （如 btsearch.love 使用 aria-label="copy" 的 chakra-button）
    // ─────────────────────────────────────────────
    const spaCapture = {
        captured: [],
        injected: false,
        activeName: '',
        activeSizeBytes: null,

        upsert(link) {
            const enrichedLink = enrichLinkWithMetadata(link, this.activeName, this.activeSizeBytes);
            const hash = enrichedLink.startsWith('magnet:?') ? extractHash(enrichedLink) : null;
            const index = this.captured.findIndex(existing => {
                if (!hash) return existing === enrichedLink;
                return extractHash(existing) === hash;
            });
            if (index < 0) {
                this.captured.push(enrichedLink);
            } else if (hash) {
                this.captured[index] = mergeMagnetMetadata(this.captured[index], enrichedLink);
            } else if (linkQualityScore(enrichedLink) > linkQualityScore(this.captured[index])) {
                this.captured[index] = enrichedLink;
            }
        },

        inject() {
            if (this.injected) return;
            this.injected = true;
            const s = document.createElement('script');
            s.textContent = `(function(){
                if (window.__lhCBHooked) return;
                window.__lhCBHooked = true;
                function emit(text) {
                    window.dispatchEvent(new CustomEvent('__lhCB', { detail: String(text) }));
                }
                // 拦截 navigator.clipboard.writeText
                try {
                    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
                    navigator.clipboard.writeText = function(t) { emit(t); return orig(t); };
                } catch(e1) {
                    try {
                        const origCB = navigator.clipboard;
                        const origWT = origCB.writeText.bind(origCB);
                        Object.defineProperty(navigator, 'clipboard', {
                            configurable: true,
                            get: () => new Proxy(origCB, {
                                get(target, prop) {
                                    if (prop === 'writeText') return (t) => { emit(t); return origWT(t); };
                                    const v = Reflect.get(target, prop);
                                    return typeof v === 'function' ? v.bind(target) : v;
                                }
                            })
                        });
                    } catch(e2) {}
                }
                // 兜底：拦截 document.execCommand('copy')（旧版写法）
                const origExec = document.execCommand.bind(document);
                document.execCommand = function(cmd, ...args) {
                    const r = origExec(cmd, ...args);
                    if (cmd === 'copy') {
                        try { emit(window.getSelection().toString()); } catch(e) {}
                    }
                    return r;
                };
            })();`;
            (document.head || document.documentElement).appendChild(s);
            s.remove();

            window.addEventListener('__lhCB', e => {
                const t = (e.detail || '').trim();
                if (t.startsWith('magnet:?') || t.startsWith('ed2k://')) this.upsert(t);
            });
        },

        findCopyBtns() {
            const set = new Set();
            for (const selector of COPY_BUTTON_SELECTORS) {
                try { document.querySelectorAll(selector).forEach(el => set.add(el)); } catch {}
            }
            return [...set];
        },

        async clickAll(onProgress, intervalMs = 160) {
            this.inject();
            const btns = this.findCopyBtns();
            if (!btns.length) return 0;
            for (let i = 0; i < btns.length; i++) {
                // 在触发站点复制逻辑前记录按钮所属条目的名称和大小。
                // clipboard.writeText 通常在同一点击调用栈内触发，因此元数据能与磁力链准确配对。
                this.activeName = findResultNameForCopyButton(btns[i]);
                this.activeSizeBytes = findResultSizeForCopyButton(btns[i]);
                try { btns[i].click(); } catch {}
                if (onProgress) onProgress(i + 1, btns.length);
                await new Promise(r => setTimeout(r, intervalMs));
                this.activeName = '';
                this.activeSizeBytes = null;
            }
            await new Promise(r => setTimeout(r, 300));
            return this.captured.length;
        },

        clear() { this.captured = []; this.activeName = ''; this.activeSizeBytes = null; }
    };

    // ─────────────────────────────────────────────
    //  主扫描函数（两阶段：正则扫描 + 剪贴板拦截）
    // ─────────────────────────────────────────────
    function doMagnetScan() {
        const scanning = document.getElementById('lh-scanning');
        const scanText  = document.getElementById('lh-scan-text');
        const refreshBtn = document.getElementById('lh-btn-refresh');
        scanning.classList.add('active');
        refreshBtn.classList.add('spinning');

        async function run() {
            // 阶段一：正则扫描全页面
            scanText.textContent = '正在扫描页面…';
            await new Promise(r => setTimeout(r, 60));
            allLinks = mergeDetectedLinks(scanMagnetLinks(), txtExtractedLinks);
            hasScannedOnce = true;

            // 阶段二：发现复制按钮则进入剪贴板拦截模式
            // btsearch.love 等站点磁力链接仅在点击按钮时由 JS 生成，不存在于 DOM
            const copyBtns = spaCapture.findCopyBtns();
            if (copyBtns.length > 0) {
                spaCapture.clear();
                suppressOutsideClose = true;          // 模拟点击期间禁止外部点击关闭面板
                suppressLiveRescan   = true;          // 模拟点击期间禁止 liveObserver 覆盖结果
                await spaCapture.clickAll((done, total) => {
                    scanText.textContent = `读取磁力链接 (${done}/${total})…`;
                });
                suppressOutsideClose = false;
                suppressLiveRescan   = false;
                // 合并时优先保留带 dn=条目名称 的版本；避免 DOM 中的裸磁力链覆盖捕获结果。
                allLinks = mergeDetectedLinks(allLinks, spaCapture.captured);
            }

            scanning.classList.remove('active');
            refreshBtn.classList.remove('spinning');
            scanText.textContent = '正在扫描页面…';
            renderMagnetList();
        }

        requestAnimationFrame(() => run());
    }

    // 静默重扫：不显示遮罩/不转圈，用于 SPA 异步加载内容后的自动更新
    function silentRescan() {
        if (suppressLiveRescan) return; // clickAll 执行期间不允许覆盖结果
        const prevCount = allLinks.length;
        const domLinks = scanMagnetLinks();
        // 保留上次通过剪贴板拦截收集的 SPA 链接，并优先使用带条目名称的版本。
        allLinks = mergeDetectedLinks(domLinks, spaCapture.captured, txtExtractedLinks);
        hasScannedOnce = true;
        renderMagnetList();
        if (allLinks.length > prevCount) {
            showToast(`✓ 检测到新链接，已自动更新 (+${allLinks.length - prevCount})`, 1600);
        }
    }

    // ─────────────────────────────────────────────
    //  实时监听：很多搜索站结果是异步加载的（SPA），
    //  面板打开期间持续侦测 DOM 变化，自动补扫新出现的内容
    // ─────────────────────────────────────────────
    let liveDebounce = null;
    const liveObserver = new MutationObserver(() => {
        if (!panel.classList.contains('visible')) return;
        clearTimeout(liveDebounce);
        liveDebounce = setTimeout(silentRescan, 700);
    });
    liveObserver.observe(document.documentElement, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['href', 'onclick', 'data-hash', 'data-infohash', 'data-btih']
    });

    // ─────────────────────────────────────────────
    //  磁力面板事件
    // ─────────────────────────────────────────────
    // FAB 拖拽 + 边缘吸附 + 位置持久化
    let fabWasDragged = false; // 拖拽后抑制误触发的 click 打开面板
    (function () {
        let drag = false, moved = false, sx, sy, ox, oy;
        const FAB_SIZE = 54, MARGIN = 16, DRAG_THRESHOLD = 8;
        fab.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            drag = true; moved = false;
            sx = e.clientX; sy = e.clientY;
            const r = fab.getBoundingClientRect();
            ox = r.left; oy = r.top;
            fab.style.transition = 'none';
            fab.classList.add('dragging');
            try { fab.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });
        document.addEventListener('pointermove', e => {
            if (!drag) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved = true;
            if (moved) {
                const nLeft = Math.max(MARGIN, Math.min(innerWidth - FAB_SIZE - MARGIN, ox + dx));
                const nTop  = Math.max(MARGIN, Math.min(innerHeight - FAB_SIZE - MARGIN, oy + dy));
                fab.style.left = nLeft + 'px';
                fab.style.top  = nTop  + 'px';
                fab.style.right = 'auto'; fab.style.bottom = 'auto';
            }
        });
        document.addEventListener('pointerup', () => {
            if (!drag) return;
            drag = false;
            fab.classList.remove('dragging');
            fab.style.transition = '';
            if (moved) {
                fabWasDragged = true;
                // 边缘吸附 + 记忆位置
                const r = fab.getBoundingClientRect();
                const centerX = r.left + r.width / 2;
                const side = centerX < innerWidth / 2 ? 'left' : 'right';
                const y = Math.max(0, innerHeight - r.bottom - MARGIN);
                fab.style.top = 'auto';
                fab.style.bottom = y + 'px';
                if (side === 'left') { fab.style.left = MARGIN + 'px'; fab.style.right = 'auto'; }
                else { fab.style.right = MARGIN + 'px'; fab.style.left = 'auto'; }
                CFG.fabPos = { side, y };
                // 拖拽结束后延迟清除标志，覆盖随后触发的 click
                setTimeout(() => { fabWasDragged = false; }, 0);
            }
        });
    })();

    fab.onclick = () => {
        if (fabWasDragged) return; // 拖拽后不触发打开面板
        const isOpen = panel.classList.contains('visible');
        if (isOpen) {
            panel.classList.remove('visible');
        } else {
            alignPanelToFab();
            panel.classList.add('visible');
            if (!CFG.cacheResult || !hasScannedOnce) doMagnetScan();
            txtPreview.autoFetch();
        }
    };
    panel.querySelector('#lh-btn-close').onclick = () => panel.classList.remove('visible');
    panel.querySelector('#lh-btn-refresh').onclick = () => doMagnetScan();
    panel.querySelector('#lh-btn-copy-open').onclick = () => copyAndOpenDownloader();
    panel.querySelector('#lh-btn-copy-all').onclick = () => {
        copyAllLinks();
    };
    panel.querySelector('#lh-btn-open-downloader').onclick = () => openDownloader();
    panel.querySelector('#lh-btn-settings').onclick = () => panel.querySelector('#lh-settings').classList.add('visible');
    panel.querySelector('#lh-settings-close').onclick = () => panel.querySelector('#lh-settings').classList.remove('visible');
    panel.querySelector('#lh-set-btn-visible').onchange = e => { CFG.btnVisible = e.target.checked; fab.style.display = e.target.checked ? '' : 'none'; };
    panel.querySelector('#lh-set-dedupe').onchange = e => { CFG.dedupeHash = e.target.checked; };
    panel.querySelector('#lh-set-cache').onchange = e => { CFG.cacheResult = e.target.checked; };
    panel.querySelector('#lh-set-txt').onchange = e => { CFG.txtAutoScan = e.target.checked; };
    document.addEventListener('click', e => {
        if (suppressOutsideClose) return;             // 模拟点击期间不响应
        if (!panel.classList.contains('visible')) return;
        if (panel.contains(e.target) || e.target === fab) return;
        panel.classList.remove('visible');
    }, true);

    // 拖拽（磁力面板）
    (function() {
        const handle = panel.querySelector('#lh-drag-handle');
        let drag = false, sx, sy, or, ob;
        handle.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            if (innerWidth <= 520) return;
            drag = true; handle.setPointerCapture(e.pointerId);
            sx = e.clientX; sy = e.clientY;
            const r = panel.getBoundingClientRect();
            or = innerWidth - r.right; ob = innerHeight - r.bottom;
            panel.style.transition = 'none'; e.preventDefault();
        });
        document.addEventListener('pointermove', e => {
            if (!drag) return;
            panel.style.right = Math.max(0, Math.min(innerWidth-80, or-(e.clientX-sx))) + 'px';
            panel.style.bottom = Math.max(0, Math.min(innerHeight-80, ob-(e.clientY-sy))) + 'px';
        });
        document.addEventListener('pointerup', () => { if (drag) { drag = false; panel.style.transition = ''; } });
    })();

    // ─────────────────────────────────────────────
    //  TXT 预览模块
    // ─────────────────────────────────────────────
    const txtPreview = {
        // 解码 arraybuffer，返回 { text, encoding }
        decode(buffer) {
            try {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
                return { text: text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text, encoding: 'UTF-8' };
            } catch {
                try {
                    const text = new TextDecoder('gbk').decode(buffer);
                    return { text, encoding: 'GBK' };
                } catch (e) {
                    return { text: '解码失败: ' + e.message, encoding: '?' };
                }
            }
        },

        // 检测是否是 HTML 错误页，提取错误文本
        extractErrorText(raw) {
            const trimmed = raw.trim();
            if (!trimmed.startsWith('<!DOCTYPE') && !trimmed.startsWith('<html') &&
                !raw.includes('alert_error') && !raw.includes('alert_info')) return null;
            try {
                const doc = new DOMParser().parseFromString(raw, 'text/html');
                const el = doc.querySelector('.alert_error,.alert_info,.alert_btnleft,#messagetext');
                if (el) return '⚠️ 无法预览：\n' + el.innerText.trim();
                if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
                    const title = doc.querySelector('title');
                    return `⚠️ 无法预览：返回了 HTML 页面\n标题：${title ? title.innerText : '未知'}`;
                }
            } catch {}
            return null;
        },

        // 在附件链接旁注入预览按钮
        injectButton(linkEl, fileName) {
            if (linkEl.dataset.lhTxtInited) return;
            linkEl.dataset.lhTxtInited = '1';

            const btn = document.createElement('span');
            btn.className = 'lh-txt-trigger';
            btn.innerHTML = svgIcon(ICONS.file, 11) + ' 预览';
            btn.title = `预览 ${fileName}`;
            btn.onclick = e => { e.preventDefault(); e.stopPropagation(); this.toggle(linkEl, btn, fileName); };
            btn._linkEl = linkEl;
            btn._fileName = fileName;
            linkEl.insertAdjacentElement('afterend', btn);
        },

        // 切换预览框
        toggle(linkEl, btn, fileName) {
            if (btn._box && document.body.contains(btn._box)) {
                btn._box.remove(); btn._box = null;
                btn.classList.remove('active');
                btn.innerHTML = svgIcon(ICONS.check, 11) + ' 预览';
            } else if (btn._cachedText !== undefined) {
                const errorText = this.extractErrorText(btn._cachedText);
                this.showBox(errorText || btn._cachedText, btn, fileName, btn._cachedEncoding, !!errorText);
            } else {
                this.fetch(linkEl.href, btn, fileName);
            }
        },

        fetch(url, btn, fileName) {
            btn.classList.add('loading');
            btn.innerHTML = `<span class="lh-spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 加载中`;

            GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'arraybuffer',
                timeout: 20000, anonymous: false,
                headers: { Referer: location.href, Accept: 'text/plain,*/*' },
                onload: res => {
                    btn.classList.remove('loading');
                    if (res.status >= 200 && res.status < 300) {
                        const { text, encoding } = this.decode(res.response);
                        const errorText = this.extractErrorText(text);
                        this.showBox(errorText || text, btn, fileName, encoding, !!errorText);
                    } else {
                        btn.innerHTML = svgIcon(ICONS.file, 11) + ' 预览失败';
                        showToast(`加载失败 (${res.status})`);
                    }
                },
                onerror: () => {
                    btn.classList.remove('loading');
                    btn.innerHTML = svgIcon(ICONS.file, 11) + ' 网络错误';
                    showToast('请求出错，请检查控制台');
                },
                ontimeout: () => {
                    btn.classList.remove('loading');
                    btn.innerHTML = svgIcon(ICONS.file, 11) + ' 超时';
                    showToast('请求超时，请重试');
                }
            });
        },

        // 静默下载 TXT 附件，提取磁力/ED2K 链接合并到检测结果，不弹出预览框
        fetchSilent(url, btn, fileName) {
            btn.classList.add('loading');
            btn.innerHTML = `<span class="lh-spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 检测中`;

            GM_xmlhttpRequest({
                method: 'GET', url, responseType: 'arraybuffer',
                timeout: 20000, anonymous: false,
                headers: { Referer: location.href, Accept: 'text/plain,*/*' },
                onload: res => {
                    btn.classList.remove('loading');
                    if (res.status >= 200 && res.status < 300) {
                        const { text, encoding } = this.decode(res.response);
                        btn._cachedText = text;
                        btn._cachedEncoding = encoding;

                        // 从 TXT 内容中提取磁力/ED2K 链接
                        const found = [];
                        let m;
                        const mr = makeMagnetReg();
                        while ((m = mr.exec(text))) found.push(m[0]);
                        const er = makeEd2kReg();
                        while ((m = er.exec(text))) found.push(m[0]);

                        if (found.length > 0) {
                            txtExtractedLinks = mergeDetectedLinks(txtExtractedLinks, found);
                            allLinks = mergeDetectedLinks(scanMagnetLinks(), spaCapture.captured || [], txtExtractedLinks);
                            renderMagnetList();
                            showToast(`\u2713 从 ${fileName} 检测到 ${found.length} 个链接`, 2000);
                        } else {
                            showToast(`\ud83d\udcc4 ${fileName} 未发现链接`, 1800);
                        }

                        btn.classList.add('scanned');
                        btn.innerHTML = svgIcon(ICONS.check, 11) + ' 预览';
                    } else {
                        btn.innerHTML = svgIcon(ICONS.file, 11) + ' 检测失败';
                        showToast(`检测失败 (${res.status})`);
                    }
                },
                onerror: () => {
                    btn.classList.remove('loading');
                    btn.innerHTML = svgIcon(ICONS.file, 11) + ' 网络错误';
                    showToast('检测请求出错');
                },
                ontimeout: () => {
                    btn.classList.remove('loading');
                    btn.innerHTML = svgIcon(ICONS.file, 11) + ' 超时';
                    showToast('检测请求超时');
                }
            });
        },

        showBox(content, btn, fileName, encoding = '', isError = false) {
            btn.classList.add('active');
            btn.innerHTML = svgIcon(ICONS.close, 11) + ' 关闭预览';

            const box = document.createElement('div');
            box.className = 'lh-txt-box';

            const lineCount = content.split('\n').length;
            const charCount = content.length;

            box.innerHTML = `
                <div class="lh-txt-header" title="${escapeHtml(fileName)}">
                    <button class="lh-txt-copy-btn">
                        ${svgIcon(ICONS.copy, 11)} 复制全文
                    </button>
                    ${encoding ? `<span class="lh-txt-enc ${encoding==='UTF-8'?'utf8':''}">${encoding}</span>` : ''}
                    <span class="lh-txt-stats">${lineCount} 行 · ${charCount.toLocaleString()} 字</span>
                    <div class="lh-txt-header-actions">
                        <button class="lh-icon-btn lh-txt-close-btn" title="关闭">${svgIcon(ICONS.close)}</button>
                    </div>
                </div>
                <div class="lh-txt-body ${isError ? 'lh-txt-error' : ''}"></div>
                <div class="lh-txt-resize" title="拖拽调整大小">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M13 1L1 13M13 7L7 13M13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>`;

            // 安全设置文本（避免 XSS）
            box.querySelector('.lh-txt-body').textContent = content;

            document.body.appendChild(box);
            btn._box = box;

            // 定位：优先在按钮右侧或下方
            this.positionBox(btn, box);

            // 拖拽
            this.makeDraggable(box, box.querySelector('.lh-txt-header'));
            // 调整大小
            this.makeResizable(box, box.querySelector('.lh-txt-resize'));

            // 复制
            const copyBtn = box.querySelector('.lh-txt-copy-btn');
            copyBtn.onclick = () => {
                copyText(content);
                copyBtn.classList.add('copied');
                copyBtn.innerHTML = svgIcon(ICONS.check, 12) + ' 已复制！';
                setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = svgIcon(ICONS.copy, 12) + ' 复制全文'; }, 2000);
            };

            // 关闭
            const close = () => { box.remove(); btn._box = null; btn.classList.remove('active'); btn.innerHTML = svgIcon(ICONS.file, 11) + ' 预览'; };
            box.querySelector('.lh-txt-close-btn').onclick = close;
        },

        positionBox(btn, box) {
            // 移动端全屏抽屉：不设置定位，由 CSS 全屏铺开
            if (window.innerWidth <= 520) return;
            const btnRect = btn.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            // 底部安全边距：兼容手机底部导航栏/工具栏，保留 env(safe-area-inset-bottom) 或至少 20px
            const safeBottom = Math.max(20, parseInt(
                getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0'
            ) || 20);
            const bw = Math.min(560, vw - 32);

            // 优先在按钮下方
            let top = btnRect.bottom + 8;
            let left = btnRect.left;

            // 右边溢出修正
            if (left + bw > vw - 16) left = Math.max(8, vw - bw - 16);

            // 可用高度 = 视口高度 - top - 底部安全距离
            let availH = vh - top - safeBottom;

            // 若下方空间不足 160px，改到按钮上方
            if (availH < 160) {
                // 上方最多用到距顶部 8px
                const maxUpH = Math.max(160, btnRect.top - 8);
                top = Math.max(8, btnRect.top - Math.min(maxUpH, 480));
                availH = btnRect.top - top - 4;
            }

            // 动态限制预览框高度，确保不超出底部安全区
            const clampedH = Math.max(160, Math.min(520, availH));
            box.style.maxHeight = clampedH + 'px';
            box.style.left = left + 'px';
            box.style.top  = top  + 'px';
        },

        makeDraggable(box, handle) {
            // 移动端全屏抽屉不需要拖动
            if (window.innerWidth <= 520) return;
            let drag = false, sx, sy, ox, oy;
            handle.addEventListener('pointerdown', e => {
                if (e.target.closest('button')) return;
                drag = true; handle.setPointerCapture(e.pointerId);
                const r = box.getBoundingClientRect();
                sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
                box.style.transition = 'none'; e.preventDefault();
            });
            document.addEventListener('pointermove', e => {
                if (!drag) return;
                const nLeft = Math.max(0, Math.min(innerWidth - 80, ox + (e.clientX - sx)));
                const nTop  = Math.max(0, Math.min(innerHeight - 80, oy + (e.clientY - sy)));
                box.style.left = nLeft + 'px'; box.style.top = nTop + 'px';
            });
            document.addEventListener('pointerup', () => { if (drag) { drag = false; box.style.transition = ''; } });
        },

        makeResizable(box, handle) {
            // 移动端全屏抽屉不需要调整大小
            if (window.innerWidth <= 520) return;
            let drag = false, sx, sy, ow, oh;
            handle.addEventListener('pointerdown', e => {
                drag = true; handle.setPointerCapture(e.pointerId);
                sx = e.clientX; sy = e.clientY;
                ow = box.offsetWidth; oh = box.offsetHeight; e.preventDefault();
            });
            document.addEventListener('pointermove', e => {
                if (!drag) return;
                const nw = Math.max(280, Math.min(innerWidth - 32, ow + (e.clientX - sx)));
                const nh = Math.max(180, Math.min(innerHeight - 40, oh + (e.clientY - sy)));
                box.style.width = nw + 'px'; box.style.maxHeight = nh + 'px'; box.style.height = nh + 'px';
            });
            document.addEventListener('pointerup', () => { drag = false; });
        },

        // 自动下载 TXT 附件并提取链接（不弹出预览框）
        autoFetch() {
            if (this._autoFetching) return;
            this._autoFetching = true;

            this.scanPage();

            const triggers = document.querySelectorAll('.lh-txt-trigger');
            const pending = Array.from(triggers).filter(t => !t._scanned && !(t._box && document.body.contains(t._box)));

            if (pending.length === 0) {
                this._autoFetching = false;
                return;
            }

            showToast(`📄 正在检测 ${pending.length} 个 TXT 附件…`, 2500);
            pending.forEach(btn => {
                btn._scanned = true;
                this.fetchSilent(btn._linkEl.href, btn, btn._fileName);
            });

            this._autoFetching = false;
        },

        // 扫描页面中的 TXT 附件链接并注入按钮
        scanPage() {
            const seen = new Set();
            document.querySelectorAll('a[href*="mod=attachment"], a[href*=".txt"], a[href*="attach"]').forEach(link => {
                if (link.dataset.lhTxtInited) return;
                const href = link.getAttribute('href') || '';
                // 判断条件：href 含 attachment 参数，或 innerText/title 以 .txt 结尾
                let name = link.title || link.innerText.trim() || link.querySelector('[title]')?.title || '';
                // 去掉内部 span 的辅助文字
                if (!name && link.querySelector('span')) name = link.querySelector('span').innerText.trim();
                const isTxt = name.toLowerCase().endsWith('.txt') || href.toLowerCase().includes('.txt');
                if (!isTxt) return;
                const key = href + '|' + name;
                if (seen.has(key)) return; seen.add(key);
                this.injectButton(link, name || '文本附件');
            });
        },

        // 启动（含 MutationObserver 监听动态加载）
        start() {
            this.autoFetch();
            const ob = new MutationObserver(() => this.scanPage());
            ob.observe(document.body, { childList: true, subtree: true });
        }
    };

    // ─────────────────────────────────────────────
    //  油猴菜单
    // ─────────────────────────────────────────────
    GM_registerMenuCommand('打开链接检测', () => {
        fab.style.display = '';
        if (!panel.classList.contains('visible')) {
            alignPanelToFab();
            panel.classList.add('visible');
            if (!CFG.cacheResult || !hasScannedOnce) doMagnetScan();
        }
    });
    GM_registerMenuCommand('🔄 重新扫描链接', () => { alignPanelToFab(); panel.classList.add('visible'); doMagnetScan(); });
    GM_registerMenuCommand('📄 扫描 TXT 附件', () => txtPreview.scanPage());

    // ─────────────────────────────────────────────
    //  初始化
    // ─────────────────────────────────────────────
    if (CFG.txtAutoScan) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => txtPreview.start());
        } else {
            txtPreview.start();
        }
    }

})();
