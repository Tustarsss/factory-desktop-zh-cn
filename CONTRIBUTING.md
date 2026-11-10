# 贡献说明

欢迎提交翻译修订和 Factory 版本适配。

## 反馈问题

请提供 Factory 版本、补丁版本、Windows 版本、页面位置，以及实际结果和预期结果。翻译问题可以直接附上词条键、原文、当前译文和建议译文。截图和日志请先移除 API Key、账户信息及会话内容。

## 修订译文

1. Fork 本仓库并创建分支。
2. 短语统一修改 `locales/reviewed.json`，指定词条修订修改 `locales/overrides.json`。
3. 运行 `npm ci --ignore-scripts` 和 `npm run check`。
4. 提交 Pull Request，说明修改位置、原因，以及是否在实际页面中确认。

保留产品名、模型名、命令、路径、代码、占位符和标签。保持条件、否定范围和操作后果的含义。`reviewed.json` 中的短语会应用到所有原文完全相同的词条；含义取决于页面时，使用 `overrides.json`。

## 更新版本适配

从本机原版 Factory 提取资源并维护 AST 识别规则。新增和变化的词条可以使用 DeepSeek 补译，完成后运行 `node scripts/refresh-catalog.mjs` 重新生成摘要和标记目录。不要手工修改生成的元数据。

在安装目录副本中确认构建、安装和恢复结果。Pull Request 应说明实际使用的 Factory 版本、修改范围和验证结果；没有验证的部分应明确说明。

## 提交范围

提交补丁源码、中文译文、适配元数据和必要文档。不要提交 Factory 程序、原始完整语言资源、补丁后的 ASAR 或 EXE、本地配置、API Key、会话、日志和依赖目录。

贡献按仓库的 [MIT License](LICENSE) 分发。其他项目或第三方内容应保留其原有许可和署名。
