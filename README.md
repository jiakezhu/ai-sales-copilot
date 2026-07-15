# AI 销售副驾 · 人机协作式轻量 CRM

> 一个**销售自己做主、AI 只做辅助**的客户获客工作台。纯前端、开箱即用、数据存本地。

核心理念：**AI 是副驾，不是替身**。抽取信息、给参考分、建议痛点——全部可被销售采纳 / 修改 / 拒绝，主动权始终在销售手里。AI 查不到的情报会**诚实说"查不到"，绝不编造**。

## 最终界面与报告约定

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification command is `node --test tests/ui-contract.test.mjs` plus JavaScript syntax checks.

## 在线演示

> 部署后自动填入 GitHub Pages 链接

## 功能模块

| 模块 | 说明 |
|---|---|
| 📞 跟进记录 | 结构化跟进表单（沟通方式 / 时间 / 对接人 / 内容 / 下一步 / 提醒）+ 待办汇总 + 时间轴，产品心脏 |
| 🌳 组织架构 | 销售自建树状决策链，节点含联系方式与真人照片，体现"多点建联、不押注单点" |
| 🗂 资料库 | 会议纪要 / 名片 / 聊天截图 / 人员照片 / 附件；图片自动压缩存本地 |
| 📝 会议纪要 | 录入会后纪要，AI 一键提取要点填入客户情报（严守"诚实内核"，抽不到如实提示） |
| 📊 客户情报 | 字段可点选编辑，私有情报（上云 / 账单 / 关系）标"私" |
| 🔁 复盘 | 转化漏斗 + 最大流失环节定位 + winback 建议 |

## 技术栈

- 纯前端静态站点：`index.html` + `style.css` + `app.js` + `data.js` + `crm.js`
- 无构建、无依赖，`localStorage` 持久化
- CSS 变量驱动的设计 token 体系，明暗双主题一键切换
- 可平滑升级到腾讯云 CloudBase（数据上云 / 图片上云 / 手机号·微信登录，见 `CloudBase接入任务文档.md`）

## 本地运行

```bash
# 方式一：直接双击 index.html
# 方式二：起个静态服务
python3 -m http.server 8899
# 打开 http://localhost:8899
```

首次打开自动载入 3 个样例客户。数据存浏览器 localStorage，各自独立、刷新不丢。

---

腾讯云 ToB 销售 hackathon 作品 · 数据提炼自真实一线销售笔记。
