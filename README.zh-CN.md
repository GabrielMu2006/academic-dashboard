# Academic Dashboard

[English](README.md) | **简体中文**

Academic Dashboard 是一款 Obsidian 桌面端插件，可将现有 Vault 转化为平静、有序的组件式工作空间，用于学习、研究、每日规划以及范围明确的 Agent 任务交接。

它坚持本地优先并理解元数据。Dashboard 读取你已有的笔记，适配现有 frontmatter 约定，并让所有可选集成保持可选。它不会抓取论文、创建第二套 Agent 运行时，也不会在未告知的情况下重新整理 Vault。

> 当前源码版本：**0.3.0**<br>
> 最低 Obsidian 版本：**1.11.4**<br>
> 平台：**Obsidian 桌面版**；macOS 是主要验收平台<br>
> 最新已发布版本：**[0.3.0](https://github.com/GabrielMu2006/academic-dashboard/releases/tag/0.3.0)**

## 功能概览

### 首页

- 日期和时间、日历、最近笔记以及本地每日引言。
- 将原生 Markdown 任务分为逾期、今天和未来 7 天，并支持最多 3 条用户选择的今日聚焦引用。
- 根据可配置元数据生成的最近论文与到期复习摘要。
- 快捷链接、常用 Obsidian 命令以及 Agent 入口。
- 在确认后创建一篇 Daily Note、课程笔记、论文阅读笔记或读书笔记。
- 精确完成一条原生 Markdown 任务，并在当前会话内提供带条件检查的撤销。
- 提供按本地周一至周日生成的可编辑周回顾草稿，分别列出 Dashboard 保留的写入事件、Agent 交接以及修改时间落在本周的笔记；再次审阅后，在 `Weekly Reviews` 中独占新建一篇笔记。

### 学习

- 按课程与学期精确分组的课程总览，在同一只读详情中集中展示课程笔记、相关资源、到期任务和待复习内容，并说明结果依据元数据还是课程根目录。
- 根据课程笔记目标目录自动生成课程文件夹按钮；点击后在文件浏览器中定位并展开对应文件夹，文件夹变化时自动刷新。
- 原生 Markdown 复习队列，并可选接入 Spaced Repetition 的只读适配器。
- 可按课程与类型筛选的 10/20 条有限复习会话，明确区分本次已查看、跳过、打开原文和安全的原生下次复习日期操作。
- 根据 Markdown 文件修改时间推导的本地 Obsidian 活动记录。
- 可选的 GitHub 贡献日历，提供显式刷新和数据过期状态。
- 仅对一个含义明确的原生 Markdown 标记执行有限范围的复习日期更新，并提供确认与当前会话内的带条件撤销。

### 研究

- 统一的论文/书籍阅读队列，在插件设置中保存状态、手动顺序、下一步以及页码/章节/阶段位置；使用稳定 ID 和包含版本的签名重关联改名笔记，不会只按标题合并书籍。
- 按映射后的标题、作者、期刊或会议、DOI、年份、阅读状态和标签搜索及筛选已有论文笔记；最多保存并固定 12 个可复现视图，并分页显示有明确边界的可见结果数量。
- 仅依据已映射的显式关联字段或完全相同的共享标签展示可解释的相关资料。
- 在受支持的公开 API 可用时，提供可选的 Bases 自定义视图。
- 针对单篇论文的状态与收藏控制，包含冲突检测和当前会话内的带条件撤销。
- 不进行外部论文发现、网络抓取或隐式元数据迁移。

### Agent

- 选择 Codex 或 OpenCode 作为目标。
- 从八种有限范围的工作流中选择：整理或总结笔记、修复 Markdown、搜索 Vault、将今天的 Daily Note 路由到已有学术笔记、创建课程笔记、创建论文阅读笔记，或创建读书笔记。
- 打开 Claudian 前，先在本地预览工作流、请求目标、相关路径、已解析创建位置和有界上下文规模；编辑请求会使旧预览失效，必须重新审阅。
- 将审阅后的请求打开并预填到 Claudian。修改已有笔记的工作流仍需先审阅；三种单篇新笔记工作流会先检查路径，然后直接创建，不再要求第二次确认。
- 查看最近 5 条保留的请求记录，并再次选择同一工作流与目标；请求文本不会被恢复，也不会自动发送。已预填并等待发送、仅打开、失败和用户标记完成保持为不同状态；当前 Claudian 兼容接口不能提供可验证的执行结果。
- 供应商、模型、身份验证、权限、发送和执行仍由 Claudian 与所选 Agent 管理，Dashboard 不重复提供这些控制。

## 必需项与可选集成

| 组件 | 是否必需 | 用途 |
| --- | --- | --- |
| Obsidian 桌面版 1.11.4+ | 是 | 插件宿主与 SecretStorage API |
| Claudian | 仅 Agent 页面需要 | 检查并交接 Agent 工作流 |
| Codex 或 OpenCode | 仅执行 Agent 任务时需要 | Claudian 后方选定的目标 Agent |
| Tasks | 否 | 可选的任务只读适配器；原生 Markdown 始终可用 |
| Spaced Repetition | 否 | 可选的复习只读适配器；原生 Markdown 始终可用 |
| Bases | 否 | 可选的 Academic Papers 自定义视图 |
| PaperPulse Academic | 否 | 通过公开主题变量提供可选视觉集成 |
| Node.js 22+ 和 npm | 仅从源码构建时需要 | 开发、测试与生产构建 |

本地 Dashboard 页面可以在普通 Vault 中运行。缺失或不兼容的可选集成会显示明确的回退或不可用状态，不会阻止插件加载。

## 安装

### 从 GitHub Release 安装

从同一个已发布 Release 下载以下三个文件：

```text
main.js
manifest.json
styles.css
```

创建插件文件夹并将文件复制到其中：

```text
<Vault>/.obsidian/plugins/academic-dashboard/
├── main.js
├── manifest.json
└── styles.css
```

在 Obsidian 桌面版中打开 **设置 → 第三方插件**，启用 **Academic Dashboard**，然后从命令面板运行 **Academic Dashboard: Open dashboard**。

0.3.0 已在 macOS 的 Obsidian 桌面版 1.13.7 中完成实际安装测试，包括将现有设置从 schema 6 原位迁移到 schema 7，并检查首页、学习、研究和智能体四个页面的渲染。

不要下载、发布或复制 `data.json`。Obsidian 会为每个 Vault 创建该文件，用于保存其专属设置和布局。

### 从源码构建

```sh
git clone https://github.com/GabrielMu2006/academic-dashboard.git
cd academic-dashboard/plugin
npm ci
npm run build
```

仅将 `plugin/main.js`、`plugin/manifest.json` 和 `plugin/styles.css` 复制到上面所示的 Vault 插件文件夹。从源码构建不会自动安装或启用插件。

### 更新

使用同一个新 Release 中的三个运行时文件替换已安装文件，然后重新加载 Obsidian。保留已安装的 `data.json`；其中包含该 Vault 的设置和布局，插件会以保守方式迁移这些数据。

## 首次配置

1. 打开 **设置 → Academic Dashboard**，选择默认页面和要显示的组件。
2. 检查 **Academic metadata** 映射，让课程、论文和读书笔记匹配现有 frontmatter，而不是迁移原有数据。
3. 可选：填写课程元数据中使用的精确 **当前学期**，让课程总览分开显示不同学期的同名课程。
4. 如果需要本地的先确认再创建，请配置 Daily Note 目标位置以及课程/论文/读书模板。三类学术笔记的默认根目录分别是 `Course`、`Paper` 和 `Reading`。
5. 可选：将 Vault 根目录下的 `每日引言.md` 设置为本地引言文件。每个非空、非标题行视为一条引言，最多支持 366 条。
6. 可选：添加最多 3 条今日聚焦笔记引用，或在首页直接固定任务。
7. 可选：按照下文配置 GitHub 贡献记录和 Claudian。

修改元数据映射只会影响后续读取与操作。Academic Dashboard 不会为了强制采用推荐结构而重写整个 Vault。

## 推荐元数据

以下默认值仅作示例；所有重要字段均可配置。

```yaml
# 课程笔记
type: course-note
course: ""
term: ""
date: 2026-08-11
tags: []
```

```yaml
# 论文笔记
type: paper
title: ""
authors: []
year: null
status: unread # unread | reading | reviewed
venue: ""
doi: ""
favorite: false
tags: []
```

```yaml
# 读书笔记
type: book-note
title: ""
authors: []
status: reading
date: 2026-08-11
tags: []
```

研究操作仅支持简单、含义明确的顶层标量。重复、格式错误、嵌套、多行、带标签、使用别名、已过期或存在冲突的 YAML 都不会被更改，而是留给用户手动检查。

## GitHub 贡献记录

可选的学习组件仅会向 `https://api.github.com/graphql` 发起请求，以获取已认证用户自己的贡献日历。

1. 为自己的 GitHub 账户创建个人访问令牌。
2. 在 **设置 → Academic Dashboard → GitHub contributions** 中粘贴令牌，并选择 **Save securely**。
3. 查看公开贡献不需要任何仓库权限。只有在确实需要匿名化的私有贡献总数时才启用该选项并授予 `read:user`；切勿为 Academic Dashboard 授予 `repo` 权限。

令牌只通过 Obsidian SecretStorage 保存，不会写入插件 `data.json`、日志、诊断信息或贡献记录缓存。插件最多保留 366 组日期/数量数据，六小时后将数据标为过期，并显示最后更新时间、过期、刷新和有限范围的错误状态。它不会请求仓库名称或仓库内容。

## Claudian 与 Agent 交接

Academic Dashboard 只使用一条 Agent 路径：

```text
Academic Dashboard → Claudian → Codex | OpenCode
```

仅当需要使用 Agent 页面时才安装并启用 Claudian。CLI 路径、供应商、模型、身份验证和权限应在 Claudian 以及所选 Agent 的可信界面中配置。Dashboard 只保存目标选择偏好，并准备范围受限的工作流上下文。

在已验证的 Claudian 2.1.3 兼容边界内，Dashboard 可以打开并预填编辑器，但无法可靠地切换目标、点击发送或观察任务是否完成。请检查目标后自行发送。对课程、论文和读书笔记而言，Dashboard 会先通过 Obsidian Vault API 递归检索并解析出唯一目标路径；这次发送就是唯一确认，Claudian 无需 Shell 扫描即可创建这一篇笔记，也不会再要求查看计划或差异并二次批准。`Ready for review` 与 `Ready to send` 都只表示请求已预填，并不代表 Agent 已运行或更改了文件。

## 写入安全模型

Academic Dashboard 只允许范围经过刻意限制的本地操作：

- 切换一条可验证的原生 Markdown 任务；
- 更新一个受支持的原生 Markdown 复习标记；
- 修改一篇论文的映射状态或收藏标量；
- 在尚不存在的安全路径创建一篇 Daily Note、课程笔记、论文笔记或读书笔记。

创建学术笔记前会递归搜索配置的根目录：优先复用完全同名的文件夹；若相关文件只位于一个文件夹，则把新笔记放在旁边；没有匹配项时创建 `<根目录>/<标题>/<标题>.md`。若多个同等合适的文件夹产生歧义，则安全停止；现有文件绝不会被移动或覆盖。

写入前，插件会立即重新读取并比较完整笔记。后续用户编辑、笔记移动、字段变化、结构歧义或目标路径已存在都会让操作以关闭方式安全失败。编辑撤销只保存在当前插件会话的内存中，并拒绝覆盖此后发生的修改。

插件不具备删除、移动、重命名、批量编辑、Git、子进程、自定义 API 端点或自动重组 Vault 的能力。Dashboard 到 Claudian 的交接与本地操作彼此独立。修改已有笔记仍需在 Claudian 中审阅；三种范围明确的新笔记工作流在用户发送后直接执行，不再要求第二次批准。

## 隐私与数据处理

| 数据或能力 | 行为 |
| --- | --- |
| Vault 元数据 | 在本地读取，用于生成有限范围的笔记、论文、日历和活动摘要 |
| 笔记内容 | 仅在解析原生任务/复习标记以及执行精确安全写入时读取 |
| 本地写入 | 每次只处理一个由用户触发的 Markdown 目标；没有删除或批量操作 |
| 网络 | 仅有可选且固定的 GitHub GraphQL 贡献记录请求 |
| GitHub PAT | 只存储在 Obsidian SecretStorage 中；永不写入插件数据或日志 |
| Agent 凭据 | 由 Codex/OpenCode 和 Claudian 管理；Dashboard 从不收集 |
| 日志 | 不含内容的操作元数据，保留期可配置 |
| 遥测 | 无 |

社区插件继承 Obsidian 桌面应用的权限。在敏感 Vault 中使用前，请检查源码以及[隐私与安全模型](docs/privacy-security.md)。切勿在 Issue 中附加未经检查的 `data.json`、令牌、Agent 对话记录、私人笔记或包含个人数据的截图。

## 布局、主题与无障碍

首页、学习、研究和 Agent 页面各自保留独立布局。选择 **Edit layout** 后，可在组件支持的 `small`、`medium` 和 `large` 尺寸之间拖动或调整大小。方向键可移动获得焦点的组件；Shift+方向键可调整尺寸；Escape 退出编辑模式。响应式单栏和双栏布局不会覆盖已保存的标准桌面布局。

视觉系统派生自 Obsidian 语义变量，无需特定主题即可工作。主题作者只能使用 `.academic-dashboard-view` 上有文档说明的 `--academic-dashboard-*` 变量；组件选择器不属于公开主题 API。请参阅[主题作者契约](docs/theme-author-contract.md)。

已验收的界面包括英文与简体中文资源、键盘操作、焦点恢复、屏幕阅读器标签与实时区域、非颜色状态提示、减少动态效果、增强对比度以及强制颜色处理。

## 开发

使用 Node.js 22 或更高版本：

```sh
cd plugin
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

生产构建会生成 `plugin/main.js`。任何文件都不会被自动复制到 Vault 或自动启用。测试应使用伪端口和合成测试数据；切勿对个人 Vault 运行自动写入。

## 仓库结构

```text
academic-dashboard/
├── README.md
├── README.zh-CN.md             # 简体中文说明
├── manifest.json              # 对外发布的 Obsidian manifest
├── versions.json              # 版本到最低 Obsidian 版本的映射
├── PROJECT.md                 # 权威产品边界
├── ROADMAP.md                 # 实现历史与顺序
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── THIRD_PARTY_NOTICES.md
├── docs/                      # 设置、架构、安全、QA 和计划
├── scripts/check-setup.mjs    # 只读环境诊断
├── scripts/check-release.mjs  # Release 元数据一致性检查
└── plugin/
    ├── manifest.json
    ├── package.json
    ├── package-lock.json
    ├── src/
    ├── tests/
    ├── styles.css
    └── main.js                # 生成的生产构建文件；不提交
```

本仓库与任何用户 Vault 相互独立。已安装插件的 `data.json`、私人笔记、本地 Agent 配置以及生成的开发依赖都绝不会成为 Release 附件。

## Release 内容

Obsidian 会安装 GitHub Release 中单独提供的 `main.js`、`manifest.json` 和 `styles.css` 附件，Release 标签必须与 manifest 版本完全一致。项目也可以额外提供 ZIP 和 SHA-256 校验值用于手动安装，但它们不能取代这三个单独文件。

仓库根目录 manifest、版本映射、Release 工作流修正、历史清理以及可选的社区插件目录提交要求，请参阅 [GitHub 发布计划](docs/github-publication-plan.md)。

## 文档与支持

- [设置与安装](docs/setup.md)
- [架构](docs/architecture.md)
- [隐私与安全](docs/privacy-security.md)
- [Claudian 设置](docs/claudian-setup.md)
- [故障排除](docs/troubleshooting.md)
- [演示与截图指南](docs/demo.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [更新日志](CHANGELOG.md)

报告可复现问题时，请使用合成数据，并提供 Academic Dashboard、Obsidian、操作系统以及相关可选插件的版本。安全漏洞请通过私密安全报告流程提交。

## 许可证

Academic Dashboard 采用 [MIT 许可证](LICENSE)发布。GridStack 采用其自身的 MIT 条款；详见[第三方声明](THIRD_PARTY_NOTICES.md)。
