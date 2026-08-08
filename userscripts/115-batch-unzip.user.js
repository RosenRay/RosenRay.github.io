// ==UserScript==
// @name         115批量解压
// @namespace    http://tampermonkey.net/
// @version      8.10
// @description  批量解压115网盘压缩包，支持体积校验。若解压后文件夹总大小小于原始压缩包，将标记"解压不全"并拦截删除操作，同时在界面显示大小对比。面板支持鼠标拖拽滑动。
// @author       ray
// @match        https://115.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=115.com
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://rosenray.github.io/userscripts/115-batch-unzip.user.js
// @downloadURL  https://rosenray.github.io/userscripts/115-batch-unzip.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ─────────────────────────────────────────────
  // 用户配置
  // ─────────────────────────────────────────────
  const CONFIG = {
    deleteZip: false, // 删除压缩包: false=保留, true=删除(默认保留)
    unzipTimeout: 5 * 60 * 1000, // 解压超时时间（毫秒）
    preUnzipTimeout: 10 * 1000, // 预解压超时时间（毫秒）
    maxConcurrent: 1, // 最大并发解压数（115服务器限制，只能串行，勿改为>1）
    retryCount: 1, // 失败后重试次数
    similarityThreshold: 0.6, // 文件夹名相似度阈值
    sizeCheck: true, // 开启解压后体积校验
    sizeCheckDelay: 2000, // 等待115服务器索引同步的延迟（毫秒）
    sizeCheckRetry: 2, // 体积获取失败时的重试次数
  };

  // ─────────────────────────────────────────────
  // 样式注入
  // ─────────────────────────────────────────────
  const STYLE = ` @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600&display=swap'); #ant-unzip-panel { position: fixed; top: 66px; right: 18px; z-index: 1000000020; width: 340px; font-family: 'Noto Sans SC', -apple-system, sans-serif; font-size: 13px; user-select: none; } #ant-unzip-panel .panel-head { display: flex; align-items: center; justify-content: space-between; background: #1a1d24; color: #e8eaf0; padding: 9px 14px; border-radius: 10px 10px 0 0; cursor: pointer; border-bottom: 1px solid #2e3340; } #ant-unzip-panel.collapsed .panel-head { border-radius: 10px; } #ant-unzip-panel .panel-head .head-left { display: flex; align-items: center; gap: 8px; } #ant-unzip-panel .panel-head .head-icon { width: 22px; height: 22px; background: linear-gradient(135deg, #4a9eff, #6c63ff); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; } #ant-unzip-panel .panel-head .head-title { font-weight: 600; font-size: 13px; letter-spacing: 0.3px; } #ant-unzip-panel .panel-head .head-summary { font-size: 11px; color: #8892a4; margin-left: 4px; } #ant-unzip-panel .panel-head .head-actions { display: flex; gap: 6px; align-items: center; } #ant-unzip-panel .panel-head .btn-collapse, #ant-unzip-panel .panel-head .btn-close-panel { width: 20px; height: 20px; background: none; border: none; cursor: pointer; color: #5a6478; display: flex; align-items: center; justify-content: center; border-radius: 4px; padding: 0; transition: color 0.15s, background 0.15s; font-size: 14px; line-height: 1; } #ant-unzip-panel .panel-head .btn-collapse:hover, #ant-unzip-panel .panel-head .btn-close-panel:hover { color: #c0c8d8; background: #2a2e38; } #ant-unzip-panel .panel-body { background: #1e2130; border-radius: 0 0 10px 10px; overflow: hidden; border: 1px solid #2e3340; border-top: none; transition: max-height 0.25s cubic-bezier(0.4,0,0.2,1); max-height: 600px; } #ant-unzip-panel.collapsed .panel-body { max-height: 0; border: none; } #ant-unzip-panel .panel-status-bar { padding: 8px 14px; background: #181b26; color: #8892a4; font-size: 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #2a2e3a; } #ant-unzip-panel .panel-status-bar .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #3a3f50; flex-shrink: 0; transition: background 0.3s; } #ant-unzip-panel .panel-status-bar .status-dot.running { background: #4a9eff; box-shadow: 0 0 6px #4a9eff88; animation: ant-pulse 1.2s ease-in-out infinite; } #ant-unzip-panel .panel-status-bar .status-dot.done { background: #42c98a; } #ant-unzip-panel .panel-status-bar .status-dot.error { background: #ff5c5c; } @keyframes ant-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } } /* 列表容器：支持滚轮 + 鼠标拖拽滑动 */ #ant-unzip-panel .item-list { overflow-y: auto; max-height: 380px; padding: 6px 0; cursor: default; /* 禁止文本选中，防止拖拽时出现蓝色选中框 */ -webkit-user-select: none; user-select: none; } #ant-unzip-panel .item-list.is-dragging { cursor: ns-resize; } #ant-unzip-panel .item-list::-webkit-scrollbar { width: 4px; } #ant-unzip-panel .item-list::-webkit-scrollbar-track { background: transparent; } #ant-unzip-panel .item-list::-webkit-scrollbar-thumb { background: #2e3340; border-radius: 2px; } #ant-unzip-panel .unzip-item { display: flex; flex-direction: column; padding: 7px 14px; gap: 2px; transition: background 0.15s; cursor: default; border-bottom: 1px solid #2a2e3a33; } #ant-unzip-panel .unzip-item:hover { background: #24293a; } #ant-unzip-panel .item-row { display: flex; align-items: center; gap: 10px; } #ant-unzip-panel .item-idx { font-size: 11px; color: #4a5168; width: 18px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; } #ant-unzip-panel .item-name { flex: 1; color: #c8cdd8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; cursor: pointer; } #ant-unzip-panel .item-name:hover { color: #4a9eff; text-decoration: underline; } #ant-unzip-panel .item-status { flex-shrink: 0; font-size: 11.5px; font-variant-numeric: tabular-nums; min-width: 54px; text-align: right; } /* 大小显示容器样式 */ #ant-unzip-panel .item-size-info { font-size: 10px; color: #5a6478; margin-left: 28px; font-family: monospace; } #ant-unzip-panel .item-size-info.size-warn { color: #f0a040; } #ant-unzip-panel .item-status.s-pending { color: #4a5168; } #ant-unzip-panel .item-status.s-running { color: #4a9eff; } #ant-unzip-panel .item-status.s-done { color: #42c98a; } #ant-unzip-panel .item-status.s-fail { color: #ff5c5c; } #ant-unzip-panel .item-status.s-timeout { color: #f0a040; } #ant-unzip-panel .item-status.s-damaged { color: #f0a040; } #ant-unzip-panel .item-status.s-nopass { color: #f0a040; } #ant-unzip-panel .item-status.s-wrongpass { color: #ff5c5c; } #ant-unzip-panel .item-status.s-incomplete { color: #f0a040; font-weight: bold; } #ant-unzip-panel .item-status.s-checking { color: #a0c4ff; font-style: italic; } #ant-unzip-panel .item-status.s-exists { color: #f0a040; } #ant-unzip-panel .item-bar-wrap { position: relative; height: 2px; background: #2a2e3a; border-radius: 1px; overflow: hidden; width: auto; margin: 4px 14px 2px 28px; display: none; } #ant-unzip-panel .unzip-item.has-progress .item-bar-wrap { display: block; } #ant-unzip-panel .item-bar-fill { height: 100%; border-radius: 1px; background: linear-gradient(90deg, #4a9eff, #6c63ff); transition: width 0.4s ease; } #ant-unzip-panel .item-bar-fill.done { background: #42c98a; } #ant-unzip-panel .item-bar-fill.fail { background: #ff5c5c; } #ant-unzip-panel .item-bar-fill.checking { background: linear-gradient(90deg, #a0c4ff, #4a9eff); } #ant-unzip-panel .panel-footer { padding: 8px 14px; border-top: 1px solid #2a2e3a; display: flex; gap: 6px; align-items: center; justify-content: flex-end; background: #181b26; } #ant-unzip-panel .panel-footer .btn-action { font-size: 11.5px; padding: 4px 10px; border-radius: 5px; cursor: pointer; border: 1px solid #2e3340; background: #24293a; color: #8892a4; transition: all 0.15s; font-family: inherit; } #ant-unzip-panel .panel-footer .btn-action:hover { background: #2e3448; color: #c0c8d8; border-color: #3e4460; } #ant-unzip-panel .panel-footer .btn-action.danger:hover { background: #3a1e1e; color: #ff5c5c; border-color: #5a2020; } /* 工具栏按钮 */ .ant-unzip-toolbar-btn { display: inline-flex !important; align-items: center !important; gap: 5px !important; height: 28px !important; padding: 0 12px !important; border-radius: 6px !important; font-size: 13px !important; cursor: pointer !important; border: 1px solid transparent !important; font-family: 'Noto Sans SC', -apple-system, sans-serif !important; transition: all 0.15s !important; text-decoration: none !important; } .ant-unzip-toolbar-btn.primary { background: linear-gradient(135deg, #3a7bd5, #5b4fcf) !important; color: #fff !important; border-color: #4a6dd5 !important; box-shadow: 0 1px 4px #3a7bd530 !important; } .ant-unzip-toolbar-btn.primary:hover { background: linear-gradient(135deg, #4a8be5, #6b5fdf) !important; box-shadow: 0 2px 8px #3a7bd550 !important; } .ant-unzip-toolbar-btn.secondary { background: #24293a !important; color: #8892a4 !important; border-color: #2e3340 !important; } .ant-unzip-toolbar-btn.secondary:hover { background: #2e3448 !important; color: #c0c8d8 !important; border-color: #3e4460 !important; } .ant-unzip-toolbar-btn.warning { background: #2a2010 !important; color: #f0a040 !important; border-color: #4a3810 !important; } .ant-unzip-toolbar-btn.warning:hover { background: #3a2e18 !important; border-color: #6a5020 !important; } .ant-unzip-toolbar-btn svg { width: 13px; height: 13px; flex-shrink: 0; } /* 单文件悬浮解压按钮 */ .ant-item-unzip-btn { display: inline-flex !important; align-items: center !important; gap: 3px !important; padding: 0 8px !important; height: 22px !important; border-radius: 4px !important; font-size: 12px !important; cursor: pointer !important; background: rgba(74,158,255,0.12) !important; color: #4a9eff !important; border: 1px solid rgba(74,158,255,0.25) !important; transition: all 0.15s !important; text-decoration: none !important; } .ant-item-unzip-btn:hover { background: rgba(74,158,255,0.22) !important; border-color: rgba(74,158,255,0.5) !important; } `;

  const $style = document.createElement("style");
  $style.textContent = STYLE;
  document.head.appendChild($style);

  // ─────────────────────────────────────────────
  // 通用辅助工具
  // ─────────────────────────────────────────────
  function formatSize(bytes) {
    if (bytes === 0 || !bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─────────────────────────────────────────────
  // 面板 DOM
  // ─────────────────────────────────────────────
  let panelEl = null;
  let itemListEl = null;
  let statusDotEl = null;
  let statusTextEl = null;
  let headSummaryEl = null;
  let panelMode = "unzip";

  function buildPanel() {
    if (panelEl) return;
    panelEl = document.createElement("div");
    panelEl.id = "ant-unzip-panel";
    panelEl.innerHTML = ` <div class="panel-head" id="ant-panel-head"> <div class="head-left"> <div class="head-icon">📦</div> <span class="head-title">解压任务</span> <span class="head-summary" id="ant-head-summary"></span> </div> <div class="head-actions"> <button class="btn-collapse" id="ant-btn-collapse" title="折叠/展开">▾</button> <button class="btn-close-panel" id="ant-btn-close-panel" title="关闭">✕</button> </div> </div> <div class="panel-body" id="ant-panel-body"> <div class="panel-status-bar"> <div class="status-dot" id="ant-status-dot"></div> <span id="ant-status-text">等待任务...</span> </div> <div class="item-list" id="ant-item-list"></div> <div class="panel-footer"> <button class="btn-action danger" id="ant-btn-clear">清空列表</button> <button class="btn-action" id="ant-btn-open-dir">打开目录</button> </div> </div> `;
    document.body.appendChild(panelEl);
    headSummaryEl = panelEl.querySelector("#ant-head-summary");
    itemListEl = panelEl.querySelector("#ant-item-list");
    statusDotEl = panelEl.querySelector("#ant-status-dot");
    statusTextEl = panelEl.querySelector("#ant-status-text");

    // 折叠/展开
    panelEl
      .querySelector("#ant-btn-collapse")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        panelEl.classList.toggle("collapsed");
        panelEl.querySelector("#ant-btn-collapse").textContent =
          panelEl.classList.contains("collapsed") ? "▸" : "▾";
      });
    panelEl.querySelector("#ant-panel-head").addEventListener("click", () => {
      panelEl.classList.toggle("collapsed");
      panelEl.querySelector("#ant-btn-collapse").textContent =
        panelEl.classList.contains("collapsed") ? "▸" : "▾";
    });
    panelEl
      .querySelector("#ant-btn-close-panel")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        panelEl.remove();
        panelEl = null;
      });
    panelEl.querySelector("#ant-btn-clear").addEventListener("click", () => {
      taskMap.clear();
      renderPanel();
    });
    panelEl.querySelector("#ant-btn-open-dir").addEventListener("click", () => {
      const cid = getCurrentCid();
      if (cid)
        window.location.href = `//115.com/?cid=${cid}&offset=0&mode=wangpan`;
    });

    // ── 鼠标拖拽滑动列表 ──
    initDragScroll(itemListEl);
  }

  /** * 给滚动容器添加鼠标拖拽滑动能力 * 单指/单鼠标按下后拖动即可滚动，不影响内部点击事件 */
  function initDragScroll(el) {
    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;
    let moved = false;

    el.addEventListener("mousedown", (e) => {
      // 只响应左键，且不在 .item-name 上（保留点击跳转）
      if (e.button !== 0) return;
      isDragging = true;
      moved = false;
      startY = e.clientY;
      startScrollTop = el.scrollTop;
      el.classList.add("is-dragging");
      // 阻止 mousedown 向下传播，避免触发页面级别的拖拽/选文字
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 2) moved = true;
      el.scrollTop = startScrollTop - dy;
    });

    document.addEventListener("mouseup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove("is-dragging");
    });

    // 拖拽过程中防止 click 误触发（如 item-name 点击）
    el.addEventListener(
      "click",
      (e) => {
        if (moved) {
          e.stopImmediatePropagation();
          moved = false;
        }
      },
      true
    );
  }

  // 任务数据结构: Map<filename, { status, percent, domObj, originalSize, currentSize, sizeInfoText }>
  const taskMap = new Map();

  const STATUS_TEXT = {
    pending: "等待中",
    running: "解压中",
    checking: "校验中",
    done: "✓ 完成",
    fail: "✗ 失败",
    timeout: "⏱ 超时",
    damaged: "⚠ 损坏",
    nopass: "🔒 无密码",
    wrongpass: "🔒 密码错误",
    incomplete: "⚠ 解压不全",
    exists: "⏭ 同名已存在，跳过",
  };

  function renderPanel() {
    if (!panelEl) buildPanel();
    if (panelEl.parentElement === null) document.body.appendChild(panelEl);

    const total = taskMap.size;
    const list = [...taskMap.values()];
    const done = list.filter((t) => t.status === "done").length;
    const failed = list.filter((t) =>
      [
        "fail",
        "timeout",
        "damaged",
        "nopass",
        "wrongpass",
        "incomplete",
        "exists",
      ].includes(t.status)
    ).length;
    const running = list.filter(
      (t) => t.status === "running" || t.status === "checking"
    ).length;
    const pending = list.filter((t) => t.status === "pending").length;

    headSummaryEl.textContent = total ? `${done}/${total}` : "";

    if (running > 0) {
      statusDotEl.className = "status-dot running";
      statusTextEl.textContent = `正在处理第 ${done + 1}/${total} 个...`;
    } else if (pending > 0) {
      statusDotEl.className = "status-dot running";
      statusTextEl.textContent = `队列中，等待 ${pending} 个`;
    } else if (total === 0) {
      statusDotEl.className = "status-dot";
      statusTextEl.textContent = "等待任务...";
    } else if (failed > 0) {
      statusDotEl.className = "status-dot error";
      statusTextEl.textContent = `处理结束，${failed} 个失败/异常`;
    } else {
      statusDotEl.className = "status-dot done";
      statusTextEl.textContent = `全部完成 ✓`;
    }

    itemListEl.innerHTML = "";
    let index = 0;
    for (const [name, task] of taskMap) {
      index++;
      const st = task.status;
      const pct = task.percent;
      const isChecking = st === "checking";
      const showBar =
        (st === "running" || st === "done" || st === "checking") &&
        typeof pct === "number";
      const barPct = st === "done" ? 100 : pct || 0;
      const barCls =
        st === "done"
          ? "done"
          : st === "fail" || st === "incomplete"
          ? "fail"
          : isChecking
          ? "checking"
          : "";

      const row = document.createElement("div");
      row.className = `unzip-item${showBar ? " has-progress" : ""}`;

      // 大小信息展示
      let sizeInfoHtml = "";
      if (task.sizeInfoText) {
        const warnCls = task.status === "incomplete" ? " size-warn" : "";
        sizeInfoHtml = `<div class="item-size-info${warnCls}">${task.sizeInfoText}</div>`;
      } else if (task.originalSize) {
        // 还未拿到解压后大小，仅展示原始大小
        sizeInfoHtml = `<div class="item-size-info">原始: ${formatSize( task.originalSize )}</div>`;
      }

      // 状态文字
      let statusLabel = "";
      if (isChecking) {
        statusLabel = "校验中…";
      } else if (typeof pct === "number" && st === "running") {
        statusLabel = pct + "%";
      } else {
        statusLabel = STATUS_TEXT[st] || st;
      }

      row.innerHTML = ` <div class="item-row"> <span class="item-idx">${index}</span> <span class="item-name" title="${name}">${name}</span> <span class="item-status s-${st}">${statusLabel}</span> </div> ${sizeInfoHtml} <div class="item-bar-wrap"> <div class="item-bar-fill ${barCls}" style="width: ${barPct}%"></div> </div> `;
      itemListEl.appendChild(row);

      row.querySelector(".item-name").addEventListener("click", (e) => {
        // 拖拽时不响应
        e.stopPropagation();
        const domObj = task.domObj;
        if (domObj)
          try {
            top.Core.FileAPI.OpenRAR(domObj);
          } catch (err) {}
      });
    }
  }

  function setTaskStatus(name, status, percent, sizeInfoText) {
    const t = taskMap.get(name);
    if (t) {
      t.status = status;
      if (percent !== undefined) t.percent = percent;
      if (sizeInfoText !== undefined) t.sizeInfoText = sizeInfoText;
      renderPanel();
    }
  }

  // ─────────────────────────────────────────────
  // API 封装
  // ─────────────────────────────────────────────
  function ajaxPost(url, data) {
    return new Promise((resolve, reject) => {
      $.ajax({
        url,
        type: "post",
        data,
        xhrFields: { withCredentials: true },
        dataType: "JSON",
        success: resolve,
        error: (_, __, err) => reject(new Error(err)),
      });
    });
  }
  function ajaxGet(url, data) {
    return new Promise((resolve, reject) => {
      $.ajax({
        url,
        type: "get",
        data,
        xhrFields: { withCredentials: true },
        dataType: "JSON",
        success: resolve,
        error: (_, __, err) => reject(new Error(err)),
      });
    });
  }

  async function apiAddDir(pid, cname) {
    return ajaxPost("//webapi.115.com/files/add", { pid, cname });
  }
  async function apiDeleteFiles(pid, fids) {
    // 注意：115 的 rb/delete 接口需要 pid=父目录ID, fid=文件ID数组
    // 保持与原始版本一致的参数格式
    return ajaxPost("//webapi.115.com/rb/delete", {
      pid,
      fid: fids,
      ignore_warn: 1,
    });
  }

  /** * 同步版本的删除（与原始版本保持一致） */
  function apiDeleteFilesSync(pid, fids) {
    let result = null;
    $.ajax({
      url: "//webapi.115.com/rb/delete",
      type: "post",
      data: {
        pid: pid,
        fid: fids,
        ignore_warn: 1,
      },
      xhrFields: { withCredentials: true },
      dataType: "JSON",
      async: false, // 同步调用，与原始版本一致
      success: function (rs) {
        console.log("[ant-unzip] deleteFiles success:", rs);
        result = rs;
      },
      error: function (xhr, status, err) {
        console.error("[ant-unzip] deleteFiles error:", status, err);
      },
    });
    return result;
  }

  /** * 检查父目录中是否已存在同名文件夹 * @param {string} parentCid - 父目录CID * @param {string} folderName - 要检查的文件夹名 * @returns {Promise<{exists: boolean, cid: string|null, fid: string|null}>} */
  async function hasSubFolder(parentCid, folderName) {
    try {
      const res = await apiFiles(parentCid);
      if (!res.state || !res.data)
        return { exists: false, cid: null, fid: null };
      // fc=0 表示文件夹，fc=1 表示文件（原错误地用了 ftype 字段，实际 API 返回的是 fc）
      const folderNameLower = folderName.toLowerCase();
      const match = res.data.find(
        (f) => String(f.n).toLowerCase() === folderNameLower && f.fc === 0
      );
      if (match) {
        return { exists: true, cid: match.cid, fid: match.fid };
      }
    } catch (e) {
      console.warn(`[ant-unzip] hasSubFolder 查询失败:`, e);
    }
    return { exists: false, cid: null, fid: null };
  }
  /** * 获取目录文件列表（不分页，最多115条） * @param {string} cid - 目录ID * @param {string|number} type - 文件类型过滤，5=压缩包，''=全部 */
  async function apiFiles(cid, type = "") {
    return apiFilesPage(cid, 0, 115, type);
  }

  /** * 分页获取目录文件列表 * @param {string} cid - 目录ID * @param {number} offset - 翻页偏移 * @param {number} limit - 每页数量 * @param {string|number} type - 文件类型过滤 */
  async function apiFilesPage(cid, offset, limit, type = "") {
    return ajaxGet("//aps.115.com/natsort/files.php", {
      cid,
      aid: 1,
      o: "user_ptime",
      asc: 0,
      offset,
      show_dir: 1,
      limit,
      natsort: 1,
      record_open_time: 1,
      count_folders: 1,
      type,
      format: "json",
    });
  }

  /** * 获取目录 stat 信息（包含 size 字段为目录总大小） * 使用 /files/index_info 接口，该接口返回目录的 folder_count/size 等聚合信息 */
  async function apiFolderInfo(cid) {
    try {
      const res = await ajaxGet("//webapi.115.com/files/index_info", {
        cid,
        count_folders: 1,
      });
      return res;
    } catch (e) {
      return null;
    }
  }

  // ── 体积校验相关 ──

  /** * 解析 115 返回的大小字符串（如 "9.59GB"）为字节数 */
  function parse115Size(sizeStr) {
    if (!sizeStr || typeof sizeStr !== "string") return 0;

    sizeStr = sizeStr.trim().toUpperCase();
    const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/);
    if (!match) return 0;

    const num = parseFloat(match[1]);
    const unit = match[2] || "B";

    const units = {
      B: 1,
      KB: 1024,
      MB: 1024 ** 2,
      GB: 1024 ** 3,
      TB: 1024 ** 4,
    };
    return Math.round(num * (units[unit] || 1));
  }

  /** * 通过 category/get 接口获取文件夹大小 */
  async function apiGetFolderSize(cid) {
    try {
      const res = await ajaxGet("//webapi.115.com/category/get", { cid });
      if (res && res.state && res.size) {
        return parse115Size(res.size);
      }
    } catch (e) {
      console.warn(`[ant-unzip] category/get 接口失败:`, e);
    }
    return 0;
  }

  /** * 获取文件夹大小（使用稳定的 category/get 接口，带重试） * @param {string} cid - 文件夹CID * @param {boolean} withDelay - 是否等待索引延迟（默认true；若调用方已自行等待则传false） * @returns {number} 文件夹大小（字节） */
  async function getFolderTotalSizeWithRetry(cid, withDelay = true) {
    // 等待115服务器完成索引更新
    if (withDelay) await sleep(CONFIG.sizeCheckDelay);

    // 重试获取大小
    for (let retry = 0; retry < CONFIG.sizeCheckRetry; retry++) {
      const size = await apiGetFolderSize(cid);
      if (size > 0) {
        return size;
      }
      if (retry < CONFIG.sizeCheckRetry - 1) {
        await sleep(1000); // 重试间隔1秒
      }
    }
    return 0;
  }

  async function apiExtractInfo( pick_code, file_name = "", page_count = 999, paths = "文件" ) {
    return ajaxGet("//webapi.115.com/files/extract_info", {
      pick_code,
      file_name,
      page_count,
      paths,
    });
  }
  async function apiAddExtractFile(data) {
    return ajaxPost("//webapi.115.com/files/add_extract_file", data);
  }
  async function apiPushExtract(pick_code, secret = "") {
    const data = { pick_code };
    if (secret) data.secret = secret;
    return ajaxPost("//webapi.115.com/files/push_extract", data);
  }
  async function apiRename(fid, newname) {
    return ajaxPost("//webapi.115.com/files/batch_rename", {
      [`files_new_name[${fid}]`]: newname,
    });
  }

  function strSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    let matched = 0;
    const used = new Array(str2.length).fill(false);
    for (let i = 0; i < str1.length; i++) {
      for (let j = 0; j < str2.length; j++) {
        if (!used[j] && str1[i] === str2[j]) {
          matched++;
          used[j] = true;
          break;
        }
      }
    }
    return matched / str1.length;
  }

  function getCurrentCid() {
    const lis = document.querySelectorAll(".list-contents li");
    if (lis.length === 0) return "0";
    const first = lis[0];
    return first.getAttribute("file_type") === "0"
      ? first.getAttribute("p_id")
      : first.getAttribute("cid");
  }

  // ─────────────────────────────────────────────
  // 并发队列
  // ─────────────────────────────────────────────
  let activeCount = 0;
  const queue = [];

  function enqueue(fn) {
    queue.push(fn);
    drainQueue();
  }
  function drainQueue() {
    while (activeCount < CONFIG.maxConcurrent && queue.length > 0) {
      const fn = queue.shift();
      activeCount++;
      Promise.resolve()
        .then(fn)
        .finally(() => {
          activeCount--;
          drainQueue();
        });
    }
  }

  function getSavedPassword() {
    return GM_getValue("unzip_secret", "");
  }
  function savePassword(pw) {
    GM_setValue("unzip_secret", pw);
  }

  // ─────────────────────────────────────────────
  // 主解压流程
  // ─────────────────────────────────────────────
  let unzipMode = 1;
  const zipMeta = new Map();
  const pcDomlist = new Map();

  async function startExtract(domObj) {
    const {
      pick_code,
      file_name: zipfilename,
      cid: origCid,
      size: originalSize,
    } = domObj;

    // 调试日志
    console.log(
      `[ant-unzip] startExtract: name=${zipfilename}, pick_code=${pick_code}, cid=${origCid}, fid=${domObj.fid}`
    );

    zipMeta.set(pick_code, { cid: origCid, fid: domObj.fid });
    pcDomlist.set(zipfilename, domObj);

    // 验证存储是否成功
    const stored = zipMeta.get(pick_code);
    console.log(`[ant-unzip] zipMeta.set 结果:`, stored);

    if (!taskMap.has(zipfilename)) {
      taskMap.set(zipfilename, {
        status: "pending",
        percent: 0,
        domObj,
        originalSize,
        sizeInfoText: originalSize ? `原始: ${formatSize(originalSize)}` : "",
      });
    }
    buildPanel();
    renderPanel();

    enqueue(() => doExtract(domObj));
  }

  async function doExtract(domObj) {
    const { pick_code, file_name: zipfilename, size: originalSize } = domObj;
    let cid = domObj.cid;
    setTaskStatus(zipfilename, "running", 0);

    try {
      const dirname = zipfilename.substring(0, zipfilename.lastIndexOf("."));
      let zipInfo = await apiExtractInfo(pick_code, "", 999, "文件");

      if (!zipInfo.state || zipInfo.data.list.length === 0) {
        setTaskStatus(zipfilename, "fail");
        return;
      }

      // 始终新建同名目录存放解压内容，避免文件散落到当前目录
      // （原逻辑会检测"压缩包内顶层已是同名文件夹"时跳过建目录，
      // 但实际使用中这会导致文件散落、体积校验也无法精准定位，因此统一新建）
      const addNewDir = true;

      // 先检查目标目录是否已存在同名文件夹，避免115服务端静默复用
      // ⚠️ 此检查必须在任何解压操作之前，且不受 unzipMode 限制
      const existing = await hasSubFolder(cid, dirname);
      if (existing.exists) {
        console.warn(
          `[ant-unzip] 检测到同名文件夹 "${dirname}" 已存在，跳过解压`
        );
        setTaskStatus(zipfilename, "exists");
        return;
      }

      // 记录原始父目录CID（在修改cid之前）
      const parentCid = cid;
      let targetCid = cid; // 解压目标目录ID
      let newFolderFid = null; // 新建文件夹的fid（用于在父目录列表中定位）
      // sizeCheckCid: 体积校验时使用的目录cid
      // - 若新建了文件夹，直接用新文件夹cid（已知）
      // - 若直接解压到父目录，需解压完成后从父目录文件列表中找到对应子文件夹
      let sizeCheckCid = null;

      if (unzipMode === 1 && addNewDir) {
        const dirRes = await apiAddDir(cid, dirname);
        if (dirRes.state) {
          targetCid = dirRes.cid;
          newFolderFid = dirRes.fid; // 新建文件夹的fid
          sizeCheckCid = dirRes.cid; // 已知新文件夹cid，直接用于校验
          // cid 保持 parentCid，不被覆盖
        }
      }
      // 若 sizeCheckCid 仍为 null（直接解压模式），
      // 将在 pollExtractProgress 完成后从父目录列表中查找对应文件夹

      const paths = (zipInfo.data.paths || [])
        .map((p) => p.file_name)
        .join("/");
      const extract_file = [],
        extract_dir = [];
      for (const item of zipInfo.data.list) {
        if (item.file_category === 0) extract_dir.push(item.file_name);
        else extract_file.push(item.file_name);
      }

      await doExtractRequest({
        pick_code,
        extract_file,
        extract_dir,
        paths,
        cid,
        targetCid,
        zipfilename,
        dirname,
        parentCid,
        newFolderFid,
        originalSize,
        sizeCheckCid,
      });
    } catch (e) {
      console.error("[ant-unzip] doExtract error:", e);
      setTaskStatus(zipfilename, "fail");
    }
  }

  async function doExtractRequest(param) {
    const {
      pick_code,
      extract_file,
      extract_dir,
      paths,
      cid,
      targetCid,
      zipfilename,
      dirname,
      parentCid,
      newFolderFid,
      originalSize,
      sizeCheckCid,
    } = param;
    const bt = Date.now();

    // 关键修复：使用 targetCid（新建的文件夹）作为解压目标
    const rs = await apiAddExtractFile({
      pick_code,
      extract_file,
      extract_dir,
      to_pid: targetCid,
      paths,
    });

    if (Date.now() - bt > CONFIG.unzipTimeout) {
      setTaskStatus(zipfilename, "timeout");
      return;
    }

    if (!rs.state) {
      setTaskStatus(zipfilename, "fail");
      handleExtractError(rs, pick_code, cid, zipfilename);
      return;
    }

    const extract_id = rs.data.extract_id;
    await pollExtractProgress(
      extract_id,
      pick_code,
      targetCid,
      cid,
      zipfilename,
      dirname,
      parentCid,
      newFolderFid,
      originalSize,
      sizeCheckCid
    );
  }

  function pollExtractProgress( extract_id, pick_code, target_cid, unzip_destination_cid, zipfilename, folder_name, parent_cid, newFolderFid, originalSize, sizeCheckCid ) {
    return new Promise((resolve) => {
      const win = window;
      const worker = new win.Worker("/static/plug/main_2014_wl/bg_unzip.js");
      worker.postMessage({ type: "unZip", data: { extract_id } });
      worker.onmessage = async function (e) {
        if (e.data.type === "update") {
          const pct = e.data.data.percent;
          if (pct < 100) {
            setTaskStatus(zipfilename, "running", pct);
            setTimeout(
              () => worker.postMessage({ type: "unZip", data: { extract_id } }),
              1000
            );
          } else {
            worker.terminate();

            // ── 体积校验逻辑 ──
            if (CONFIG.sizeCheck && originalSize) {
              // 进入"校验中"状态（函数内部会等待索引更新）
              setTaskStatus(
                zipfilename,
                "checking",
                100,
                `原始: ${formatSize(originalSize)} | 等待索引...`
              );

              // 确定实际用于校验的 cid：
              // - 若已知（新建了文件夹），直接用
              // - 若未知（直接解压到父目录），从父目录文件列表中查找同名子文件夹
              let checkCid = sizeCheckCid;
              let alreadySlept = false;
              if (!checkCid) {
                // 等待索引后再查询，否则新文件夹可能还没出现
                await sleep(CONFIG.sizeCheckDelay);
                alreadySlept = true;
                checkCid = await findSubFolderCid(parent_cid, folder_name);
                if (!checkCid) {
                  console.warn(
                    `[ant-unzip] 无法从父目录找到解压文件夹 "${folder_name}"，跳过校验`
                  );
                  setTaskStatus(
                    zipfilename,
                    "done",
                    100,
                    `原始: ${formatSize(originalSize)} | 文件夹未找到，跳过校验`
                  );
                  // 直接走删除流程
                  doDeleteZip(pick_code, zipfilename);
                  resolve();
                  return;
                }
              }

              // 获取解压目标目录的总大小
              const currentSize = await getFolderTotalSizeWithRetry(
                checkCid,
                !alreadySlept
              );

              // 计算解压率（解压后必然小于压缩包，因为压缩包包含元数据）
              const extractRate = ((currentSize / originalSize) * 100).toFixed(
                1
              );
              const sizeInfoText = `原始: ${formatSize( originalSize )} → 解压: ${formatSize(currentSize)} (${extractRate}%)`;

              if (currentSize === 0) {
                // 仍为0说明索引失败或目录为空，标记不确定，不阻断删除
                console.warn(
                  `[ant-unzip] 无法获取目录大小，跳过校验: ${zipfilename}`
                );
                setTaskStatus(
                  zipfilename,
                  "done",
                  100,
                  `原始: ${formatSize(originalSize)} | 大小获取失败`
                );
              } else if (extractRate < 90) {
                // 解压率低于90%视为异常（正常解压通常在95-99%之间）
                console.warn(
                  `[体积异常] ${zipfilename}. 原: ${originalSize}, 现: ${currentSize}, 率: ${extractRate}%`
                );
                setTaskStatus(zipfilename, "incomplete", 100, sizeInfoText);
                resolve();
                return; // 校验失败，不执行删除逻辑
              } else {
                console.log(
                  `[解压正常] ${zipfilename}. 原: ${originalSize}, 现: ${currentSize}, 率: ${extractRate}%`
                );
                setTaskStatus(zipfilename, "done", 100, sizeInfoText);
              }
            } else {
              setTaskStatus(zipfilename, "done", 100);
            }

            // 校验通过 or 跳过校验 → 执行删除
            doDeleteZip(pick_code, zipfilename);
            resolve();
          }
        } else if (e.data.type === "error") {
          worker.terminate();
          setTaskStatus(zipfilename, "fail");
          resolve();
        }
      };
    });
  }

  /** * 从父目录文件列表中查找指定名称的子文件夹，返回其 cid * 用于 addNewDir=false 场景（直接解压到父目录，解压文件是压缩包内已有的顶层文件夹） */
  async function findSubFolderCid(parentCid, folderName) {
    try {
      // 获取父目录列表，只看文件夹（show_dir=1, type=''）
      const res = await ajaxGet("//aps.115.com/natsort/files.php", {
        cid: parentCid,
        aid: 1,
        o: "user_ptime",
        asc: 0,
        offset: 0,
        show_dir: 1,
        limit: 115,
        natsort: 1,
        record_open_time: 1,
        count_folders: 1,
        type: "",
        format: "json",
      });
      if (!res || !res.data) return null;
      // 在列表中查找与 folderName 相似的文件夹（file_type=0 表示文件夹）
      const match = res.data.find(
        (f) =>
          f.fc === "0" &&
          (f.n === folderName ||
            strSimilarity(f.n, folderName) > CONFIG.similarityThreshold)
      );
      if (match) {
        console.log(
          `[ant-unzip] 找到解压文件夹: name=${match.n}, cid=${match.cid}`
        );
        return match.cid;
      }
    } catch (e) {
      console.warn("[ant-unzip] findSubFolderCid 失败:", e);
    }
    return null;
  }

  /** * 执行删除压缩包操作，抽取为独立函数避免重复 */
  function doDeleteZip(pick_code, zipfilename) {
    if (CONFIG.deleteZip) {
      console.log(`[ant-unzip] === 删除压缩包 ===`);
      console.log(`[ant-unzip] pick_code: ${pick_code}`);
      console.log(`[ant-unzip] zipMeta 内容:`, [...zipMeta.entries()]);

      // 尝试从 zipMeta 获取
      let meta = zipMeta.get(pick_code);

      // 如果 zipMeta 中没有，尝试从 pcDomlist 获取
      if (!meta) {
        const domObj = pcDomlist.get(zipfilename);
        if (domObj) {
          console.log(`[ant-unzip] 从 pcDomlist 找到 domObj:`, domObj);
          meta = { cid: domObj.cid, fid: domObj.fid };
        }
      }

      console.log(`[ant-unzip] meta:`, meta);
      if (meta) {
        console.log(`[ant-unzip] 调用删除: pid=${meta.cid}, fid=[${meta.fid}]`);
        // 使用同步版本，与原始版本一致
        const res = apiDeleteFilesSync(meta.cid, [meta.fid]);
        console.log(`[ant-unzip] 删除结果:`, res);
        if (res && res.state) {
          console.log(`[ant-unzip] ✓ 删除成功`);
        } else {
          console.error(`[ant-unzip] ✗ 删除失败:`, res);
        }
      } else {
        console.error(`[ant-unzip] ✗ 无法找到删除所需数据`);
      }
    }
  }

  function handleExtractError(rs, pick_code, cid, zipfilename) {
    if (rs.code === 990028) {
      showStorageFullDialog();
    } else if (rs.message) {
      $.alertTip && $.alertTip(rs.message);
    }
  }

  function showStorageFullDialog() {
    const wrapHtml = `<div class="dialog-box" style="width:500px;"><div class="dialog-handle"><a href="javascript:;" class="close hover" btn="close">关闭</a></div><div rel="base_content"><div class="newviptip-dialog"><div class="newviptip-header"><div class="center-vip-icon"><s>VIP</s></div></div><div class="newviptip-wrap"><div class="title">存储空间不足</div><div class="title">升级为铂金VIP或者首充黄金VIP可获得额外赠送存储空间，也可以购买空间进行扩容。</div><div class="btn-wrap"><a href="javascript:;" btn="upgrade" class="button btn-upgrade"><span>升级VIP</span></a><a href="javascript:;" btn="buy_space" class="button"><span>购买空间</span></a></div></div></div></div></div>`;
    $.showContentDG &&
      $.showContentDG("", {
        warpHtml: wrapHtml,
        width: 500,
        loaded: function () {
          this.warp
            .find("[btn=upgrade]")
            .on("click", () => window.open("//vip.115.com/?p=index_info_vip"));
          this.warp
            .find("[btn=buy_space]")
            .on("click", () =>
              window.open(
                "//vip.115.com/order/mycoupon/?t=space&is_force_spswd=1"
              )
            );
        },
      });
  }

  async function batchExtract(cid) {
    taskMap.clear();
    renderPanel();
    try {
      const res = await apiFiles(cid, 5);
      if (!res.state) return;
      for (const f of res.data) {
        if (f.n.indexOf("无法云解压") !== -1) continue;
        // apiFiles返回的 f.cid 应该是父目录ID
        console.log(
          `[ant-unzip] 批量解压: name=${f.n}, cid=${f.cid}, fid=${f.fid}`
        );
        const domObj = {
          pick_code: f.pc,
          file_name: f.n,
          cid: f.cid || cid, // 使用返回的cid，如果为空则使用传入的cid
          fid: f.fid,
          size: parseInt(f.s || 0), // 原始压缩包大小
        };
        // 修复：调用 startExtract 而不是直接调用 doExtract，确保 zipMeta 被正确设置
        startExtract(domObj);
      }
      renderPanel();
    } catch (e) {
      console.error("[ant-unzip] batchExtract error:", e);
    }
  }

  // ─────────────────────────────────────────────
  // 预解压流程 (全量保留)
  // ─────────────────────────────────────────────
  let activePreCount = 0;
  const preQueue = [];
  function enqueuePreExtract(fn) {
    preQueue.push(fn);
    drainPreQueue();
  }
  function drainPreQueue() {
    while (activePreCount < CONFIG.maxConcurrent && preQueue.length > 0) {
      const fn = preQueue.shift();
      activePreCount++;
      Promise.resolve()
        .then(fn)
        .finally(() => {
          activePreCount--;
          drainPreQueue();
        });
    }
  }

  async function batchPreExtract(cid) {
    try {
      const res = await apiFiles(cid, 5);
      if (!res.state) return;
      panelMode = "pre";
      taskMap.clear();
      for (const f of res.data) {
        if (f.n.indexOf("无法云解压") !== -1) continue;
        const domObj = {
          pick_code: f.pc,
          file_name: f.n,
          cid: f.cid,
          fid: f.fid,
          zipfilename: f.n,
        };
        pcDomlist.set(f.n, domObj);
        taskMap.set(f.n, { status: "pending", percent: 0, domObj });
        enqueuePreExtract(() => doPushExtract(domObj));
      }
      buildPanel();
      renderPanel();
    } catch (e) {
      console.error("[ant-unzip] batchPreExtract error:", e);
    }
  }

  function doPushExtract(param) {
    return new Promise((resolve) => {
      const bt = Date.now();
      const win = window;
      const worker = new win.Worker("/static/plug/main_2014_wl/bg_unzip.js");
      const { zipfilename, pick_code, fid } = param;
      const oldname = zipfilename;
      const basename = oldname.substring(0, oldname.lastIndexOf("."));
      const ext = oldname.substring(oldname.lastIndexOf("."));
      const newname = `${basename}（无法云解压）${ext}`;

      setTaskStatus(zipfilename, "running", 0);

      worker.postMessage({ type: "start", data: { pick_code } });
      worker.onmessage = async function (e) {
        if (Date.now() - bt > CONFIG.preUnzipTimeout) {
          worker.terminate();
          setTaskStatus(zipfilename, "timeout");
          resolve();
          return;
        }
        if (e.data.type !== "update") {
          if (e.data.type === "error") {
            worker.terminate();
            setTaskStatus(zipfilename, "fail");
          }
          resolve();
          return;
        }
        const { unzip_status, progress } = e.data.data;
        if (unzip_status === 0) {
          setTaskStatus(zipfilename, "running", progress);
          try {
            const rs = await apiPushExtract(pick_code);
            if (rs.state)
              setTimeout(
                () =>
                  worker.postMessage({ type: "start", data: { pick_code } }),
                1000
              );
          } catch (err) {}
        } else if (unzip_status === 1) {
          setTaskStatus(zipfilename, "running", progress);
          setTimeout(
            () => worker.postMessage({ type: "start", data: { pick_code } }),
            1000
          );
        } else if (unzip_status === 2) {
          worker.terminate();
          if (!oldname.includes("无法云解压"))
            await apiRename(fid, newname).catch(() => {});
          setTaskStatus(zipfilename, "damaged");
          resolve();
        } else if (unzip_status === 3) {
          worker.terminate();
          setTaskStatus(zipfilename, "fail");
          resolve();
        } else if (unzip_status === 6) {
          worker.terminate();
          await handlePasswordRequired(param, resolve);
        } else if (unzip_status === 7) {
          worker.terminate();
          if (!oldname.includes("无法云解压"))
            await apiRename(fid, newname).catch(() => {});
          setTaskStatus(zipfilename, "fail");
          resolve();
        } else {
          worker.terminate();
          setTaskStatus(zipfilename, "done", 100);
          resolve();
        }
      };
    });
  }

  async function handlePasswordRequired(param, resolve) {
    const { zipfilename, pick_code } = param;
    let savedPw = getSavedPassword();
    if (!param._pwTried && savedPw) {
      param._pwTried = true;
      param.mm = savedPw;
      try {
        const rs = await apiPushExtract(pick_code, savedPw);
        if (rs.state && rs.data.unzip_status === 1)
          return doPushExtract(param).then(resolve);
      } catch (e) {}
    }
    const hint = param.mm
      ? `密码有误，请输入正确密码（${zipfilename}）：`
      : `请输入解压密码（${zipfilename}）：`;
    const pw = prompt(hint, param.mm || "");
    if (!pw) {
      setTaskStatus(zipfilename, "nopass");
      resolve();
      return;
    }
    try {
      const rs = await apiPushExtract(pick_code, pw);
      if (rs.state && rs.data.unzip_status === 1) {
        savePassword(pw);
        param.mm = pw;
        return doPushExtract(param).then(resolve);
      } else {
        setTaskStatus(zipfilename, "wrongpass");
      }
    } catch (e) {
      setTaskStatus(zipfilename, "fail");
    }
    resolve();
  }

  // ─────────────────────────────────────────────
  // 工具栏按钮
  // ─────────────────────────────────────────────
  function injectToolbarButtons() {
    const toolbar = document.querySelector(".left-tvf");
    if (!toolbar || toolbar.querySelector(".ant-unzip-toolbar-btn")) return;

    const createBtn = (label, icon, cls) => {
      const btn = document.createElement("a");
      btn.href = "javascript:void(0)";
      btn.className = `ant-unzip-toolbar-btn ${cls}`;
      btn.innerHTML = `${icon}<span>${label}</span>`;
      return btn;
    };

    const SVG_ZIP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;
    const SVG_DIR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
    const SVG_PRE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    const btn1 = createBtn("分别解压", SVG_ZIP, "primary unzip_toeach");
    const btn2 = createBtn("直接解压", SVG_DIR, "secondary unzip_directly");
    const btn3 = createBtn("预解压", SVG_PRE, "warning unzipallpre");

    btn1.addEventListener("click", () => {
      unzipMode = 1;
      batchExtract(getCurrentCid());
    });
    btn2.addEventListener("click", () => {
      unzipMode = 2;
      batchExtract(getCurrentCid());
    });
    btn3.addEventListener("click", () => batchPreExtract(getCurrentCid()));

    toolbar.appendChild(btn1);
    toolbar.appendChild(btn2);
    toolbar.appendChild(btn3);
  }

  $(document).on("mouseenter", ".list-contents li", function () {
    const li = $(this);
    if (
      li.find(".ant-item-unzip-btn").length > 0 ||
      li.attr("file_type") === "0"
    )
      return;
    const btn = document.createElement("a");
    btn.className = "ant-item-unzip-btn";
    btn.href = "javascript:void(0)";
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>解压`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 获取父目录ID（对于文件类型，cid属性就是父目录ID）
      const parentCid = li.attr("cid") || li.attr("p_id");
      console.log(
        `[ant-unzip] 单文件解压: name=${li.attr( "title" )}, parentCid=${parentCid}, fid=${li.attr("file_id")}`
      );
      const domObj = {
        pick_code: li.attr("pick_code"),
        file_name: li.attr("title"),
        cid: parentCid,
        fid: li.attr("file_id"),
        size: parseInt(li.attr("size") || 0),
      };
      startExtract(domObj);
    });
    li.find(".file-opr").prepend(btn);
  });

  // ─────────────────────────────────────────────
  // 键盘快捷键
  // ─────────────────────────────────────────────
  document.addEventListener(
    "keydown",
    function (event) {
      const tag = document.activeElement;
      if (tag && (tag.tagName === "INPUT" || tag.tagName === "TEXTAREA"))
        return;
      if (event.keyCode === 8) {
        event.preventDefault();
        const flist = $(".file-path a");
        if (flist.length >= 2) flist[flist.length - 2].click();
      }
      if (event.keyCode === 33) {
        const flist = $(".list-contents");
        flist.scrollTop(flist.scrollTop() - (flist.height() - 60));
      }
      if (event.keyCode === 34) {
        const flist = $(".list-contents");
        flist.scrollTop(flist.scrollTop() + (flist.height() - 60));
      }
    },
    true
  );

  function tryInit() {
    if (document.querySelector(".left-tvf")) {
      injectToolbarButtons();
    } else {
      setTimeout(tryInit, 500);
    }
  }
  tryInit();

  const toolbarObserver = new MutationObserver(() => {
    const toolbar = document.querySelector(".left-tvf");
    if (toolbar && !toolbar.querySelector(".ant-unzip-toolbar-btn")) {
      injectToolbarButtons();
    }
  });
  toolbarObserver.observe(document.body, { childList: true, subtree: true });
})();