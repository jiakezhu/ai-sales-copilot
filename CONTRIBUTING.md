# 协作约定

本项目当前目标是比赛和演示作品。`main` 必须始终保持可运行、可演示，并通过基础验证。

## 开始任务前

先在沟通群或任务卡中写清四件事：

1. 要解决的问题；
2. 验收标准；
3. 预计修改的文件；
4. 是否修改客户数据结构或 CloudBase 配置。

数据结构、持久化、登录和报告内容属于共享契约。修改这些内容前必须先与协作者确认。

## 分支与合并

- 一项任务使用一个短期分支，例如 `feat/report-export`、`fix/ui-contract`；不要直接在 `main` 开发。
- 开工前同步主线：`git switch main`、`git pull --ff-only`，再创建任务分支。
- 提交前同步一次主线并处理冲突；合并前由另一位协作者查看差异。
- 合并完成后删除任务分支，避免长期分叉。

## 文件边界

- `app.js`：页面渲染和交互主流程，修改前应告知协作者。
- `style.css`、`index.html`：视觉和响应式布局，视觉任务应集中在同一分支。
- `data.js`、`crm.js`、`auth.js`、`cloudbase-config.js`：数据结构、存储和登录；属于高风险共享区。
- `report.js`：客户报告内容与导出边界。
- `tests/`、`docs/`：适合作为低冲突的验收和交接任务，但测试更新必须反映已确认的产品规格。

## 提交前验证

至少执行：

```bash
node --test tests/ui-contract.test.mjs
node --check app.js
node --check data.js
node --check crm.js
node --check report.js
git diff --check
```

提交信息使用 `feat:`、`fix:`、`test:`、`docs:` 等前缀，并描述用户可感知的结果。
