import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Crown,
  KeyRound,
  Loader2,
  LogIn,
  type LucideIcon,
  MapPinned,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type {
  ApiKeyPlatform,
  ApiKeySummary,
  HealthResponse,
  MobileRouteDefinition,
  MobileRouteKey,
  PublicUser,
} from "@sinly/shared";
import { apiKeyPlatforms, mobileRoutes } from "@sinly/shared";
import {
  ApiRequestError,
  createApiKey,
  deleteApiKey,
  getSession,
  listApiKeys,
  loadHealth,
  loadMobileShell,
  requestLogin,
  requestRegister,
  updateApiKey,
  type MobileShellResponse,
} from "./api";

type ApiState = "checking" | "ready" | "offline";
type AuthMode = "login" | "register";
type AuthStatus = "checking" | "guest" | "authenticated";
type SubmitState = "idle" | "submitting";
type KeySyncState = "idle" | "loading" | "ready" | "error";

interface ApiKeyFormState {
  apiKey: string;
  label: string;
}

const defaultRoute = mobileRoutes[0] as MobileRouteDefinition | undefined;

if (!defaultRoute) {
  throw new Error("At least one mobile route must be defined");
}

const fallbackRoute: MobileRouteDefinition = defaultRoute;

const defaultKeyForms: Record<ApiKeyPlatform, ApiKeyFormState> = {
  amap: { apiKey: "", label: "高德地图" },
  baidu: { apiKey: "", label: "百度地图" },
  tencent: { apiKey: "", label: "腾讯地图" },
};

const platformLabels: Record<ApiKeyPlatform, string> = {
  amap: "高德",
  baidu: "百度",
  tencent: "腾讯",
};

const iconByRoute: Record<MobileRouteKey, LucideIcon> = {
  query: Search,
  results: MapPinned,
  keys: KeyRound,
  membership: Crown,
  history: Clock3,
  profile: UserRound,
};

function routeDescription(route: MobileRouteDefinition): string {
  const descriptions: Record<MobileRouteKey, string> = {
    query: "核心查询入口会使用当前选择的平台 Key 发起云端查询。",
    results: "承载列表结果、数量限制与后续格式整理能力。",
    keys: "管理三平台 Key，并切换当前查询平台。",
    membership: "预留会员状态、开通续费与权益提示入口。",
    history: "预留查询历史筛选与复用入口。",
    profile: "预留账号信息、设置与常用操作入口。",
  };

  return descriptions[route.key];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function userDisplayName(user: PublicUser): string {
  return user.name?.trim() || user.account || user.email;
}

function statusLabel(apiState: ApiState): string {
  if (apiState === "ready") {
    return "云端已连接";
  }

  if (apiState === "checking") {
    return "加载云端";
  }

  return "云端异常";
}

function keyByPlatform(keys: ApiKeySummary[], platform: ApiKeyPlatform): ApiKeySummary | null {
  return keys.find((key) => key.platform === platform) ?? null;
}

export function App() {
  const [activeRouteKey, setActiveRouteKey] = useState<MobileRouteKey>("query");
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [mobileShell, setMobileShell] = useState<MobileShellResponse | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<ApiKeyPlatform>("amap");
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [keyForms, setKeyForms] =
    useState<Record<ApiKeyPlatform, ApiKeyFormState>>(defaultKeyForms);
  const [keySyncState, setKeySyncState] = useState<KeySyncState>("idle");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySavingPlatform, setKeySavingPlatform] = useState<ApiKeyPlatform | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSession()
      .then((payload) => {
        if (!cancelled) {
          setUser(payload.user);
          setAuthStatus("authenticated");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          if (error instanceof ApiRequestError && error.status === 401) {
            setAuthStatus("guest");
          } else {
            setAuthStatus("guest");
            setFormError("暂时无法校验登录态，请稍后重试。");
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setApiState("checking");
      return;
    }

    let cancelled = false;

    Promise.all([loadHealth(), loadMobileShell()])
      .then(([healthPayload, shellPayload]) => {
        if (!cancelled) {
          setHealth(healthPayload);
          setMobileShell(shellPayload);
          setApiState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiState("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setApiKeys([]);
      setKeySyncState("idle");
      return;
    }

    let cancelled = false;
    setKeySyncState("loading");
    setKeyError(null);

    listApiKeys()
      .then((payload) => {
        if (!cancelled) {
          setApiKeys(payload.keys);
          setKeySyncState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setKeySyncState("error");
          setKeyError(
            error instanceof ApiRequestError && error.code === "KEY_ENCRYPTION_NOT_CONFIGURED"
              ? "Key 加密配置未启用。"
              : "Key 状态同步失败，请稍后重试。",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const activeRoute = useMemo(
    () =>
      (mobileShell?.routes ?? mobileRoutes).find((route) => route.key === activeRouteKey) ??
      fallbackRoute,
    [activeRouteKey, mobileShell],
  );

  const ActiveIcon = iconByRoute[activeRoute.key];
  const selectedKey = keyByPlatform(apiKeys, selectedPlatform);

  function setPlatformForm(platform: ApiKeyPlatform, patch: Partial<ApiKeyFormState>) {
    setKeyForms((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        ...patch,
      },
    }));
  }

  async function reloadApiKeys() {
    const payload = await listApiKeys();
    setApiKeys(payload.keys);
    setKeySyncState("ready");
  }

  async function handleSaveApiKey(platform: ApiKeyPlatform) {
    const form = keyForms[platform];
    const apiKey = form.apiKey.trim();
    const label = form.label.trim() || null;
    const existing = keyByPlatform(apiKeys, platform);

    if (!apiKey) {
      setKeyError("请输入 Key。");
      return;
    }

    setKeySavingPlatform(platform);
    setKeyError(null);

    try {
      if (existing) {
        await updateApiKey(platform, { platform, apiKey, label });
      } else {
        await createApiKey({ platform, apiKey, label });
      }

      setPlatformForm(platform, { apiKey: "" });
      await reloadApiKeys();
    } catch (error) {
      setKeyError(
        error instanceof ApiRequestError && error.code === "KEY_ENCRYPTION_NOT_CONFIGURED"
          ? "Key 加密配置未启用。"
          : "Key 保存失败，请检查后重试。",
      );
    } finally {
      setKeySavingPlatform(null);
    }
  }

  async function handleDeleteApiKey(platform: ApiKeyPlatform) {
    setKeySavingPlatform(platform);
    setKeyError(null);

    try {
      await deleteApiKey(platform);
      await reloadApiKeys();
    } catch {
      setKeyError("Key 删除失败，请稍后重试。");
    } finally {
      setKeySavingPlatform(null);
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setFormError("请输入有效的邮箱地址。");
      return;
    }

    setSubmitState("submitting");
    setFormError(null);

    try {
      if (authMode === "login") {
        const payload = await requestLogin();
        window.location.assign(payload.loginUrl);
        return;
      }

      const payload = await requestRegister(normalizedEmail);
      setUser(payload.user);
      setAuthStatus("authenticated");
    } catch (error) {
      if (error instanceof ApiRequestError && error.loginUrl) {
        window.location.assign(error.loginUrl);
        return;
      }

      if (error instanceof ApiRequestError && error.code === "AUTH_NOT_CONFIGURED") {
        setFormError("认证服务暂未配置，请稍后再试。");
      } else if (error instanceof ApiRequestError && error.code === "INVALID_EMAIL") {
        setFormError("邮箱格式不正确。");
      } else {
        setFormError("请求失败，请检查网络后重试。");
      }
      setSubmitState("idle");
    }
  }

  if (authStatus === "checking") {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-panel" aria-live="polite">
          <Loader2 className="spin" size={26} />
          <h1>正在校验登录态</h1>
          <p>请稍候，正在从云端读取会话。</p>
        </section>
      </main>
    );
  }

  if (authStatus === "guest") {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-icon" aria-hidden="true">
            <ShieldCheck size={28} />
          </div>
          <p className="eyebrow">账号访问</p>
          <h1 id="auth-title">{authMode === "login" ? "登录" : "注册"}</h1>
          <p className="auth-copy">
            使用邮箱完成身份校验。提交后会跳转到平台认证页，认证成功后回到当前应用。
          </p>

          <div className="segmented" role="tablist" aria-label="账号操作">
            <button
              type="button"
              className={authMode === "login" ? "segment segment-active" : "segment"}
              aria-selected={authMode === "login"}
              onClick={() => {
                setAuthMode("login");
                setFormError(null);
              }}
            >
              登录
            </button>
            <button
              type="button"
              className={authMode === "register" ? "segment segment-active" : "segment"}
              aria-selected={authMode === "register"}
              onClick={() => {
                setAuthMode("register");
                setFormError(null);
              }}
            >
              注册
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit} noValidate>
            <label htmlFor="email">邮箱</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              aria-invalid={Boolean(formError)}
              onChange={(event) => setEmail(event.target.value)}
            />

            {formError ? (
              <p className="form-error" role="alert">
                <AlertCircle size={16} />
                {formError}
              </p>
            ) : null}

            <button
              className="primary-action"
              type="submit"
              disabled={submitState === "submitting"}
            >
              {submitState === "submitting" ? (
                <Loader2 className="spin" size={19} />
              ) : (
                <LogIn size={19} />
              )}
              <span>{authMode === "login" ? "继续登录" : "继续注册"}</span>
              <ArrowRight size={18} />
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="screen-title">
        <div className="topbar">
          <div>
            <p className="eyebrow">已登录</p>
            <h1 id="screen-title">查询工作台</h1>
          </div>
          <div className={`status-pill status-${apiState}`}>
            <span aria-hidden="true" />
            {statusLabel(apiState)}
          </div>
        </div>

        {user ? (
          <div className="profile-strip">
            {user.pictureUrl ? (
              <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <div className="avatar-fallback" aria-hidden="true">
                <UserRound size={22} />
              </div>
            )}
            <div>
              <strong>{userDisplayName(user)}</strong>
              <span>{user.email}</span>
            </div>
          </div>
        ) : null}

        <section className="platform-switcher" aria-label="当前查询平台">
          {apiKeyPlatforms.map((platform) => {
            const hasKey = Boolean(keyByPlatform(apiKeys, platform));
            const selected = platform === selectedPlatform;

            return (
              <button
                key={platform}
                type="button"
                className={selected ? "platform-option platform-active" : "platform-option"}
                aria-pressed={selected}
                onClick={() => setSelectedPlatform(platform)}
              >
                <span>{platformLabels[platform]}</span>
                <small>{hasKey ? "已同步" : "未配置"}</small>
              </button>
            );
          })}
        </section>

        {activeRoute.key === "keys" ? (
          <section className="key-settings" aria-labelledby="key-settings-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">当前平台 {platformLabels[selectedPlatform]}</p>
                <h2 id="key-settings-title">Key 管理</h2>
              </div>
              <div className={`sync-pill sync-${keySyncState}`}>
                {keySyncState === "loading" ? <Loader2 className="spin" size={15} /> : null}
                {keySyncState === "ready" ? <CheckCircle2 size={15} /> : null}
                <span>
                  {keySyncState === "ready"
                    ? "已同步"
                    : keySyncState === "loading"
                      ? "同步中"
                      : keySyncState === "error"
                        ? "同步失败"
                        : "待同步"}
                </span>
              </div>
            </div>

            {keyError ? (
              <p className="form-error key-error" role="alert">
                <AlertCircle size={16} />
                {keyError}
              </p>
            ) : null}

            <div className="key-grid">
              {apiKeyPlatforms.map((platform) => {
                const storedKey = keyByPlatform(apiKeys, platform);
                const form = keyForms[platform];
                const saving = keySavingPlatform === platform;

                return (
                  <article
                    key={platform}
                    className={
                      platform === selectedPlatform ? "key-card key-card-active" : "key-card"
                    }
                  >
                    <div className="key-card-head">
                      <div>
                        <h3>{platformLabels[platform]}</h3>
                        <span>{storedKey ? storedKey.maskedKey : "未配置"}</span>
                      </div>
                      <button
                        type="button"
                        className="icon-action"
                        title="选择平台"
                        aria-label={`选择${platformLabels[platform]}`}
                        onClick={() => setSelectedPlatform(platform)}
                      >
                        <KeyRound size={18} />
                      </button>
                    </div>

                    <label htmlFor={`${platform}-label`}>名称</label>
                    <input
                      id={`${platform}-label`}
                      type="text"
                      maxLength={80}
                      value={form.label}
                      onChange={(event) => setPlatformForm(platform, { label: event.target.value })}
                    />

                    <label htmlFor={`${platform}-key`}>Key</label>
                    <input
                      id={`${platform}-key`}
                      type="password"
                      autoComplete="off"
                      placeholder={storedKey ? "输入新 Key 更新" : "输入 Key"}
                      value={form.apiKey}
                      onChange={(event) =>
                        setPlatformForm(platform, { apiKey: event.target.value })
                      }
                    />

                    <div className="key-actions">
                      <button
                        type="button"
                        className="save-action"
                        disabled={saving}
                        onClick={() => void handleSaveApiKey(platform)}
                      >
                        {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
                        <span>{storedKey ? "更新" : "保存"}</span>
                      </button>
                      <button
                        type="button"
                        className="danger-action"
                        disabled={saving || !storedKey}
                        onClick={() => void handleDeleteApiKey(platform)}
                      >
                        <Trash2 size={17} />
                        <span>删除</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="panel">
            <div className="panel-title">
              <ActiveIcon size={22} />
              <div>
                <h2>{activeRoute.label}</h2>
                <p>{activeRoute.apiNamespace}</p>
              </div>
            </div>
            <p className="panel-copy">{routeDescription(activeRoute)}</p>
            <div className="route-meta">
              <span>当前平台 {platformLabels[selectedPlatform]}</span>
              <span>{selectedKey ? `Key ${selectedKey.maskedKey}` : "Key 未配置"}</span>
            </div>
          </div>
        )}

        <div className="structure-list" aria-label="云端数据">
          <div>
            <strong>会话</strong>
            <span>{user ? "已同步" : "未同步"}</span>
          </div>
          <div>
            <strong>导航</strong>
            <span>{mobileShell ? `${mobileShell.routes.length} 个入口` : "加载中"}</span>
          </div>
          <div>
            <strong>会员</strong>
            <span>{user?.membershipStatus ?? "none"}</span>
          </div>
        </div>

        {health ? (
          <p className="health-line">
            服务版本 {health.version}, 已运行 {health.uptimeSeconds}s, 数据库{" "}
            {health.database.latencyMs}ms
          </p>
        ) : (
          <p className="health-line health-warning">
            <RefreshCw size={14} />
            云端数据仍在加载或暂不可用。
          </p>
        )}
      </section>

      <nav className="bottom-tabs" aria-label="主导航">
        {(mobileShell?.routes ?? mobileRoutes).map((route) => {
          const Icon = iconByRoute[route.key];
          const selected = route.key === activeRouteKey;

          return (
            <button
              key={route.key}
              className={selected ? "tab tab-active" : "tab"}
              type="button"
              aria-current={selected ? "page" : undefined}
              title={route.label}
              onClick={() => setActiveRouteKey(route.key)}
            >
              <Icon size={20} />
              <span>{route.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
