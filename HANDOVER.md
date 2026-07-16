# 项目交接 · 云销副驾

最后更新：2026-07-16

## 产品定位

面向个人 ToB 销售的 AI 客户推进工作台。主链路是：

`AI / 语音 / 手动采集 → 销售确认 → 客户全流程沉淀 → 一键全景报告`

AI 是信息整理助手，不替代销售判断；无法可靠提取的内容保持为空。

## 当前信息架构

全局一级导航：今日、客户、待办、分析。

客户详情：作战概览、推进记录、关键关系、情报与证据。

重点攻坚档案不再作为独立数据入口；其中已有内容会被全景报告实时汇总，避免重复维护。

## 核心文件

- `index.html`：应用外壳、导航、弹窗和报告预览容器。
- `style.css`：浅色优先的设计系统、深色主题、PC/移动响应式布局、打印报告样式。
- `app.js`：页面渲染、AI 确认流程、手动录入、客户管理、统一待办和报告导出。
- `data.js`：字段、阶段、等级、联系方式和示例客户。
- `crm.js`：本地/CloudBase 持久化、AI 提取规则和材料处理。
- `auth.js`、`cloudbase-config.js`：可选云端登录与同步。

## 关键设计约定

1. AI 只生成候选更新，必须确认后写入。
2. 所有信息始终可以手动新增或修改。
3. 待办使用 `taskDone` 标记完成，保留原始记录。
4. 阶段修改写入 `stageHistory`，全景报告会展示历史。
5. 全景报告从客户底层数据实时生成，不形成第二套档案。
6. PDF 使用浏览器打印流程；Word 导出为可编辑 `.doc` 文件。
7. 移动端在 900px 以下切换为底部导航，主内容不再被固定侧栏挤压。

## 最终界面与报告约定

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification command is `node --test tests/ui-contract.test.mjs` plus JavaScript syntax checks.

## 验证

```bash
node --check app.js
node --check data.js
node --check crm.js
python3 -m http.server 8899
```

验证重点：AI 候选确认、手动推进记录、客户四区切换、任务完成历史、报告预览与导出、390px 移动布局。
