// ===================================================================
// CloudBase 初始化 + 登录 + 首屏数据拉取（异步复杂度全封装在这）
// -------------------------------------------------------------------
// 设计：应用启动流程被这里接管
//   演示模式(无 ENV_ID)：直接放行，app.js 照旧读本地 → 和现在完全一样
//   云端模式(有 ENV_ID)：
//     1. 初始化 SDK
//     2. 检查登录态；未登录 → 弹登录页，登录成功后继续
//     3. 从云数据库拉该用户的数据 → 写入本地镜像
//     4. 放行，启动 app.js（app.js 同步读镜像，完全无感）
// ===================================================================

const CloudAuth = {
  app: null,
  auth: null,
  db: null,
  user: null,

  // 应用启动总入口。返回 Promise，resolve 后才允许 app 初始化。
  async boot() {
    if (!CLOUD_ENABLED) {
      // —— 演示模式：什么都不做，直接放行 ——
      this._hideGate();
      return { mode: "local" };
    }

    // —— 云端模式 ——
    if (typeof cloudbase === "undefined") {
      this._fatal("未加载 CloudBase SDK，请检查 index.html 的 <script> 引入，或网络是否可访问 SDK CDN。");
      throw new Error("cloudbase sdk missing");
    }

    this.app = cloudbase.init({ env: CLOUDBASE_CONFIG.ENV_ID.trim() });
    this.auth = this.app.auth({ persistence: "local" });
    this.db = this.app.database();

    // 已登录？
    const state = await this.auth.getLoginState().catch(() => null);
    if (state && state.user) {
      this.user = state.user;
    } else {
      // 未登录 → 展示登录页，等待登录完成
      this.user = await this._showLoginAndWait();
    }

    // 拉取云端数据 → 写本地镜像，供 app.js 同步读取
    await this._pullToMirror();
    this._hideGate();
    return { mode: "cloud", uid: this._uid() };
  },

  _uid() {
    return (this.user && (this.user.uid || this.user.userId || this.user.openid)) || "anon";
  },

  // 从云数据库把该用户的数据拉到本地镜像（key 与 crm.js 约定一致）
  async _pullToMirror() {
    const uid = this._uid();
    try {
      const res = await this.db
        .collection(CLOUDBASE_CONFIG.COLLECTION)
        .where({ _owner: uid })
        .limit(1)
        .get();
      const doc = res && res.data && res.data[0];
      if (doc && Array.isArray(doc.list)) {
        localStorage.setItem(cloudMirrorKey(uid), JSON.stringify(doc.list));
      } else {
        // 云端还没有该用户的数据 → 用种子初始化一份并写回云端
        const seed = JSON.parse(JSON.stringify(SEED_CUSTOMERS));
        localStorage.setItem(cloudMirrorKey(uid), JSON.stringify(seed));
        await this.db.collection(CLOUDBASE_CONFIG.COLLECTION).add({
          _owner: uid, list: seed, updatedAt: Date.now(),
        }).catch(() => {});
      }
    } catch (e) {
      // 拉取失败：降级为本地镜像（不至于白屏），并提示
      console.warn("[CloudAuth] pull failed, fallback to local mirror:", e);
      if (!localStorage.getItem(cloudMirrorKey(uid))) {
        localStorage.setItem(cloudMirrorKey(uid),
          JSON.stringify(JSON.parse(JSON.stringify(SEED_CUSTOMERS))));
      }
      toastSafe("云端读取失败，已临时使用本地数据。请检查数据库集合与权限配置。");
    }
  },

  // ---------------- 登录页 ----------------
  _showLoginAndWait() {
    return new Promise((resolve) => {
      const gate = this._ensureGate();
      const L = CLOUDBASE_CONFIG.LOGIN || {};
      const phoneBlock = L.phone ? `
        <div class="cb-login-block">
          <div class="cb-field">
            <label>手机号</label>
            <input id="cbPhone" type="tel" maxlength="11" placeholder="请输入手机号" />
          </div>
          <div class="cb-field cb-code-row">
            <input id="cbCode" type="text" maxlength="6" placeholder="短信验证码" />
            <button id="cbSendCode" class="cb-btn-ghost">获取验证码</button>
          </div>
          <button id="cbPhoneLogin" class="cb-btn-primary">登录 / 注册</button>
        </div>` : "";
      const wechatBlock = L.wechat ? `
        <div class="cb-login-block">
          <button id="cbWechatLogin" class="cb-btn-primary cb-wechat">微信登录</button>
        </div>` : "";
      const divider = (L.phone && L.wechat) ? `<div class="cb-or">或</div>` : "";

      gate.innerHTML = `
        <div class="cb-login-card">
          <div class="cb-login-logo">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none"><path d="M4 13.5 L10 19 L20 6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="cb-login-title">腾讯云 · 销售获客工作台</div>
          <div class="cb-login-sub">登录后你的客户数据将安全存储在云端，多设备同步</div>
          ${phoneBlock}
          ${divider}
          ${wechatBlock}
          <div class="cb-login-msg" id="cbLoginMsg"></div>
        </div>`;
      gate.classList.remove("cb-hidden");

      const msg = (t, err) => {
        const m = document.getElementById("cbLoginMsg");
        if (m) { m.textContent = t || ""; m.className = "cb-login-msg" + (err ? " cb-err" : ""); }
      };

      // —— 手机号验证码 ——
      let verifyInfo = null;
      const sendBtn = document.getElementById("cbSendCode");
      if (sendBtn) {
        sendBtn.addEventListener("click", async () => {
          const phone = (document.getElementById("cbPhone").value || "").trim();
          if (!/^1\d{10}$/.test(phone)) return msg("请输入正确的 11 位手机号", true);
          sendBtn.disabled = true;
          try {
            verifyInfo = await this.auth.getVerification({ phone_number: "+86 " + phone });
            msg("验证码已发送，请查收短信");
            let s = 60;
            const timer = setInterval(() => {
              sendBtn.textContent = `${s}s 后重发`;
              if (--s < 0) { clearInterval(timer); sendBtn.disabled = false; sendBtn.textContent = "获取验证码"; }
            }, 1000);
          } catch (e) {
            sendBtn.disabled = false;
            msg("发送失败：" + (e && e.message || "请检查控制台是否已开通手机号登录"), true);
          }
        });
      }
      const loginBtn = document.getElementById("cbPhoneLogin");
      if (loginBtn) {
        loginBtn.addEventListener("click", async () => {
          const phone = (document.getElementById("cbPhone").value || "").trim();
          const code = (document.getElementById("cbCode").value || "").trim();
          if (!/^1\d{10}$/.test(phone)) return msg("请输入正确的手机号", true);
          if (!code) return msg("请输入验证码", true);
          if (!verifyInfo) return msg("请先获取验证码", true);
          loginBtn.disabled = true; msg("登录中…");
          try {
            const verifyResult = await this.auth.verify({
              verification_id: verifyInfo.verification_id, verification_code: code,
            });
            await this.auth.signIn({
              username: phone,
              verification_token: verifyResult.verification_token,
            });
            const st = await this.auth.getLoginState();
            resolve(st.user);
          } catch (e) {
            loginBtn.disabled = false;
            msg("登录失败：" + (e && e.message || "验证码错误或已过期"), true);
          }
        });
      }

      // —— 微信登录 ——
      const wxBtn = document.getElementById("cbWechatLogin");
      if (wxBtn) {
        wxBtn.addEventListener("click", async () => {
          msg("正在跳转微信授权…");
          try {
            await this.auth.signInWithRedirect
              ? this.auth.signInWithRedirect({ provider: "wechat" })
              : msg("当前 SDK 不支持微信重定向登录，请改用手机号，或查阅控制台微信登录配置", true);
          } catch (e) {
            msg("微信登录失败：" + (e && e.message || "请检查控制台微信登录配置"), true);
          }
        });
      }
    });
  },

  async logout() {
    if (this.auth) { try { await this.auth.signOut(); } catch (e) {} }
    location.reload();
  },

  // ---------------- 登录遮罩 DOM ----------------
  _ensureGate() {
    let gate = document.getElementById("cbGate");
    if (!gate) {
      gate = document.createElement("div");
      gate.id = "cbGate";
      gate.className = "cb-gate";
      document.body.appendChild(gate);
    }
    return gate;
  },
  _hideGate() {
    const gate = document.getElementById("cbGate");
    if (gate) gate.classList.add("cb-hidden");
  },
  _fatal(text) {
    const gate = this._ensureGate();
    gate.innerHTML = `<div class="cb-login-card"><div class="cb-login-title">初始化失败</div><div class="cb-login-sub cb-err">${text}</div></div>`;
    gate.classList.remove("cb-hidden");
  },
};

// toast 在 app.js 里定义；auth 可能早于它，做个安全包装
function toastSafe(t) {
  try { if (typeof toast === "function") return toast(t); } catch (e) {}
  console.log("[toast]", t);
}
