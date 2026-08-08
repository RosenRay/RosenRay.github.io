# RosenRay 油猴脚本

这个仓库用于托管个人油猴脚本，并通过 GitHub Pages 提供安装和自动更新（返回 JS MIME，兼容手机端安装）。

## 脚本列表

| 脚本 | 版本 | 安装地址 |
| --- | --- | --- |
| BTSearch 筛选修复 + 磁力直达 | 1.4.0 | https://rosenray.github.io/userscripts/btsearch-fix.user.js |
| 链接检测 + TXT预览 | 6.6 | https://rosenray.github.io/userscripts/link-detector.user.js |
| 98手机浏览助手 | 2.5.3 | https://rosenray.github.io/userscripts/98-browsing-helper.user.js |
| 98快捷导航 | 1.0.1 | https://rosenray.github.io/userscripts/98-quick-nav.user.js |
| 98搜索增强预览 | 2.4.2 | https://rosenray.github.io/userscripts/98-search-preview.user.js |
| 色聚广告过滤 | 1.0 | https://rosenray.github.io/userscripts/seju-ad-filter.user.js |

## 自动更新

脚本均已配置 `@updateURL` 和 `@downloadURL`。例如：

```javascript
// @updateURL    https://rosenray.github.io/userscripts/btsearch-fix.user.js
// @downloadURL  https://rosenray.github.io/userscripts/btsearch-fix.user.js
```

以后更新脚本时，只需要提升 `@version` 并提交同名文件，Tampermonkey 就能检查到新版本。

## 当前结构

```text
RosenRay.github.io
├── index.html
├── README.md
└── userscripts
    ├── btsearch-fix.user.js
    ├── link-detector.user.js
    ├── link-detector-bridge.user.js
    ├── 98-browsing-helper.user.js
    ├── 98-quick-nav.user.js
    ├── 98-search-preview.user.js
    ├── seju-ad-filter.user.js
    └── version.json
```

`link-detector-bridge.user.js` 是旧 Bridge 版安装地址的兼容文件，页面不再单独展示；新安装请使用 `link-detector.user.js`。


## 手机端安装

点击上面的安装地址，若浏览器未自动唤起脚本管理器，可手动复制脚本地址到管理器的「从 URL 安装」：

- **油猴（Tampermonkey）**：仪表盘 → 实用工具 → 导入 → 粘贴地址 → 安装
- **脚本猫（ScriptCat）**：首页 → 「+」→ 从 URL 安装 → 粘贴地址

> 所有脚本均返回 `application/javascript` MIME 类型，脚本管理器会自动识别并更新。
