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
  { key: "website",     label: "官方网站",   public: true,  ph: "如：https://example.com" },
  { key: "product",     label: "主力产品",   public: true,  ph: "如：MMORPG《九州幻想》" },
  { key: "dau",         label: "活跃数据",   public: true,  ph: "如：DAU 210 万 / MAU 860 万" },
  { key: "revenue",     label: "营收/流水",  public: true,  ph: "如：年流水约 9 亿，海外占 35%" },

  // —— 以下为对接 B2B 公司调研（企查查/天眼查/公开检索）可补充的客户情报维度 ——
  { key: "creditCode",   label: "统一社会信用代码", public: true, ph: "如：91110108MA01ABCD2X" },
  { key: "legalPerson",  label: "法定代表人",   public: true,  ph: "如：周明远" },
  { key: "regCapital",   label: "注册资本",     public: true,  ph: "如：5000 万人民币" },
  { key: "regAddress",   label: "注册地址",     public: true,  ph: "如：北京市海淀区 xx 路 xx 号" },
  { key: "businessModel",label: "业务模式",     public: true,  ph: "如：研运一体，靠长线运营拉高 LTV" },
  { key: "techStack",    label: "技术栈",       public: true,  ph: "如：Go + Kubernetes + 自研调度" },
  { key: "shareholders", label: "股东与股权",   public: true,  ph: "如：红杉持股 18%，创始人 42%" },
  { key: "parentSubs",   label: "母公司与子公司", public: true, ph: "如：母公司 XX 集团，子公司 3 家" },
  { key: "supplyChain",  label: "上下游关系",   public: true,  ph: "如：上游阿里云，下游渠道代理" },
  { key: "recentNews",   label: "近期动态",     public: true,  ph: "如：2026-06 完成 C 轮，拓展中东" },
  { key: "hiring",       label: "招聘信号",     public: true,  ph: "如：急招海外运营/云架构师，扩张中" },
  { key: "riskNote",     label: "风险与竞争",   public: true,  ph: "如：友商 A 存量大，迁移惯性高" },
  { key: "triggerEvents",label: "触发事件",     public: true,  ph: "如：融资到位、换帅、新区域扩张" },

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

// ===================================================================
// 攻坚档案（重点攻坚客户档案）——单客户维度的结构化作战地图
// 对应线下《重点攻坚客户档案》模板：头部快标 + 8 大模块
// 数据存在 customer.raidFile 里，可编辑、可打印导出
// ===================================================================

// 头部：本次沟通诉求（可多选）
const RAID_DEMANDS = [
  { key: "align",    label: "对齐信息" },
  { key: "strategy", label: "确定打法" },
  { key: "resource", label: "申请资源" },
  { key: "blocker",  label: "解决卡点" },
  { key: "close",    label: "临门促单" },
];

// 头部：当前攻坚阶段（单选，区别于 CRM_STAGES，更贴合攻坚话术）
const RAID_STAGES = [
  { key: "no_dm",     label: "决策人未建联" },
  { key: "dm_linked", label: "决策人已建联" },
  { key: "research",  label: "需求调研/方案交流" },
  { key: "nego",      label: "商务谈判" },
  { key: "won",       label: "关单" },
];

// 合作态度（决策人建联进展用）
const RAID_ATTITUDES = [
  { key: "positive", label: "积极", color: "#00a870" },
  { key: "neutral",  label: "观望", color: "#ed7b2f" },
  { key: "negative", label: "抵触", color: "#e34d59" },
];

// 攻坚档案 8 大模块的结构定义（用于渲染表单骨架 + 空档案初始化）
// type: text(多行) / list(可增删的条目列表) / scenes(业务场景:标题+场景+链接) /
//       roles(关键角色:角色+职位+诉求) / competitors(竞对:名称+覆盖+优劣势) /
//       goals(三段目标) / plan(攻坚动作+需支持)
const RAID_SECTIONS = [
  {
    key: "basic", no: "1", title: "客户基本面", required: true,
    hint: "基于一线沟通理解撰写，禁止直接复制网络简介",
    fields: [
      { key: "scope",   label: "经营范围（用自己的话概括）", type: "text" },
      { key: "model",   label: "商业模式（核心赚钱逻辑）",   type: "text" },
      { key: "market",  label: "市场分布（重点区域/客户群）", type: "text" },
    ],
  },
  {
    key: "scenes", no: "2", title: "业务场景拆解", required: true,
    hint: "围绕客户实际业务，梳理相关业务场景（可增减）",
    type: "scenes",
  },
  {
    key: "org", no: "3", title: "决策链与组织架构", required: true,
    hint: "组织架构图见「组织架构」Tab；此处补充汇报关系简述与关键角色诉求",
    fields: [
      { key: "orgDesc", label: "组织架构简述（汇报关系）", type: "text" },
    ],
    type: "roles", // 额外渲染关键角色列表
  },
  {
    key: "dm", no: "4", title: "决策人建联进展", required: true,
    fields: [
      { key: "reachLevel", label: "当前触达层级",        type: "text" },
      { key: "attitude",   label: "合作态度",            type: "attitude" },
      { key: "coreDemand", label: "核心诉求 / 关注点",   type: "text" },
      { key: "concern",    label: "主要顾虑",            type: "text" },
    ],
  },
  {
    key: "competitor", no: "5", title: "竞对分析",
    fields: [
      { key: "internal", label: "内部协同/冲突（是否有其他销售同时跟进？）", type: "text" },
    ],
    type: "competitors", // 额外渲染外部竞对列表
  },
  {
    key: "goals", no: "6", title: "阶段性拓展目标",
    hint: "销售及架构师预沟通，待策略会对齐",
    type: "goals",
  },
  {
    key: "solution", no: "7", title: "方案设计",
    hint: "销售及架构师预沟通，待策略会对齐",
    fields: [
      { key: "biz",  label: "商务方案", type: "text" },
      { key: "tech", label: "技术方案", type: "text" },
    ],
  },
  {
    key: "plan", no: "8", title: "下一步攻坚计划",
    hint: "销售及架构师预沟通，待策略会对齐",
    fields: [
      { key: "action",  label: "攻坚动作",                          type: "text" },
      { key: "support", label: "需支持事项（如申请高层拜访、特殊折扣等）", type: "text" },
    ],
  },
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
      website:     { v: "https://starlight.example.com" },
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
    marketNews: [
      { id: "sn1", title: "《九州幻想》东南亚版本开启预约", publishedAt: "2026-06-28", market: "东南亚", sourceUrl: "https://starlight.example.com/news/sea-launch", signal: "海外发行从测试进入正式获客阶段，网络体验将直接影响首月留存。", impact: "拜访时确认重点国家、开服时间和延迟基线，推动小范围 GAAP 实测。", confirmedAt: "2026-07-01 10:00" },
      { id: "sn2", title: "星澜互娱披露 B 轮融资后的全球化投入计划", publishedAt: "2026-06-12", market: "全球", sourceUrl: "https://starlight.example.com/news/series-b", signal: "融资资金明确用于海外发行和研发团队扩张。", impact: "预算窗口与海外基础设施采购可能同步打开。", confirmedAt: "2026-07-01 10:00" },
    ],
    hiringSignals: [
      { id: "sh1", role: "东南亚游戏社区运营", location: "新加坡", postedAt: "2026-06-26", sourceUrl: "https://starlight.example.com/jobs/community-sea", signal: "正在搭建本地化运营与玩家社区能力。", opportunity: "确认海外节点覆盖、活动峰值保障与本地数据合规计划。", confirmedAt: "2026-07-01 10:00" },
      { id: "sh2", role: "全球网络运维工程师", location: "深圳", postedAt: "2026-06-20", sourceUrl: "https://starlight.example.com/jobs/global-network", signal: "跨区域网络质量和海外故障响应已成为专门职责。", opportunity: "以东南亚三地延迟与丢包实测切入技术交流。", confirmedAt: "2026-07-01 10:00" },
    ],
    painChain: {
      signal: "海外发行与本地运营团队同步扩张",
      pain: "东南亚与中东玩家跨境延迟高、活动期掉线",
      impact: "影响新服留存、付费转化和海外发行口碑",
      solution: "全球加速 GAAP + 海外边缘节点 PoC",
      question: "能否用三个重点城市的真实业务流量，共同验证延迟和丢包改善？",
      updatedAt: "2026-07-01 10:00",
    },
    jointWorkPlan: [
      { id: "map1", title: "确认 PoC 城市与业务流量范围", deliverable: "测试范围与成功标准清单", ourOwner: "客户经理 / 架构师", customerOwner: "王工", dueDate: "2026-07-03", status: "doing" },
      { id: "map2", title: "完成东南亚三地延迟实测", deliverable: "基线与 GAAP 对比报告", ourOwner: "解决方案架构师", customerOwner: "网络运维团队", dueDate: "2026-07-10", status: "todo" },
      { id: "map3", title: "联合评审 PoC 结果与商务范围", deliverable: "CTO 评审结论与下一阶段采购范围", ourOwner: "客户经理", customerOwner: "李阔 / 王工", dueDate: "2026-07-15", status: "todo" },
    ],
    negotiationBrief: {
      objective: "确认东南亚三地 GAAP PoC，并锁定 CTO 评审时间",
      customerPosition: "愿意验证效果，但担心迁移风险、长期成本和单一厂商绑定",
      valueAnchor: "以真实业务流量降低延迟和丢包，保护海外新服留存与付费转化",
      mustHave: "共同确认成功标准、测试范围，以及 PoC 达标后的正式采购评审",
      flexible: "可协调架构师支持与有限 PoC 资源额度，测试范围可以分阶段扩大",
      giveGet: "提供测试资源和专项技术支持，换取真实业务流量、CTO 参与评审及采购时间表",
      redLine: "不承诺无限期免费资源，不在成功标准未确认前给出长期价格锁定",
      objections: "担心迁移影响线上稳定性、被单一云厂商锁定，以及后续成本不可控",
      response: "先采用旁路小流量验证，不改动核心架构；用实测指标决定是否扩大，并明确可退出边界",
      closeAction: "会后确认 PoC 负责人、三座城市、成功标准和启动日期",
      updatedAt: "2026-07-01 10:00",
    },
    salesAssets: [],
    // 攻坚档案示范（对应线下《重点攻坚客户档案》模板）
    raidFile: {
      updatedAt: "2026-07-01",
      demands: ["align", "strategy"],   // 本次沟通诉求
      raidStage: "dm_linked",           // 当前攻坚阶段：决策人已建联
      basic: {
        scope:  "自研 + 发行手游，主攻 MMORPG 品类，同时做海外发行代理；核心收入来自游戏内充值（道具/皮肤/月卡）与海外分成。",
        model:  "研运一体：自研《九州幻想》等 3 款产品，靠长线运营（版本更新+活动+付费点设计）拉高玩家 LTV，海外市场买量投放放大规模。",
        market: "国内一二线为基本盘，增量重心在东南亚、中东；海外流水已占 35% 且仍在上升。",
      },
      scenes: [
        { title: "海外发行", scene: "东南亚/中东玩家实时对战，对延迟极敏感；现有节点覆盖不足，跨区访问延迟高、掉线多，直接影响留存与付费。", link: "" },
        { title: "开服 & 大型活动", scene: "新服开启、周年庆等瞬时在线暴涨 5-8 倍，自建 IDC 扩容不及时导致排队/卡顿，活动当天体验事故频发。", link: "" },
      ],
      org: {
        orgDesc: "周明远(CEO)最终拍板 → 李阔(CTO)负责技术选型 → 王工(运维总监)经办并对稳定性/成本有一票否决权。技术决策实际由 CTO+运维总监共同主导，CEO 关注战略与 ROI。",
      },
      roles: [
        { name: "周明远", role: "CEO / 创始人", demand: "关注出海战略能否成功、整体 ROI；不深入技术细节，认‘能不能帮我把海外做起来’。" },
        { name: "李阔",   role: "CTO",          demand: "认技术硬指标（延迟数据、SLA、架构合理性）；怕被绑定单一厂商，重视方案的先进性与可迁移性。" },
        { name: "王工",   role: "运维总监",      demand: "最痛稳定性与成本；活动保障压力大，希望弹性能力强、迁移风险低、有专人兜底支持。" },
      ],
      dm: {
        reachLevel: "已触达执行层（运维总监王工）+ 管理层（CTO 李阔），尚未直接与 CEO 对话。",
        attitude:   "positive",
        coreDemand: "先解决出海延迟这一最痛的点，用一个可量化的效果证明能力，再谈整体上云降本。",
        concern:    "担心迁移过程影响线上稳定性；担心被单一云厂商锁定；对报价与长期成本敏感。",
      },
      competitor: {
        internal: "暂无其他同事同时跟进该客户，销售归属清晰，无内部撞单风险。",
      },
      competitors: [
        { name: "友商 A（现有主力云）", coverage: "承载客户现有大部分自建 IDC 之外的云上业务", pros: "已有存量、迁移惯性大", cons: "出海节点覆盖弱、游戏专项加速能力不足、大促弹性响应慢" },
        { name: "友商 B", coverage: "海外 CDN / 加速部分场景", pros: "海外节点多", cons: "游戏场景优化不深，缺乏一体化游戏云与数据库多活方案" },
      ],
      goals: {
        g1: "3 个月内：以「全球加速 GAAP + 海外节点」切入，做一次东南亚延迟对比 PoC，用实测数据打动 CTO，拿下第一笔出海加速订单。",
        g2: "6 个月：延伸到 GAME-TECH 游戏云 + GSE，承接开服/活动弹性场景，替换部分自建 IDC 峰值算力。",
        g3: "长期：推动核心数据库迁移至 TDSQL + 异地多活，形成‘加速+算力+数据’整体上云，成为其出海基础设施主力供应商。",
      },
      solution: {
        biz:  "分阶段签约降低客户决策门槛：先签出海加速小单验证效果，PoC 达标后再谈游戏云与数据库整体框架；提供出海带宽阶梯折扣 + 活动保障专项支持包。",
        tech: "全球加速 GAAP + 海外边缘节点降低东南亚/中东延迟；GAME-TECH 游戏云 + GSE 做开服弹性伸缩；云数据库 TDSQL + 异地多活满足数据合规与高可用。",
      },
      plan: {
        action:  "本周三上门拜访，带东南亚 3 城市延迟实测对比数据 + 出海加速方案 PPT；现场敲定一次小范围 PoC 的范围与时间表。",
        support: "申请解决方案架构师随访一次；申请出海加速 PoC 的资源额度与阶梯折扣审批；争取一次面向 CEO 的高层拜访窗口。",
      },
    },
  },
  {
    id: "quickbuy", name: "闪购优选", logo: "闪", color: "#0ea5a4",
    stage: "contact", grade: "A", aiSuggestScore: 88,
    fields: {
      industry:    { v: "生鲜电商" },
      founded:     { v: "2020 年" },
      staff:       { v: "约 1200 人" },
      funding:     { v: "C 轮 · 7 亿元（高瓴、腾讯投资参投）" },
      website:     { v: "https://quickbuy.example.com" },
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
      website:     { v: "https://toolflow.example.com" },
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
