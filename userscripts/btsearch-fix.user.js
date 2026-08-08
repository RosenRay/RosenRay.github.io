// ==UserScript==
// @name         BTSearch 移动端筛选修复 + 磁力直达
// @namespace    btsearch-mobile-fix
// @version      1.4.0
// @description  修复 BTSearch 筛选框二次无法打开；磁力按钮直达下载工具；过滤搜索页广告。
// @author       ray
// @match        https://www.btsearch.love/*
// @match        https://btsearch.love/*
// @include      /^https:\/\/(?:www\.)?btsearch\.love\/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/)?search(?:[\/?#]|$)/
// @run-at       document-start
// @grant        none
// @updateURL    https://rosenray.github.io/userscripts/btsearch-fix.user.js
// @downloadURL  https://rosenray.github.io/userscripts/btsearch-fix.user.js
// ==/UserScript==

(function () {
    'use strict';

    var VERSION = '1.4.0';
    var FLAG = '__BTSEARCH_MOBILE_FIX_140__';

    if (window[FLAG]) return;
    window[FLAG] = true;

    var MAGNET_RE = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,64}(?:&[^\s"'<>]*)?/i;
    var COPY_WORD_RE = /(复制|copy|磁力|magnet)/i;
    var lastTrustedButton = null;
    var lastTrustedAt = 0;
    var lastOpenedMagnet = '';
    var lastOpenedAt = 0;
    var scanTimer = 0;
    var AD_ATTR_RE = /(?:^|[\s_-])(ad|ads|advert|advertisement|banner|sponsor|sponsored|promotion|promoted)(?:$|[\s_-])/i;
    var AD_TEXT_RE = /(?:^|[\s【\[（(])(广告|廣告|赞助|贊助|推广|推廣|sponsored|advertisement|promoted)(?:$|[\s】\]）):：])/i;
    var AD_URL_RE = /(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice|adserver|adnxs\.com|taboola\.com|outbrain\.com)/i;
    var FILTER_LINK_RE = /(?:[?&](?:sort_type|time)=|\/(?:sort|filter)(?:[/?#]|$))/i;
    var FILTER_WORD_RE = /^(?:排序|筛选|篩選|时间|時間|全部|主题|主題|最新|最早|热门|熱門|相关度|相關度|relevance|newest|oldest|filter|sort)$/i;

    function isElement(value) {
        return value && value.nodeType === 1;
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function cleanMagnet(value) {
        var text = String(value || '').replace(/&amp;/gi, '&').trim();
        var match;

        try {
            text = decodeURIComponent(text);
        } catch (ignore) {}

        match = text.match(MAGNET_RE);
        return match ? match[0].replace(/[),.;]+$/, '') : '';
    }

    function isSearchPath(urlValue) {
        var url;
        try {
            url = new URL(urlValue || location.href, location.href);
            return /^\/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?\/)?search\/?$/.test(url.pathname);
        } catch (ignore) {
            return false;
        }
    }

    function getButtonText(button) {
        if (!isElement(button)) return '';
        return normalizeText([
            button.getAttribute('aria-label'),
            button.getAttribute('title'),
            button.getAttribute('data-tooltip'),
            button.getAttribute('data-action'),
            button.getAttribute('data-testid'),
            button.className,
            button.textContent
        ].filter(Boolean).join(' '));
    }

    function isCopyButton(button) {
        var text;
        var rect;

        if (!isElement(button)) return false;
        if (!/^(BUTTON|A)$/i.test(button.tagName) && button.getAttribute('role') !== 'button') return false;
        if (button.id === 'btm-status-140' || button.closest('#btm-status-140')) return false;

        text = getButtonText(button);
        if (!COPY_WORD_RE.test(text)) return false;

        try {
            rect = button.getBoundingClientRect();
            if (rect.width > 260 || rect.height > 130) return false;
        } catch (ignore) {}

        return true;
    }

    function findCopyButton(target) {
        var button;
        if (!isElement(target)) return null;
        button = target.closest('button, a, [role="button"]');
        return isCopyButton(button) ? button : null;
    }

    function showMessage(text, bad) {
        var box;
        if (!document.documentElement) return;

        box = document.getElementById('btm-message-140');
        if (!box) {
            box = document.createElement('div');
            box.id = 'btm-message-140';
            (document.body || document.documentElement).appendChild(box);
        }

        box.textContent = text;
        box.style.cssText = [
            'position:fixed',
            'left:50%',
            'bottom:calc(28px + env(safe-area-inset-bottom))',
            'transform:translateX(-50%)',
            'z-index:2147483647',
            'max-width:calc(100vw - 32px)',
            'padding:10px 15px',
            'border-radius:20px',
            'background:' + (bad ? 'rgba(185,28,28,.95)' : 'rgba(17,24,39,.95)'),
            'color:#fff',
            'font:500 13px/1.35 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
            'text-align:center',
            'box-shadow:0 6px 24px rgba(0,0,0,.28)',
            'pointer-events:none'
        ].join('!important;') + '!important;';

        window.clearTimeout(box.__btmTimer);
        box.__btmTimer = window.setTimeout(function () {
            if (box && box.parentNode) box.parentNode.removeChild(box);
        }, 2200);
    }

    function markButton(button) {
        var textNodes;
        var i;
        var node;
        var changed = false;

        if (!isElement(button) || button.getAttribute('data-btm-140') === '1') return;

        button.setAttribute('data-btm-140', '1');
        button.setAttribute('title', '直接打开磁力下载工具');
        button.style.setProperty('min-width', '60px', 'important');
        button.style.setProperty('min-height', '40px', 'important');
        button.style.setProperty('touch-action', 'manipulation', 'important');
        button.style.setProperty('-webkit-tap-highlight-color', 'transparent', 'important');

        textNodes = button.childNodes;
        for (i = 0; i < textNodes.length; i++) {
            node = textNodes[i];
            if (node.nodeType === 3 && /(复制|copy)/i.test(node.nodeValue || '')) {
                node.nodeValue = String(node.nodeValue || '')
                    .replace(/复制(?:磁力|链接|磁链)?/ig, '打开')
                    .replace(/copy(?:\s*magnet)?/ig, '打开');
                changed = true;
            }
        }

        if (!changed && !button.querySelector('.btm-label-140')) {
            node = document.createElement('span');
            node.className = 'btm-label-140';
            node.textContent = ' 打开';
            node.style.cssText = 'font-size:12px!important;font-weight:600!important;white-space:nowrap!important;';
            button.appendChild(node);
        }
    }

    function installAdStyles() {
        var style;
        if (!document.documentElement || document.getElementById('btm-ad-style-140')) return;

        style = document.createElement('style');
        style.id = 'btm-ad-style-140';
        style.textContent = [
            '[data-btm-ad-hidden="1"]{display:none!important;visibility:hidden!important;',
            'height:0!important;min-height:0!important;max-height:0!important;',
            'margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;}'
        ].join('');
        (document.head || document.documentElement).appendChild(style);
    }

    function getAdAttributeText(element) {
        if (!isElement(element)) return '';
        return normalizeText([
            element.id,
            element.className,
            element.getAttribute('name'),
            element.getAttribute('role'),
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.getAttribute('data-testid'),
            element.getAttribute('data-ad'),
            element.getAttribute('data-ad-slot'),
            element.getAttribute('data-ad-client'),
            element.getAttribute('data-ad-unit')
        ].filter(Boolean).join(' '));
    }

    function hasFilterControl(element) {
        var controls;
        var i;
        var href;
        var label;

        if (!isElement(element)) return false;
        controls = element.querySelectorAll('a[href], button, select, [role="button"]');
        for (i = 0; i < controls.length; i++) {
            href = normalizeText(controls[i].getAttribute('href'));
            label = normalizeText([
                controls[i].getAttribute('name'),
                controls[i].getAttribute('aria-label'),
                controls[i].textContent
            ].filter(Boolean).join(' '));

            if (FILTER_LINK_RE.test(href)) return true;
            if (label.length <= 24 && FILTER_WORD_RE.test(label)) return true;
        }
        return false;
    }

    function hasSearchResultContent(element) {
        var buttons;
        var i;
        if (!isElement(element)) return false;
        if (element.querySelector('[data-btm-140="1"]')) return true;

        buttons = element.querySelectorAll('button, a, [role="button"]');
        for (i = 0; i < buttons.length; i++) {
            if (isCopyButton(buttons[i])) return true;
        }
        return false;
    }

    function isStrongAdNode(element) {
        var attrs;
        var src;
        var child;
        var matched = false;

        if (!isElement(element)) return false;
        if (element.id === 'btm-message-140' || element.closest('#btm-message-140')) return false;

        /* 先做廉价特征判断，只有疑似广告节点才检查其完整子树。 */
        attrs = getAdAttributeText(element);
        if (AD_ATTR_RE.test(attrs)) matched = true;

        if (element.hasAttribute('data-ad-client') ||
            element.hasAttribute('data-ad-slot') ||
            element.hasAttribute('data-ad-unit') ||
            element.hasAttribute('data-ad-format')) {
            matched = true;
        }

        src = normalizeText(element.getAttribute('src') || element.getAttribute('href'));
        if (AD_URL_RE.test(src)) matched = true;

        if (!matched && /^(IFRAME|INS|ASIDE)$/i.test(element.tagName)) {
            child = element.querySelector('iframe[src], script[src]');
            if (child && AD_URL_RE.test(normalizeText(child.getAttribute('src')))) matched = true;
        }

        if (!matched) return false;
        if (hasSearchResultContent(element) || hasFilterControl(element)) return false;
        return true;
    }

    function hideAdNode(element, reason) {
        if (!isElement(element) || element.getAttribute('data-btm-ad-hidden') === '1') return;
        if (hasSearchResultContent(element) || hasFilterControl(element)) return;

        element.setAttribute('data-btm-ad-hidden', '1');
        element.setAttribute('data-btm-ad-reason', reason || 'detected');
    }

    function filterStrongAds() {
        var selectors = [
            'ins.adsbygoogle',
            '.adsbygoogle',
            '[data-ad-client]',
            '[data-ad-slot]',
            '[data-ad-unit]',
            '[data-ad-format]',
            'iframe[src*="doubleclick"]',
            'iframe[src*="googlesyndication"]',
            'iframe[src*="googleadservices"]'
        ];
        var nodes;
        var genericNodes;
        var i;

        try {
            nodes = document.querySelectorAll(selectors.join(','));
            for (i = 0; i < nodes.length; i++) hideAdNode(nodes[i], 'strong-selector');
        } catch (ignoreSelector) {}

        genericNodes = document.querySelectorAll('aside, iframe, ins, section, article, div, li');
        for (i = 0; i < genericNodes.length; i++) {
            if (isStrongAdNode(genericNodes[i])) hideAdNode(genericNodes[i], 'strong-attribute');
        }
    }

    function findFirstResultTop() {
        var elements = document.querySelectorAll('[data-btm-140="1"], button, a, [role="button"]');
        var i;
        var button;
        var row;
        var rect;

        for (i = 0; i < elements.length; i++) {
            button = elements[i];
            if (button.getAttribute('data-btm-140') !== '1' && !isCopyButton(button)) continue;

            row = button.closest('article, li, [class*="result"], [class*="item"], [class*="card"]') || button.parentElement;
            if (!row) continue;
            try {
                rect = row.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return rect.top;
            } catch (ignoreRect) {}
        }
        return null;
    }

    function findFilterBottom(resultTop) {
        var elements = document.querySelectorAll('a[href], button, select, [role="button"]');
        var bottom = null;
        var i;
        var href;
        var label;
        var isFilter;
        var rect;

        for (i = 0; i < elements.length; i++) {
            href = normalizeText(elements[i].getAttribute('href'));
            label = normalizeText([
                elements[i].getAttribute('name'),
                elements[i].getAttribute('aria-label'),
                elements[i].textContent
            ].filter(Boolean).join(' '));
            isFilter = FILTER_LINK_RE.test(href) || (label.length <= 24 && FILTER_WORD_RE.test(label));
            if (!isFilter) continue;

            try {
                rect = elements[i].getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) continue;
                if (resultTop != null && rect.bottom >= resultTop) continue;
                if (bottom == null || rect.bottom > bottom) bottom = rect.bottom;
            } catch (ignoreRect) {}
        }
        return bottom;
    }

    function hasExternalPromotionLink(element) {
        var links = element.querySelectorAll('a[href]');
        var i;
        var url;

        for (i = 0; i < links.length; i++) {
            try {
                url = new URL(links[i].href, location.href);
                if (/^(magnet|javascript):/i.test(url.protocol)) continue;
                if (/^https?:$/i.test(url.protocol) && url.origin !== location.origin) return true;
            } catch (ignoreUrl) {}
        }
        return false;
    }

    function looksLikePositionalAd(element, filterBottom, resultTop) {
        var rect;
        var text;
        var attrs;
        var media;

        if (!isElement(element) || element.getAttribute('data-btm-ad-hidden') === '1') return false;
        if (/^(HTML|BODY|MAIN|FORM|NAV|HEADER|FOOTER)$/i.test(element.tagName)) return false;

        try {
            rect = element.getBoundingClientRect();
        } catch (ignoreRect) {
            return false;
        }

        if (rect.width < Math.min(160, window.innerWidth * 0.45) || rect.height < 18 || rect.height > 420) return false;
        if (rect.top < filterBottom - 10 || rect.bottom > resultTop + 10) return false;
        if (hasSearchResultContent(element) || hasFilterControl(element)) return false;

        text = normalizeText(element.textContent).slice(0, 500);
        attrs = getAdAttributeText(element);
        media = element.querySelector('img, picture, video, iframe, canvas, svg');

        if (AD_ATTR_RE.test(attrs) || AD_TEXT_RE.test(text)) return true;
        if (element.querySelector('iframe')) return true;
        if (hasExternalPromotionLink(element) && (media || text.length < 240)) return true;

        return false;
    }

    function filterPositionalAd() {
        var resultTop = findFirstResultTop();
        var filterBottom;
        var nodes;
        var matches = [];
        var i;
        var candidate;
        var parent;

        if (resultTop == null) return;
        filterBottom = findFilterBottom(resultTop);
        if (filterBottom == null || resultTop - filterBottom < 18) return;

        nodes = document.querySelectorAll('aside, iframe, ins, section, article, div, li');
        for (i = 0; i < nodes.length; i++) {
            if (looksLikePositionalAd(nodes[i], filterBottom, resultTop)) matches.push(nodes[i]);
        }

        /* 优先隐藏最外层广告容器，避免只隐藏图片后仍留下空白。 */
        for (i = 0; i < matches.length; i++) {
            candidate = matches[i];
            parent = candidate.parentElement;
            if (parent && matches.indexOf(parent) !== -1) continue;
            hideAdNode(candidate, 'between-filter-and-results');
        }
    }

    function filterAds() {
        if (!isSearchPath(location.href)) return;
        installAdStyles();
        filterStrongAds();
        filterPositionalAd();
    }

    function scanButtons() {
        var elements;
        var i;
        if (!document.querySelectorAll) return;

        elements = document.querySelectorAll('button, a, [role="button"]');
        for (i = 0; i < elements.length; i++) {
            if (isCopyButton(elements[i])) markButton(elements[i]);
        }
    }

    function scheduleScan() {
        window.clearTimeout(scanTimer);
        scanTimer = window.setTimeout(function () {
            scanButtons();
            filterAds();
        }, 120);
    }

    function recordTrusted(event) {
        var button;
        if (!event.isTrusted) return;
        button = findCopyButton(event.target);
        if (!button) return;

        lastTrustedButton = button;
        lastTrustedAt = Date.now();
    }

    function hasRecentTrustedClick() {
        return !!lastTrustedButton && Date.now() - lastTrustedAt < 3000;
    }

    function launchMagnet(value) {
        var magnet = cleanMagnet(value);
        var now = Date.now();
        var popup;

        if (!magnet || !hasRecentTrustedClick()) return false;
        if (magnet === lastOpenedMagnet && now - lastOpenedAt < 1500) return true;

        lastOpenedMagnet = magnet;
        lastOpenedAt = now;
        lastTrustedButton = null;
        lastTrustedAt = 0;

        try {
            /*
             * 必须同步执行在原复制按钮的可信点击调用栈中。
             * 使用 _blank 避免当前搜索页进入 magnet: 导航加载状态。
             */
            popup = window.open(magnet, '_blank');
            showMessage('正在打开磁力下载工具…', false);

            /* 某些内核会短暂创建空白页；外部协议接管后由浏览器自行关闭/保留。 */
            if (popup && popup.focus) {
                try { popup.focus(); } catch (ignoreFocus) {}
            }
        } catch (error) {
            showMessage('应用跳转被浏览器拦截，磁力链接仍已复制', true);
        }

        return true;
    }

    function patchClipboard() {
        var clipboard;
        var originalWrite;
        var proto;
        var originalProtoWrite;
        var originalExec;

        try {
            clipboard = navigator.clipboard;
            if (clipboard && typeof clipboard.writeText === 'function') {
                originalWrite = clipboard.writeText;
                try {
                    clipboard.writeText = function (text) {
                        var result = originalWrite.call(this, text);
                        launchMagnet(text);
                        return result;
                    };
                } catch (assignError) {
                    proto = window.Clipboard && window.Clipboard.prototype;
                    if (proto && typeof proto.writeText === 'function') {
                        originalProtoWrite = proto.writeText;
                        proto.writeText = function (text) {
                            var result = originalProtoWrite.call(this, text);
                            launchMagnet(text);
                            return result;
                        };
                    }
                }
            }
        } catch (clipboardError) {
            console.debug('[BTSearch 1.4] clipboard patch failed', clipboardError);
        }

        try {
            proto = window.Document && window.Document.prototype;
            if (proto && typeof proto.execCommand === 'function') {
                originalExec = proto.execCommand;
                proto.execCommand = function (command) {
                    var active;
                    var selectedText = '';
                    var result;
                    var start;
                    var end;

                    if (/^copy$/i.test(String(command))) {
                        try {
                            active = this.activeElement;
                            if (active && typeof active.value === 'string') {
                                start = typeof active.selectionStart === 'number' ? active.selectionStart : 0;
                                end = typeof active.selectionEnd === 'number' ? active.selectionEnd : active.value.length;
                                selectedText = active.value.slice(start, end) || active.value;
                            }
                            if (!selectedText && window.getSelection) {
                                selectedText = String(window.getSelection());
                            }
                        } catch (readError) {}
                    }

                    result = originalExec.apply(this, arguments);
                    if (selectedText) launchMagnet(selectedText);
                    return result;
                };
            }
        } catch (execError) {
            console.debug('[BTSearch 1.4] execCommand patch failed', execError);
        }
    }

    function shouldHardNavigate(urlValue) {
        var current;
        var target;
        var keys = ['sort_type', 'time'];
        var i;

        try {
            current = new URL(location.href);
            target = new URL(urlValue, location.href);

            if (current.origin !== target.origin || !isSearchPath(current.href) || !isSearchPath(target.href)) {
                return false;
            }

            for (i = 0; i < keys.length; i++) {
                if (current.searchParams.get(keys[i]) !== target.searchParams.get(keys[i])) return true;
            }
        } catch (ignore) {}

        return false;
    }

    function patchHistory() {
        var methods = ['pushState', 'replaceState'];
        var i;
        var method;
        var original;

        try {
            for (i = 0; i < methods.length; i++) {
                method = methods[i];
                original = history[method];
                if (typeof original !== 'function') continue;

                (function (methodName, originalMethod) {
                    history[methodName] = function (state, title, url) {
                        if (url != null && shouldHardNavigate(url)) {
                            location.assign(new URL(url, location.href).href);
                            return;
                        }
                        return originalMethod.apply(this, arguments);
                    };
                })(method, original);
            }
        } catch (historyError) {
            console.debug('[BTSearch 1.4] history patch failed', historyError);
        }
    }

    /* 尽早安装，确保早于页面框架保存 clipboard/history 的原始引用。 */
    patchClipboard();
    patchHistory();

    document.addEventListener('pointerdown', recordTrusted, true);
    document.addEventListener('touchstart', recordTrusted, true);
    document.addEventListener('mousedown', recordTrusted, true);
    document.addEventListener('click', recordTrusted, true);

    /* 链接型筛选条件直接完整刷新，避免筛选组件只初始化一次。 */
    document.addEventListener('click', function (event) {
        var anchor;
        if (!event.isTrusted || !isSearchPath(location.href) || findCopyButton(event.target)) return;
        if (!isElement(event.target)) return;

        anchor = event.target.closest('a[href]');
        if (!anchor || !shouldHardNavigate(anchor.href)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        location.assign(anchor.href);
    }, true);

    function startDomWork() {
        var observer;
        scanButtons();
        filterAds();

        observer = new MutationObserver(scheduleScan);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'title', 'aria-label', 'src', 'href', 'data-action', 'data-testid', 'data-ad-slot', 'data-ad-client']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startDomWork, { once: true });
    } else {
        startDomWork();
    }
})();
