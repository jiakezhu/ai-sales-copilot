// ===================================================================
// CRM 引擎：持久化 + AI 辅助（AI 只是副手，不越权）
// ===================================================================

// -------------------------------------------------------------------
// 持久化：本地演示模式 = 直接读写 localStorage（与原版一致）
//         云端模式    = 读写「本地镜像」，改动后台防抖同步到 CloudBase
//         —— app.js 始终同步调用 load/save，异步复杂度对它完全透明 ——
// -------------------------------------------------------------------
const CRM = {
  // 当前生效的存储 key：云端模式用按 uid 隔离的镜像 key
  _key() {
    if (typeof CLOUD_ENABLED !== "undefined" && CLOUD_ENABLED && typeof CloudAuth !== "undefined") {
      return cloudMirrorKey(CloudAuth._uid ? CloudAuth._uid() : "anon");
    }
    return STORAGE_KEY;
  },

  load() {
    try {
      const raw = localStorage.getItem(this._key());
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const seed = JSON.parse(JSON.stringify(SEED_CUSTOMERS));
    localStorage.setItem(this._key(), JSON.stringify(seed));
    return seed;
  },

  save(list) {
    // 1) 同步写本地镜像（app.js 无感）
    localStorage.setItem(this._key(), JSON.stringify(list));
    // 2) 云端模式：后台防抖同步到云数据库
    if (typeof CLOUD_ENABLED !== "undefined" && CLOUD_ENABLED) {
      this._syncToCloud(list);
    }
  },

  reset() {
    localStorage.removeItem(this._key());
    const fresh = this.load();
    if (typeof CLOUD_ENABLED !== "undefined" && CLOUD_ENABLED) this._syncToCloud(fresh);
    return fresh;
  },

  // —— 云端同步（防抖，fire-and-forget）——
  _syncTimer: null,
  _syncToCloud(list) {
    const ms = (typeof CLOUDBASE_CONFIG !== "undefined" && CLOUDBASE_CONFIG.SYNC_DEBOUNCE_MS) || 1500;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(async () => {
      try {
        const uid = CloudAuth._uid();
        const db = CloudAuth.db;
        const col = db.collection(CLOUDBASE_CONFIG.COLLECTION);
        const res = await col.where({ _owner: uid }).limit(1).get();
        const doc = res && res.data && res.data[0];
        if (doc && doc._id) {
          await col.doc(doc._id).update({ list, updatedAt: Date.now() });
        } else {
          await col.add({ _owner: uid, list, updatedAt: Date.now() });
        }
      } catch (e) {
        console.warn("[CRM] cloud sync failed:", e);
        toastSafe("云端同步失败，改动已存本地，联网后会自动重试。");
      }
    }, ms);
  },
};

// ---------- AI 辅助引擎 ----------
// 定位：AI 是副手。它做三件事，且都可被销售覆盖：
//   1. 从销售粘贴的文本里抽取结构化字段（不编造，抽不到就说抽不到）
//   2. 给一个"价值参考分"（仅供参考，不决定重点等级——等级销售自己定）
//   3. 根据行业/上云情况给痛点和方案建议（可采纳/可删）
const AIEngine = {
  // 从原始文本抽取字段
  extract(rawText) {
    const t = rawText || "";
    const found = {};
    const rules = {
      staff:   [/(\d+\s*(多)?人)/, /团队.{0,4}(\d+)/, /规模.{0,4}(\d+)/],
      funding: [/([ABCD]\s*轮[^，。；\n]{0,20})/, /(融资[^，。；\n]{0,20})/, /(\d+(\.\d+)?\s*亿[^，。；\n]{0,10})/],
      dau:     [/(DAU[^，。；\n]{0,20})/i, /(MAU[^，。；\n]{0,20})/i, /(日活[^，。；\n]{0,15})/, /(月活[^，。；\n]{0,15})/],
      revenue: [/(流水[^，。；\n]{0,20})/, /(营收[^，。；\n]{0,20})/, /(GMV[^，。；\n]{0,20})/i, /(ARR[^，。；\n]{0,20})/i],
      product: [/(《[^》]+》)/, /(App|app|小程序|SaaS|平台)[^，。；\n]{0,15}/],
      founded: [/((19|20)\d{2}\s*年(成立|创立)?)/, /(成立于\s*(19|20)\d{2})/],
      cloudStatus: [/(用[^，。；\n]{0,4}(阿里云|华为云|AWS|亚马逊|某友商|自建|IDC)[^，。；\n]{0,20})/, /(云支出[^，。；\n]{0,15})/, /(年.{0,3}(万|亿)[^，。；\n]{0,10}云)/],
      billNote:[/((对象)?存储|CVM|CDN|数据库|EMR|带宽|算力|云支出)[^，。；\n]{0,24}/],
      relation:[/((态度|关系)[^，。；\n]{0,25})/, /((信任|支持|反对|中立|积极|认可|拍板人?|决策人|关键人)[^，。；\n]{0,20})/, /((加了?微信|见过面|拒绝了?|已沟通)[^，。；\n]{0,20})/],
      industry:[/(游戏|电商|SaaS|金融|教育|医疗|零售|工具|社交|直播|短视频)[^，。；\n]{0,10}/],
    };
    for (const key in rules) {
      for (const re of rules[key]) {
        const m = t.match(re);
        if (m) { found[key] = m[1] || m[0]; break; }
      }
    }
    let name = "";
    const nm = t.match(/([\u4e00-\u9fa5]{2,8}(科技|互娱|网络|信息|优选|云|智能|文化|传媒))/);
    if (nm) name = nm[1];
    return { name, found };
  },

  // 从会议纪要文本抽取要点（复用 extract 的情报字段 + 额外识别纪要专属要点）
  // 诚实原则：仅抽取文本中明确出现的内容，抽不到就留空，绝不编造。
  extractMeeting(rawText) {
    const t = rawText || "";
    // 1) 先复用通用情报字段抽取（industry/funding/dau/cloudStatus/... 共 10 项）
    const { name, found } = this.extract(t);

    // 2) 纪要专属要点：逐行扫描，命中关键词的整句作为候选（保留原文，不改写）
    const lines = t.split(/[\n；;。]/).map(s => s.trim()).filter(Boolean);
    const pick = (patterns) => {
      const hit = [];
      for (const ln of lines) {
        if (patterns.some(re => re.test(ln)) && !hit.includes(ln)) hit.push(ln);
      }
      return hit;
    };
    const points = {
      nextSteps: pick([/下一步|下步|接下来|后续|待办|计划|跟进|准备|预约|安排|发出?给?|提供|需要我?们?/]),
      decisions: pick([/决定|拍板|确认|同意|通过|定了|敲定|达成|结论|方案确定/]),
      concerns:  pick([/担心|顾虑|异议|质疑|风险|问题是|痛点|不满意|价格|成本|预算|竞品|对比|考虑/]),
      relation:  pick([/态度|关系|好感|信任|支持|反对|中立|决策人|关键人|拍板人|引荐|推荐/]),
    };

    // 3) 把纪要要点映射进「客户关系」情报字段（若原文里有关系进展且情报里没抽到 relation）
    if (!found.relation && points.relation.length) {
      found.relation = points.relation.join("；");
    }

    return { name, found, points };
  },

  // 缺失字段分析（用于温和提示，不刷屏）
  missingFields(customer) {
    return FIELD_DEFS.filter(def => {
      const f = customer.fields[def.key];
      return !f || !f.v || !f.v.trim();
    });
  },

  // 价值参考分（仅供参考）+ 痛点/方案建议
  suggest(customer) {
    const f = customer.fields;
    const val = k => (f[k] && f[k].v) ? f[k].v : "";
    const txt = Object.values(f).map(x => x.v || "").join(" ");

    let score = 40;
    const reasons = [];
    const cloud = val("cloudStatus") + val("billNote");
    const bigSpend = /(\d+)\s*(千万|亿)/.test(cloud) || /[3-9]\d{3}\s*万/.test(cloud) || /亿/.test(cloud);
    if (bigSpend) { score += 22; reasons.push("云支出体量大，客单价与降本空间可观"); }
    else if (cloud) { score += 8; reasons.push("有明确上云现状，可切入"); }
    const fund = val("funding");
    if (/[CD]\s*轮|上市|战略/.test(fund)) { score += 18; reasons.push("融资阶段成熟，预算充足"); }
    else if (/B\s*轮/.test(fund)) { score += 14; reasons.push("B 轮扩张期，有采购能力"); }
    else if (/A\s*轮/.test(fund)) { score += 6; reasons.push("A 轮早期，预算相对敏感"); }
    const scale = val("dau") + val("revenue");
    if (/(\d+)\s*万|亿/.test(scale)) { score += 14; reasons.push("用户/营收规模大，弹性需求强"); }
    if (/(阿里云|华为云|AWS|亚马逊|某友商)/.test(cloud)) { score += 10; reasons.push("现用友商云，存在迁移/winback 窗口"); }
    if (/(海外|出海|东南亚|全球|海外占)/.test(txt)) { score += 6; reasons.push("有出海需求，全球加速刚需"); }
    score = Math.min(98, Math.max(30, score));

    const suggestGrade = score >= 78 ? "S" : score >= 62 ? "A" : score >= 48 ? "B" : "C";

    const painGuess = [];
    if (/游戏|互娱/.test(txt)) painGuess.push("开服/活动瞬时流量洪峰，弹性算力需求");
    if (/电商|零售|优选/.test(txt)) painGuess.push("大促流量波动剧烈，资源利用率低");
    if (/(海外|出海|东南亚|全球)/.test(txt)) painGuess.push("跨境延迟高，海外用户体验差");
    if (bigSpend) painGuess.push("云成本高企，降本增效诉求强");
    if (/SaaS|工具|协作/.test(txt)) painGuess.push("小团队运维人力不足，需托管化");

    return {
      score,
      suggestGrade,
      reasons: reasons.length ? reasons : ["信息较少，建议补充融资/上云/规模后再参考"],
      painGuess,
    };
  },

  // 联网检索（诚实版：无授权数据源则明确告知，绝不编造）
  async webSearch(companyName) {
    await new Promise(r => setTimeout(r, 800));
    return {
      ok: false,
      message: `未接入授权工商数据源，无法自动检索「${companyName || "该公司"}」的公开信息。请手动补充，或把你已掌握的资料粘贴给 AI 结构化。`,
    };
  },

  // 名片/截图识别（诚实版）：优先尝试真实识别；无授权服务则诚实提示手动确认，绝不编造
  async recognizeCard(asset) {
    await new Promise(r => setTimeout(r, 1100));
    // 纯前端静态页：无后端、无授权 OCR key，无法真实识别 → 诚实兜底
    return {
      ok: false,
      fields: {},
      message: "当前为纯前端演示环境，未接入授权 OCR / 大模型识别服务，无法自动抽取名片字段。请对照图片手动填写下方信息，确认后一键补入情报或建立联系人。",
    };
  },
};

// ---------- 材料库引擎：文件读取 + 图片压缩 + 素材 CRUD ----------
const AssetEngine = {
  MAX_EDGE: 1280,        // 图片最长边（压缩后）
  QUALITY: 0.82,         // JPEG 质量
  MAX_BYTES: 900 * 1024, // 单文件存储上限（压缩后 base64 近似）

  isImage(file) { return file && /^image\//.test(file.type); },

  // 读取文件：
  //   云端模式 → 上传对象存储，拿永久 URL（突破 5MB，多设备可见）
  //   本地模式 → 图片压缩为 dataURL 存本地；非图片仅存元信息
  readFile(file) {
    if (typeof CLOUD_ENABLED !== "undefined" && CLOUD_ENABLED) {
      return this._uploadToCloud(file);
    }
    return new Promise((resolve, reject) => {
      if (this.isImage(file)) {
        const reader = new FileReader();
        reader.onload = e => this._compress(e.target.result, file).then(resolve).catch(reject);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        // 非图片：只留文件名/大小，不存内容（localStorage 放不下大文件）
        resolve({ dataUrl: "", isImage: false, name: file.name, size: file.size, mime: file.type });
      }
    });
  },

  // 云端模式：上传到 CloudBase 对象存储，返回可直接用于 <img src> 的临时/永久 URL
  async _uploadToCloud(file) {
    try {
      const app = CloudAuth.app;
      const uid = CloudAuth._uid();
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const cloudPath = `${CLOUDBASE_CONFIG.STORAGE_DIR}/${uid}/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
      const up = await app.uploadFile({ cloudPath, filePath: file });
      const fileID = up.fileID;
      // 换取可访问的临时 URL（有效期较长；跨设备可见）
      let url = "";
      try {
        const tmp = await app.getTempFileURL({ fileList: [fileID] });
        url = (tmp && tmp.fileList && tmp.fileList[0] && tmp.fileList[0].tempFileURL) || "";
      } catch (e) {}
      return {
        dataUrl: url, fileID, isImage: this.isImage(file),
        name: file.name, size: file.size, mime: file.type,
      };
    } catch (e) {
      console.warn("[AssetEngine] cloud upload failed, fallback local:", e);
      toastSafe("图片上传云端失败，已改为本地压缩存储。");
      // 回退本地压缩
      return new Promise((resolve, reject) => {
        if (this.isImage(file)) {
          const reader = new FileReader();
          reader.onload = e => this._compress(e.target.result, file).then(resolve).catch(reject);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        } else {
          resolve({ dataUrl: "", isImage: false, name: file.name, size: file.size, mime: file.type });
        }
      });
    }
  },

  _compress(dataUrl, file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, this.MAX_EDGE / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        let out = canvas.toDataURL("image/jpeg", this.QUALITY);
        // 若仍过大，逐步降质
        let q = this.QUALITY;
        while (out.length > this.MAX_BYTES && q > 0.4) {
          q -= 0.12;
          out = canvas.toDataURL("image/jpeg", q);
        }
        resolve({ dataUrl: out, isImage: true, name: file.name, size: out.length, mime: "image/jpeg", w: width, h: height });
      };
      img.onerror = () => resolve({ dataUrl, isImage: true, name: file.name, size: dataUrl.length, mime: file.type });
      img.src = dataUrl;
    });
  },

  // 生成一条素材记录
  makeAsset(type, meta, extra) {
    return Object.assign({
      id: uid("a"),
      type,                 // card | chat | photo | file
      name: meta.name || "未命名",
      dataUrl: meta.dataUrl || "",
      isImage: !!meta.isImage,
      mime: meta.mime || "",
      size: meta.size || 0,
      linkedNodeId: "",     // 关联的组织架构节点（人员照片用）
      caption: "",          // 备注/关键信息标注
      createdAt: nowDateTime(),
    }, extra || {});
  },
};

// ---------- 工具函数 ----------
function uid(p) { return (p || "c") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function esc(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function nowDateTime() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function methodMeta(key) {
  return CONTACT_METHODS.find(m => m.key === key) || CONTACT_METHODS[CONTACT_METHODS.length - 1];
}
function gradeMeta(key) {
  return GRADES.find(g => g.key === key) || { key: "?", label: "未分级", color: "#8a94a6", desc: "尚未设定重点等级" };
}
