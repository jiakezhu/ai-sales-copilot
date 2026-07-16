# 云销副驾 · AI 客户推进工作台

面向个人 ToB 销售的客户推进工作台。产品以“下一步行动”为核心，将自然语言、语音和手动录入统一沉淀到客户档案，并支持一键生成完整客户全景报告。

## 核心能力

- **今日工作台**：集中展示优先行动、逾期待办、重点客户和跟进节奏。
- **AI 信息收件箱**：支持自然语言与浏览器语音识别；AI 先整理成候选更新，由销售确认后写入。
- **手动录入**：客户、推进记录、联系人、情报、痛点和方案均可直接手动维护。
- **客户全流程**：统一时间线沉淀电话、微信、邮件、会议、拜访、任务和材料。
- **关键关系图**：记录决策层、影响层、执行层、汇报关系、联系方式及关系备注。
- **情报与证据**：区分公开信息和一线私有情报，将材料作为客户事实的证据。
- **客户全景报告**：一键汇总基础信息、私有情报、关系、全流程推进记录、阶段历史、任务、方案、攻坚计划和材料索引，支持 PDF 与 Word 导出。
- **响应式界面**：PC 使用多栏工作台，移动端使用底部导航和快捷 AI 录入入口。

## 数据与 AI 原则

- AI 只提取输入中明确出现的信息，不虚构客户情报。
- 所有 AI 更新默认经过销售确认。
- AI 写入后的信息仍可手动修改。
- 待办完成后保留历史，不清空原始下一步内容。
- 演示模式使用浏览器本地存储；配置 CloudBase 后可启用云端同步。

## 最终界面与报告约定

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification command is `node --test tests/ui-contract.test.mjs` plus JavaScript syntax checks.

## 本地运行

```bash
python3 -m http.server 8899
```

打开 `http://localhost:8899`。首次进入会载入三个示例客户。
