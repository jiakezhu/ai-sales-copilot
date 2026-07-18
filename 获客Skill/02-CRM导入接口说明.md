# CRM 导入接口说明（云计算获客 V1）

## 1. 接口定位

本接口约定 WorkBuddy 输出怎样的 JSON，供当前 CRM 在“导入预览 → 人工确认 → 创建客户线索”后使用。

当前 CRM 的客户数据模型同时包含公开情报与销售私有信息。获客 Skill 在 V1 **只能填充公开且有证据的信息**，不能自动写入销售行为数据。

主 Schema：`schemas/cloud-lead-list.v1.schema.json`

## 2. CRM 字段映射

| WorkBuddy JSON 路径 | CRM 实际路径 | V1 是否允许自动导入 | 规则 |
| --- | --- | --- | --- |
| `proposed_crm_import.customer.name` | `customer.name` | 是 | 必填。 |
| `proposed_crm_import.customer.stage` | `customer.stage` | 是 | V1 必须为 `lead`。 |
| `proposed_crm_import.customer.grade` | `customer.grade` | 是 | 只能为 `A`、`B` 或 `C`；由评分映射，销售可改。 |
| `fields.industry` | `customer.fields.industry.v` | 是 | 公开事实。 |
| `fields.founded` | `customer.fields.founded.v` | 是 | 公开事实。 |
| `fields.staff` | `customer.fields.staff.v` | 是 | 公开事实或来源明确的估计。 |
| `fields.funding` | `customer.fields.funding.v` | 是 | 公开融资；未知则留空。 |
| `fields.product` | `customer.fields.product.v` | 是 | 公开产品或服务。 |
| `fields.dau` | `customer.fields.dau.v` | 是 | 公开活跃数据；未知则留空。 |
| `fields.revenue` | `customer.fields.revenue.v` | 是 | 公开营收、流水或 ARR；未知则留空。 |
| `contacts[]` | `customer.orgChain[]` | 可选 | 仅公开姓名、职务和公开业务联系方式；CRM 生成本地 `id`。 |
| `research`、`evidence`、`unknowns` | CRM 情报/材料区 | 仅作候选预览 | 应作为调研附件或待确认内容保存；不能当作销售记录。 |
| `fields.cloudStatus` | `customer.fields.cloudStatus.v` | 否 | 当前 CRM 标记为销售私有信息。 |
| `fields.billNote` | `customer.fields.billNote.v` | 否 | 当前 CRM 标记为销售私有信息。 |
| `fields.relation` | `customer.fields.relation.v` | 否 | 当前 CRM 标记为销售私有信息。 |
| 销售推进记录 | `customer.notes[]` | 否 | 只能由销售在 CRM 中实际创建。 |
| 需求假设 | `customer.painPoints[]` | 否 | 未经销售确认前不能写成真实痛点。 |
| 推荐云方案 | `customer.solution[]` | 否 | 可在报告中展示，不能自动写入已确认方案。 |

## 3. 导入行为

1. CRM 读取 `cloud-lead-list.v1.json` 并校验 Schema。
2. 仅处理 `research_readiness.status = "ready_for_review"` 且 `proposed_crm_import.operation = "create_lead"` 的记录。
3. 导入页展示字段差异、证据、需求假设和未知信息；销售勾选确认后才创建客户。
4. V1 不做团队全局去重、客户占用排除或目标客户范围筛选。CRM 可以按统一社会信用代码、标准企业名和官网域名提示当前账号下的疑似重复，但不得把“未命中”解释为团队无人跟进。
5. 创建客户时，CRM 将扁平文本字段转换为当前数据模型的 `{ v: "..." }` 结构，并为联系人生成本地 ID。
6. 导入完成后，销售自行决定客户等级、阶段、联系人关系、跟进记录、痛点和方案是否需要进一步补充。

## 4. 证据与推测规范

- `evidence[]` 只能记录外部可核验事实及其来源。
- `research.public_facts[]` 和 `signals[]` 必须引用至少一个 `evidence_id`。
- `research.demand_hypotheses[]` 是推测，必须带 `confidence` 和支撑它的 `evidence_ids`。
- 所有未知项写入 `unknowns[]`，不得使用语言模型补全。

## 5. 文件包接口

```text
cloud-lead-list.v1.json  必须，通过 Schema 校验
lead-list.md             必须，面向销售阅读
lead-list.html           可选，面向筛选和汇报
evidence.json            可选，证据量较大时拆分
```

`lead-list.md` 和 `lead-list.html` 必须从同一份 JSON 渲染或忠实摘要而来；不要让模型分别独立撰写，避免内容与 CRM 导入数据不一致。
