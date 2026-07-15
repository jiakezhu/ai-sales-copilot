// ===================================================================
// 腾讯云 · 销售获客工作台 · 数据层
// 设计原则：
//   1. 销售是主角，AI 是辅助。重点等级由销售手动定，AI 只给参考建议。
//   2. 组织架构图由销售自己搭建（树状层级 + 联系方式）。
//   3. 跟进记录是产品核心：结构化（方式/时间/地点/对接人/内容/下一步/提醒）。
//   4. 数据持久化在 localStorage，可增删改查。
//   5. 材料库：名片/聊天记录/人员照片/附件，图片转 base64 存本地。
//   6. 明暗双主题，偏好持久化。
// ===================================================================

const STORAGE_KEY = "tc_sales_crm_v4";
const THEME_KEY = "tc_sales_theme";   // 'dark' | 'light'

// 材料库资料类型（会议纪要 / 名片 / 聊天记录 / 照片 / 附件）
// meeting 为文本类资料：额外带 text（纪要正文）、meetingDate、attendees，可 AI 提取要点填入情报
const ASSET_TYPES = [
  { key: "meeting", label: "会议纪要", icon: "📝", desc: "录入会后纪要，AI 可提取要点一键填入客户情报" },
  { key: "card",   label: "名片",     icon: "📇", desc: "上传后可尝试识别姓名/电话/职位" },
  { key: "chat",   label: "聊天记录", icon: "💬", desc: "微信/沟通截图，作为关系与需求凭证" },
  { key: "photo",  label: "人员照片", icon: "👤", desc: "关联到组织架构里的具体联系人" },
  { key: "file",   label: "其他附件", icon: "📎", desc: "合同/方案/报价等文件截图" },
];

// 客户情报字段（可编辑；标注哪些理论上公开可查）
const FIELD_DEFS = [
  { key: "industry",    label: "所属行业",   public: true,  ph: "如：手游研发 / 生鲜电商" },
  { key: "founded",     label: "成立时间",   public: true,  ph: "如：2019 年" },
  { key: "staff",       label: "团队规模",   public: true,  ph: "如：约 480 人" },
  { key: "funding",     label: "融资情况",   public: true,  ph: "如：B 轮 3.2 亿（红杉领投）" },
  { key: "product",     label: "主力产品",   public: true,  ph: "如：MMORPG《九州幻想》" },
  { key: "dau",         label: "活跃数据",   public: true,  ph: "如：DAU 210 万 / MAU 860 万" },
  { key: "revenue",     label: "营收/流水",  public: true,  ph: "如：年流水约 9 亿，海外占 35%" },
  { key: "cloudStatus", label: "上云现状",   public: false, ph: "客户现在用什么云？年支出？" },
  { key: "billNote",    label: "账单结构",   public: false, ph: "CVM/CDN/数据库各占多少？" },
  { key: "relation",    label: "客户关系",   public: false, ph: "上次沟通到哪一步？谁的态度如何？" },
];

// 重点等级（销售手动设定，含颜色与含义）
const GRADES = [
  { key: "S", label: "S · 战略级", color: "#e34d59", desc: "最高优先级，全力攻坚" },
  { key: "A", label: "A · 重点",   color: "#0052d9", desc: "重点跟进，稳步推进" },
  { key: "B", label: "B · 常规",   color: "#0d9488", desc: "常规维护，保持触达" },
  { key: "C", label: "C · 培育",   color: "#ed7b2f", desc: "长期培育，低频跟进" },
];

// CRM 阶段流转
const CRM_STAGES = [
  { key: "lead",     label: "线索",   color: "#8a94a6" },
  { key: "contact",  label: "建联中", color: "#366ef4" },
  { key: "meeting",  label: "已约见", color: "#0052d9" },
  { key: "proposal", label: "方案中", color: "#ed7b2f" },
  { key: "won",      label: "已成交", color: "#00a870" },
  { key: "lost",     label: "已流失", color: "#c5000f" },
];

// 组织架构层级（销售建节点时选）
const ORG_LEVELS = [
  { level: 1, label: "决策层（董事长/CEO/创始人）" },
  { level: 2, label: "管理层（CTO/VP/总监）" },
  { level: 3, label: "执行层（经办/工程师/采购）" },
];

// 跟进沟通方式（结构化跟进的核心维度）
const CONTACT_METHODS = [
  { key: "phone",   label: "电话",   icon: "☎", color: "#0052d9" },
  { key: "wechat",  label: "微信",   icon: "💬", color: "#07c160" },
  { key: "email",   label: "邮件",   icon: "✉", color: "#ed7b2f" },
  { key: "visit",   label: "线下拜访", icon: "🤝", color: "#7c3aed" },
  { key: "meeting", label: "线上会议", icon: "🎦", color: "#366ef4" },
  { key: "other",   label: "其他",   icon: "•", color: "#8a94a6" },
];

// 话术场景（辅助功能）
const SCRIPT_SCENES = [
  { key: "first",     label: "首次建联" },
  { key: "meeting",   label: "约见面" },
  { key: "rejected",  label: "被拒跟进" },
  { key: "objection", label: "异议应对" },
];

// ===================================================================
// 内置样例客户（作为已有 CRM 记录，演示可直接用）
// grade 为销售手动设定；aiSuggestScore 是 AI 给的参考建议分
// orgChain：树状，pid 指向上级 id，带联系方式
// notes：结构化跟进记录
// ===================================================================
const SEED_CUSTOMERS = [
  {
    id: "starlight", name: "星澜互娱", logo: "星", color: "#6366f1",
    stage: "meeting", grade: "S", aiSuggestScore: 92,
    fields: {
      industry:    { v: "手游研发" },
      founded:     { v: "2019 年" },
      staff:       { v: "约 480 人" },
      funding:     { v: "B 轮 · 3.2 亿元（红杉领投）" },
      product:     { v: "3 款 MMORPG，主力《九州幻想》" },
      dau:         { v: "峰值 DAU 210 万 / MAU 860 万" },
      revenue:     { v: "年流水约 9 亿元，海外占比 35%" },
      cloudStatus: { v: "自建 IDC + 某友商云混合，年云支出约 4200 万" },
      billNote:    { v: "友商 CVM 占比高，出海带宽费用高" },
      relation:    { v: "已通过运维总监王工约到线下见面" },
    },
    orgChain: [
      { id: "o1", pid: null, name: "周明远", role: "CEO / 创始人", level: 1, phone: "", wechat: "zmy_star", email: "zhoumy@starlight.com", note: "最终拍板，关注 ROI 与出海战略" },
      { id: "o2", pid: "o1", name: "李阔", role: "CTO", level: 2, phone: "138****6621", wechat: "likuo_tech", email: "likuo@starlight.com", note: "技术选型关键人，认技术硬指标" },
      { id: "o3", pid: "o2", name: "王工", role: "运维总监", level: 3, phone: "135****8890", wechat: "wang_ops", email: "", note: "经办 & 一票否决，最痛稳定性与成本" },
    ],
    painPoints: [
      { v: "出海延迟高，东南亚/中东玩家体验差" },
      { v: "开服/活动瞬时流量洪峰，自建 IDC 弹性不足" },
      { v: "海外数据本地化存储合规压力" },
    ],
    solution: [
      { product: "全球加速 GAAP + 海外节点", reason: "降低东南亚/中东延迟，解决出海痛点" },
      { product: "GAME-TECH 游戏云 + GSE", reason: "开服弹性伸缩，应对流量洪峰" },
      { product: "云数据库 TDSQL + 异地多活", reason: "数据合规 + 高可用" },
    ],
    aiScoreReason: [
      "高流水高 DAU，弹性算力与出海需求强，客单价天花板高",
      "现用友商云 + 自建 IDC 混合，存在明确迁移/降本窗口",
      "B 轮后处于扩张期，海外业务对全球加速有刚需",
    ],
    funnel: { reached: 100, connected: 62, meeting: 28, proposal: 15, won: 6 },
    notes: [
      { id: "n1", method: "wechat", date: "2026-06-20 14:30", contact: "王工", place: "", content: "脉脉联系上运维总监王工，加了微信，简单介绍了腾讯云出海加速能力，对方表示有兴趣。", next: "整理一份出海加速方案要点发给王工", nextDate: "2026-06-22" },
      { id: "n2", method: "phone", date: "2026-06-24 10:00", contact: "王工", place: "", content: "电话沟通，王工同意下周见面详聊，需要准备针对东南亚节点的延迟对比数据。", next: "预约周三上门拜访，准备方案 PPT", nextDate: "2026-07-01" },
    ],
    assets: [],
  },
  {
    id: "quickbuy", name: "闪购优选", logo: "闪", color: "#0ea5a4",
    stage: "contact", grade: "A", aiSuggestScore: 88,
    fields: {
      industry:    { v: "生鲜电商" },
      founded:     { v: "2020 年" },
      staff:       { v: "约 1200 人" },
      funding:     { v: "C 轮 · 7 亿元（高瓴、腾讯投资参投）" },
      product:     { v: "即时零售 App，30 分钟达" },
      dau:         { v: "DAU 340 万 / MAU 1500 万" },
      revenue:     { v: "GMV 年 60 亿，履约成本高企" },
      cloudStatus: { v: "全量某友商云，年支出约 8000 万" },
      billNote:    { v: "大数据 EMR + 推荐算力占大头" },
      relation:    { v: "腾讯已投资，CTO 张涛愿意聊降本" },
    },
    orgChain: [
      { id: "q1", pid: null, name: "陈曦", role: "CEO", level: 1, phone: "", wechat: "", email: "chenxi@quickbuy.com", note: "关注 GMV 与盈亏平衡，对降本敏感" },
      { id: "q2", pid: "q1", name: "张涛", role: "CTO", level: 2, phone: "137****2043", wechat: "zhangtao_qb", email: "zhangtao@quickbuy.com", note: "云成本优化项目发起人" },
      { id: "q3", pid: "q1", name: "刘敏", role: "采购/财务 VP", level: 2, phone: "", wechat: "", email: "liumin@quickbuy.com", note: "合同与价格决策，强势" },
    ],
    painPoints: [
      { v: "大促流量 5-8 倍瞬时波动，资源利用率低" },
      { v: "履约调度算法算力成本高，急需降本" },
      { v: "实时推荐依赖大数据平台，现方案成本高" },
    ],
    solution: [
      { product: "弹性 MapReduce EMR + 数据湖", reason: "替换现有大数据平台，降本 30%+" },
      { product: "轻量服务器 + 弹性伸缩", reason: "大促削峰填谷，按量转包月利旧降本" },
      { product: "Serverless 云函数 SCF", reason: "履约调度按需付费，闲时零成本" },
    ],
    aiScoreReason: [
      "超大云支出体量，降本增效诉求强烈，winback 机会明确",
      "腾讯系已投资，关系层面有天然切入点",
      "大促流量波动剧烈，弹性 + 数据分析需求突出",
    ],
    funnel: { reached: 100, connected: 55, meeting: 22, proposal: 10, won: 3 },
    notes: [
      { id: "qn1", method: "phone", date: "2026-06-18 16:00", contact: "张涛", place: "", content: "通过腾讯投资关系拿到 CTO 张涛联系方式，电话初步沟通降本诉求，对方对 EMR 替换方案感兴趣。", next: "发一份大数据平台降本案例", nextDate: "2026-06-25" },
    ],
    assets: [],
  },
  {
    id: "toolflow", name: "效率河马", logo: "河", color: "#3b82f6",
    stage: "lead", grade: "C", aiSuggestScore: 58,
    fields: {
      industry:    { v: "SaaS 工具" },
      founded:     { v: "2021 年" },
      staff:       { v: "约 90 人" },
      funding:     { v: "A 轮 · 6000 万元" },
      product:     { v: "在线协作文档 + 项目管理" },
      dau:         { v: "DAU 12 万 / MAU 45 万" },
      revenue:     { v: "ARR 约 3000 万，仍在亏损扩张" },
      cloudStatus: { v: "创业初期上云，年支出约 500 万" },
      billNote:    { v: "" },
      relation:    { v: "尚未建联" },
    },
    orgChain: [
      { id: "t1", pid: null, name: "吴桐", role: "创始人 / CEO", level: 1, phone: "", wechat: "", email: "", note: "技术出身，亲自决策，认性价比" },
    ],
    painPoints: [
      { v: "预算有限，追求极致性价比" },
      { v: "团队小，运维人力不足，希望托管化" },
    ],
    solution: [
      { product: "轻量应用服务器 Lighthouse", reason: "低成本起步，适配预算敏感初创" },
      { product: "云开发 CloudBase", reason: "免运维，节省小团队人力" },
    ],
    aiScoreReason: [
      "体量与云支出偏小，短期客单价有限，可暂缓重点投入",
      "A 轮阶段现金流紧张，对价格极度敏感",
      "成长性好，可作为长期培育客户，用轻量方案切入",
    ],
    funnel: { reached: 100, connected: 48, meeting: 12, proposal: 4, won: 1 },
    notes: [],
    assets: [],
  },
];
