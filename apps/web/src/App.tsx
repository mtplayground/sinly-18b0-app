import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Crown,
  Download,
  KeyRound,
  LockKeyhole,
  Loader2,
  LogIn,
  type LucideIcon,
  MapPin,
  MapPinned,
  Phone,
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
  BatchKeywordSearchResponse,
  HealthResponse,
  KeywordSearchResponse,
  MapPoiResult,
  MobileRouteDefinition,
  MobileRouteKey,
  PublicUser,
  RegionSelection,
  ResultExportFormat,
} from "@sinly/shared";
import { apiKeyPlatforms, chinaRegions, findRegionSelection, mobileRoutes } from "@sinly/shared";
import {
  ApiRequestError,
  createApiKey,
  deleteApiKey,
  exportResults,
  getSession,
  listApiKeys,
  loadHealth,
  loadMobileShell,
  requestLogin,
  requestRegister,
  searchByKeyword,
  searchByKeywords,
  updateApiKey,
  type MobileShellResponse,
} from "./api";

type ApiState = "checking" | "ready" | "offline";
type AuthMode = "login" | "register";
type AuthStatus = "checking" | "guest" | "authenticated";
type SubmitState = "idle" | "submitting";
type KeySyncState = "idle" | "loading" | "ready" | "error";
type QueryState = "idle" | "searching" | "done" | "error";
type QueryMode = "single" | "batch";
type ExportState = "idle" | "exporting" | "error";

interface ApiKeyFormState {
  apiKey: string;
  label: string;
}

const defaultRoute = mobileRoutes[0] as MobileRouteDefinition | undefined;

if (!defaultRoute) {
  throw new Error("At least one mobile route must be defined");
}

const fallbackRoute: MobileRouteDefinition = defaultRoute;

function firstOrThrow<Item>(items: readonly Item[], message: string): Item {
  const item = items[0];
  if (!item) {
    throw new Error(message);
  }

  return item;
}

const defaultProvince = firstOrThrow(chinaRegions, "At least one China region must be defined");
const defaultCity = firstOrThrow(defaultProvince.cities, "At least one city must be defined");
const defaultCounty = firstOrThrow(defaultCity.counties, "At least one county must be defined");

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

const FREE_RESULT_LIMIT = 10;
const MAX_BATCH_KEYWORDS = 5;

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
    results: "展示去重后的查询结果，并对电话、地址等字段做格式整理。",
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

function resultPhone(result: MapPoiResult): string {
  return result.contact.phone ?? "暂无电话";
}

function resultAddress(result: MapPoiResult): string {
  return result.address ?? [result.province, result.city, result.district].filter(Boolean).join("");
}

function resultRegion(result: MapPoiResult): string {
  return (
    [result.province, result.city, result.district].filter(Boolean).join(" / ") || "地区未返回"
  );
}

function parseBatchKeywords(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function isBatchSearch(
  search: KeywordSearchResponse | BatchKeywordSearchResponse,
): search is BatchKeywordSearchResponse {
  return "batch" in search && search.batch;
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
  const [selectedProvinceCode, setSelectedProvinceCode] = useState(defaultProvince.code);
  const [selectedCityCode, setSelectedCityCode] = useState(defaultCity.code);
  const [selectedCountyCode, setSelectedCountyCode] = useState(defaultCounty.code);
  const [queryMode, setQueryMode] = useState<QueryMode>("single");
  const [keyword, setKeyword] = useState("");
  const [batchKeywords, setBatchKeywords] = useState("");
  const [queryState, setQueryState] = useState<QueryState>("idle");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [latestSearch, setLatestSearch] = useState<
    KeywordSearchResponse | BatchKeywordSearchResponse | null
  >(null);

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
  const isAnnualMember = user?.membershipStatus === "active";
  const visibleResults = latestSearch
    ? latestSearch.results.slice(
        0,
        isAnnualMember ? latestSearch.results.length : FREE_RESULT_LIMIT,
      )
    : [];
  const lockedResultCount = latestSearch
    ? Math.max(
        (latestSearch.total ?? latestSearch.results.length) -
          (isAnnualMember ? latestSearch.results.length : FREE_RESULT_LIMIT),
        0,
      )
    : 0;
  const selectedRegion: RegionSelection = findRegionSelection(
    selectedProvinceCode,
    selectedCityCode,
    selectedCountyCode,
  );
  const availableCities = selectedRegion.province.cities;
  const availableCounties = selectedRegion.city.counties;
  const regionPath = `${selectedRegion.province.name} / ${selectedRegion.city.name} / ${selectedRegion.county.name}`;

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

  async function handleKeywordSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      setQueryState("error");
      setQueryError("请输入关键词。");
      return;
    }

    if (!selectedKey) {
      setQueryState("error");
      setQueryError(
        `当前平台未配置 Key，请先在 Key 页保存${platformLabels[selectedPlatform]} Key。`,
      );
      return;
    }

    setQueryState("searching");
    setQueryError(null);

    try {
      const payload = await searchByKeyword({
        platform: selectedPlatform,
        keyword: normalizedKeyword,
        province: selectedRegion.province.name,
        city: selectedRegion.city.name,
        district: selectedRegion.county.name,
        page: 1,
        pageSize: 20,
      });

      setLatestSearch(payload);
      setExportError(null);
      setExportState("idle");
      setQueryState("done");
      setActiveRouteKey("results");
    } catch (error) {
      setQueryState("error");

      if (error instanceof ApiRequestError && error.loginUrl) {
        setQueryError("请先登录后再查询。");
        return;
      }

      if (error instanceof ApiRequestError && error.code === "MAP_API_KEY_NOT_FOUND") {
        setQueryError(
          `当前平台未配置 Key，请先在 Key 页保存${platformLabels[selectedPlatform]} Key。`,
        );
        return;
      }

      if (error instanceof ApiRequestError && error.code === "INVALID_MAP_SEARCH_REQUEST") {
        setQueryError("查询条件不完整，请检查平台和关键词。");
        return;
      }

      setQueryError("查询失败，请稍后重试。");
    }
  }

  async function handleBatchKeywordSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAnnualMember) {
      setQueryState("error");
      setQueryError("批量关键词查询仅年会员可用。");
      return;
    }

    const keywords = parseBatchKeywords(batchKeywords);
    if (keywords.length < 2) {
      setQueryState("error");
      setQueryError("请至少输入 2 个关键词。");
      return;
    }

    if (keywords.length > MAX_BATCH_KEYWORDS) {
      setQueryState("error");
      setQueryError(`每次最多提交 ${MAX_BATCH_KEYWORDS} 个关键词。`);
      return;
    }

    if (!selectedKey) {
      setQueryState("error");
      setQueryError(
        `当前平台未配置 Key，请先在 Key 页保存${platformLabels[selectedPlatform]} Key。`,
      );
      return;
    }

    setQueryState("searching");
    setQueryError(null);

    try {
      const payload = await searchByKeywords({
        platform: selectedPlatform,
        keywords,
        province: selectedRegion.province.name,
        city: selectedRegion.city.name,
        district: selectedRegion.county.name,
        pageSize: 20,
      });

      setLatestSearch(payload);
      setExportError(null);
      setExportState("idle");
      setQueryState("done");
      setActiveRouteKey("results");
    } catch (error) {
      setQueryState("error");

      if (error instanceof ApiRequestError && error.loginUrl) {
        setQueryError("请先登录后再查询。");
        return;
      }

      if (error instanceof ApiRequestError && error.code === "MEMBERSHIP_REQUIRED") {
        setQueryError("批量关键词查询仅年会员可用。");
        return;
      }

      if (error instanceof ApiRequestError && error.code === "MAP_API_KEY_NOT_FOUND") {
        setQueryError(
          `当前平台未配置 Key，请先在 Key 页保存${platformLabels[selectedPlatform]} Key。`,
        );
        return;
      }

      if (error instanceof ApiRequestError && error.code === "INVALID_BATCH_MAP_SEARCH_REQUEST") {
        setQueryError("批量查询条件不完整，请检查平台、关键词数量和地区。");
        return;
      }

      setQueryError("批量查询失败，请稍后重试。");
    }
  }

  async function handleExportResults(format: ResultExportFormat) {
    if (!latestSearch) {
      setExportState("error");
      setExportError("暂无可导出的结果。");
      return;
    }

    if (!isAnnualMember) {
      setExportState("error");
      setExportError("导出 Excel/CSV 仅年会员可用。");
      return;
    }

    setExportState("exporting");
    setExportError(null);

    try {
      const download = await exportResults({
        format,
        title: isBatchSearch(latestSearch)
          ? `批量查询-${latestSearch.keywords.join("-")}`
          : latestSearch.keyword,
        results: latestSearch.results,
      });
      const url = URL.createObjectURL(download.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = download.filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setExportState("idle");
    } catch (error) {
      setExportState("error");

      if (error instanceof ApiRequestError && error.code === "MEMBERSHIP_REQUIRED") {
        setExportError("导出 Excel/CSV 仅年会员可用。");
        return;
      }

      if (error instanceof ApiRequestError && error.code === "INVALID_EXPORT_REQUEST") {
        setExportError("导出内容为空或格式不正确。");
        return;
      }

      setExportError("导出失败，请稍后重试。");
    }
  }

  function handleProvinceChange(provinceCode: string) {
    const province = chinaRegions.find((item) => item.code === provinceCode) ?? defaultProvince;
    const city = firstOrThrow(province.cities, "At least one city must be defined");
    const county = firstOrThrow(city.counties, "At least one county must be defined");

    setSelectedProvinceCode(province.code);
    setSelectedCityCode(city.code);
    setSelectedCountyCode(county.code);
  }

  function handleCityChange(cityCode: string) {
    const city = availableCities.find((item) => item.code === cityCode) ?? availableCities[0];
    if (!city) {
      return;
    }

    const county = city.counties[0];
    if (!county) {
      return;
    }

    setSelectedCityCode(city.code);
    setSelectedCountyCode(county.code);
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

        {activeRoute.key === "query" ? (
          <section className="query-panel" aria-labelledby="query-title">
            <div className="panel-title">
              <ActiveIcon size={22} />
              <div>
                <h2 id="query-title">关键词查询</h2>
                <p>{activeRoute.apiNamespace}</p>
              </div>
            </div>
            <p className="panel-copy">{routeDescription(activeRoute)}</p>

            <div className="region-select-grid">
              <label htmlFor="province-select">
                <span>省</span>
                <select
                  id="province-select"
                  value={selectedProvinceCode}
                  onChange={(event) => handleProvinceChange(event.target.value)}
                >
                  {chinaRegions.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.name}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="city-select">
                <span>市</span>
                <select
                  id="city-select"
                  value={selectedRegion.city.code}
                  onChange={(event) => handleCityChange(event.target.value)}
                >
                  {availableCities.map((city) => (
                    <option key={city.code} value={city.code}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="county-select">
                <span>县 / 区</span>
                <select
                  id="county-select"
                  value={selectedRegion.county.code}
                  onChange={(event) => setSelectedCountyCode(event.target.value)}
                >
                  {availableCounties.map((county) => (
                    <option key={county.code} value={county.code}>
                      {county.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="region-current" aria-label="当前地区">
              <strong>{selectedRegion.county.name}</strong>
              <span>{regionPath}</span>
              <small>行政区划代码 {selectedRegion.county.code}</small>
            </div>

            <div className="query-mode-switch" role="tablist" aria-label="查询模式">
              <button
                type="button"
                className={queryMode === "single" ? "query-mode-active" : ""}
                aria-selected={queryMode === "single"}
                onClick={() => {
                  setQueryMode("single");
                  setQueryError(null);
                  setQueryState("idle");
                }}
              >
                单个关键词
              </button>
              <button
                type="button"
                className={queryMode === "batch" ? "query-mode-active" : ""}
                aria-selected={queryMode === "batch"}
                onClick={() => {
                  setQueryMode("batch");
                  setQueryError(null);
                  setQueryState("idle");
                }}
              >
                批量关键词
              </button>
            </div>

            {queryMode === "single" ? (
              <form className="keyword-form" onSubmit={handleKeywordSearch} noValidate>
                <label htmlFor="keyword-input">关键词</label>
                <div className="keyword-input-row">
                  <input
                    id="keyword-input"
                    type="search"
                    maxLength={80}
                    enterKeyHint="search"
                    placeholder="餐饮、酒店、汽修、公司名"
                    value={keyword}
                    aria-invalid={Boolean(queryError)}
                    onChange={(event) => {
                      setKeyword(event.target.value);
                      if (queryError) {
                        setQueryError(null);
                        setQueryState("idle");
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="query-submit"
                    disabled={queryState === "searching"}
                    title="查询"
                    aria-label="查询"
                  >
                    {queryState === "searching" ? (
                      <Loader2 className="spin" size={20} />
                    ) : (
                      <Search size={20} />
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form className="keyword-form" onSubmit={handleBatchKeywordSearch} noValidate>
                <label htmlFor="batch-keyword-input">
                  批量关键词
                  <small>最多 {MAX_BATCH_KEYWORDS} 个，逐行或逗号分隔</small>
                </label>
                <textarea
                  id="batch-keyword-input"
                  rows={5}
                  maxLength={500}
                  placeholder="餐饮&#10;酒店&#10;汽修"
                  value={batchKeywords}
                  aria-invalid={Boolean(queryError)}
                  disabled={!isAnnualMember}
                  onChange={(event) => {
                    setBatchKeywords(event.target.value);
                    if (queryError) {
                      setQueryError(null);
                      setQueryState("idle");
                    }
                  }}
                />
                <button
                  type="submit"
                  className="batch-submit"
                  disabled={queryState === "searching" || !isAnnualMember}
                >
                  {queryState === "searching" ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                  <span>批量查询</span>
                </button>
              </form>
            )}

            {queryError ? (
              <p className="form-error" role="alert">
                <AlertCircle size={16} />
                {queryError}
              </p>
            ) : null}

            {queryMode === "batch" && !isAnnualMember ? (
              <div className="locked-results" role="note">
                <div>
                  <LockKeyhole size={20} />
                </div>
                <div>
                  <strong>批量关键词查询为年会员权益</strong>
                  <span>开通后可一次提交多个关键词，并合并官方 API 返回结果。</span>
                </div>
                <button
                  type="button"
                  className="upgrade-action"
                  onClick={() => setActiveRouteKey("membership")}
                >
                  <Crown size={17} />
                  <span>升级年会员</span>
                </button>
              </div>
            ) : null}

            {!selectedKey ? (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setActiveRouteKey("keys")}
              >
                <KeyRound size={17} />
                <span>配置{platformLabels[selectedPlatform]} Key</span>
              </button>
            ) : null}
          </section>
        ) : activeRoute.key === "keys" ? (
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
        ) : activeRoute.key === "results" ? (
          <section className="results-panel" aria-labelledby="results-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {latestSearch
                    ? `${platformLabels[latestSearch.platform]} · ${latestSearch.region.district ?? "全部区域"}`
                    : "等待查询"}
                </p>
                <h2 id="results-title">结果列表</h2>
              </div>
              <div className={isAnnualMember ? "member-pill member-active" : "member-pill"}>
                {isAnnualMember ? <Crown size={15} /> : <LockKeyhole size={15} />}
                <span>{isAnnualMember ? "年会员" : `免费前 ${FREE_RESULT_LIMIT}`}</span>
              </div>
            </div>

            {!latestSearch ? (
              <div className="empty-results">
                <Search size={24} />
                <strong>暂无查询结果</strong>
                <span>先在查询页选择平台、地区并输入关键词。</span>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setActiveRouteKey("query")}
                >
                  <Search size={17} />
                  <span>去查询</span>
                </button>
              </div>
            ) : (
              <>
                <div className="search-arrival" aria-label="最近一次查询">
                  <strong>
                    {isBatchSearch(latestSearch)
                      ? `批量 ${latestSearch.keywords.length} 个关键词`
                      : latestSearch.keyword}
                  </strong>
                  {isBatchSearch(latestSearch) ? (
                    <span>{latestSearch.keywords.join(" / ")}</span>
                  ) : null}
                  <span>
                    {platformLabels[latestSearch.platform]} · {latestSearch.region.province ?? "-"}{" "}
                    / {latestSearch.region.city ?? "-"} / {latestSearch.region.district ?? "-"}
                  </span>
                  <small>
                    已返回 {latestSearch.results.length} 条
                    {isBatchSearch(latestSearch)
                      ? ` / ${latestSearch.searches.length} 次官方查询`
                      : latestSearch.total !== null
                        ? ` / 官方总数 ${latestSearch.total}`
                        : ""}
                  </small>
                  {isAnnualMember ? <small>已自动去重并整理电话、地址格式</small> : null}
                </div>

                <div className="export-panel" role="note">
                  <div>
                    <strong>导出整理结果</strong>
                    <span>仅在合法授权范围内使用，避免超范围留存或共享个人信息。</span>
                  </div>
                  {isAnnualMember ? (
                    <div className="export-actions">
                      <button
                        type="button"
                        disabled={exportState === "exporting" || latestSearch.results.length === 0}
                        onClick={() => void handleExportResults("csv")}
                      >
                        {exportState === "exporting" ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                        <span>CSV</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportState === "exporting" || latestSearch.results.length === 0}
                        onClick={() => void handleExportResults("excel")}
                      >
                        {exportState === "exporting" ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Download size={16} />
                        )}
                        <span>Excel</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="upgrade-action"
                      onClick={() => setActiveRouteKey("membership")}
                    >
                      <Crown size={17} />
                      <span>升级导出</span>
                    </button>
                  )}
                </div>

                {exportError ? (
                  <p className="form-error" role="alert">
                    <AlertCircle size={16} />
                    {exportError}
                  </p>
                ) : null}

                {visibleResults.length > 0 ? (
                  <div className="result-list" aria-label="查询结果">
                    {visibleResults.map((result, index) => (
                      <article
                        className="result-card"
                        key={`${result.provider}-${result.providerPoiId}`}
                      >
                        <div className="result-rank">{index + 1}</div>
                        <div className="result-content">
                          <div className="result-head">
                            <h3>{result.name}</h3>
                            {result.category ? <span>{result.category}</span> : null}
                          </div>
                          <p>
                            <Phone size={15} />
                            <span>{resultPhone(result)}</span>
                          </p>
                          <p>
                            <MapPin size={15} />
                            <span>{resultAddress(result) || resultRegion(result)}</span>
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-results">
                    <MapPinned size={24} />
                    <strong>未返回匹配商家</strong>
                    <span>可以调整关键词或缩小地区后重新查询。</span>
                  </div>
                )}

                {!isAnnualMember && lockedResultCount > 0 ? (
                  <div className="locked-results" role="note">
                    <div>
                      <LockKeyhole size={20} />
                    </div>
                    <div>
                      <strong>还有 {lockedResultCount} 条结果已锁定</strong>
                      <span>开通年会员后展示全部查询结果，并解锁后续批量与导出能力。</span>
                    </div>
                    <button
                      type="button"
                      className="upgrade-action"
                      onClick={() => setActiveRouteKey("membership")}
                    >
                      <Crown size={17} />
                      <span>升级年会员</span>
                    </button>
                  </div>
                ) : null}
              </>
            )}
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
              <span>当前地区 {regionPath}</span>
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
            <strong>地区</strong>
            <span>{selectedRegion.county.name}</span>
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
