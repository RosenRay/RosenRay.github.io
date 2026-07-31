// ==UserScript==
// @name 98论坛搜索增强预览
// @namespace https://plwt.kpqq4.com/
// @version 2.4.1
// @description 紧凑显示增强搜索数据，支持过滤、浏览记录和通用手机版搜索提示页。
// @author ChatGPT
// @match *://plwt.kpqq4.com/search.php*
// @match *://*/search.php*
// @grant GM_addStyle
// @run-at document-start
// @updateURL https://rosenray.github.io/userscripts/98-forum-search-preview.user.js
// @downloadURL https://rosenray.github.io/userscripts/98-forum-search-preview.user.js
// ==/UserScript==

(function () {
  "use strict";

  const FILTER_STORAGE_KEY = "dsp-search-filters-v1";
  const VIEWED_STORAGE_KEY = "dsp-viewed-threads-v1";
  const MAX_VIEWED_THREADS = 1500;
  const SAFE_SWITCH_DELAY_MS = 10500;
  const pageStartedAt = Date.now();
  const viewedThreadIds = loadViewedThreadIds();
  const keywordAtStart = getKeywordFromUrl();

  if (!isForumSearchPage()) return;

  if (!keywordAtStart) {
    const submittedWithoutKeyword = new URL(location.href).searchParams.has(
      "searchsubmit"
    );
    if (submittedWithoutKeyword) hideOriginalPageEarly();
    installBlankSearchInterceptor();
    runWhenReady(() => {
      const searchPrompt = getSearchPrompt();
      if (!searchPrompt) {
        revealOriginalPage();
        return;
      }
      if (!submittedWithoutKeyword) hideOriginalPageEarly();
      enableMobileViewport();
      addStyles();
      buildMobilePromptPage(searchPrompt);
      revealOriginalPage();
    });
    return;
  }

  const initialMobileMode = new URL(location.href).searchParams.get("mobile");

  if (initialMobileMode === "no") {
    hideOriginalPageEarly();
    runWhenReady(boot);
  } else {
    runWhenReady(() => {
      if (getSearchPrompt() || isDesktopSearchPage()) {
        boot();
      } else {
        showSafeEnhanceButton();
      }
    });
  }

  function runWhenReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function boot() {
    const searchPrompt = getSearchPrompt();
    if (searchPrompt) {
      enableMobileViewport();
      addStyles();
      buildMobilePromptPage(searchPrompt);
      revealOriginalPage();
      return;
    }

    const desktopItems = collectDesktopItems();

    if (!isDesktopSearchPage()) {
      showDesktopModeHint();
      revealOriginalPage();
      return;
    }

    ensureDesktopSearchHistoryUrl();
    enableMobileViewport();
    addStyles();
    buildMobilePage(desktopItems);
    revealOriginalPage();
  }

  function isForumSearchPage() {
    const params = new URLSearchParams(location.search);
    return (
      location.pathname.endsWith("/search.php") &&
      (!params.get("mod") || params.get("mod") === "forum")
    );
  }

  function installBlankSearchInterceptor() {
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (!form || form.tagName !== "FORM") return;

        const action = new URL(
          form.getAttribute("action") || location.href,
          location.href
        );
        const isForumSearchForm =
          action.pathname.endsWith("/search.php") &&
          (action.searchParams.get("mod") === "forum" ||
            form.id === "searchform");
        if (!isForumSearchForm) return;

        const input = form.querySelector(
          'input[name="srchtxt"], #scform_srchtxt'
        );
        const keyword = cleanText(input?.value);
        if (!keyword) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        navigateDesktop(buildNewSearchUrl(keyword));
      },
      true
    );
  }

  function getKeywordFromUrl() {
    const url = new URL(location.href);
    return cleanText(
      url.searchParams.get("kw") || url.searchParams.get("srchtxt")
    );
  }

  function hideOriginalPageEarly() {
    document.documentElement.classList.add("dsp-pending");
    GM_addStyle(`
      html.dsp-pending { background: #f4f5f7 !important; }
      html.dsp-pending body { visibility: hidden !important; }
    `);
  }

  function revealOriginalPage() {
    document.documentElement.classList.remove("dsp-pending");
  }

  function getSearchPrompt() {
    const messageBox = document.querySelector("#messagetext");
    if (!messageBox) return null;

    const messageParagraph = Array.from(messageBox.querySelectorAll("p")).find(
      (paragraph) => {
        const text = cleanText(paragraph.textContent);
        return (
          text &&
          !paragraph.classList.contains("alert_btnleft") &&
          !/点击这里返回|网站首页|论坛首页/.test(text)
        );
      }
    );
    const message = cleanText(
      messageParagraph?.textContent || messageBox.textContent
    );
    if (!message) return null;

    const rateLimited =
      /搜索繁忙|刷新.{0,8}频繁|操作.{0,8}频繁|请求.{0,8}频繁|频繁.{0,16}(?:再试|操作)|(?:稍后|秒后|分钟后).{0,10}再试/.test(
        message
      );
    if (rateLimited) {
      return {
        kind: "rate-limit",
        title: "操作过于频繁",
        message,
        note: "网站限制了短时间内的重复搜索，请按照提示等待后再搜索。返回上一页不会自动重新请求。",
        returnLabel: "返回上一页",
      };
    }

    const invalidSearch =
      /搜索内容|搜索词|关键词|关键字|不能少于|不能超过|长度|字符/.test(message);
    if (invalidSearch) {
      return {
        kind: "validation",
        title: "搜索条件有误",
        message,
        note: "请返回修改搜索内容。返回操作本身不会再次提交搜索请求。",
        returnLabel: "返回修改",
      };
    }

    return {
      kind: "generic",
      title: "搜索提示",
      message,
      note: "这是网站返回的搜索提示，请根据提示返回上一页处理。",
      returnLabel: "返回上一页",
    };
  }

  function buildMobilePromptPage(prompt) {
    const root = document.createElement("div");
    root.id = "dsp-mobile-app";
    root.className = `dsp-limit-page dsp-prompt-${prompt.kind}`;

    const header = document.createElement("header");
    header.className = "dsp-header";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "dsp-back";
    backButton.setAttribute("aria-label", "返回");
    backButton.textContent = "‹";
    backButton.addEventListener("click", () => {
      if (history.length > 1) {
        history.back();
      } else {
        navigateMobile("/search.php?mod=forum");
      }
    });

    const heading = document.createElement("div");
    heading.className = "dsp-header-title";
    heading.textContent = "搜索提示";
    header.append(backButton, heading);

    const main = document.createElement("main");
    main.className = "dsp-limit-main";

    const card = document.createElement("section");
    card.className = "dsp-limit-card";

    const icon = document.createElement("div");
    icon.className = "dsp-limit-icon";
    icon.textContent = prompt.kind === "rate-limit" ? "!" : "i";

    const title = document.createElement("h1");
    title.textContent = prompt.title;

    const messageElement = document.createElement("p");
    messageElement.className = "dsp-limit-message";
    messageElement.textContent = prompt.message;

    const note = document.createElement("p");
    note.className = "dsp-limit-note";
    note.textContent = prompt.note;

    const actions = document.createElement("div");
    actions.className = "dsp-limit-actions";

    const returnButton = document.createElement("button");
    returnButton.type = "button";
    returnButton.className = "dsp-limit-primary";
    returnButton.textContent = prompt.returnLabel;
    returnButton.addEventListener("click", () => {
      if (history.length > 1) {
        history.back();
      } else {
        navigateMobile("/search.php?mod=forum");
      }
    });

    const searchLink = document.createElement("a");
    searchLink.className = "dsp-limit-secondary";
    searchLink.href = makeMobileUrl("/search.php?mod=forum");
    searchLink.textContent = "回到搜索页";
    searchLink.addEventListener("click", (event) => {
      event.preventDefault();
      navigateMobile("/search.php?mod=forum");
    });

    actions.append(returnButton, searchLink);
    card.append(icon, title, messageElement, note, actions);
    main.appendChild(card);
    root.append(header, main);
    document.body.appendChild(root);
    document.documentElement.classList.add("dsp-mobile-mode");
  }

  function showSafeEnhanceButton() {
    if (document.querySelector(".dsp-safe-switch")) return;

    GM_addStyle(`
      .dsp-safe-switch {
        box-sizing: border-box;
        margin: 10px 12px;
        padding: 11px 12px;
        border: 1px solid #cfe0ef;
        border-radius: 9px;
        background: #f3f8fc;
        color: #607080;
        font-size: 13px;
        line-height: 1.5;
      }
      .dsp-safe-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .dsp-safe-switch-text { min-width: 0; flex: 1; }
      .dsp-safe-switch-button {
        flex: 0 0 auto;
        min-width: 116px;
        height: 38px;
        padding: 0 12px;
        border: 0;
        border-radius: 7px;
        background: #438fc8;
        color: #fff;
        font-size: 13px;
      }
      .dsp-safe-switch-button:disabled {
        background: #b7c6d2;
        color: #f5f7f9;
      }
    `);

    const box = document.createElement("div");
    box.className = "dsp-safe-switch";

    const row = document.createElement("div");
    row.className = "dsp-safe-switch-row";

    const text = document.createElement("div");
    text.className = "dsp-safe-switch-text";
    text.textContent =
      "当前保持手机版结果，不会自动重复搜索。等待安全间隔后可手动读取电脑版分类和摘要。";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dsp-safe-switch-button";
    button.disabled = true;

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        SAFE_SWITCH_DELAY_MS - (Date.now() - pageStartedAt)
      );
      if (remaining > 0) {
        button.disabled = true;
        button.textContent = `增强版（${Math.ceil(remaining / 1000)}秒）`;
        return false;
      }

      button.disabled = false;
      button.textContent = "进入增强搜索";
      return true;
    };

    const timer = setInterval(() => {
      if (updateCountdown()) clearInterval(timer);
    }, 250);
    updateCountdown();

    button.addEventListener("click", () => {
      if (Date.now() - pageStartedAt < SAFE_SWITCH_DELAY_MS) return;
      navigateDesktop(location.href);
    });

    row.append(text, button);
    box.appendChild(row);

    const target = document.querySelector(
      ".threadlist.n5_ssnrys, .threadlist, #threadlist"
    );
    if (target) {
      target.insertAdjacentElement("beforebegin", box);
    } else {
      document.body.prepend(box);
    }
  }

  function isDesktopSearchPage() {
    return !!(
      document.querySelector("#threadlist li.pbw, .slst li.pbw") ||
      (document.body?.id === "nv_search" &&
        document.querySelector("#ct .sttl, #ct .slst"))
    );
  }

  function collectDesktopItems() {
    const items = [];

    document
      .querySelectorAll("#threadlist li.pbw, .slst li.pbw, li.pbw")
      .forEach((item) => {
        const titleLink = item.querySelector(
          'h3 a[href*="mod=viewthread"], a[href*="mod=viewthread"], a[href*="viewthread.php"]'
        );
        if (!titleLink) return;

        const tid =
          item.id?.match(/^\d+$/)?.[0] ||
          getTid(titleLink.getAttribute("href"));
        const title = cleanText(titleLink.textContent);
        if (!tid || !title) return;

        const categoryLink = item.querySelector(
          'a.xi1[href*="forum-"], ' +
            'a.xi1[href*="mod=forumdisplay"], ' +
            'a[href*="mod=forumdisplay"][href*="fid="], ' +
            'a[href*="forum.php?fid="]'
        );
        const statsParagraph = item.querySelector("p.xg1");
        const metadataParagraph = categoryLink?.closest("p");
        const excerptParagraph = Array.from(
          item.querySelectorAll(":scope > p")
        ).find((paragraph) => {
          return (
            paragraph !== statsParagraph &&
            paragraph !== metadataParagraph &&
            !!cleanText(paragraph.textContent)
          );
        });

        items.push({
          tid,
          title,
          threadUrl: makeMobileUrl(titleLink.getAttribute("href")),
          category: cleanText(categoryLink?.textContent) || "未分类",
          categoryUrl: categoryLink
            ? makeMobileUrl(categoryLink.getAttribute("href"))
            : "",
          stats: cleanText(statsParagraph?.textContent),
          time: cleanText(
            metadataParagraph?.querySelector("span")?.textContent
          ),
          excerpt: cleanText(excerptParagraph?.textContent),
        });
      });

    return items;
  }

  function buildMobilePage(items) {
    const keyword = getKeyword();
    const root = document.createElement("div");
    root.id = "dsp-mobile-app";

    const header = document.createElement("header");
    header.className = "dsp-header";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "dsp-back";
    backButton.setAttribute("aria-label", "返回");
    backButton.textContent = "‹";
    backButton.addEventListener("click", () => {
      if (history.length > 1) {
        history.back();
      } else {
        navigateMobile(makeMobileUrl("/forum.php"));
      }
    });

    const heading = document.createElement("div");
    heading.className = "dsp-header-title";
    heading.textContent = "搜索主题";
    header.append(backButton, heading);

    const searchSection = document.createElement("section");
    searchSection.className = "dsp-search-section";

    const searchForm = document.createElement("form");
    searchForm.className = "dsp-search-form";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "dsp-search-input";
    searchInput.value = keyword;
    searchInput.placeholder = "输入搜索关键词";
    searchInput.autocomplete = "off";

    const searchButton = document.createElement("button");
    searchButton.type = "submit";
    searchButton.className = "dsp-search-button";
    searchButton.textContent = "搜索";

    searchForm.append(searchInput, searchButton);
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = searchInput.value.trim();
      if (!value) return;
      navigateDesktop(buildNewSearchUrl(value));
    });

    const summary = document.createElement("div");
    summary.className = "dsp-summary";
    summary.textContent = getResultSummary(items.length, keyword);

    const list = document.createElement("main");
    list.className = "dsp-result-list";

    if (items.length) {
      items.forEach((item) =>
        list.appendChild(createResultItem(item, keyword))
      );
    } else {
      const empty = document.createElement("div");
      empty.className = "dsp-empty";
      empty.textContent = "没有找到相关帖子";
      list.appendChild(empty);
    }

    const filterControls = createFilterControls(list);
    searchSection.append(searchForm, summary, filterControls);

    const pagination = createPagination();
    const bottomNav = createBottomNav();

    root.append(header, searchSection, list);
    if (pagination) root.appendChild(pagination);
    root.appendChild(bottomNav);
    document.body.appendChild(root);
    document.documentElement.classList.add("dsp-mobile-mode");
  }

  function createResultItem(item, keyword) {
    const article = document.createElement("article");
    article.className = "dsp-result-item";
    article.dataset.tid = item.tid;
    article.dataset.category = item.category;
    article.dataset.title = item.title;
    if (viewedThreadIds.has(String(item.tid)))
      article.classList.add("dsp-viewed");

    const titleLink = document.createElement("a");
    titleLink.className = "dsp-result-title";
    titleLink.href = item.threadUrl;
    titleLink.addEventListener("click", (event) => {
      markThreadViewed(item.tid, article);
      event.preventDefault();
      navigateMobile(item.threadUrl);
    });
    titleLink.addEventListener("auxclick", () =>
      markThreadViewed(item.tid, article)
    );
    appendHighlightedText(titleLink, item.title, keyword);

    const excerpt = document.createElement("p");
    excerpt.className = "dsp-result-excerpt";
    excerpt.textContent = item.excerpt || "搜索页未提供正文摘要";

    const details = document.createElement("div");
    details.className = "dsp-result-details";

    if (item.time) {
      const time = document.createElement("span");
      time.textContent = item.time;
      details.appendChild(time);
    }

    if (item.stats) {
      const stats = document.createElement("span");
      stats.textContent = item.stats;
      details.appendChild(stats);
    }

    if (item.categoryUrl) {
      const categoryLink = document.createElement("a");
      categoryLink.className = "dsp-category";
      categoryLink.href = item.categoryUrl;
      categoryLink.addEventListener("click", (event) => {
        event.preventDefault();
        navigateMobile(item.categoryUrl);
      });
      categoryLink.textContent = item.category;
      categoryLink.title = `进入版块：${item.category}`;
      details.appendChild(categoryLink);
    } else {
      const category = document.createElement("span");
      category.className = "dsp-category";
      category.textContent = item.category;
      details.appendChild(category);
    }

    article.append(titleLink, excerpt);
    if (details.childElementCount) article.appendChild(details);
    return article;
  }

  function loadViewedThreadIds() {
    try {
      const stored = JSON.parse(
        localStorage.getItem(VIEWED_STORAGE_KEY) || "[]"
      );
      if (!Array.isArray(stored)) return new Set();
      return new Set(stored.map(String).filter(Boolean));
    } catch (_) {
      return new Set();
    }
  }

  function markThreadViewed(tid, article) {
    const id = String(tid || "");
    if (!id) return;

    viewedThreadIds.delete(id);
    viewedThreadIds.add(id);
    article?.classList.add("dsp-viewed");

    while (viewedThreadIds.size > MAX_VIEWED_THREADS) {
      viewedThreadIds.delete(viewedThreadIds.values().next().value);
    }

    try {
      localStorage.setItem(
        VIEWED_STORAGE_KEY,
        JSON.stringify(Array.from(viewedThreadIds))
      );
    } catch (_) {
      // 本地存储不可用时，仅保留当前页面的置灰状态。
    }
  }

  function createFilterControls(resultList) {
    const state = loadFilterState();
    const wrapper = document.createElement("div");
    wrapper.className = "dsp-filter-wrapper";

    const toolbar = document.createElement("div");
    toolbar.className = "dsp-filter-toolbar";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "dsp-filter-toggle";
    toggleButton.textContent = "筛选设置";

    const status = document.createElement("span");
    status.className = "dsp-filter-status";

    toolbar.append(toggleButton, status);

    const panel = document.createElement("div");
    panel.className = "dsp-filter-panel";
    panel.hidden = true;

    const note = document.createElement("div");
    note.className = "dsp-filter-note";
    note.textContent =
      "勾选后的条件会隐藏本页匹配结果；设置会保存在当前浏览器。";
    panel.appendChild(note);

    const refresh = () => {
      saveFilterState(state);
      applyFilters(resultList, state, toggleButton, status);
    };

    panel.append(
      createFilterSection(
        "过滤分类",
        "输入完整分类名称",
        state.categories,
        refresh
      ),
      createFilterSection(
        "过滤标题内容",
        "输入标题关键词",
        state.titles,
        refresh
      )
    );

    toggleButton.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggleButton.classList.toggle("dsp-open", !panel.hidden);
    });

    wrapper.append(toolbar, panel);
    applyFilters(resultList, state, toggleButton, status);
    return wrapper;
  }

  function createFilterSection(title, placeholder, entries, onChange) {
    const section = document.createElement("section");
    section.className = "dsp-filter-section";

    const heading = document.createElement("div");
    heading.className = "dsp-filter-heading";
    heading.textContent = title;

    const form = document.createElement("form");
    form.className = "dsp-filter-add";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.maxLength = 80;

    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.textContent = "添加";
    form.append(input, addButton);

    const entryList = document.createElement("div");
    entryList.className = "dsp-filter-entries";

    const renderEntries = () => {
      entryList.replaceChildren();

      if (!entries.length) {
        const empty = document.createElement("span");
        empty.className = "dsp-filter-empty";
        empty.textContent = "尚未添加";
        entryList.appendChild(empty);
        return;
      }

      entries.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "dsp-filter-entry";

        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = entry.enabled;
        checkbox.addEventListener("change", () => {
          entry.enabled = checkbox.checked;
          onChange();
        });

        const text = document.createElement("span");
        text.textContent = entry.value;
        label.append(checkbox, text);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "dsp-filter-remove";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `删除 ${entry.value}`);
        removeButton.addEventListener("click", () => {
          entries.splice(index, 1);
          renderEntries();
          onChange();
        });

        row.append(label, removeButton);
        entryList.appendChild(row);
      });
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = cleanText(input.value);
      if (!value) return;

      const existing = entries.find(
        (entry) => entry.value.toLocaleLowerCase() === value.toLocaleLowerCase()
      );

      if (existing) {
        existing.enabled = true;
      } else {
        entries.push({ value, enabled: true });
      }

      input.value = "";
      renderEntries();
      onChange();
    });

    section.append(heading, form, entryList);
    renderEntries();
    return section;
  }

  function applyFilters(resultList, state, toggleButton, status) {
    const categoryFilters = state.categories
      .filter((entry) => entry.enabled)
      .map((entry) => entry.value.toLocaleLowerCase());
    const titleFilters = state.titles
      .filter((entry) => entry.enabled)
      .map((entry) => entry.value.toLocaleLowerCase());

    let hiddenCount = 0;
    resultList.querySelectorAll(".dsp-result-item").forEach((article) => {
      const category = (article.dataset.category || "").toLocaleLowerCase();
      const title = (article.dataset.title || "").toLocaleLowerCase();
      const categoryMatched = categoryFilters.includes(category);
      const titleMatched = titleFilters.some((keyword) =>
        title.includes(keyword)
      );
      const hidden = categoryMatched || titleMatched;
      article.hidden = hidden;
      if (hidden) hiddenCount += 1;
    });

    const activeCount = categoryFilters.length + titleFilters.length;
    toggleButton.textContent = activeCount
      ? `筛选设置 (${activeCount})`
      : "筛选设置";
    status.textContent = activeCount
      ? `已隐藏 ${hiddenCount} 条`
      : "未启用过滤";
  }

  function loadFilterState() {
    const fallback = {
      categories: [{ value: "求片问答悬赏区", enabled: false }],
      titles: [],
    };

    try {
      const parsed = JSON.parse(
        localStorage.getItem(FILTER_STORAGE_KEY) || "null"
      );
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        categories: normalizeFilterEntries(parsed.categories),
        titles: normalizeFilterEntries(parsed.titles),
      };
    } catch (_) {
      return fallback;
    }
  }

  function normalizeFilterEntries(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const entries = [];

    value.forEach((entry) => {
      const text = cleanText(typeof entry === "string" ? entry : entry?.value);
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      entries.push({ value: text, enabled: !!entry?.enabled });
    });

    return entries;
  }

  function saveFilterState(state) {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // 浏览器禁用本地存储时，筛选仍可在当前页面使用。
    }
  }

  function appendHighlightedText(element, text, keyword) {
    if (!keyword) {
      element.textContent = text;
      return;
    }

    const lowerText = text.toLocaleLowerCase();
    const lowerKeyword = keyword.toLocaleLowerCase();
    let cursor = 0;
    let index = lowerText.indexOf(lowerKeyword, cursor);

    while (index !== -1) {
      if (index > cursor)
        element.appendChild(document.createTextNode(text.slice(cursor, index)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(index, index + keyword.length);
      element.appendChild(mark);
      cursor = index + keyword.length;
      index = lowerText.indexOf(lowerKeyword, cursor);
    }

    if (cursor < text.length)
      element.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function createPagination() {
    const source = document.querySelector(".pgs .pg, .threadlist .pg, .pg");
    if (!source) return null;

    const currentPage =
      Number(cleanText(source.querySelector("strong")?.textContent)) ||
      Number(new URL(location.href).searchParams.get("page")) ||
      1;
    const totalPage = getTotalPages(source, currentPage);
    const prevSource = source.querySelector("a.prev");
    const nextSource = source.querySelector("a.nxt");

    const pagination = document.createElement("nav");
    pagination.className = "dsp-pagination";
    pagination.setAttribute("aria-label", "搜索结果分页");

    pagination.appendChild(
      createPageButton("上一页", prevSource?.getAttribute("href"), !prevSource)
    );

    const pageInfo = document.createElement("button");
    pageInfo.type = "button";
    pageInfo.className = "dsp-page-info";
    pageInfo.textContent = `${currentPage} / ${totalPage}`;
    pageInfo.title = "点击跳转页码";
    pageInfo.addEventListener("click", () => {
      const value = prompt(`输入页码（1-${totalPage}）`, String(currentPage));
      if (value == null) return;
      const page = Math.min(
        totalPage,
        Math.max(1, Number.parseInt(value, 10) || currentPage)
      );
      navigateDesktop(buildPageUrl(page));
    });
    pagination.appendChild(pageInfo);

    pagination.appendChild(
      createPageButton("下一页", nextSource?.getAttribute("href"), !nextSource)
    );
    return pagination;
  }

  function createPageButton(text, href, disabled) {
    const element = document.createElement(disabled ? "span" : "a");
    element.className = disabled
      ? "dsp-page-button dsp-disabled"
      : "dsp-page-button";
    element.textContent = text;
    if (!disabled) {
      element.href = makeDesktopUrl(href);
      element.addEventListener("click", (event) => {
        event.preventDefault();
        navigateDesktop(element.href);
      });
    }
    return element;
  }

  function getTotalPages(source, currentPage) {
    const titled =
      source
        .querySelector('[title*="共"][title*="页"]')
        ?.getAttribute("title") || "";
    const titleMatch = titled.match(/共\s*(\d+)\s*页/);
    if (titleMatch) return Number(titleMatch[1]);

    const lastText = cleanText(source.querySelector("a.last")?.textContent);
    const lastMatch = lastText.match(/(\d+)$/);
    if (lastMatch) return Number(lastMatch[1]);

    const pages = Array.from(source.querySelectorAll('a[href*="page="]')).map(
      (link) =>
        Number(new URL(link.href, location.href).searchParams.get("page")) || 0
    );
    return Math.max(currentPage, ...pages);
  }

  function createBottomNav() {
    const nav = document.createElement("nav");
    nav.className = "dsp-bottom-nav";

    nav.append(
      createNavLink(
        "⌂",
        "首页",
        makeMobileUrl("/portal.php?mod=index"),
        false,
        true
      ),
      createNavLink(
        "▦",
        "论坛",
        makeMobileUrl("/forum.php?forumlist=1"),
        false,
        true
      ),
      createNavLink("⌕", "搜索", "#", true)
    );
    return nav;
  }

  function createNavLink( icon, label, href, active = false, mobileTarget = false ) {
    const link = document.createElement("a");
    link.className = active ? "dsp-nav-link dsp-active" : "dsp-nav-link";
    link.href = href;
    if (mobileTarget) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        navigateMobile(href);
      });
    }

    const iconElement = document.createElement("span");
    iconElement.className = "dsp-nav-icon";
    iconElement.textContent = icon;

    const text = document.createElement("span");
    text.textContent = label;
    link.append(iconElement, text);
    return link;
  }

  function getKeyword() {
    const url = new URL(location.href);
    return (
      url.searchParams.get("kw") ||
      url.searchParams.get("srchtxt") ||
      document.querySelector('#scform_srchtxt, input[name="srchtxt"]')?.value ||
      ""
    );
  }

  function getResultSummary(fallbackCount, keyword) {
    const source = cleanText(
      document.querySelector(".sttl h2, .thread_tit")?.textContent
    );
    if (source) return source;
    return keyword
      ? `找到“${keyword}”相关内容，本页 ${fallbackCount} 条`
      : `本页 ${fallbackCount} 条结果`;
  }

  function buildNewSearchUrl(keyword) {
    const url = new URL("/search.php", location.origin);
    url.searchParams.set("mod", "forum");
    url.searchParams.set("srchtxt", keyword);
    url.searchParams.set("searchsubmit", "yes");
    url.searchParams.set("orderby", "lastpost");
    url.searchParams.set("ascdesc", "desc");
    url.searchParams.set("mobile", "no");
    return url.href;
  }

  function buildPageUrl(page) {
    const url = new URL(location.href);
    url.searchParams.set("mobile", "no");
    url.searchParams.set("page", String(page));
    return url.href;
  }

  function makeDesktopUrl(value) {
    if (!value) return "#";
    const url = new URL(value, location.href);
    url.searchParams.set("mobile", "no");
    return url.href;
  }

  function makeMobileUrl(value) {
    if (!value) return "";
    const url = new URL(value, location.href);
    url.searchParams.set("mobile", "2");
    return url.href;
  }

  function ensureDesktopSearchHistoryUrl() {
    const url = new URL(location.href);
    if (url.searchParams.get("mobile") === "no") return;
    url.searchParams.set("mobile", "no");
    history.replaceState(history.state, "", url.href);
  }

  function setDiscuzMobileMode(mode) {
    document.cookie = `cPNj_2132_mobile=${mode}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function navigateMobile(value) {
    setDiscuzMobileMode("2");
    location.href = makeMobileUrl(value);
  }

  function navigateDesktop(value) {
    setDiscuzMobileMode("no");
    location.href = makeDesktopUrl(value);
  }

  function getTid(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return (
        url.searchParams.get("tid") ||
        url.pathname.match(/thread-(\d+)-/i)?.[1] ||
        ""
      );
    } catch (_) {
      return String(value).match(/[?&]tid=(\d+)/i)?.[1] || "";
    }
  }

  function enableMobileViewport() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement("meta");
      viewport.name = "viewport";
      document.head.appendChild(viewport);
    }
    viewport.content =
      "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
  }

  function showDesktopModeHint() {
    if (!document.querySelector('.threadlist.n5_ssnrys, meta[name="viewport"]'))
      return;
    GM_addStyle(`
      .dsp-switch-hint {
        box-sizing: border-box;
        margin: 8px;
        padding: 10px 12px;
        border: 1px solid #f0d9a9;
        border-radius: 9px;
        background: #fff9eb;
        color: #8b6828;
        font-size: 13px;
        line-height: 1.55;
      }
    `);
    const hint = document.createElement("div");
    hint.className = "dsp-switch-hint";
    hint.textContent =
      "当前仍是手机版搜索数据。请确认地址中的 mobile 参数为 no，然后刷新页面。";
    const list = document.querySelector(".threadlist");
    list?.insertAdjacentElement("beforebegin", hint);
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addStyles() {
    GM_addStyle(`
      html.dsp-mobile-mode,
      html.dsp-mobile-mode body {
        width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #f4f5f7 !important;
        color: #32383f !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif !important;
        -webkit-text-size-adjust: 100% !important;
      }
      html.dsp-mobile-mode body > *:not(#dsp-mobile-app) { display: none !important; }
      #dsp-mobile-app { display: block !important; width: 100% !important; min-height: 100vh; padding-bottom: calc(60px + env(safe-area-inset-bottom)); }
      .dsp-header {
        position: sticky;
        top: 0;
        z-index: 50;
        display: grid;
        grid-template-columns: 42px 1fr 42px;
        align-items: center;
        height: 44px;
        padding-top: env(safe-area-inset-top);
        background: #30353a;
        color: #fff;
        box-shadow: 0 1px 0 rgba(0, 0, 0, .12);
      }
      .dsp-back {
        width: 42px;
        height: 44px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #fff;
        font-size: 32px;
        font-weight: 200;
        line-height: 1;
      }
      .dsp-header-title { grid-column: 2; text-align: center; font-size: 17px; font-weight: 500; letter-spacing: .5px; }
      .dsp-search-section { padding: 9px 10px 8px; background: #fff; border-bottom: 1px solid #e8ebef; }
      .dsp-search-form { display: flex; gap: 7px; }
      .dsp-search-input {
        box-sizing: border-box;
        min-width: 0;
        flex: 1;
        height: 39px;
        padding: 0 10px;
        border: 1px solid #d8dde4;
        border-radius: 7px;
        outline: none;
        background: #f8f9fa;
        color: #252b31;
        font-size: 15px;
      }
      .dsp-search-input:focus { border-color: #6aa7d9; background: #fff; box-shadow: 0 0 0 3px rgba(72, 145, 204, .11); }
      .dsp-search-button {
        flex: 0 0 66px;
        height: 39px;
        border: 0;
        border-radius: 7px;
        background: #4a97d1;
        color: #fff;
        font-size: 14px;
        font-weight: 500;
      }
      .dsp-search-button:active { background: #397fb5; transform: scale(.98); }
      .dsp-summary { margin-top: 7px; color: #8a939e; font-size: 12px; line-height: 1.45; }
      .dsp-filter-wrapper { margin-top: 7px; }
      .dsp-filter-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .dsp-filter-toggle {
        min-height: 29px;
        padding: 0 9px;
        border: 1px solid #cbd9e6;
        border-radius: 7px;
        background: #f2f7fb;
        color: #3976a8;
        font-size: 12px;
      }
      .dsp-filter-toggle::after { content: " ▾"; }
      .dsp-filter-toggle.dsp-open::after { content: " ▴"; }
      .dsp-filter-status { min-width: 0; color: #929ba5; font-size: 11px; text-align: right; }
      .dsp-filter-panel {
        margin-top: 7px;
        padding: 9px;
        border: 1px solid #dfe5eb;
        border-radius: 9px;
        background: #f8fafc;
      }
      .dsp-filter-panel[hidden] { display: none !important; }
      .dsp-filter-note { margin-bottom: 10px; color: #7d8894; font-size: 12px; line-height: 1.5; }
      .dsp-filter-section + .dsp-filter-section { margin-top: 13px; padding-top: 12px; border-top: 1px solid #e3e8ed; }
      .dsp-filter-heading { margin-bottom: 7px; color: #475462; font-size: 13px; font-weight: 600; }
      .dsp-filter-add { display: flex; gap: 7px; }
      .dsp-filter-add input {
        box-sizing: border-box;
        min-width: 0;
        flex: 1;
        height: 36px;
        padding: 0 10px;
        border: 1px solid #d6dde5;
        border-radius: 7px;
        background: #fff;
        color: #303841;
        font-size: 14px;
      }
      .dsp-filter-add button {
        flex: 0 0 58px;
        height: 36px;
        border: 0;
        border-radius: 7px;
        background: #4a91c8;
        color: #fff;
        font-size: 13px;
      }
      .dsp-filter-entries { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
      .dsp-filter-entry {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        border: 1px solid #d5e0e9;
        border-radius: 999px;
        background: #fff;
        overflow: hidden;
      }
      .dsp-filter-entry label {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        gap: 5px;
        padding: 5px 5px 5px 8px;
        color: #50606f;
        font-size: 12px;
      }
      .dsp-filter-entry label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsp-filter-entry input { width: 15px; height: 15px; margin: 0; accent-color: #3f8dc8; }
      .dsp-filter-remove {
        width: 27px;
        align-self: stretch;
        padding: 0;
        border: 0;
        border-left: 1px solid #e3e8ed;
        background: transparent;
        color: #9aa4ae;
        font-size: 18px;
      }
      .dsp-filter-empty { color: #a0a8b0; font-size: 12px; }
      .dsp-result-list { margin-top: 6px; background: #fff; border-top: 1px solid #e8ebef; border-bottom: 1px solid #e8ebef; }
      .dsp-result-item { padding: 11px 12px 10px; border-bottom: 1px solid #edf0f3; }
      .dsp-result-item[hidden] { display: none !important; }
      .dsp-result-item:last-child { border-bottom: 0; }
      .dsp-result-item.dsp-viewed { background: #f5f6f7; }
      .dsp-result-title { display: block; color: #353b42; font-size: 16px; font-weight: 400; line-height: 1.55; text-decoration: none; word-break: break-word; }
      .dsp-viewed .dsp-result-title { color: #7c858e; }
      .dsp-viewed .dsp-result-title mark { color: #b77975; }
      .dsp-result-title:active { color: #2877b4; }
      .dsp-result-title mark { padding: 0; background: transparent; color: #ef3e36; font-weight: 600; }
      .dsp-result-excerpt {
        display: -webkit-box;
        margin: 5px 0 0;
        color: #717b85;
        font-size: 12px;
        line-height: 1.5;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
      .dsp-viewed .dsp-result-excerpt,
      .dsp-viewed .dsp-result-details { color: #a2a9b0; }
      .dsp-result-details { display: flex; flex-wrap: nowrap; align-items: center; gap: 0; margin-top: 5px; color: #929ba4; font-size: 11px; line-height: 1.45; overflow: hidden; white-space: nowrap; }
      .dsp-result-details > span:not(.dsp-category) { flex: 0 0 auto; }
      .dsp-result-details > * + *::before { content: "·"; margin: 0 7px; color: #c0c6cc; }
      .dsp-category {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: #3976a8;
        font-size: inherit;
        line-height: inherit;
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsp-category::after { content: ""; }
      .dsp-limit-page { padding-bottom: 0 !important; }
      .dsp-limit-main { box-sizing: border-box; display: flex; justify-content: center; width: 100%; padding: 28px 14px; }
      .dsp-limit-card {
        box-sizing: border-box;
        width: 100%;
        max-width: 420px;
        padding: 24px 18px 18px;
        border: 1px solid #e2e6ea;
        border-radius: 12px;
        background: #fff;
        text-align: center;
        box-shadow: 0 5px 20px rgba(45, 59, 72, .06);
      }
      .dsp-limit-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        margin: 0 auto 12px;
        border-radius: 50%;
        background: #fff1e6;
        color: #e58b42;
        font-size: 24px;
        font-weight: 600;
      }
      .dsp-prompt-validation .dsp-limit-icon,
      .dsp-prompt-generic .dsp-limit-icon { background: #eaf4fc; color: #4a91c8; font-size: 20px; }
      .dsp-limit-card h1 { margin: 0; color: #38434d; font-size: 18px; font-weight: 600; }
      .dsp-limit-message { margin: 12px 0 0; color: #586674; font-size: 15px; line-height: 1.6; }
      .dsp-limit-note { margin: 8px 0 0; color: #8b959f; font-size: 12px; line-height: 1.55; }
      .dsp-limit-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 20px; }
      .dsp-limit-primary,
      .dsp-limit-secondary {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 39px;
        border-radius: 7px;
        font-size: 13px;
        text-decoration: none;
      }
      .dsp-limit-primary { border: 0; background: #4a97d1; color: #fff; }
      .dsp-limit-secondary { border: 1px solid #d5dde5; background: #fff; color: #657483; }
      .dsp-empty { padding: 50px 20px; color: #929ca7; font-size: 14px; text-align: center; }
      .dsp-pagination { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; margin: 11px 10px; }
      .dsp-page-button,
      .dsp-page-info {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 37px;
        padding: 0 11px;
        border: 1px solid #d7dde4;
        border-radius: 8px;
        background: #fff;
        color: #506171;
        font-size: 13px;
        text-decoration: none;
      }
      .dsp-page-info { min-width: 72px; font-weight: 600; }
      .dsp-disabled { color: #b9c0c7; background: #f4f5f6; }
      .dsp-bottom-nav {
        position: fixed;
        z-index: 60;
        right: 0;
        bottom: 0;
        left: 0;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        height: 50px;
        padding-bottom: env(safe-area-inset-bottom);
        border-top: 1px solid #e1e5ea;
        background: rgba(255, 255, 255, .97);
        backdrop-filter: blur(12px);
      }
      .dsp-nav-link { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; color: #8a939d; font-size: 11px; line-height: 1.15; text-decoration: none; }
      .dsp-nav-icon { height: 23px; font-size: 21px; font-weight: 300; line-height: 23px; }
      .dsp-nav-link.dsp-active { color: #3e8fc9; }
      @media (prefers-color-scheme: dark) {
        html.dsp-mobile-mode,
        html.dsp-mobile-mode body { background: #12171d !important; color: #dce3eb !important; }
        .dsp-search-section,
        .dsp-result-list { background: #1c242d; border-color: #2d3945; }
        .dsp-search-input { border-color: #394755; background: #252f39; color: #e4ebf2; }
        .dsp-summary { color: #94a2b0; }
        .dsp-filter-toggle { border-color: #38546c; background: #22384b; color: #9bc9ef; }
        .dsp-filter-panel { border-color: #33414e; background: #18212a; }
        .dsp-filter-note,
        .dsp-filter-status { color: #8f9dab; }
        .dsp-filter-section + .dsp-filter-section { border-color: #303c47; }
        .dsp-filter-heading { color: #c4ced8; }
        .dsp-filter-add input { border-color: #394755; background: #252f39; color: #e4ebf2; }
        .dsp-filter-entry { border-color: #3a4855; background: #222c35; }
        .dsp-filter-entry label { color: #c2ced9; }
        .dsp-filter-remove { border-color: #3a4651; color: #8996a2; }
        .dsp-result-item { border-color: #2a3540; }
        .dsp-result-item.dsp-viewed { background: #182028; }
        .dsp-result-title { color: #dce3eb; }
        .dsp-viewed .dsp-result-title { color: #8995a0; }
        .dsp-result-excerpt { color: #9eabb8; }
        .dsp-result-details { color: #8493a1; }
        .dsp-category { color: #78add7; }
        .dsp-limit-card { border-color: #33404c; background: #1c242d; box-shadow: none; }
        .dsp-limit-icon { background: #3c2d22; color: #efa566; }
        .dsp-prompt-validation .dsp-limit-icon,
        .dsp-prompt-generic .dsp-limit-icon { background: #22384b; color: #8fc0e5; }
        .dsp-limit-card h1 { color: #dce3eb; }
        .dsp-limit-message { color: #bdc8d3; }
        .dsp-limit-note { color: #8997a4; }
        .dsp-limit-secondary { border-color: #3a4855; background: #222c35; color: #b9c5d0; }
        .dsp-page-button,
        .dsp-page-info { border-color: #394654; background: #202a34; color: #c6d1dd; }
        .dsp-disabled { color: #65717d; background: #192129; }
        .dsp-bottom-nav { border-color: #303b47; background: rgba(25, 33, 41, .97); }
      }
    `);
  }
})();
