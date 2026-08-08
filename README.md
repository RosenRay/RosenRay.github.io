# RosenRay 油猴脚本

这个仓库用于托管个人油猴脚本，并通过 GitHub Pages / GitHub Raw 提供安装和自动更新。

## 脚本列表

| 脚本 | 版本 | 安装地址 |
| --- | --- | --- |
| 115批量解压 | 8.10 | https://rosenray.github.io/userscripts/115-batch-unzip.user.js |
| BTSearch 筛选修复 + 磁力直达 | 1.4.0 | https://rosenray.github.io/userscripts/btsearch-fix.user.js |
| 链接检测 + TXT预览 | 6.7 | https://rosenray.github.io/userscripts/link-detector.user.js |
| 98手机浏览助手 | 2.5.3 | https://rosenray.github.io/userscripts/98-browsing-helper.user.js |
| 98快捷导航 | 1.0.1 | https://rosenray.github.io/userscripts/98-quick-nav.user.js |
| 98搜索增强预览 | 2.4.2 | https://rosenray.github.io/userscripts/98-search-preview.user.js |
| 色聚广告过滤 | 1.0 | https://rosenray.github.io/userscripts/seju-ad-filter.user.js |

## 自动更新

脚本均已配置 `@updateURL` 和 `@downloadURL`。例如：

```javascript
// @updateURL    https://raw.githubusercontent.com/RosenRay/RosenRay.github.io/master/userscripts/btsearch-fix.user.js
// @downloadURL  https://raw.githubusercontent.com/RosenRay/RosenRay.github.io/master/userscripts/btsearch-fix.user.js
```

以后更新脚本时，只需要提升 `@version` 并提交同名文件，Tampermonkey 就能检查到新版本。

## 当前结构

```text
RosenRay.github.io
├── index.html
├── README.md
└── userscripts
    ├── 115-batch-unzip.user.js
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
