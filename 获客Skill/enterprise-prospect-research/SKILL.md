---
name: enterprise-prospect-research
description: 基于公开、可追溯企业信息开展产品导向的潜客研究，使用结构化产品策略、五通道候选发现、多源主体核验、事件去重、反向审查和固定评分，直接生成 Sales Buddy CRM 可导入 JSON、销售审阅 Markdown 和独立精美 HTML 三件套。用户提出“为某产品找潜客”“筛选目标企业”“发现近期采购或扩张信号”“生成获客名单、客户画像或 CRM 一键导入清单”时使用；适合从开放市场发现企业，也适合研究用户提供的候选名单。
---

# 企业潜客研究

将企业视为待验证 `lead`，不是已确认商机。只读使用公开、合法、可复核的信息；不得写 CRM、执行外联或生成销售行为记录。

## 1. 建立产品策略

先确认产品或能力。仅当产品和研究范围都无法从上下文确定时提问；其余缺省项使用模板默认值并明确说明。

读取 `references/strategy-card-template.md`，形成结构化策略卡，至少确定：

- 产品价值、可观察使用场景和目标购买角色；
- ICP 指标、降权指标、用户明确的硬排除条件；
- 强/中/弱/负向信号词典与时间窗；
- 目标数量、地区、行业、候选来源和数据源限制。

不得把企业规模、所有制、行业或集团属性自行设为硬排除条件。未指定时输出 20 家，强信号窗口 90 天，普通信号窗口 180 天。

## 2. 规划候选池和工具

读取 `references/discovery-playbook.md`。目标候选池取 `max(目标数量 × 5, 60)`，默认上限 300；用户给定名单时先完整核验该名单，再决定是否扩展。

执行前检查可用能力并记录降级方案：

1. 企信慧眼：单体解析 `qxb_op_enterprise_resolve`；结构化圈选 `qxb_op_enterprise_filter`；专项数据依次调用 `qxb_data_catalog_get`、`qxb_op_api_spec_get`、`qxb_op_api_call`。
2. 天眼查：先 `search_companies`、`get_company_basic_profile`；专项信息先 `get_company_capabilities`，只调用其返回的真实工具名。
3. 企查查：交叉核验名称、代码、状态、行业、官网和公开联系方式；名称与代码同时具备时才调用 `verify_company_accuracy`。
4. 官网、新闻、招聘、招投标：使用宿主提供的网页检索、浏览器或对应只读 MCP。

工具不可用时继续使用剩余来源，不得伪造调用结果；在报告中披露缺失来源和覆盖影响。

## 3. 五通道并行发现

并行执行以下通道，并给候选记录发现通道：

1. **ICP 圈选**：行业、地区、产品、业务模式、规模和集团属性。
2. **事件驱动**：产品上线、融资、扩张、出海、技术迁移、安全/合规事件。
3. **招聘驱动**：岗位、技术栈、团队扩张和地域变化。
4. **采购驱动**：招投标、中标、资质、采购公告和合作伙伴招募。
5. **相似与生态扩展**：用户样板客户、竞品客户、上下游、集团子公司和同行相似企业。

不要把同一新闻的转载当成多个事件。每轮完成后检查通道覆盖、地区/行业集中度和候选数量；不足时扩展关键词、时间窗或相邻场景，最多三轮。不得为凑数降低主体核验门槛。

## 4. 核验主体并去重

先核验主体，再研究机会：

- 保留标准名称、统一社会信用代码（未脱敏时）、官网域名、总部、行业、主营、集团关系、来源和抓取时间；
- 优先按信用代码去重，其次按标准名称 + 官网域名；
- 集团母子公司可分别保留，但必须说明各自业务和信号，不能复制母公司的证据；
- 存续状态冲突、主体冲突、来源不可定位或证据不足时进入 `manual_review`，不进入 `customers[]`。

## 5. 收集证据和处理冲突

每条关键事实保留稳定证据 ID、来源、URL 或可定位引用、发布时间、抓取时间、事实陈述和简短摘录。基础字段至少保留来源代码和核验日期；影响等级的事件必须落入 `marketNews`、`hiringSignals`、`bidding` 或 `qualifications`，并带 `sourceUrl`。

来源冲突时遵循：官方登记/监管或招采原文 > 企业官网 > 企业信息库 > 主流新闻 > 聚合转载。不得静默选择；无法解决的冲突写入未知项并降低证据分。

预算、痛点、采购时点、部署方式、现用供应商和成交可能性均为推测，必须写“推测，未获客户确认”，并关联公开信号。

## 6. 评分、分层和反向审查

读取 `references/signal-scoring.md`，按产品匹配 30、场景证据 25、购买时机 25、证据质量 15、行动可验证性 5 计算 100 分；同一底层事件只计一次，负向信号按规则扣分。

- A：总分 >= 75，至少 1 条近 90 天强信号，且有可定位证据。
- B：总分 >= 55，至少 2 条独立中/强信号。
- C：主体可靠且存在产品关联，但近期时机不足。
- `manual_review`：主体、证据或冲突不足以可靠排序，不进入 JSON。

读取 `references/quality-gates.md`，对入选客户执行第二遍反向审查：主动寻找过期、重复、主体错配、集团证据借用、事件已结束和与产品无关的解释。不能通过质量门槛的客户降级或移入 `manual_review`。

CRM `stage` 固定为 `lead`，`grade` 仅写 A/B/C。把总分、五维评分、发现通道、入选理由、反向审查和证据 ID 写入每个客户的 `prospectResearch`，供 Markdown/HTML 确定性渲染；五个维度满分合计必须为 100，得分合计必须等于 `score`。

## 7. 生成 CRM 原生 JSON

读取 `references/output-contract.md` 和 `references/crm-customer-list.v1.schema.json`，生成任意文件名的 `.json`（默认 `crm-customer-list.v1.json`）。直接输出顶层 `customers[]`；不要生成 `leads[]`、`identity`、`research`、独立 `evidence[]` 或 `proposed_crm_import`。

公开事实进入 `fields`、`orgChain`、`marketNews`、`hiringSignals`、`bidding`、`qualifications`、`businessBrief` 和 `painChain`，研究评分进入 `prospectResearch`。每个 `fields.*` 必须使用 `{ v, source, confidence, verifiedAt }`。公开研究识别到的 `orgChain[]` 人物必须使用 `relationStatus: "identified"`；不得根据公开任职、备注或联系方式生成 `reached` 或 `connected`。

以下数组必须为空：`notes`、`painPoints`、`solution`、`assets`、`stageHistory`、`jointWorkPlan`、`meetingPreps`、`meetingReviews`、`salesAssets`。不得填充 `fields.cloudStatus`、`fields.billNote`、`fields.relation`。

## 8. 校验和交付

依次执行：

```text
node scripts/validate-crm-json.mjs <任意文件名.json>
node scripts/audit-prospect-quality.mjs <任意文件名.json>
node scripts/render-prospect-report.mjs <任意文件名.json> --out .
node scripts/verify-deliverables.mjs <任意文件名.json> lead-list.md lead-list.html
```

前两个脚本校验完整契约、评分、重复企业、证据覆盖、A/B 信号时效、未知项和私有数据边界；第三个脚本从同一 JSON 生成 Markdown 与独立 HTML；第四个脚本核对客户、证据、哈希和文件完整性。任何一步失败都必须修正 JSON 后重跑，不得手工修改衍生报告。

从同一 JSON 自动生成 `lead-list.md` 和 `lead-list.html`，包含管理摘要、优先级排序、五维评分、公开事实、信号时间线、需求推测、反向审查、未知项和证据索引。HTML 必须是无外部 CSS、字体或脚本依赖的独立文件，并支持响应式和打印。

推荐交付：

```text
任意文件名.json          必须，内容符合 crm-customer-list.v1 即可导入
lead-list.md               必须，销售审阅和证据追溯
lead-list.html             必须，独立精美网页报告，可浏览和打印
```

若用户提供历史结果，只使用聚合的联系率、会议率、有效商机率和淘汰原因校准策略卡；不得把历史私有销售记录复制进潜客 JSON。
