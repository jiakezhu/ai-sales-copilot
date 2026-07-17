# 云销副驾 · AI 客户推进工作台

面向个人 ToB 销售的客户推进工作台。产品以“下一步行动”为核心，将自然语言、语音和手动录入统一沉淀到客户档案，并支持一键生成完整客户全景报告。

## 核心能力

- **账号系统**：支持邮箱密码注册、登录和退出；每个账号的客户数据独立存储。
- **今日工作台**：集中展示优先行动、逾期待办、重点客户和跟进节奏。
- **AI 信息收件箱**：支持自然语言与浏览器语音识别；可通过服务端 OpenAI 兼容 API 进行结构化提取，失败时回退本地规则。
- **批量导入客户**：支持 CSV、TSV、XLSX、XLS，提供导入预览、逐行校验和同名客户更新/跳过策略。
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
- 默认使用 Node.js 同源 API 提供账号认证、用户级客户数据存储和 AI 代理，密钥不会下发到浏览器。
- CloudBase `ENV_ID` 非空时仍优先使用原 CloudBase 登录与同步；使用普通静态服务器时自动进入本地演示模式。

## 最终界面与报告约定

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification commands are `npm test` and `npm run check`.

## 本地运行

需要 Node.js 22 或更高版本：

```bash
cp .env.example .env
# 编辑 .env，至少把 AUTH_SECRET 改成高强度随机值
npm start
```

打开 `http://127.0.0.1:3000`，先注册账号再登录。每个账号的客户数据独立保存在 `.data/`（已加入 `.gitignore`），首次进入会载入三个示例客户。

如只需查看旧版静态演示，也可继续使用 `python3 -m http.server 8899`；此模式没有账号密码、服务端同步和 AI API。

## 新增能力

- **注册与登录**：邮箱 + 密码注册登录，密码使用 scrypt 加盐哈希；接口 token 采用 HMAC 签名并自动过期。
- **客户数据隔离**：`GET /api/customers` 与 `PUT /api/customers` 按登录用户读写，前端保留用户级本地镜像；通过 revision 乐观锁检测多页面/多设备冲突并按客户合并后重试。
- **批量导入**：客户页支持 CSV、TSV、XLSX、XLS，导入前预览校验；同名客户可选择跳过或更新。提醒日期会归一化为 `YYYY-MM-DD`，无效日期作为行级错误提示。
- **AI API**：`POST /api/ai/extract` 通过服务端调用 OpenAI 兼容接口，API Key 不下发浏览器；未配置时自动保留现有本地规则兜底。接口按用户和 IP 限制每分钟及每日调用量。

## AI API 配置

在 `.env` 中填写：

```bash
AI_API_URL=https://api.openai.com/v1
AI_API_KEY=your-api-key
AI_MODEL=gpt-4.1-mini
```

`AI_API_URL` 可填写 API 根路径，也可直接填写完整的 `/chat/completions` 地址。服务端优先使用 JSON Schema；上游不支持时会自动降级为 JSON Object 模式。

## 验证

```bash
npm test
npm run check
```
