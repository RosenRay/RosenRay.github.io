// ==UserScript==
// @name         色聚广告过滤
// @namespace    https://seju.life/
// @version      1.0
// @description  过滤色聚网站的置顶推荐广告及最新发布中的外链广告条目
// @author       ray
// @match        https://seju.life/*
// @match        https://seju.live/*
// @match        https://se114.org/*
// @grant        none
// @run-at       document-end
// @updateURL    https://rosenray.github.io/userscripts/seju-ad-filter.user.js
// @downloadURL  https://rosenray.github.io/userscripts/seju-ad-filter.user.js
// ==/UserScript==

(function () {
    'use strict';

    const currentHost = location.hostname;

    // 判断链接是否指向当前域名之外
    function isExternalLink(href) {
        if (!href) return false;
        // 忽略锚点、javascript: 等
        if (href.startsWith('#') || href.startsWith('javascript:')) return false;
        try {
            const u = new URL(href, location.href);
            return u.hostname !== currentHost;
        } catch (e) {
            return false;
        }
    }

    function filter() {
        // 1. 移除整个「置顶推荐」区块（全部为外链广告）
        document.querySelectorAll('div.sticky').forEach(el => el.remove());

        // 2. 过滤「最新发布」中的广告条目
        //    规则：文章主链接（标题或缩略图）非当前域名开头即视为广告
        document.querySelectorAll('article.excerpt').forEach(article => {
            const mainLink = article.querySelector('h2 a[href], .focus a[href]');
            if (mainLink && isExternalLink(mainLink.getAttribute('href'))) {
                article.remove();
            }
        });
    }

    // 首次执行
    filter();

    // 监听 DOM 变化，应对可能的动态加载/分页
    const observer = new MutationObserver(() => filter());
    observer.observe(document.body, { childList: true, subtree: true });
})();
