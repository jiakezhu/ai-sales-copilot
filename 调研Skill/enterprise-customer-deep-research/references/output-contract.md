# CRM 原生三份输出契约

## 唯一事实源与强制流水线

JSON 文件名不限，默认使用 `company-deep-research.json`。文件内部必须使用 `crm-customer-list.v1`；文件名不参与校验。

必须先用 `scripts/create-research-scaffold.mjs` 生成 Schema 驱动骨架，再在原结构内填值。不得从空白 JSON 开始，不得保留任何 `__FILL_*` 占位符。最终只能用 `scripts/finalize-research.mjs` 交付；它在临时目录中通过 Schema、质量和一致性门禁后才写入 Markdown 与 HTML。两份报告嵌入源 JSON 的 SHA-256。

## CRM JSON

顶层必须包含 `schema_version`、`run_id`、`generated_at` 和 `customers`。`customers` 必须且只能包含一个客户：

- `name` 与 `deepResearch.subject.legal_name` 完全一致；
- `stage` 默认 `lead`，`grade` 根据证据评分，没有评分依据时用 `B`；
- 公开事实投影到 `fields`、`orgChain`、`marketNews`、`hiringSignals`、`bidding`、`qualifications` 和 `businessBrief`；其中公开识别的 `orgChain[]` 人物统一写 `relationStatus: "identified"`，不得输出 `reached` 或 `connected`；
- 推测只能进入明确带 `inferred: true` 的 `painChain`；
- 完整主体、主张、股权、人员、事件、风险、证据、冲突和盲区保存在 `deepResearch`；
- 销售跟进、会议、附件、已确认痛点、方案和销售资产数组保持为空。

正式 Schema 为 `crm-customer-list.v1.schema.json`。不得另建独立顶层深调 JSON 契约。

## Markdown 与 HTML

两份报告都从 `customers[0].deepResearch` 渲染，同时使用同一客户的 CRM 字段。必须包含完整证据清单、冲突和数据盲区。HTML 为独立单文件，无外部 CSS、字体或脚本依赖，响应式且可打印。

## 固定报告文件名

- `company-deep-research.md`
- `company-deep-research.html`

JSON 文件名由用户或运行环境决定，任何 `.json` 名称都可以，只要内容符合 Schema。