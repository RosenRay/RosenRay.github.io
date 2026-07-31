// ==UserScript==
// @name         98手机网页浏览助手
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  98堂手机网页版辅助工具：屏蔽帖子列表首条广告、隐藏置顶帖、优化排序文字、复制代码、搜索过滤、自动签到、一键评分、一键回复、资源定位、自动登录、置顶修复 - UI增强版
// @author       bbbyqq
// @license      MIT
// @match        *://*/portal.php*
// @match        *://*/forum.php*
// @match        *://*/home.php*
// @match        *://*/plugin.php*
// @match        *://*/member.php*
// @match        *://*/search.php*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://rosenray.github.io/userscripts/98-mobile-browsing-helper.user.js
// @downloadURL  https://rosenray.github.io/userscripts/98-mobile-browsing-helper.user.js
// ==/UserScript==

(function () {
    "use strict";

    /* ============================================================
     * 一、常量配置区
     * 集中管理默认值与常量，便于后续维护
     * ============================================================ */

    // 默认回复文案（自动签到、一键回复共用，降低封号风险）
    const DEFAULT_REPLY_TEXTS = [
        "看着不错，辛苦楼主",
        "感谢楼主的分享",
        "资源很好，谢谢分享",
        "收藏了，支持一下",
        "好资源，感谢提供",
        "楼主辛苦了，谢谢",
        "支持楼主，继续加油",
        "感谢分享，已收藏",
        "不错的资源，谢谢楼主",
        "辛苦整理，支持一下",
    ];

    // 默认搜索排除关键词
    const DEFAULT_SEARCH_KEYWORDS = ["求", "约定", "SHA1"];

    // 默认资源定位关键词
    const DEFAULT_RESOURCE_KEYWORDS = [
        "复制代码",
        ".txt",
        ".zip",
        ".rar",
        ".7z",
        "本主题需向作者支付",
        ".torrent",
    ];

    // 安全问题列表（Discuz 标准列表）
    const SECURITY_QUESTIONS = [
        "安全提问(未设置请忽略)",
        "母亲的名字",
        "爷爷的名字",
        "父亲出生的城市",
        "您其中一位老师的名字",
        "您个人计算机的型号",
        "您最喜欢的餐馆名称",
        "驾驶执照最后四位数字",
    ];

    // 移动端 UA 关键词
    const MOBILE_UA_KEYWORDS = [
        "Android", "webOS", "iPhone", "iPad", "iPod",
        "BlackBerry", "Windows Phone",
    ];

    // 当前页面类型判断（一次计算，多处复用）
    const URL = location.href;
    const IS_PORTAL = URL.includes("portal.php");
    const IS_FORUM = URL.includes("forum.php");
    const IS_HOME = URL.includes("home.php");
    const IS_SEARCH = URL.includes("search.php");
    const IS_MEMBER = URL.includes("member.php");

    // 是否移动端
    const IS_MOBILE = MOBILE_UA_KEYWORDS.some((kw) =>
        navigator.userAgent.includes(kw)
    );

    // 顶部/底部广告容器选择器（class 为 show-text cl 的 div）
    const AD_SELECTOR = "div.show-text.cl";

    // 是否为论坛帖子列表页（forumdisplay）
    const IS_FORUM_DISPLAY =
        IS_FORUM && new URLSearchParams(location.search).get("mod") === "forumdisplay";


    /* ============================================================
     * 二、通用工具函数
     * 封装通用逻辑，减少重复代码
     * ============================================================ */

    /**
     * 等待 DOM 就绪后执行回调
     * 兼容已加载完成和加载中两种状态
     */
    function onDOMReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback);
        } else {
            callback();
        }
    }

    /**
     * 自定义消息弹窗系统
     * 支持 success / error / warning / info 四种样式
     * 支持多条堆叠、点击关闭、倒计时进度条
     */
    const showAlert = {
        success(message, duration = 2500) {
            this._show("success", message, duration);
        },
        error(message, duration = 2500) {
            this._show("error", message, duration);
        },
        warning(message, duration = 2500) {
            this._show("warning", message, duration);
        },
        info(message, duration = 2500) {
            this._show("info", message, duration);
        },
        _show(type, message, duration) {
            // 样式配置
            const styleConfig = {
                success: {
                    bgColor: "#f0f9eb", textColor: "#67c23a", borderColor: "#e1f3d8",
                    icon: `<svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M512 0c282.784 0 512 229.216 512 512s-229.216 512-512 512S0 794.784 0 512 229.216 0 512 0z m236.32 294.144L408.896 633.536 259.84 484.544 192 552.416l216.896 216.928 407.296-407.296-67.872-67.904z" fill="#67c23a"/></svg>`,
                },
                error: {
                    bgColor: "#fef0f0", textColor: "#f56d6d", borderColor: "#fde2e2",
                    icon: `<svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M509.262713 5.474574c281.272162 0 509.262713 228.02238 509.262713 509.262713 0 281.272162-227.990551 509.262713-509.262713 509.262713s-509.262713-227.990551-509.262713-509.262713c0-281.240333 227.990551-509.262713 509.262713-509.262713z m135.050106 278.725849L509.262713 419.250528l-135.050106-135.050105-90.012184 90.012184L419.186871 509.262713l-135.018277 135.081935 90.012184 90.012184L509.262713 599.274897l135.050106 135.050106 90.012184-90.012184L599.274897 509.262713l135.050106-135.050106-90.012184-90.012184z" fill="#f56d6d"/></svg>`,
                },
                warning: {
                    bgColor: "#fdf6ec", textColor: "#e6a23c", borderColor: "#faecd8",
                    icon: `<svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M512 64C264.8 64 64 264.8 64 512s200.8 448 448 448 448-200.8 448-448S759.2 64 512 64z m-44.8 736c-26.4 0-48-21.6-48-48s21.6-48 48-48 48 21.6 48 48-21.6 48-48 48z m44.8-176c-17.6 0-32-14.4-32-32V288c0-17.6 14.4-32 32-32s32 14.4 32 32v304c0 17.6-14.4 32-32 32z" fill="#e6a23c"/></svg>`,
                },
                info: {
                    bgColor: "#f4f4f5", textColor: "#909399", borderColor: "#e9e9eb",
                    icon: `<svg viewBox="0 0 1024 1024" width="16" height="16"><path d="M512 64C264.8 64 64 264.8 64 512s200.8 448 448 448 448-200.8 448-448S759.2 64 512 64z m0 560c-17.6 0-32-14.4-32-32V480c0-17.6 14.4-32 32-32s32 14.4 32 32v112c0 17.6-14.4 32-32 32z m0-240c-26.4 0-48-21.6-48-48s21.6-48 48-48 48 21.6 48 48-21.6 48-48 48z" fill="#909399"/></svg>`,
                },
            };

            // 注入全局样式（仅一次）
            if (!document.getElementById("n98_alert_style")) {
                const style = document.createElement("style");
                style.id = "n98_alert_style";
                style.textContent = `
                    #n98_alert_container {
                        position: fixed; top: 10px; left: 50%; transform: translateX(-50%);
                        z-index: 100000; display: flex; flex-direction: column; align-items: center;
                        gap: 8px; max-width: 90vw; pointer-events: none;
                    }
                    .n98_alert_item {
                        position: relative; min-width: 200px; max-width: 90vw;
                        padding: 10px 32px 10px 16px; border-radius: 6px; border: 1px solid;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        display: flex; align-items: center; gap: 8px;
                        font-size: 14px; line-height: 1.5; word-break: break-word;
                        pointer-events: auto; cursor: pointer; overflow: hidden;
                        animation: n98_alert_in 0.3s ease;
                        transition: opacity 0.3s, transform 0.3s;
                    }
                    .n98_alert_item.closing { opacity: 0; transform: translateX(20px); }
                    .n98_alert_item .alert-icon { flex-shrink: 0; line-height: 0; }
                    .n98_alert_item .alert-message { flex: 1; }
                    .n98_alert_item .alert-close {
                        position: absolute; top: 6px; right: 8px; width: 18px; height: 18px;
                        line-height: 18px; text-align: center; font-size: 14px; opacity: 0.5;
                    }
                    .n98_alert_item .alert-progress {
                        position: absolute; bottom: 0; left: 0; height: 2px;
                        background: currentColor; opacity: 0.4;
                    }
                    @keyframes n98_alert_in {
                        from { opacity: 0; transform: translateY(-20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `;
                document.head.appendChild(style);
            }

            // 获取或创建容器
            let container = document.getElementById("n98_alert_container");
            if (!container) {
                container = document.createElement("div");
                container.id = "n98_alert_container";
                document.body.appendChild(container);
            }

            const config = styleConfig[type] || styleConfig.info;
            const item = document.createElement("div");
            item.className = "n98_alert_item";
            item.style.backgroundColor = config.bgColor;
            item.style.color = config.textColor;
            item.style.borderColor = config.borderColor;
            item.innerHTML = `
                <div class="alert-icon">${config.icon}</div>
                <div class="alert-message">${message}</div>
                <div class="alert-close">×</div>
                <div class="alert-progress" style="width:100%"></div>
            `;

            // 关闭函数
            const closeItem = () => {
                clearTimeout(item.timeout);
                item.classList.add("closing");
                setTimeout(() => item.remove(), 300);
            };

            // 点击关闭
            item.addEventListener("click", closeItem);

            // 添加到容器
            container.appendChild(item);

            // 进度条动画
            const progress = item.querySelector(".alert-progress");
            progress.style.transition = `width ${duration}ms linear`;
            // 触发重绘后再改变宽度
            requestAnimationFrame(() => {
                progress.style.width = "0%";
            });

            // 自动关闭
            item.timeout = setTimeout(closeItem, duration);
        },
    };

    /**
     * 自定义模态框组件
     * 替代原生 prompt/confirm，支持输入框、下拉、密码遮挡
     * 调用方式：
     *   Modal.confirm({ title, message }).then(ok => ...)
     *   Modal.prompt({ title, placeholder, type }).then(text => ...)
     *   Modal.form({ title, fields }).then(data => ...)
     */
    const Modal = {
        _styleInjected: false,

        _injectStyle() {
            if (this._styleInjected) return;
            this._styleInjected = true;
            const style = document.createElement("style");
            style.textContent = `
                .n98_modal_mask {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5); z-index: 100001;
                    display: flex; align-items: center; justify-content: center;
                    padding: 16px; box-sizing: border-box;
                    animation: n98_modal_fade 0.2s ease;
                }
                .n98_modal_box {
                    background: #fff; border-radius: 10px; width: 100%; max-width: 380px;
                    max-height: 85vh; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                    animation: n98_modal_slide 0.25s ease;
                }
                .n98_modal_title {
                    font-size: 16px; font-weight: 700; color: #333; text-align: center;
                    padding: 18px 20px 12px;
                }
                .n98_modal_body { padding: 0 20px 16px; }
                .n98_modal_message { font-size: 14px; color: #606266; line-height: 1.6; text-align: center; margin: 8px 0; }
                .n98_modal_field { margin-bottom: 12px; }
                .n98_modal_field label {
                    display: block; font-size: 13px; color: #606266; margin-bottom: 6px;
                }
                .n98_modal_field input, .n98_modal_field select, .n98_modal_field textarea {
                    width: 100%; padding: 8px 10px; font-size: 14px; color: #333;
                    border: 1px solid #dcdfe6; border-radius: 4px; box-sizing: border-box;
                    background: #fff; transition: border-color 0.2s;
                }
                .n98_modal_field input:focus, .n98_modal_field select:focus, .n98_modal_field textarea:focus {
                    outline: none; border-color: #409eff;
                }
                .n98_modal_field textarea { resize: vertical; min-height: 60px; }
                .n98_modal_actions {
                    display: flex; gap: 10px; padding: 0 20px 18px;
                }
                .n98_modal_btn {
                    flex: 1; padding: 9px 0; text-align: center; font-size: 14px;
                    border-radius: 5px; cursor: pointer; border: none; transition: all 0.2s;
                }
                .n98_modal_btn-cancel {
                    background: #f5f7fa; color: #606266; border: 1px solid #dcdfe6;
                }
                .n98_modal_btn-cancel:active { background: #e9ecf1; }
                .n98_modal_btn-confirm {
                    background: #409eff; color: #fff;
                }
                .n98_modal_btn-confirm:active { background: #3a8ee6; }
                .n98_modal_btn-danger {
                    background: #f56d6d; color: #fff;
                }
                .n98_modal_btn-danger:active { background: #e64d4d; }
                @keyframes n98_modal_fade { from {opacity:0} to {opacity:1} }
                @keyframes n98_modal_slide { from {opacity:0; transform: translateY(-30px)} to {opacity:1; transform: translateY(0)} }
            `;
            document.head.appendChild(style);
        },

        /**
         * 创建模态框基础结构
         * @returns {{mask, box, close: Function}}
         */
        _create() {
            this._injectStyle();
            const mask = document.createElement("div");
            mask.className = "n98_modal_mask";
            const box = document.createElement("div");
            box.className = "n98_modal_box";
            mask.appendChild(box);
            document.body.appendChild(mask);

            const close = () => {
                mask.style.animation = "n98_modal_fade 0.2s ease reverse";
                setTimeout(() => mask.remove(), 200);
            };
            return { mask, box, close };
        },

        /**
         * 确认对话框
         * @param {{title?:string, message:string, confirmText?:string, cancelText?:string, danger?:boolean}} opts
         * @returns {Promise<boolean>}
         */
        confirm(opts = {}) {
            return new Promise((resolve) => {
                const { mask, box, close } = this._create();
                const title = opts.title || "提示";
                const message = opts.message || "";
                const confirmText = opts.confirmText || "确定";
                const cancelText = opts.cancelText || "取消";

                box.innerHTML = `
                    <div class="n98_modal_title">${title}</div>
                    <div class="n98_modal_body"><div class="n98_modal_message">${message}</div></div>
                `;
                const actions = document.createElement("div");
                actions.className = "n98_modal_actions";
                actions.innerHTML = `
                    <button class="n98_modal_btn n98_modal_btn-cancel">${cancelText}</button>
                    <button class="n98_modal_btn ${opts.danger ? "n98_modal_btn-danger" : "n98_modal_btn-confirm"}">${confirmText}</button>
                `;
                box.appendChild(actions);

                actions.children[0].addEventListener("click", () => { close(); resolve(false); });
                actions.children[1].addEventListener("click", () => { close(); resolve(true); });
                mask.addEventListener("click", (e) => {
                    if (e.target === mask) { close(); resolve(false); }
                });
            });
        },

        /**
         * 输入对话框
         * @param {{title?:string, placeholder?:string, value?:string, type?:string}} opts
         * @returns {Promise<string|null>} 返回输入值，取消则返回 null
         */
        prompt(opts = {}) {
            return new Promise((resolve) => {
                const { mask, box, close } = this._create();
                const title = opts.title || "请输入";
                const placeholder = opts.placeholder || "";
                const value = opts.value || "";
                const type = opts.type || "text";

                box.innerHTML = `
                    <div class="n98_modal_title">${title}</div>
                    <div class="n98_modal_body">
                        <div class="n98_modal_field">
                            <input type="${type}" id="n98_prompt_input" placeholder="${placeholder}" value="${value.replace(/"/g, "&quot;")}">
                        </div>
                    </div>
                `;
                const actions = document.createElement("div");
                actions.className = "n98_modal_actions";
                actions.innerHTML = `
                    <button class="n98_modal_btn n98_modal_btn-cancel">取消</button>
                    <button class="n98_modal_btn n98_modal_btn-confirm">确定</button>
                `;
                box.appendChild(actions);

                const input = box.querySelector("#n98_prompt_input");
                setTimeout(() => input.focus(), 100);

                const submit = () => { close(); resolve(input.value); };
                const cancel = () => { close(); resolve(null); };

                actions.children[0].addEventListener("click", cancel);
                actions.children[1].addEventListener("click", submit);
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") cancel();
                });
                mask.addEventListener("click", (e) => {
                    if (e.target === mask) cancel();
                });
            });
        },

        /**
         * 表单对话框（支持多个字段）
         * @param {{title?:string, fields:Array}} opts
         *   fields: [{ key, label, type:'text'|'password'|'select'|'textarea', value, placeholder, options:[{label,value}] }]
         * @returns {Promise<object|null>} 返回字段键值对象，取消则返回 null
         */
        form(opts = {}) {
            return new Promise((resolve) => {
                const { mask, box, close } = this._create();
                const title = opts.title || "请填写";

                let fieldsHtml = "";
                (opts.fields || []).forEach((f) => {
                    const val = (f.value !== undefined ? f.value : "").toString().replace(/"/g, "&quot;");
                    if (f.type === "select") {
                        const optsHtml = (f.options || []).map((o) =>
                            `<option value="${o.value}" ${o.value === f.value ? "selected" : ""}>${o.label}</option>`
                        ).join("");
                        fieldsHtml += `
                            <div class="n98_modal_field">
                                <label>${f.label}</label>
                                <select id="n98_field_${f.key}">${optsHtml}</select>
                            </div>
                        `;
                    } else if (f.type === "textarea") {
                        fieldsHtml += `
                            <div class="n98_modal_field">
                                <label>${f.label}</label>
                                <textarea id="n98_field_${f.key}" placeholder="${f.placeholder || ""}">${val}</textarea>
                            </div>
                        `;
                    } else {
                        fieldsHtml += `
                            <div class="n98_modal_field">
                                <label>${f.label}</label>
                                <input type="${f.type || "text"}" id="n98_field_${f.key}" placeholder="${f.placeholder || ""}" value="${val}">
                            </div>
                        `;
                    }
                });

                box.innerHTML = `
                    <div class="n98_modal_title">${title}</div>
                    <div class="n98_modal_body">${fieldsHtml}</div>
                `;
                const actions = document.createElement("div");
                actions.className = "n98_modal_actions";
                actions.innerHTML = `
                    <button class="n98_modal_btn n98_modal_btn-cancel">取消</button>
                    <button class="n98_modal_btn n98_modal_btn-confirm">确定</button>
                `;
                box.appendChild(actions);

                const submit = () => {
                    const data = {};
                    (opts.fields || []).forEach((f) => {
                        const el = box.querySelector(`#n98_field_${f.key}`);
                        if (el) {
                            data[f.key] = f.type === "select" ? Number(el.value) : el.value;
                        }
                    });
                    close();
                    resolve(data);
                };
                const cancel = () => { close(); resolve(null); };

                actions.children[0].addEventListener("click", cancel);
                actions.children[1].addEventListener("click", submit);
                mask.addEventListener("click", (e) => {
                    if (e.target === mask) cancel();
                });
            });
        },
    };

    /**
     * 自定义复制函数
     * 解决 GM_setClipboard 在 Safari 浏览器上不生效的 bug
     * @param {string} text 待复制文本
     */
    function copyContent(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        // 避免在移动端拉起键盘和滚动
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
        } catch (e) {
            console.error("[98助手] 复制失败:", e);
        }
        document.body.removeChild(textarea);
    }

    /**
     * 从预设回复文案中随机选一条，降低封号风险
     * @returns {string} 随机回复文案
     */
    function getRandomReplyText() {
        const replyTexts = GM_getValue("replyTexts", DEFAULT_REPLY_TEXTS);
        if (!Array.isArray(replyTexts) || replyTexts.length === 0) {
            return DEFAULT_REPLY_TEXTS[0];
        }
        return replyTexts[Math.floor(Math.random() * replyTexts.length)];
    }

    /**
     * 将 prompt 输入的字符串解析为数组
     * 按逗号分隔，去除首尾空格和空值
     * @param {string} input 用户输入
     * @returns {string[]} 解析后的数组
     */
    function parseInputToArray(input) {
        if (!input) return [];
        return input
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
    }

    /**
     * 安全地为表单元素设置值并触发对应事件
     * @param {HTMLElement} el 目标元素
     * @param {string} value 值
     * @param {string} eventName 触发的事件名（默认 input）
     */
    function setInputValue(el, value, eventName = "input") {
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event(eventName, { bubbles: true }));
    }

    /**
     * 安全点击元素
     * @param {HTMLElement} el 目标元素
     * @returns {boolean} 是否成功点击
     */
    function safeClick(el) {
        if (el && typeof el.click === "function") {
            el.click();
            return true;
        }
        return false;
    }

    /**
     * 函数防抖
     * @param {Function} fn 目标函数
     * @param {number} delay 延迟毫秒
     */
    function debounce(fn, delay = 200) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }


    /* ============================================================
     * 三、功能模块
     * 每个模块独立，按页面生效
     * ============================================================ */

    /* ---------- 模块1：首页按钮（portal.php） ---------- */

    /**
     * 首页顶部工具栏 + 设置中心抽屉面板
     * 工具栏：设置中心入口、搜索过滤开关、自动签到
     * 设置中心：集中管理所有配置项（关键词、回复文案、自动登录）
     */
    function initPortalButtons() {
        if (!IS_PORTAL) return;

        // 注入工具栏与抽屉样式（仅一次）
        if (!document.getElementById("n98_portal_style")) {
            const style = document.createElement("style");
            style.id = "n98_portal_style";
            style.textContent = `
                /* 顶部工具栏 */
                .n98_toolbar {
                    display: flex; align-items: center; gap: 10px;
                    padding: 10px; background: #fff; border-radius: 8px;
                    margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);
                }
                .n98_toolbar_btn {
                    display: flex; align-items: center; justify-content: center; gap: 4px;
                    padding: 8px 12px; border-radius: 6px; font-size: 13px;
                    cursor: pointer; border: none; color: #fff; transition: all 0.2s;
                    min-height: 36px;
                }
                .n98_toolbar_btn:active { transform: scale(0.96); }
                .n98_toolbar_btn svg { width: 16px; height: 16px; }
                .n98_toolbar_btn-primary { background: #409eff; flex: 0 0 auto; }
                .n98_toolbar_btn-danger { background: #f56d6d; margin-left: auto; }
                /* 开关样式 */
                .n98_toggle {
                    display: flex; align-items: center; gap: 6px; font-size: 13px; color: #606266;
                }
                .n98_toggle_switch {
                    position: relative; width: 40px; height: 22px; background: #dcdfe6;
                    border-radius: 11px; cursor: pointer; transition: background 0.25s; flex-shrink: 0;
                }
                .n98_toggle_switch.on { background: #409eff; }
                .n98_toggle_switch::after {
                    content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
                    background: #fff; border-radius: 50%; transition: transform 0.25s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
                .n98_toggle_switch.on::after { transform: translateX(18px); }
                /* 抽屉面板 */
                .n98_drawer_mask {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100002;
                    opacity: 0; transition: opacity 0.25s;
                }
                .n98_drawer_mask.show { opacity: 1; }
                .n98_drawer {
                    position: fixed; top: 0; right: 0; width: 88vw; max-width: 360px;
                    height: 100%; background: #f5f7fa; z-index: 100003;
                    transform: translateX(100%); transition: transform 0.3s ease;
                    display: flex; flex-direction: column;
                }
                .n98_drawer.show { transform: translateX(0); }
                .n98_drawer_header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 14px 16px; background: #409eff; color: #fff; flex-shrink: 0;
                }
                .n98_drawer_title { font-size: 16px; font-weight: 700; }
                .n98_drawer_close {
                    width: 28px; height: 28px; line-height: 28px; text-align: center;
                    font-size: 20px; cursor: pointer; opacity: 0.8;
                }
                .n98_drawer_body { flex: 1; overflow-y: auto; padding: 12px; }
                .n98_drawer_section {
                    background: #fff; border-radius: 8px; padding: 12px; margin-bottom: 10px;
                }
                .n98_drawer_section_title {
                    font-size: 14px; font-weight: 700; color: #303133; margin-bottom: 8px;
                    display: flex; align-items: center; gap: 6px;
                }
                .n98_drawer_section_title svg { width: 15px; height: 15px; color: #409eff; }
                .n98_drawer_field { margin-bottom: 10px; }
                .n98_drawer_field:last-child { margin-bottom: 0; }
                .n98_drawer_field label {
                    display: block; font-size: 12px; color: #909399; margin-bottom: 4px;
                }
                .n98_drawer_field input, .n98_drawer_field select, .n98_drawer_field textarea {
                    width: 100%; padding: 7px 10px; font-size: 13px; color: #303133;
                    border: 1px solid #dcdfe6; border-radius: 5px; box-sizing: border-box;
                    background: #fff; transition: border-color 0.2s;
                }
                .n98_drawer_field input:focus, .n98_drawer_field select:focus, .n98_drawer_field textarea:focus {
                    outline: none; border-color: #409eff;
                }
                .n98_drawer_field textarea { resize: vertical; min-height: 54px; }
                .n98_drawer_field_hint { font-size: 11px; color: #c0c4cc; margin-top: 3px; }
                .n98_drawer_actions {
                    display: flex; gap: 8px; padding: 12px; flex-shrink: 0;
                    background: #fff; border-top: 1px solid #ebeef5;
                }
                .n98_drawer_btn {
                    flex: 1; padding: 9px 0; text-align: center; font-size: 14px;
                    border-radius: 5px; cursor: pointer; border: none; transition: all 0.2s;
                }
                .n98_drawer_btn-reset { background: #f5f7fa; color: #606266; border: 1px solid #dcdfe6; }
                .n98_drawer_btn-save { background: #409eff; color: #fff; }
                .n98_drawer_btn:active { transform: scale(0.97); }
            `;
            document.head.appendChild(style);
        }

        const parent = document.querySelector(".n5_jujiao");
        if (!parent) return;

        // 移除已存在的工具栏，避免重复
        const existing = document.querySelector(".n98_toolbar");
        if (existing) existing.remove();

        // 隐藏轮播图
        const carousel = document.querySelector("#n5_mohd");
        if (carousel) carousel.style.display = "none";

        // ===== 创建顶部工具栏 =====
        const toolbar = document.createElement("div");
        toolbar.className = "n98_toolbar";

        // 设置中心按钮
        const settingsBtn = document.createElement("button");
        settingsBtn.className = "n98_toolbar_btn n98_toolbar_btn-primary";
        settingsBtn.innerHTML = `<svg viewBox="0 0 1024 1024"><path d="M512 64C264.8 64 64 264.8 64 512s200.8 448 448 448 448-200.8 448-448S759.2 64 512 64z m219.2 552.8l32 55.2-80 80-55.2-32c-26.4 14.4-55.2 25.6-84.8 32L528 856h-32l-15.2-103.2c-30.4-6.4-58.4-17.6-84.8-32l-55.2 32-80-80 32-55.2c-14.4-26.4-25.6-55.2-32-84.8L168 520v-32l103.2-15.2c6.4-30.4 17.6-58.4 32-84.8l-32-55.2 80-80 55.2 32c26.4-14.4 55.2-25.6 84.8-32L496 168h32l15.2 103.2c30.4 6.4 58.4 17.6 84.8 32l55.2-32 80 80-32 55.2c14.4 26.4 25.6 55.2 32 84.8L856 496v32l-103.2 15.2c-6.4 29.6-17.6 58.4-32 84.8zM512 384c-70.4 0-128 57.6-128 128s57.6 128 128 128 128-57.6 128-128-57.6-128-128-128z" fill="currentColor"/></svg>设置中心`;
        settingsBtn.addEventListener("click", openSettingsDrawer);

        // 搜索过滤开关
        const filterEnabled = GM_getValue("searchFilterEnabled", true);
        const toggleWrap = document.createElement("div");
        toggleWrap.className = "n98_toggle";
        toggleWrap.innerHTML = `
            <span>过滤</span>
            <div class="n98_toggle_switch ${filterEnabled ? "on" : ""}" id="n98_filter_toggle"></div>
        `;
        toggleWrap.querySelector("#n98_filter_toggle").addEventListener("click", function () {
            const newState = !GM_getValue("searchFilterEnabled", true);
            GM_setValue("searchFilterEnabled", newState);
            this.classList.toggle("on", newState);
            showAlert.success("搜索过滤功能已" + (newState ? "开启" : "关闭"), 2000);
        });

        // 自动签到按钮
        const signBtn = document.createElement("button");
        signBtn.className = "n98_toolbar_btn n98_toolbar_btn-danger";
        signBtn.innerHTML = `<svg viewBox="0 0 1024 1024"><path d="M512 64C264.8 64 64 264.8 64 512s200.8 448 448 448 448-200.8 448-448S759.2 64 512 64z m48 720H464V544h96v240z m0-336H464v-96h96v96z" fill="currentColor"/></svg>自动签到`;
        signBtn.addEventListener("click", () => {
            GM_setValue("autoSign", true);
            GM_setValue("isReply", false);
            // 首次使用给出风险提示
            if (!GM_getValue("isTips", false)) {
                Modal.confirm({
                    title: "风险提示",
                    message: '每点击一次自动签到，都会自动去国产原创区发送一条"感谢分享"的评论，如因评论过多被封号，本人概不负责！',
                    confirmText: "我已了解",
                    danger: true,
                }).then((ok) => {
                    GM_setValue("isTips", true);
                    if (ok) {
                        safeClick(document.querySelector(".footer_menu ul li:nth-child(2) a"));
                    } else {
                        GM_setValue("autoSign", false);
                    }
                });
            } else {
                safeClick(document.querySelector(".footer_menu ul li:nth-child(2) a"));
            }
        });

        toolbar.appendChild(settingsBtn);
        toolbar.appendChild(toggleWrap);
        toolbar.appendChild(signBtn);
        parent.insertBefore(toolbar, parent.firstChild);

        // ===== 设置中心抽屉面板 =====
        function openSettingsDrawer() {
            // 移除已存在的抽屉
            const existingMask = document.querySelector(".n98_drawer_mask");
            if (existingMask) existingMask.remove();

            const mask = document.createElement("div");
            mask.className = "n98_drawer_mask";
            const drawer = document.createElement("div");
            drawer.className = "n98_drawer";

            // 读取当前配置
            const cfg = {
                search_keywords: GM_getValue("search_keywords", DEFAULT_SEARCH_KEYWORDS),
                resource_keywords: GM_getValue("resource_keywords", DEFAULT_RESOURCE_KEYWORDS),
                replyTexts: GM_getValue("replyTexts", DEFAULT_REPLY_TEXTS),
                username: GM_getValue("username", ""),
                password: GM_getValue("password", ""),
                questionValue: GM_getValue("questionValue", 0),
                answer: GM_getValue("answer", ""),
                autoLogin: GM_getValue("autoLogin", false),
            };

            const questionOpts = SECURITY_QUESTIONS
                .map((q, i) => `<option value="${i}" ${i === cfg.questionValue ? "selected" : ""}>${q}</option>`)
                .join("");

            drawer.innerHTML = `
                <div class="n98_drawer_header">
                    <span class="n98_drawer_title">⚙ 设置中心</span>
                    <span class="n98_drawer_close">×</span>
                </div>
                <div class="n98_drawer_body">
                    <div class="n98_drawer_section">
                        <div class="n98_drawer_section_title">
                            <svg viewBox="0 0 1024 1024"><path d="M944 416h-64l-24-58.4 45-45c8.8-8.8 8.8-23.2 0-32l-88-88c-8.8-8.8-23.2-8.8-32 0l-45 45L681 224V160c0-13.6-10.4-24-24-24h-176c-13.6 0-24 10.4-24 24v64l-58.4 24-45-45c-8.8-8.8-23.2-8.8-32 0l-88 88c-8.8 8.8-8.8 23.2 0 32l45 45L249 416h-64c-13.6 0-24 10.4-24 24v176c0 13.6 10.4 24 24 24h64l24 58.4-45 45c-8.8 8.8-8.8 23.2 0 32l88 88c8.8 8.8 23.2 8.8 32 0l45-45 58.4 24v64c0 13.6 10.4 24 24 24h176c13.6 0 24-10.4 24-24v-64l58.4-24 45 45c8.8 8.8 23.2 8.8 32 0l88-88c8.8-8.8 8.8-23.2 0-32l-45-45 24-58.4h64c13.6 0 24-10.4 24-24V440c0-13.6-10.4-24-24-24zM512 656c-80 0-144-64-144-144s64-144 144-144 144 64 144 144-64 144-144 144z" fill="currentColor"/></svg>
                            关键词配置
                        </div>
                        <div class="n98_drawer_field">
                            <label>搜索排除关键词（逗号分隔）</label>
                            <textarea id="n98_cfg_search_keywords">${cfg.search_keywords.join(",")}</textarea>
                            <div class="n98_drawer_field_hint">搜索结果含这些词的帖子将被隐藏</div>
                        </div>
                        <div class="n98_drawer_field">
                            <label>资源定位关键词（逗号分隔）</label>
                            <textarea id="n98_cfg_resource_keywords">${cfg.resource_keywords.join(",")}</textarea>
                            <div class="n98_drawer_field_hint">帖子页点击"资源位置"时匹配这些词</div>
                        </div>
                        <div class="n98_drawer_field">
                            <label>回复文案（逗号分隔）</label>
                            <textarea id="n98_cfg_reply_texts">${cfg.replyTexts.join(",")}</textarea>
                            <div class="n98_drawer_field_hint">自动签到和一键回复会随机选一条</div>
                        </div>
                    </div>
                    <div class="n98_drawer_section">
                        <div class="n98_drawer_section_title">
                            <svg viewBox="0 0 1024 1024"><path d="M832 384h-64V288c0-141.6-114.4-256-256-256S256 146.4 256 288v96h-64c-35.2 0-64 28.8-64 64v448c0 35.2 28.8 64 64 64h640c35.2 0 64-28.8 64-64V448c0-35.2-28.8-64-64-64z m-320 320c-35.2 0-64-28.8-64-64s28.8-64 64-64 64 28.8 64 64-28.8 64-64 64z m128-320H384V288c0-70.4 57.6-128 128-128s128 57.6 128 128v96z" fill="currentColor"/></svg>
                            自动登录
                        </div>
                        <div class="n98_drawer_field">
                            <label>用户名</label>
                            <input type="text" id="n98_cfg_username" value="${cfg.username.replace(/"/g, "&quot;")}" placeholder="请输入用户名">
                        </div>
                        <div class="n98_drawer_field">
                            <label>密码</label>
                            <input type="password" id="n98_cfg_password" value="${cfg.password.replace(/"/g, "&quot;")}" placeholder="请输入密码">
                        </div>
                        <div class="n98_drawer_field">
                            <label>安全问题</label>
                            <select id="n98_cfg_question">${questionOpts}</select>
                        </div>
                        <div class="n98_drawer_field">
                            <label>安全问题答案</label>
                            <input type="text" id="n98_cfg_answer" value="${cfg.answer.replace(/"/g, "&quot;")}" placeholder="未设置请留空">
                        </div>
                        <div class="n98_drawer_field">
                            <label>自动登录</label>
                            <div class="n98_toggle">
                                <div class="n98_toggle_switch ${cfg.autoLogin ? "on" : ""}" id="n98_cfg_autologin"></div>
                                <span id="n98_cfg_autologin_text">${cfg.autoLogin ? "已启用" : "已禁用"}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="n98_drawer_actions">
                    <button class="n98_drawer_btn n98_drawer_btn-reset">恢复默认</button>
                    <button class="n98_drawer_btn n98_drawer_btn-save">保存配置</button>
                </div>
            `;

            mask.appendChild(drawer);
            document.body.appendChild(mask);

            // 触发显示动画
            requestAnimationFrame(() => {
                mask.classList.add("show");
                drawer.classList.add("show");
            });

            // 自动登录开关交互
            const autoLoginSwitch = drawer.querySelector("#n98_cfg_autologin");
            const autoLoginText = drawer.querySelector("#n98_cfg_autologin_text");
            autoLoginSwitch.addEventListener("click", function () {
                const isOn = this.classList.toggle("on");
                autoLoginText.innerText = isOn ? "已启用" : "已禁用";
            });

            // 关闭函数
            const closeDrawer = () => {
                mask.classList.remove("show");
                drawer.classList.remove("show");
                setTimeout(() => mask.remove(), 300);
            };
            drawer.querySelector(".n98_drawer_close").addEventListener("click", closeDrawer);
            mask.addEventListener("click", (e) => {
                if (e.target === mask) closeDrawer();
            });

            // 保存配置
            drawer.querySelector(".n98_drawer_btn-save").addEventListener("click", () => {
                const searchKeywords = parseInputToArray(drawer.querySelector("#n98_cfg_search_keywords").value);
                const resourceKeywords = parseInputToArray(drawer.querySelector("#n98_cfg_resource_keywords").value);
                const replyTexts = parseInputToArray(drawer.querySelector("#n98_cfg_reply_texts").value);

                if (replyTexts.length === 0) {
                    showAlert.error("至少需要一条回复文案", 2000);
                    return;
                }

                GM_setValue("search_keywords", searchKeywords);
                GM_setValue("resource_keywords", resourceKeywords);
                GM_setValue("replyTexts", replyTexts);
                GM_setValue("username", drawer.querySelector("#n98_cfg_username").value);
                GM_setValue("password", drawer.querySelector("#n98_cfg_password").value);
                GM_setValue("questionValue", Number(drawer.querySelector("#n98_cfg_question").value));
                GM_setValue("answer", drawer.querySelector("#n98_cfg_answer").value);
                GM_setValue("autoLogin", autoLoginSwitch.classList.contains("on"));

                showAlert.success("配置已保存", 2000);
                closeDrawer();
            });

            // 恢复默认
            drawer.querySelector(".n98_drawer_btn-reset").addEventListener("click", () => {
                Modal.confirm({
                    title: "恢复默认",
                    message: "确定要将所有配置恢复为默认值吗？此操作不可撤销。",
                    confirmText: "恢复",
                    danger: true,
                }).then((ok) => {
                    if (!ok) return;
                    GM_setValue("search_keywords", DEFAULT_SEARCH_KEYWORDS);
                    GM_setValue("resource_keywords", DEFAULT_RESOURCE_KEYWORDS);
                    GM_setValue("replyTexts", DEFAULT_REPLY_TEXTS);
                    GM_setValue("username", "");
                    GM_setValue("password", "");
                    GM_setValue("questionValue", 0);
                    GM_setValue("answer", "");
                    GM_setValue("autoLogin", false);
                    showAlert.success("已恢复默认配置", 2000);
                    closeDrawer();
                });
            });
        }
    }

    /* ---------- 模块2：复制代码增强（forum.php） ---------- */

    /**
     * 解决 98 手机网页版复制代码只复制第一行的问题
     * 原理：给代码块每个 li 补 a 标签，点击复制时拼接所有行
     */
    function initCopyCodeEnhance() {
        if (!IS_FORUM) return;

        document.querySelectorAll(".blockbtn").forEach((btn) => {
            const targetId = btn.getAttribute("data-clipboard-target");
            if (!targetId) return;
            const targetEl = document.querySelector(targetId);
            if (!targetEl) return;
            const container = targetEl.parentNode;
            if (!container) return;

            // 判断 li a 是否存在
            let linkList = container.querySelectorAll("li a");

            // 若不存在，则给每个 li 补 a 标签
            if (!linkList || linkList.length === 0) {
                container.querySelectorAll("li").forEach((li) => {
                    const text = li.innerText.trim();
                    if (!text) return;
                    const a = document.createElement("a");
                    a.href = text;
                    a.innerText = text;
                    a.style.cssText = `
                        color: inherit;
                        text-decoration: none;
                    `;
                    li.innerHTML = "";
                    li.appendChild(a);
                });
            }

            // 点击复制
            btn.addEventListener("click", () => {
                const code = [];
                container.querySelectorAll("li a").forEach((item) => {
                    code.push(item.innerText);
                });
                const codeText = code.join("\n");
                // 延迟 500ms 避免与站点原生逻辑冲突
                setTimeout(() => {
                    copyContent(codeText);
                    showAlert.success("已复制 " + code.length + " 行代码", 2000);
                }, 500);
            });
        });
    }

    /* ---------- 模块3：搜索助手（search.php / home.php） ---------- */

    /**
     * 在搜索/我的页面添加排除关键词 checkbox
     * 勾选后自动隐藏包含对应关键词的帖子，支持开关控制
     */
    function initSearchHelper() {
        if (!IS_SEARCH && !IS_HOME) return;

        // 检查搜索过滤开关是否开启
        const searchFilterEnabled = GM_getValue("searchFilterEnabled", true);

        const excludes = {
            description: "排除关键词",
            keywords: GM_getValue("search_keywords", DEFAULT_SEARCH_KEYWORDS),
        };

        // 从缓存获取已勾选状态
        let checkedList = GM_getValue("checkedList") || [];
        if (!Array.isArray(checkedList)) checkedList = [];

        if (searchFilterEnabled) {
            createExcludesWrapper();
            removeDuplicateWrappers();
        } else {
            // 开关关闭时，恢复所有被隐藏的搜索结果
            document.querySelectorAll(".threadlist ul li").forEach((item) => {
                item.style.removeProperty("display");
            });
        }

        // 添加排除关键字区块
        function createExcludesWrapper() {
            const excludesWrapper = document.createElement("div");
            excludesWrapper.className = "excludes-wrapper";
            excludesWrapper.style.cssText =
                "font-size: 20px;display: flex;align-items: center;font-weight: 700;flex-wrap: wrap;";
            excludesWrapper.innerHTML = `<span>${excludes.description}：</span>`;
            document.querySelector("#searchform")?.append(excludesWrapper);
            document.querySelector(".threadlist")?.prepend(excludesWrapper);

            removeSearchResult();

            excludes.keywords.forEach((item) => {
                const wrapper = document.querySelector(".excludes-wrapper");
                const label = document.createElement("label");
                label.className = "excludes-item";
                label.style.cssText = "margin-right: 10px;";
                label.innerHTML = `<input type="checkbox" style="margin-right: 5px;" value="${item}" ${checkedList.some((val) => item === val) ? "checked" : ""}/>${item}`;
                wrapper?.appendChild(label);
            });
        }

        // 删除重复的 wrapper（避免脚本重复执行导致重复渲染）
        function removeDuplicateWrappers() {
            const wrapperNodeList = document.querySelectorAll(".excludes-wrapper");
            for (let i = wrapperNodeList.length - 1; i > 0; i--) {
                wrapperNodeList[i].parentNode?.removeChild(wrapperNodeList[i]);
            }
        }

        // 监听勾选状态
        document
            .querySelectorAll('.excludes-item input[type="checkbox"]')
            .forEach((checkbox) => {
                checkbox?.addEventListener("change", (e) => {
                    const isChecked = e.target.checked;
                    const checkedValue = e.target.value;
                    if (isChecked) {
                        checkedList.push(checkedValue);
                    } else {
                        checkedList = checkedList.filter((val) => val !== checkedValue);
                    }
                    // 数组去重
                    checkedList = Array.from(new Set(checkedList));
                    GM_setValue("checkedList", checkedList);
                    removeSearchResult();
                });
            });

        // 隐藏包含勾选关键词的元素
        function removeSearchResult() {
            const searchList = document.querySelectorAll(".threadlist ul li");
            searchList.forEach((item) => {
                const html = item.innerHTML.toLowerCase();
                if (checkedList.some((val) => html.includes(val.toLowerCase()))) {
                    item.style.display = "none";
                } else {
                    item.style.removeProperty("display");
                }
            });
        }
    }

    /* ---------- 模块4：自动签到（状态机，跨页面） ---------- */

    /**
     * 自动签到流程：
     * 1. 进入国产原创区
     * 2. 打开第一个带图帖子
     * 3. 点击参与回复
     * 4. 回复页面填入随机文案并提交
     * 5. 跳转我的页面
     * 6. 点击每日签到
     * 7. 自动计算加减法验证码并提交
     */
    function initAutoSign() {
        const autoSign = GM_getValue("autoSign") || false;
        const isReply = GM_getValue("isReply") || false;

        try {
            // 论坛：未回复状态
            if (IS_FORUM && autoSign && !isReply) {
                // 论坛分类页面：点击国产原创
                if (document.querySelector("#sub_forum_1")) {
                    safeClick(document.querySelector("#sub_forum_1 ul li:nth-child(1) a"));
                }
                // 国产原创页面：点击第一个有图片的帖子
                if (document.querySelector(".threadlist")) {
                    const firstPost = document.querySelectorAll(".threadlist .n5_htmk .ztyzjj a")[0];
                    safeClick(firstPost);
                }
                // 帖子详情页：点击参与回复
                if (document.querySelector("#thread_btn_bar")) {
                    safeClick(document.querySelector("#thread_btn_bar a.reply"));
                }
                // 回复主题页面：填入随机文案并提交
                if (document.querySelector("#postform")) {
                    const replyText = getRandomReplyText();
                    const messageInput = document.querySelector("#needmessage");
                    const submitBtn = document.querySelector("#postsubmit");
                    if (messageInput && submitBtn) {
                        messageInput.value = replyText;
                        submitBtn.className = "btn_pn btn_pn_blue";
                        submitBtn.setAttribute("disable", false);
                        submitBtn.click();
                        GM_setValue("isReply", true);
                    }
                }
            }

            // 我的：已回复状态，执行签到
            if (autoSign && isReply) {
                // 回复完，跳转我的页面
                if (document.querySelector("#thread_btn_bar")) {
                    safeClick(document.querySelector(".n5_tbys .txbz"));
                }
                // 我的页面：点击每日签到
                if (document.querySelector(".dd_sign_icon")) {
                    safeClick(document.querySelector(".dd_sign_icon"));
                }
                // 今日未签到页面：点击签到
                if (document.querySelector(".ddpc_sign_btn_red")) {
                    safeClick(document.querySelector(".ddpc_sign_btn_red"));
                }
                // 签到验证码页面：自动计算加减法并提交
                if (document.querySelector(".seccheck")) {
                    solveSignCaptcha();
                }
                // 今日已签到页面：结束流程
                if (document.querySelector(".ddpc_sign_btn_grey")) {
                    GM_setValue("autoSign", false);
                    showAlert.success("今日已签到", 2000);
                }
            }

            // 未登录提示
            if (autoSign) {
                const loginBtn = document.querySelector("#loginform .btn_login");
                const pageTitle = document.querySelector(".dqym");
                if (loginBtn && pageTitle && pageTitle.innerText === "会员登录") {
                    showAlert.error("请先登录", 2000);
                    GM_setValue("autoSign", false);
                }
            }
        } catch (e) {
            console.error("[98助手] 自动签到异常:", e);
            GM_setValue("autoSign", false);
            GM_setValue("isReply", false);
        }
    }

    /**
     * 自动计算签到验证码（加法/减法）并提交
     */
    function solveSignCaptcha() {
        const captchaEl = document.querySelector(".seccheck .xg2");
        if (!captchaEl) return;
        const text = captchaEl.innerText;
        let result = 0;

        if (text.includes("-")) {
            // 减法运算
            result = text
                .split("-")
                .map((s) => Number(s.replace(/[^\d]/g, "")))
                .reduce((prev, curr) => prev - curr);
        } else if (text.includes("+")) {
            // 加法运算
            result = text
                .split("+")
                .map((s) => Number(s.replace(/[^\d]/g, "")))
                .reduce((prev, curr) => prev + curr);
        }

        const answerInput = document.querySelector('input[name="secanswer"]');
        const submitBtn = document.querySelector(".btn_login .formdialog");
        if (answerInput && submitBtn) {
            answerInput.value = result;
            submitBtn.click();
        }
    }

    /* ---------- 模块5：一键回复自动执行（状态机，跨页面） ---------- */

    /**
     * 检查一键回复状态，在回复页面自动填入文案并提交
     * 与"一键回复按钮"配合，通过 GM_setValue 跨页面传递数据
     */
    function initQuickReplyAutoSubmit() {
        const quickReplyMode = GM_getValue("quickReplyMode", false);
        const quickReplyText = GM_getValue("quickReplyText", "");

        try {
            if (IS_FORUM && quickReplyMode && quickReplyText) {
                // 回复主题页面
                if (document.querySelector("#postform")) {
                    const messageInput = document.querySelector("#needmessage");
                    const submitBtn = document.querySelector("#postsubmit");
                    if (messageInput && submitBtn) {
                        messageInput.value = quickReplyText;
                        submitBtn.className = "btn_pn btn_pn_blue";
                        submitBtn.setAttribute("disable", false);
                        submitBtn.click();
                        // 清除一键回复状态
                        GM_setValue("quickReplyMode", false);
                        GM_setValue("quickReplyText", "");
                        showAlert.success("一键回复已发送", 2000);
                    }
                }
            }
        } catch (e) {
            console.error("[98助手] 一键回复自动提交异常:", e);
            GM_setValue("quickReplyMode", false);
            GM_setValue("quickReplyText", "");
        }
    }

    /* ---------- 模块6：一键评分（forum.php） ---------- */

    /**
     * 修改帖子底部"评分"按钮为"一键评分"
     * 点击后自动等待评分弹窗，填入最大评分值并提交
     */
    function initQuickRate() {
        if (!IS_FORUM) return;

        const rateSpan = document.querySelector("#thread_btn_bar .btn:nth-child(4) span");
        if (!rateSpan) return;

        // 修改按钮文字
        if (rateSpan.innerText === "评分") {
            rateSpan.innerText = "一键评分";
        }

        if (!rateSpan.innerText.includes("评分")) return;

        // 为一键评分按钮添加点击事件
        const rateBtn = document.querySelector("#thread_btn_bar .btn:nth-child(4)");
        rateBtn?.addEventListener("click", function () {
            let attempts = 0;
            const maxAttempts = 200; // 20 秒超时
            const interval = setInterval(() => {
                const scoreElement = document.querySelector("#ntcmsg_popmenu #score8");
                if (scoreElement) {
                    clearInterval(interval);
                    // 获取评分区间最大值并赋值
                    const maxCell = document.querySelector(
                        "#ntcmsg_popmenu table tr:nth-child(2) td:nth-child(3)"
                    );
                    if (maxCell) {
                        scoreElement.value = Number(maxCell.innerText.replace(/[^\d]/g, ""));
                    }
                    // 提交评分
                    const submitBtn = document.querySelector(
                        "#ntcmsg_popmenu .pop_btn input[type=submit]"
                    );
                    if (safeClick(submitBtn)) {
                        showAlert.success("已提交评分", 2000);
                    } else {
                        showAlert.error("评分提交失败", 2000);
                    }
                } else {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        clearInterval(interval);
                    }
                }
            }, 100);
        });
    }

    /* ---------- 模块7：一键回复按钮改造（forum.php） ---------- */

    /**
     * 将底部"参与回复"按钮改为"一键回复"
     * 点击后弹出预置文案选择（含"自行编辑回复"选项）
     * 选择后跳转到回复页面，由模块5自动完成提交
     */
    function initQuickReplyButton() {
        if (!IS_FORUM) return;

        // 自动签到流程进行中时不改造按钮，避免拦截签到流程的点击
        const autoSign = GM_getValue("autoSign", false);
        const isReply = GM_getValue("isReply", false);
        if (autoSign && !isReply) return;

        // 查找"参与回复"按钮
        const replyBtn = document.querySelector("#thread_btn_bar a.reply");
        if (!replyBtn) return;

        // 查找按钮内的文字元素
        const replyTextEl = replyBtn.querySelector("span") || replyBtn;

        // 保存原按钮的 href，用于跳转到回复页面
        const replyHref = replyBtn.getAttribute("href") || "";

        // 修改按钮文字
        replyTextEl.innerText = "回复";

        // 通过克隆节点移除原有点击事件
        const newBtn = replyBtn.cloneNode(true);
        replyBtn.parentNode?.replaceChild(newBtn, replyBtn);

        // 为"一键回复"按钮添加点击事件
        newBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            const replyTexts = GM_getValue("replyTexts", DEFAULT_REPLY_TEXTS);
            createReplyPicker(replyTexts, function (selectedText) {
                // 保存回复文案到缓存，跨页面传递
                GM_setValue("quickReplyText", selectedText);
                GM_setValue("quickReplyMode", true);
                // 跳转到回复页面
                if (replyHref) {
                    location.href = replyHref;
                } else {
                    showAlert.error("未找到回复链接", 2000);
                    GM_setValue("quickReplyMode", false);
                }
            });
        });

        /**
         * 创建预置回复文案选择弹窗
         * @param {string[]} replyTexts 预置文案列表
         * @param {Function} callback 选中后的回调
         */
        function createReplyPicker(replyTexts, callback) {
            // 遮罩层
            const mask = document.createElement("div");
            mask.id = "reply_picker_mask";
            mask.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // 弹窗容器
            const picker = document.createElement("div");
            picker.style.cssText = `
                background: #fff;
                border-radius: 8px;
                width: 90%;
                max-width: 400px;
                max-height: 80vh;
                overflow-y: auto;
                padding: 15px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;

            // 标题
            const title = document.createElement("div");
            title.innerText = "请选择回复文案";
            title.style.cssText = `
                font-size: 16px;
                font-weight: 700;
                text-align: center;
                margin-bottom: 15px;
                color: #333;
            `;
            picker.appendChild(title);

            // 预置文案列表项创建函数（复用）
            const createItem = (text, bg, color, hoverBg, hoverColor, onClick) => {
                const item = document.createElement("div");
                item.innerText = text;
                item.style.cssText = `
                    padding: 12px 15px;
                    margin-bottom: 8px;
                    background: ${bg};
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    color: ${color};
                    transition: all 0.2s;
                    text-align: center;
                `;
                item.addEventListener("mouseenter", () => {
                    item.style.background = hoverBg;
                    item.style.color = hoverColor;
                });
                item.addEventListener("mouseleave", () => {
                    item.style.background = bg;
                    item.style.color = color;
                });
                item.addEventListener("click", onClick);
                return item;
            };

            // 渲染预置文案
            replyTexts.forEach((text) => {
                picker.appendChild(
                    createItem(
                        text,
                        "#f5f5f5",
                        "#333",
                        "#409eff",
                        "#fff",
                        () => {
                            callback(text);
                            document.body.removeChild(mask);
                        }
                    )
                );
            });

            // 自行回复选项
            const customItem = createItem(
                "✍ 自行编辑回复",
                "#fdf6ec",
                "#e6a23c",
                "#e6a23c",
                "#fff",
                () => {
                    const customText = prompt("请输入回复内容：", "");
                    if (customText !== null && customText.trim()) {
                        callback(customText.trim());
                        document.body.removeChild(mask);
                    }
                }
            );
            // 增加虚线边框和加粗样式
            customItem.style.border = "1px dashed #e6a23c";
            customItem.style.fontWeight = "700";
            picker.appendChild(customItem);

            // 取消按钮
            const cancelBtn = document.createElement("div");
            cancelBtn.innerText = "取消";
            cancelBtn.style.cssText = `
                padding: 10px;
                margin-top: 8px;
                text-align: center;
                cursor: pointer;
                font-size: 14px;
                color: #909399;
                border-top: 1px solid #eee;
            `;
            cancelBtn.addEventListener("click", () => {
                document.body.removeChild(mask);
            });
            picker.appendChild(cancelBtn);

            mask.appendChild(picker);

            // 点击遮罩层关闭
            mask.addEventListener("click", (e) => {
                if (e.target === mask) {
                    document.body.removeChild(mask);
                }
            });

            document.body.appendChild(mask);
        }
    }

    /* ---------- 模块8：资源定位（forum.php） ---------- */

    /**
     * 在帖子页面添加"资源位置"按钮
     * 点击后扫描页面文本，匹配资源关键词，依次滚动定位并高亮闪烁
     */
    function initResourceLocator() {
        if (!IS_FORUM) return;

        // 资源类型数组（可由用户自定义）
        const resourceTypes = GM_getValue("resource_keywords", DEFAULT_RESOURCE_KEYWORDS);

        // 存储找到的资源位置
        let resourcePositions = [];
        // 当前资源位置索引（-1 表示尚未定位）
        let currentIndex = -1;

        // 创建按钮并添加到页面上
        createLocationBtn();

        // 创建一个按钮并添加到页面上
        function createLocationBtn() {
            if (IS_MOBILE) {
                // 手机端
                // 获取目标元素
                const threadBtnBar = document.getElementById("thread_btn_bar");

                // 创建一个新的 <a> 元素
                const locationBtn = document.createElement("a");
                locationBtn.id = "location_btn";
                locationBtn.className = "btn js-req";
                locationBtn.style.cssText = "display: flex; align-items: center; justify-content: center; flex-direction: column; margin-top: 2px;";
                locationBtn.innerHTML = `<svg viewBox="0 0 1024 1024" width="20" height="20">
                    <path d="M927.282215 479.83544l-83.4629 0c-15.068184-158.75777-141.389194-285.078781-300.146964-300.146964L543.67235 95.835695c0-17.622356-14.285355-31.907711-31.907711-31.907711-17.622356 0-31.907711 14.285355-31.907711 31.907711l0 83.85278c-158.75777 15.068184-285.078781 141.389194-300.146964 300.146964l-83.826174 0c-17.622356 0-31.907711 14.285355-31.907711 31.907711 0 17.622356 14.285355 31.907711 31.907711 31.907711l83.826174 0c15.068184 158.75777 141.389194 285.078781 300.146964 300.146964l0 83.946924c0 17.622356 14.285355 31.907711 31.907711 31.907711 17.622356 0 31.907711-14.285355 31.907711-31.907711l0-83.946924c158.75777-15.068184 285.078781-141.389194 300.146964-300.146964l83.4629 0c17.622356 0 31.907711-14.285355 31.907711-31.907711C959.189925 494.120794 944.904571 479.83544 927.282215 479.83544zM511.76464 793.112446c-155.396209 0-281.369296-125.973086-281.369296-281.369296s125.973086-281.369296 281.369296-281.369296 281.369296 125.973086 281.369296 281.369296S667.159826 793.112446 511.76464 793.112446z" fill="#0086ce" p-id="4182"></path><path d="M511.76464 511.74315m-69.616544 0a68.031 68.031 0 1 0 139.233088 0 68.031 68.031 0 1 0-139.233088 0Z" fill="#0086ce" p-id="4183"></path>
                    </svg>
                    <span>定位</span>`;
                threadBtnBar?.appendChild(locationBtn);

                // 设置flex布局，解决小屏手机看不到按钮的bug
                if (document.querySelector("#thread_btn_bar")) {
                    document.querySelector("#thread_btn_bar").style.display = "flex";
                    document.querySelector("#thread_btn_bar").style.justifyContent = "space-between";
                    document.querySelector("#thread_btn_bar").style.flexDirection = "row-reverse";
                    document.querySelector("#thread_btn_bar .reply").style.order = "1";
                }
            } else {
                // pc端
                const button = document.createElement("button");
                button.innerHTML = `<button id="location_btn" style="position: fixed; top: 10px; right: 10px; z-index: 9999; background-color: #4CAF50; color: white; border: none; padding: 5px 10px; text-align: center; cursor: pointer; font-size: 14px; border-radius: 5px;"> 定位资源位置 </button>`;
                document.body?.appendChild(button);
            }
        }

        // 更新序号显示（保留空函数，避免其他地方调用报错）
        function updateCountDisplay() {}

        // 为按钮添加点击事件
        document
            .querySelector("#location_btn")
            ?.addEventListener("click", function () {
                navigateToNext();
            });

        // 检查节点是否为 script 标签或其子节点
        function isScriptOrChild(node) {
            let cur = node;
            while (cur) {
                if (cur.tagName === "SCRIPT") return true;
                cur = cur.parentNode;
            }
            return false;
        }

        // 查找所有资源位置
        function findAllResources() {
            resourcePositions = [];
            const walker = document.createTreeWalker(
                document.body, NodeFilter.SHOW_TEXT, null, false
            );
            let node;
            while ((node = walker.nextNode())) {
                if (isScriptOrChild(node)) continue;
                const text = node.nodeValue.toLowerCase();
                resourceTypes.forEach(function (type) {
                    if (text.includes(type.toLowerCase())) {
                        if (node.parentNode) {
                            resourcePositions.push(node.parentNode);
                        }
                    }
                });
            }
            currentIndex = -1;
            updateCountDisplay();
        }

        /**
         * 定位到下一个资源位置
         */
        function navigateToNext() {
            // 首次点击或列表为空时重新查找
            if (resourcePositions.length === 0) {
                findAllResources();
            }

            if (resourcePositions.length === 0) {
                showAlert.error("没有找到资源", 2000);
                return;
            }

            // 计算新索引（循环）
            currentIndex = (currentIndex + 1) % resourcePositions.length;
            const target = resourcePositions[currentIndex];

            // 滚动到目标位置
            const offsetTop =
                target.getBoundingClientRect().top +
                window.pageYOffset -
                window.innerHeight / 2;

            if (IS_MOBILE) {
                const mescroll = document.querySelector("#mescroll");
                if (mescroll) {
                    mescroll.scrollBy({ top: offsetTop, behavior: "smooth" });
                } else {
                    window.scrollTo({ top: offsetTop, behavior: "smooth" });
                }
            } else {
                window.scrollTo({ top: offsetTop, behavior: "smooth" });
            }
            blinkElement(target, 2);
        }

        /**
         * 高亮闪烁元素
         * @param {HTMLElement} element 目标元素
         * @param {number} blinkCount 闪烁次数
         */
        function blinkElement(element, blinkCount) {
            if (element.blinkTimeoutId) {
                clearTimeout(element.blinkTimeoutId);
                element.style.backgroundColor = element.originalBackgroundColor;
            }
            const blinkColor = "#ffbd64";
            let blinkTimes = 0;
            const interval = 300;

            element.originalBackgroundColor = element.style.backgroundColor;

            function doBlink() {
                element.style.backgroundColor =
                    blinkTimes % 2 ? element.originalBackgroundColor : blinkColor;
                blinkTimes++;
                if (blinkTimes < blinkCount * 2) {
                    element.blinkTimeoutId = setTimeout(doBlink, interval);
                } else {
                    element.style.backgroundColor = element.originalBackgroundColor;
                    delete element.blinkTimeoutId;
                }
            }
            doBlink();
        }
    }

    /* ---------- 模块9：自动登录（member.php） ---------- */

    /**
     * 在登录页面自动填充用户名、密码、安全问题及答案
     * 若启用自动登录，则延迟 1 秒自动点击登录按钮
     */
    function initAutoLogin() {
        if (!IS_MEMBER) return;

        const cfg = {
            username: GM_getValue("username", ""),
            password: GM_getValue("password", ""),
            questionValue: GM_getValue("questionValue", 0),
            answer: GM_getValue("answer", ""),
            autoLogin: GM_getValue("autoLogin", false),
        };

        // 填写用户名
        setInputValue(
            document.querySelector('.login_from input[name="username"]'),
            cfg.username
        );

        // 填写密码
        setInputValue(
            document.querySelector('.login_from input[name="password"]'),
            cfg.password
        );

        // 设置安全问题
        const selectElement = document.querySelector(".login_from .sel_list");
        if (selectElement) {
            selectElement.value = cfg.questionValue;
            selectElement.dispatchEvent(new Event("change", { bubbles: true }));
        }

        // 填写答案
        setInputValue(
            document.querySelector(".login_from .answerli input"),
            cfg.answer
        );

        // 自动点击登录（如果启用）
        if (cfg.autoLogin) {
            const loginButton = document.querySelector(".btn_login button");
            if (loginButton) {
                // 延迟 1 秒确保表单已更新
                setTimeout(() => loginButton.click(), 1000);
            }
        }
    }

    /* ---------- 模块10：置顶按钮修复（forum.php） ---------- */

    /**
     * 修复帖子页面置顶/置底按钮失效问题
     * 拦截原站点点击逻辑，改为平滑滚动到顶部/底部
     */
    function initScrollTopFix() {
        if (!IS_FORUM) return;

        document.addEventListener(
            "click",
            (e) => {
                const btn = e.target.closest("a.scrolltop");
                if (!btn) return;

                // 阻止原站点的点击逻辑
                e.preventDefault();
                e.stopPropagation();

                // 返回顶部
                if (!btn.classList.contains("bottom")) {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
                // 返回底部
                else {
                    window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: "smooth",
                    });
                }
            },
            true
        );
    }

    /* ---------- 模块11：帖子列表页排序栏优化 ---------- */

    /**
     * 优化 forumdisplay 帖子列表页：
     * 1. 保留网站原有排序栏样式，只适度增大文字和点击留白；
     * 2. 隐藏排序栏下方的置顶帖列表，仅保留排序栏本身。
     */
    function initForumDisplayLayout() {
        // 同时通过 URL 和页面结构判断，兼容 Discuz 伪静态地址。
        const isForumDisplayPage =
            IS_FORUM_DISPLAY ||
            Boolean(document.querySelector(".n5_zdtys .orderby") && document.querySelector(".threadlist"));
        if (!isForumDisplayPage) return;

        // 注入样式，仅执行一次
        if (!document.getElementById("n98_forumdisplay_style")) {
            const style = document.createElement("style");
            style.id = "n98_forumdisplay_style";
            style.textContent = `
                /* 隐藏排序栏下方的置顶帖区域 */
                .n5_zdtys > ul {
                    display: none !important;
                }

                /* 去掉隐藏置顶帖后可能残留的空白 */
                .n5_zdtys {
                    margin-bottom: 0 !important;
                    padding-bottom: 0 !important;
                }

                /* 保留原站样式，只稍微增大排序文字和点击范围 */
                .n5_zdtys .orderby a {
                    font-size: 16px !important;
                    line-height: 30px !important;
                    padding-left: 7px !important;
                    padding-right: 7px !important;
                    -webkit-tap-highlight-color: transparent;
                    touch-action: manipulation;
                }
            `;
            document.head.appendChild(style);
        }

        document.querySelectorAll(".n5_zdtys > ul").forEach((stickyList) => {
            stickyList.setAttribute("aria-hidden", "true");
        });
    }

    /* ---------- 模块12：屏蔽广告（全页面 / 帖子列表页） ---------- */

    /**
     * 屏蔽论坛广告：
     * 1. 移除页面顶部、底部的 show-text 广告容器；
     * 2. 在 forumdisplay 帖子列表页，移除列表首个伪装成帖子的广告卡片。
     *
     * 根据该站列表结构，每页 .threadlist 中第一个 .n5_htmk 固定为广告，
     * 因此每个列表容器只移除一次首个卡片，并用标记防止观察器重复误删正常帖子。
     * 使用 MutationObserver 监听 DOM 变化，延迟插入的广告也会被处理。
     */
    function initAdBlocker() {
        /**
         * 移除帖子列表首条广告卡片
         * 仅在 forumdisplay 页面执行，避免影响帖子详情页和其他 forum.php 页面。
         */
        function removeFirstThreadAd() {
            // 同时通过 URL 和排序栏结构判断，兼容 Discuz 伪静态地址。
            const isForumDisplayPage =
                IS_FORUM_DISPLAY ||
                Boolean(document.querySelector(".n5_zdtys .orderby") && document.querySelector(".threadlist"));
            if (!isForumDisplayPage) return;

            document.querySelectorAll(".threadlist").forEach((threadList) => {
                // 一个列表容器只处理一次。必须先标记再删除，避免 MutationObserver
                // 在首条被移除后继续把第二条、第三条正常帖子当成“新的首条”删除。
                if (threadList.dataset.n98FirstAdRemoved === "1") return;

                const firstCard = Array.from(threadList.children).find((child) =>
                    child.classList?.contains("n5_htmk")
                );
                if (!firstCard) return;

                threadList.dataset.n98FirstAdRemoved = "1";
                firstCard.remove();
            });
        }

        // 移除广告容器和帖子列表首条广告
        function removeAds() {
            document.querySelectorAll(AD_SELECTOR).forEach((ad) => {
                ad.remove();
            });
            removeFirstThreadAd();
        }

        // 立即执行一次
        removeAds();

        // 监听 DOM 变化（防抖避免频繁触发影响性能）
        const debouncedRemoveAds = debounce(removeAds, 100);
        const adObserver = new MutationObserver(debouncedRemoveAds);
        adObserver.observe(document.body, { childList: true, subtree: true });
    }


    /* ============================================================
     * 四、启动入口
     * 等 DOM 就绪后执行所有模块
     * ============================================================ */

    onDOMReady(function () {
        try {
            // 页面通用模块
            initForumDisplayLayout();
            initAdBlocker();

            // 首页模块
            initPortalButtons();

            // 帖子页模块
            initCopyCodeEnhance();
            initQuickRate();
            initQuickReplyButton();
            initResourceLocator();
            initScrollTopFix();

            // 搜索/我的页模块
            initSearchHelper();

            // 登录页模块
            initAutoLogin();

            // 跨页面状态机模块（自动签到、一键回复自动提交）
            initAutoSign();
            initQuickReplyAutoSubmit();
        } catch (e) {
            console.error("[98助手] 初始化异常:", e);
        }
    });
})();
