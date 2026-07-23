# CRM 原生潜客输出契约

## 顶层

输出文件名 `crm-customer-list.v1.json`：

```json
{
  "schema_version": "crm-customer-list.v1",
  "run_id": "稳定运行标识",
  "generated_at": "ISO 8601 date-time",
  "summary": {},
  "customers": []
}
```

`summary.customer_counts` 包含 `S/A/B/C/manual_review`。Skill 默认不输出 S；`manual_review` 只统计到摘要和 Markdown，不进入 `customers[]`。

## 客户对象

- `name`：标准企业名称。
- `stage`：固定 `lead`。
- `grade`：A/B/C。
- `fields`：CRM 当前情报字段，只写公开事实。
- `orgChain`：公开联系人；姓名、角色、层级和备注必填，无可靠信息时为空。
- `marketNews`：产品、融资、扩张和其他非招聘事件。
- `hiringSignals`：公开招聘事件。
- `bidding`、`qualifications`：公开招采和资质。
- `businessBrief`：业务事实、明确标注的需求推测和未知项。
- `painChain`：公开信号到首轮确认问题；存在内容时必须 `inferred: true`。

## 情报字段

每个 `fields.*` 必须完整提供：

```json
{
  "v": "公开事实文本",
  "source": "tyc",
  "confidence": "high",
  "verifiedAt": "2026-07-23"
}
```

来源代码仅允许空字符串、`customer`、`website`、`qcc`、`tyc`、`qxb`、`web`、`panshi`。无法核验时使用 `unverified`，不得以模型知识补全。

基础字段没有 URL 容器时，精确引用保留在 `lead-list.md`；影响 A/B 等级的事件必须同时写入带 `sourceUrl` 的结构化情报数组。

## 映射

| 研究内容 | CRM 字段 |
| --- | --- |
| 行业、成立、规模、融资、官网、产品 | `fields.industry/founded/staff/funding/website/product` |
| 信用代码、注册地址、集团关系 | `fields.creditCode/regAddress/parentSubs` |
| 商业模式、技术栈、上下游 | `fields.businessModel/techStack/supplyChain` |
| 近期动态、招聘、风险、触发事件 | `fields.recentNews/hiring/riskNote/triggerEvents` |
| 产品、融资、扩张等事件 | `marketNews[]` |
| 招聘、招采和资质证据 | `hiringSignals[]`、`bidding[]`、`qualifications[]` |
| 产品和经营事实 | `businessBrief.products/operatingStatus` |
| 需求推测 | `businessBrief.painHypothesis`、`painChain.pain` |
| 首轮确认问题 | `painChain.question` |
| 未知项 | `businessBrief.unknowns[]` |

## 禁止内容

以下数组必须为空：`notes`、`painPoints`、`solution`、`assets`、`stageHistory`、`jointWorkPlan`、`meetingPreps`、`meetingReviews`、`salesAssets`。

`fields.cloudStatus`、`fields.billNote`、`fields.relation` 的 `v` 必须为空。不得把公开推测写成销售已确认信息，也不得把评分解释写成成交概率。
