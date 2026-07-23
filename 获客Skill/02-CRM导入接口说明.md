# CRM 原生 JSON 导入接口说明

## 1. 接口定位

WorkBuddy 直接输出 CRM 客户对象，不经过 `leads[]`、`proposed_crm_import` 或其他业务映射。v2 增强发现和质量控制，但保持 `crm-customer-list.v1` 兼容；CRM 仍只校验、预览、补齐技术字段、去重并保存。

主 Schema：`schemas/crm-customer-list.v1.schema.json`

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

## 3. CRM 原生字段

| JSON 路径 | 用途 | 规则 |
| --- | --- | --- |
| `customers[].name` | 客户名称 | 必填，用于同名去重。 |
| `stage` | 销售阶段 | Skill 固定 `lead`。 |
| `grade` | 客户等级 | Skill 输出 A/B/C。 |
| `fields.*` | 客户情报 | 完整 `{ v, source, confidence, verifiedAt }`。 |
| `orgChain[]` | 公开联系人 | 仅公开姓名、职务和业务联系方式。 |
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

不得生成销售跟进、真实关系、已确认痛点、预算、采购计划、账单结构或成交方案。`fields.cloudStatus`、`fields.billNote`、`fields.relation` 的 `v` 必须为空。

## 5. 交付前校验

Skill 包内依次运行：

```text
node scripts/validate-crm-json.mjs <json>
node scripts/audit-prospect-quality.mjs <json>
```

完整 Schema 校验失败属于阻断错误；质量审计会额外阻断重复企业、A/B 证据不足、未知项缺失和推测未标注等问题。

## 6. CRM 导入行为

1. CRM 读取 `.json` 并再次校验版本和核心客户结构。
2. 为合法客户补齐本地 `id`、创建时间、颜色、空容器和初始阶段历史。
3. 预览新增、更新、跳过和错误数量。
4. 同名客户可跳过或更新；更新只合并非空公开情报，不覆盖销售私有信息。
5. 用户确认后通过现有 `CRM.save(customers)` 保存到 localStorage、API 或 CloudBase。
