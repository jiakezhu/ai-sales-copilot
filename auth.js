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

// ===================================================================
// 本地 Node API 认证：用于开箱即用的账号密码注册/登录。
// CloudBase 配置了 ENV_ID 时仍优先使用 CloudBase，不改变现有部署。
// ===================================================================
const ApiAuth = {
  enabled: false,
  user: null,

  _uid() {
    return this.user?.id || this.user?.uid || "anon";
  },

  _mergeCustomerLists(remote, local) {
    const merged = new Map();
    (Array.isArray(remote) ? remote : []).forEach(customer => {
      const key = customer?.id || String(customer?.name || "").trim().toLowerCase();
      if (key) merged.set(key, customer);
    });
    (Array.isArray(local) ? local : []).forEach(customer => {
      const key = customer?.id || String(customer?.name || "").trim().toLowerCase();
      if (key) merged.set(key, customer);
    });
    return Array.from(merged.values());
  },

  async boot() {
    if (typeof SalesAPI === "undefined") return { mode: "local" };
    try {
      await SalesAPI.health();
    } catch (error) {
      if (error?.status === 404 || error?.status === 405) return { mode: "local" };
      return this._showUnavailable(error);
    }

    this.enabled = true;
    if (SalesAPI.getToken?.()) {
      try { this.user = await SalesAPI.me(); } catch (error) { SalesAPI.logout(); }
    }
    if (!this.user) this.user = await this._showLoginAndWait();
    await this._pullToMirror();
    this._hideGate();
    return { mode: "api", uid: this._uid(), user: this.user };
  },

  _showUnavailable(error) {
    const gate = this._ensureGate();
    gate.innerHTML = `<div class="cb-login-card"><div class="cb-login-title">服务暂时不可用</div><div class="cb-login-sub">无法连接账号服务。为避免不同账号的客户数据混在一起，当前不会降级到共享本地模式。</div><button id="apiRetryBoot" class="cb-btn-primary">重新连接</button><div class="cb-login-msg cb-err">${error?.status ? `HTTP ${error.status}` : "请检查 Node API 是否正在运行"}</div></div>`;
    gate.classList.remove("cb-hidden");
    gate.querySelector("#apiRetryBoot")?.addEventListener("click", () => location.reload());
    return new Promise(() => {});
  },

  async _pullToMirror() {
    const key = this._mirrorKey();
    const dirtyKey = key + ":dirty";
    try {
      let cached = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (Array.isArray(parsed)) cached = parsed;
      } catch (error) {}
      if (localStorage.getItem(dirtyKey) === "1" && cached) {
        try {
          await SalesAPI.saveCustomers(cached);
        } catch (error) {
          if (error?.status !== 409) throw error;
          const remote = await SalesAPI.getCustomers();
          cached = this._mergeCustomerLists(remote, cached);
          await SalesAPI.saveCustomers(cached);
          localStorage.setItem(key, JSON.stringify(cached));
        }
        localStorage.removeItem(dirtyKey);
        return;
      }
      const remote = await SalesAPI.getCustomers();
      const list = Array.isArray(remote) ? remote : (Array.isArray(remote?.customers) ? remote.customers : []);
      if (list.length) {
        localStorage.setItem(key, JSON.stringify(list));
        localStorage.removeItem(dirtyKey);
      } else {
        let initial = null;
        try {
          const cached = JSON.parse(localStorage.getItem(key) || "null");
          if (Array.isArray(cached) && cached.length) initial = cached;
        } catch (error) {}
        initial ||= JSON.parse(JSON.stringify(SEED_CUSTOMERS));
        localStorage.setItem(key, JSON.stringify(initial));
        await SalesAPI.saveCustomers(initial);
      }
    } catch (error) {
      console.warn("[ApiAuth] customer pull failed:", error);
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(JSON.parse(JSON.stringify(SEED_CUSTOMERS))));
      toastSafe("云端客户数据读取失败，已使用本地镜像。");
    }
  },

  _mirrorKey() {
    return "tc_sales_api_mirror_" + this._uid();
  },

  _showLoginAndWait() {
    return new Promise((resolve) => {
      const gate = this._ensureGate();
      let mode = "login";
      const render = () => {
        const registering = mode === "register";
        gate.innerHTML = `
          <div class="cb-login-card api-login-card">
            <div class="cb-login-logo"><svg viewBox="0 0 24 24" width="26" height="26" fill="none"><path d="M4 13.5 L10 19 L20 6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cb-login-title">云销副驾</div>
            <div class="cb-login-sub">${registering ? "创建账号，开始管理你的客户推进" : "登录后客户数据按账号安全隔离"}</div>
            <div class="auth-tabs" role="tablist">
              <button type="button" class="${!registering ? "active" : ""}" data-auth-mode="login" role="tab" aria-selected="${!registering}">登录</button>
              <button type="button" class="${registering ? "active" : ""}" data-auth-mode="register" role="tab" aria-selected="${registering}">注册</button>
            </div>
            <form id="apiAuthForm" class="cb-login-block">
              ${registering ? `<div class="cb-field"><label>姓名</label><input name="name" maxlength="40" autocomplete="name" required placeholder="怎么称呼你" /></div>` : ""}
              <div class="cb-field"><label>邮箱</label><input name="email" type="email" maxlength="120" autocomplete="email" required placeholder="name@example.com" /></div>
              <div class="cb-field"><label>密码</label><input name="password" type="password" minlength="8" maxlength="128" autocomplete="${registering ? "new-password" : "current-password"}" required placeholder="至少 8 位" /></div>
              ${registering ? `<div class="cb-field"><label>确认密码</label><input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required placeholder="再次输入密码" /></div>` : ""}
              <button class="cb-btn-primary" type="submit">${registering ? "注册并进入" : "登录"}</button>
            </form>
            <div class="cb-login-msg" id="cbLoginMsg" aria-live="polite"></div>
          </div>`;
        gate.classList.remove("cb-hidden");
        gate.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => {
          mode = button.dataset.authMode;
          render();
        }));
        gate.querySelector("#apiAuthForm")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const submit = form.querySelector("button[type=submit]");
          const message = gate.querySelector("#cbLoginMsg");
          const data = new FormData(form);
          const email = String(data.get("email") || "").trim();
          const password = String(data.get("password") || "");
          const setMessage = (text, error = false) => {
            message.textContent = text;
            message.className = "cb-login-msg" + (error ? " cb-err" : "");
          };
          if (registering && password !== String(data.get("confirmPassword") || "")) return setMessage("两次输入的密码不一致", true);
          submit.disabled = true;
          setMessage(registering ? "正在创建账号…" : "正在登录…");
          try {
            const result = registering
              ? await SalesAPI.register(String(data.get("name") || "").trim(), email, password)
              : await SalesAPI.login(email, password);
            this.user = result?.user || result;
            if (!this.user?.id) this.user = await SalesAPI.me();
            resolve(this.user);
          } catch (error) {
            submit.disabled = false;
            setMessage(error?.message || (registering ? "注册失败，请稍后重试" : "登录失败，请检查邮箱和密码"), true);
          }
        });
      };
      render();
    });
  },

  async logout() {
    SalesAPI.logout();
    this.user = null;
    location.reload();
  },

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
    document.getElementById("cbGate")?.classList.add("cb-hidden");
  },
};

const AuthCoordinator = {
  mode: "local",
  user: null,

  async boot() {
    const result = (typeof CLOUD_ENABLED !== "undefined" && CLOUD_ENABLED)
      ? await CloudAuth.boot()
      : await ApiAuth.boot();
    this.mode = result?.mode || "local";
    this.user = this.mode === "cloud" ? CloudAuth.user : this.mode === "api" ? ApiAuth.user : null;
    return result;
  },

  async logout() {
    if (this.mode === "cloud") return CloudAuth.logout();
    if (this.mode === "api") return ApiAuth.logout();
  },
};
