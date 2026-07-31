# RosenRay 油猴脚本

这个仓库用于托管个人油猴脚本，并通过 GitHub Pages / GitHub Raw 提供安装和自动更新。

## 脚本列表

| 脚本 | 版本 | 安装地址 |
| --- | --- | --- |
| BTSearch 移动端筛选修复 + 磁力直达 | 1.4.0 | https://rosenray.github.io/userscripts/btsearch-mobile-fix.user.js |
| 链接检测 + TXT预览 | 5.6 | https://rosenray.github.io/userscripts/link-detector-txt-preview.user.js |

## 自动更新

脚本均已配置 `@updateURL` 和 `@downloadURL`。例如：

```javascript
// @updateURL    https://raw.githubusercontent.com/RosenRay/RosenRay.github.io/master/userscripts/btsearch-mobile-fix.user.js
// @downloadURL  https://raw.githubusercontent.com/RosenRay/RosenRay.github.io/master/userscripts/btsearch-mobile-fix.user.js
```

以后更新脚本时，只需要提升 `@version` 并提交同名文件，Tampermonkey 就能检查到新版本。

## 当前结构

```text
RosenRay.github.io
├── index.html
├── README.md
└── userscripts
    ├── btsearch-mobile-fix.user.js
    ├── link-detector-txt-preview.user.js
    └── version.json
```
