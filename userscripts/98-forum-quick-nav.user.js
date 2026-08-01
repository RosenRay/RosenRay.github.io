// ==UserScript==
// @name         98论坛快捷导航
// @namespace    https://rosenray.github.io/userscripts
// @version      1.0.0
// @description  在 98 手机版论坛首页的综合讨论区下方增加按最新排序的常用版块快捷入口。
// @author       ChatGPT
// @match        *://*/forum.php*
// @grant        none
// @run-at       document-end
// @updateURL    https://rosenray.github.io/userscripts/98-forum-quick-nav.user.js
// @downloadURL  https://rosenray.github.io/userscripts/98-forum-quick-nav.user.js
// ==/UserScript==

(function () {
    "use strict";

    const QUICK_NAV_ID = "n98_forum_quick_nav";
    const TARGET_SELECTOR = "#sub_forum_94 ul";
    const QUICK_LINKS = [
        {
            label: "综合讨论区 · 最新",
            href: "forum.php?mod=forumdisplay&fid=95&filter=author&orderby=dateline&mobile=2",
        },
        {
            label: "网友原创区 · 最新",
            href: "forum.php?mod=forumdisplay&fid=141&filter=author&orderby=dateline&mobile=2",
        },
    ];

    /**
     * Limits this script to the mobile forum-list page or equivalent DOM.
     * Hostnames are intentionally ignored because 98 mirrors change often.
     */
    function shouldRun() {
        const url = new URL(location.href);
        return (
            url.pathname.endsWith("/forum.php") &&
            (url.searchParams.get("forumlist") === "1" || document.querySelector(TARGET_SELECTOR))
        );
    }

    /**
     * Adds two sorted quick links to the 综合讨论区 forum group.
     * Duplicate protection keeps MutationObserver reruns idempotent.
     */
    function insertQuickNav() {
        const list = document.querySelector(TARGET_SELECTOR);
        if (!list || document.getElementById(QUICK_NAV_ID)) return;

        const fragment = document.createDocumentFragment();
        const marker = document.createElement("li");
        marker.id = QUICK_NAV_ID;
        marker.className = "n98_quick_forum_marker";
        marker.hidden = true;
        fragment.appendChild(marker);

        QUICK_LINKS.forEach((item) => {
            const li = document.createElement("li");
            const link = document.createElement("a");
            const info = document.createElement("i");

            li.className = "n98_quick_forum";
            link.className = "btdb";
            link.href = item.href;
            link.textContent = item.label;
            info.textContent = "按最新发布排序";

            li.append(link, info);
            fragment.appendChild(li);
        });

        list.appendChild(fragment);
    }

    /**
     * Watches late-rendered forum lists without repeatedly touching the page.
     */
    function start() {
        if (!shouldRun()) return;

        insertQuickNav();
        const observer = new MutationObserver(() => {
            if (document.getElementById(QUICK_NAV_ID)) {
                observer.disconnect();
                return;
            }
            insertQuickNav();
        });
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
