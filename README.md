# Factory Desktop 简体中文补丁

为 Windows 版 Factory Desktop 添加「简体中文」选项。通过应用原有的 i18next 语言框架加载译文，支持恢复原版。

**当前为 v0.2.2 预发布版。** 译文已更新到 Factory Desktop 1.9.0，已确认现有脚本能提取该版本语言资源；界面和安装效果仍待验收。

[下载源码包](https://github.com/Tustarsss/factory-desktop-zh-cn/releases) · [反馈问题](https://github.com/Tustarsss/factory-desktop-zh-cn/issues) · [参与贡献](CONTRIBUTING.md)

这是社区补丁项目，与 Factory 官方无关联。仓库只包含补丁工具、中文译文和适配元数据；Factory 的程序、商标及原始资源归其权利人所有。MIT 许可适用于本项目编写的代码和译文，不授予分发 Factory 安装包的权利。

## 支持范围

| 项目 | 当前支持 |
| --- | --- |
| 系统 | Windows 10 / 11 |
| Factory Desktop | 译文基于 **1.9.0**；其他版本按语言结构和原文匹配，兼容范围待实际验收 |
| Node.js | 22.12 或更高版本 |
| 语言 | 简体中文 |
| 词条 | 17,793 个，覆盖 19 个命名空间 |
| 翻译方式 | DeepSeek Flash 初译，常用术语人工校对 |

包含首页、会话、设置、任务、自动化、连接器、技能、用量等本地语言资源，以及 Windows 原生菜单和部分系统对话框。品牌名、模型名、命令、代码和技术标识保留原文。服务器返回的动态内容、用户内容及未接入语言框架的硬编码文本不计入词条覆盖范围；词条完整不表示所有页面已逐一人工验收。

## 安装

1. 下载本项目源码并解压。
2. 完全退出 Factory。
3. 在项目目录打开 PowerShell，执行：

```powershell
npm ci --ignore-scripts
npm run check
npm run install:patch
```

4. 启动 Factory，在 **Settings → Preferences → Language** 中选择 **简体中文**。语言设置可能位于 General 页面中的 Preferences 区域。

也可以双击 `install.cmd`。它会检查 Node.js、安装依赖并运行补丁。普通用户安装的 Factory 通常不需要管理员权限。

默认查找 `%LOCALAPPDATA%\Factory` 中版本最高的 `app-版本` 目录。自定义安装路径时，直接指定包含 `factory-desktop.exe` 的目录：

```powershell
node scripts/patch.mjs install --app-dir 'D:\Apps\Factory\app-1.6.1'
```

安装阶段在本机生成中文模块并重新打包，不需要 DeepSeek API 或 API Key。首次安装依赖需要访问 npm。

## 备份与恢复

补丁先将原始 `resources\app.asar` 和 `factory-desktop.exe` 备份到安装目录下的 `.factory-zh-cn-backup`，再替换这两个文件。Factory 启用了 ASAR 完整性校验，因此补丁也会更新启动程序中对应的校验值。原有 Electron fuse 设置保持不变。修改后的启动程序不再具有原厂 Authenticode 签名；恢复操作会还原带原始签名的程序。

恢复前完全退出 Factory，然后执行：

```powershell
npm run restore
```

也可以双击 `restore.cmd`。恢复后，备份保留为 `.factory-zh-cn-backup-restored-时间戳`。安装和恢复不删除会话、配置或原始备份。恢复原版后，原版会按其支持的语言处理现有语言偏好。

## Factory 更新后

新版本通常会覆盖补丁。更新后，退出 Factory，重新运行 `install.cmd` 即可尝试应用现有译文。补丁不再锁定版本号、打包文件名或压缩后的变量名，而是用 AST 查找语言列表、英文资源和语言加载器。程序会显示本次匹配数量，并在构建目录保存 `matching-report.json`。

匹配规则如下：

- 词条键和英文原文都相同：复用对应中文译文。
- 词条键改名或移动，但英文原文完全相同：复用该原文的已有译文。
- 新增词条，或改过英文且没有可复用译文：保留英文。
- 已移除的词条：不写入新版资源。

因此新版可以部分汉化，不要求每个词条都匹配成功。原文摘要用于匹配，不包含完整英文资源。匹配、解析和打包只在安装阶段执行；运行时沿用 Factory 自带的语言框架，不扫描界面，也不请求翻译 API。

如果 Factory 改变了语言资源的组织方式，脚本可能无法识别接入位置，此时仍需要适配。只有文件名、变量名或部分词条变化时，通常可以继续匹配。其他版本尚未实测，不保证每个未来版本都能直接安装。不要把旧版本备份复制到新版目录。

同一版本已装有旧补丁时，先运行 `restore.cmd`，再安装新补丁；恢复操作只作用于其备份所在的安装目录。

查看当前安装状态：

```powershell
npm run inspect
```

## 维护译文

| 文件 | 用途 |
| --- | --- |
| `locales/zh-CN.json` | 按词条键保存的批量译文 |
| `locales/reviewed.json` | 按短语统一的人工校对译文 |
| `locales/overrides.json` | 指定词条的人工修订，优先级最高 |
| `profiles/source-hashes.json` | 已翻译词条对应的英文原文摘要，用于跨版本匹配 |
| `profiles/catalog.tokens.json` | 翻译目录的词条键与受保护标记，用于离线校验 |
| `profiles/1.6.1.*` | 初版适配时保留的历史元数据，不再作为安装限制 |

人工校对优先修改 `reviewed.json` 或 `overrides.json`，避免重新批量翻译时覆盖修订。修改后运行 `npm run check`。检查包括词条完整性、占位符、HTML/React 标签、Markdown 代码片段和链接，不替代语义校对。

## 使用 DeepSeek 补译

普通用户安装补丁无需执行本节。维护者需要先安装受支持的 Factory，然后提取英文词条：

```powershell
npm run extract
```

英文词条保存在被 Git 忽略的 `work/` 目录。提取器用 AST 读取数据表达式，不运行 Factory 的打包脚本。提取操作不会自动更新翻译目录的基准摘要；只有完成新词条翻译后，才应刷新基准。

在当前终端的环境变量中提供 `DEEPSEEK_API_KEY`，再执行：

```powershell
npm run translate
node scripts/refresh-catalog.mjs
npm run check
```

默认请求官方 `https://api.deepseek.com/chat/completions`，使用 `deepseek-flash`，关闭思考模式。只发送安装包中的英文界面词条及词条键，不发送会话、用户文件或本机配置。API 请求按账号实际用量计费。密钥只从环境读取，不写入项目文件。

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容 API 的基础 URL |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 翻译模型 |
| `TRANSLATION_CONCURRENCY` | `5` | 并发请求数 |
| `TRANSLATION_BATCH_SIZE` | `110` | 每批最多词条数 |

相同英文词条会去重。工具先按原文摘要复用仓库中的已有译文，再读取 `work/translation-cache.json`，只请求剩余词条；因此新克隆的仓库也能复用已有翻译。成功结果会继续写入本地缓存。模型返回无效 JSON 或破坏受保护标记时，相应词条不会计入成功结果；可以降低批量大小后重新运行。人工修订仍通过独立文件覆盖。

## 适配其他版本

1. 先尝试直接运行补丁，查看匹配结果；词条变化不需要手工修改适配规则。
2. 要补全译文时，从新版提取英文资源，复用翻译缓存并补译新增或变化的词条。
3. 翻译完成后运行 `node scripts/refresh-catalog.mjs`，再运行 `npm run check`。摘要和标记目录是生成文件，不要手工修改。
4. 如果语言结构无法识别，更新 `scripts/extract.mjs` 中对应的 AST 识别规则。
5. 由维护者在安装目录副本中验收构建、安装、恢复和实际界面，再记录兼容版本。

只构建补丁文件，不替换安装目录：

```powershell
node scripts/patch.mjs build --build-dir '.\work\preview-build'
```

生成目录包含 Factory 本地程序派生文件，只用于本机验证，不应提交到 GitHub。

## 许可证与贡献

项目代码和译文采用 [MIT License](LICENSE)。欢迎通过 [Issues](https://github.com/Tustarsss/factory-desktop-zh-cn/issues) 反馈翻译或兼容性问题，通过 Pull Request 提交修订。具体流程见 [贡献说明](CONTRIBUTING.md)。

仓库和发布附件仅包含源码、译文、适配元数据和文档，不分发 Factory 程序。`work/`、`node_modules/`、原版或补丁后的可执行文件、ASAR、API Key、会话和日志不应提交。

## 参考

- [Factory Desktop](https://factory.com/product/desktop)
- [Electron ASAR 完整性校验](https://www.electronjs.org/docs/latest/tutorial/asar-integrity)
- [DeepSeek API](https://api-docs.deepseek.com/api/create-chat-completion/)
