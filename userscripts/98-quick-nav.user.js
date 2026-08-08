// ==UserScript==
// @name         98论坛快捷导航
// @namespace    https://rosenray.github.io/userscripts
// @version      1.0.1
// @description  在 98 手机版论坛首页左侧分类栏下方增加按最新排序的常用版块快捷入口。
// @author       ray
// @match        *://*/forum.php*
// @grant        none
// @run-at       document-end
// @updateURL    https://rosenray.github.io/userscripts/98-quick-nav.user.js
// @downloadURL  https://rosenray.github.io/userscripts/98-quick-nav.user.js
// ==/UserScript==

(function () {
    "use strict";

    const QUICK_NAV_ID = "n98_forum_quick_nav";
    const TARGET_SELECTOR = ".n5_bbsfq ul.tabs";
    const QUICK_LINKS = [
        {
            title: "综合讨论区",
            badge: "最新",
            href: "forum.php?mod=forumdisplay&fid=95&filter=author&orderby=dateline&mobile=2",
        },
        {
            title: "网友原创区",
            badge: "最新",
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
     * Adds two sorted quick links below the left category list.
     * Duplicate protection keeps MutationObserver reruns idempotent.
     */
    function insertQuickNav() {
        const tabs = document.querySelector(TARGET_SELECTOR);
        if (!tabs || document.getElementById(QUICK_NAV_ID)) return;

        installStyle();
        const panel = document.createElement("div");
        panel.id = QUICK_NAV_ID;
        panel.className = "n98_quick_nav_panel";

        QUICK_LINKS.forEach((item) => {
            const link = document.createElement("a");
            const title = document.createElement("span");
            const badge = document.createElement("em");

            link.className = "n98_quick_nav_link";
            link.href = item.href;
            title.textContent = item.title;
            badge.textContent = item.badge;

            link.append(title, badge);
            panel.appendChild(link);
        });

        tabs.insertAdjacentElement("afterend", panel);
    }

    /**
     * Provides a local fallback when the mobile theme CSS does not cover injected nodes.
     */
    function installStyle() {
        if (document.getElementById("n98_forum_quick_nav_style")) return;

        const style = document.createElement("style");
        style.id = "n98_forum_quick_nav_style";
        style.textContent = `
            #n98_forum_quick_nav {
                margin: 8px 0 0;
                border-top: 1px solid #e5e5e5;
                background: #f2f2f2;
            }
            #n98_forum_quick_nav .n98_quick_nav_link {
                display: block;
                box-sizing: border-box;
                min-height: 50px;
                padding: 8px 8px 7px 18px;
                border-bottom: 1px solid #e5e5e5;
                color: #4b4f55;
                font-size: 14px;
                line-height: 1.25;
                text-decoration: none;
                -webkit-tap-highlight-color: transparent;
            }
            #n98_forum_quick_nav .n98_quick_nav_link:active {
                background: #fff;
                color: #2f9bd7;
            }
            #n98_forum_quick_nav span,
            #n98_forum_quick_nav em {
                display: block;
                font-style: normal;
                white-space: nowrap;
            }
            #n98_forum_quick_nav em {
                margin-top: 3px;
                color: #9aa0a6;
                font-size: 11px;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
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
