# CRM 原生 JSON 与三件套交付说明

## 1. 接口定位

WorkBuddy 直接输出 CRM 客户对象，不经过 `leads[]`、`proposed_crm_import` 或业务适配器。CRM 负责校验、预览、补齐技术字段、去重并保存。

主 Schema：`schemas/crm-customer-list.v1.schema.json`

JSON 文件名不限；CRM 根据文件内部 `schema_version` 校验。

## 2. 顶层结构

```json
{
  "schema_version": "crm-customer-list.v1",
  "run_id": "stable-run-id",
  "generated_at": "2026-07-23T10:00:00+08:00",
  "summary": {},
  "customers": []
}
```

## 3. CRM 与研究字段

| JSON 路径 | 用途 | 规则 |
| --- | --- | --- |
| `customers[].name` | 客户名称 | 必填，用于同名去重。 |
| `stage` | 销售阶段 | Skill 固定 `lead`。 |
| `grade` | 客户等级 | Skill 输出 A/B/C。 |
| `fields.*` | 客户情报 | 完整 `{ v, source, confidence, verifiedAt }`。 |
| `prospectResearch` | 获客评分 | 总分、五维评分、发现通道、入选理由、反向审查和证据 ID。 |
| `orgChain[]` | 公开联系人 | `relationStatus` 固定为 `identified`，不代表已触达或已建联。 |
| `marketNews[]` | 官网、新闻和事件 | A/B 评级事件保留日期和 `sourceUrl`。 |
| `hiringSignals[]` | 公开招聘 | 区分直招、外包和重复转载。 |
| `bidding[]` | 招投标 | 区分采购方、投标方、中标方和项目状态。 |
| `qualifications[]` | 资质许可 | 仅公开可验证事实。 |
| `businessBrief` | 业务和需求假设 | 假设明确未获客户确认，记录未知项。 |
| `painChain` | 信号到验证问题 | 有内容时必须 `inferred: true`。 |

## 4. 禁止自动生成

以下数组必须为空：

```text
notes, painPoints, solution, assets, stageHistory,
jointWorkPlan, meetingPreps, meetingReviews, salesAssets
```

不得生成销售跟进、真实关系、已确认痛点、预算、采购计划、账单结构或成交方案。

## 5. 校验与报告生成

```text
node scripts/validate-crm-json.mjs <任意文件名.json>
node scripts/audit-prospect-quality.mjs <任意文件名.json>
node scripts/render-prospect-report.mjs <任意文件名.json> --out .
node scripts/verify-deliverables.mjs <任意文件名.json> lead-list.md lead-list.html
```

前两步校验 Schema、评分、证据和质量门槛；第三步自动生成 Markdown 与独立 HTML；第四步核对客户、证据、运行 ID、源 SHA-256、响应式和打印样式。衍生报告不得手工修改。

## 6. CRM 导入行为

1. CRM 读取 `.json` 并校验版本和客户结构。
2. 为合法客户补齐本地 ID、创建时间、颜色、空容器和阶段历史。
3. 预览新增、更新、跳过和错误数量。
4. 同名客户可跳过或更新；更新不覆盖销售私有信息。
5. 用户确认后通过现有保存链路持久化。