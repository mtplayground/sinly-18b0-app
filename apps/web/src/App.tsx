import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Crown,
  CreditCard,
  Download,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  Loader2,
  LogIn,
  type LucideIcon,
  MapPin,
  MapPinned,
  Phone,
  QrCode,
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
  PaymentOrderSummary,
  PaymentProvider,
  PublicUser,
  RegionSelection,
  ResultExportFormat,
  SearchHistoryItem,
} from "@sinly/shared";
import { apiKeyPlatforms, chinaRegions, findRegionSelection, mobileRoutes } from "@sinly/shared";
import {
  ApiRequestError,
  createApiKey,
  createPaymentOrder,
  deleteApiKey,
  exportResults,
  getPaymentOrder,
  getSession,
  listSearchHistory,
  listApiKeys,
  loadHealth,
  loadMobileShell,
  requestLogin,
  searchByKeyword,
  searchByKeywords,
  updateApiKey,
  type MobileShellResponse,
} from "./api";

type ApiState = "checking" | "ready" | "offline";
type AuthStatus = "checking" | "guest" | "authenticated";
type SubmitState = "idle" | "submitting";
type KeySyncState = "idle" | "loading" | "ready" | "error";
type QueryState = "idle" | "searching" | "done" | "error";
type QueryMode = "single" | "batch";
type ExportState = "idle" | "exporting" | "error";
type PaymentState = "idle" | "creating" | "pending" | "checking" | "paid" | "error";
type HistoryState = "idle" | "loading" | "ready" | "error";

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
const ANNUAL_PRICE_CENTS = 19900;
const EXPORT_COMPLIANCE_NOTICE =
  "仅可在合法授权范围内使用导出数据，避免超范围留存、共享或处理个人信息。";

const paymentProviderLabels: Record<PaymentProvider, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
};

const membershipBenefits = [
  {
    title: "批量关键词查询",
    copy: "一次提交多个关键词，合并官方 API 返回结果。",
  },
  {
    title: "自动去重与整理",
    copy: "自动合并重复商家，并规范电话、地址字段。",
  },
  {
    title: "三平台 Key 管理",
    copy: "高德、百度、腾讯 Key 独立保存，按当前平台查询。",
  },
  {
    title: "Excel / CSV 导出",
    copy: "将整理后的结果导出，保留合规使用提示。",
  },
] as const;

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
    membership: "开通或续费年会员，解锁批量查询、整理与导出。",
    history: "查看云端同步的过往查询，并快速回看或再次发起。",
    profile: "查看账号资料、会员状态，并进入常用管理入口。",
  };

  return descriptions[route.key];
}

function userDisplayName(user: PublicUser): string {
  return user.name?.trim() || user.account || user.email;
}

function formatPrice(cents: number, currency = "CNY"): string {
  const amount = cents / 100;
  if (currency === "CNY") {
    return `¥${amount.toFixed(0)}`;
  }

  return `${currency} ${amount.toFixed(2)}`;
}

function paymentStatusLabel(order: PaymentOrderSummary | null): string {
  if (!order) {
    return "待下单";
  }

  if (order.status === "paid") {
    return "已支付";
  }

  if (order.status === "failed") {
    return "支付异常";
  }

  if (order.status === "cancelled") {
    return "已取消";
  }

  return "待支付";
}

function membershipStatusLabel(status: PublicUser["membershipStatus"] | undefined): string {
  if (status === "active") {
    return "年会员";
  }

  if (status === "expired") {
    return "已到期";
  }

  if (status === "cancelled") {
    return "已取消";
  }

  return "免费账号";
}

function formatProfileDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function historyRegionLabel(item: SearchHistoryItem): string {
  return [item.region.province, item.region.city, item.region.district].filter(Boolean).join(" / ");
}

function splitHistoryKeywords(item: SearchHistoryItem): string[] {
  return item.keyword
    .split("/")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function findRegionCodesByNames(item: SearchHistoryItem): {
  provinceCode: string;
  cityCode: string;
  countyCode: string;
} {
  const province =
    chinaRegions.find((region) => region.name === item.region.province) ?? defaultProvince;
  const city =
    province.cities.find((regionCity) => regionCity.name === item.region.city) ??
    firstOrThrow(province.cities, "At least one city must be defined");
  const county =
    city.counties.find((regionCounty) => regionCounty.name === item.region.district) ??
    firstOrThrow(city.counties, "At least one county must be defined");

  return {
    provinceCode: province.code,
    cityCode: city.code,
    countyCode: county.code,
  };
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

function friendlyApiMessage(error: unknown, fallback: string, platform?: ApiKeyPlatform): string {
  if (!(error instanceof ApiRequestError)) {
    return fallback;
  }

  const platformName = platform ? platformLabels[platform] : "当前平台";
  const messages: Record<string, string> = {
    AUTH_NOT_CONFIGURED: "认证服务暂未配置，请稍后再试。",
    INVALID_EMAIL: "邮箱格式不正确。",
    KEY_ENCRYPTION_NOT_CONFIGURED: "Key 加密配置未启用，请联系管理员检查服务配置。",
    API_KEY_ALREADY_EXISTS: `${platformName} Key 已存在，如需更换请使用更新。`,
    API_KEY_NOT_FOUND: `${platformName} Key 不存在，请重新保存后再试。`,
    MAP_API_KEY_NOT_FOUND: `${platformName}未配置 Key，请先在 Key 页保存官方地图 Key。`,
    MAP_API_KEY_INVALID: `${platformName} Key 无效或未开通当前接口，请检查 Key 后重试。`,
    MAP_PROVIDER_QUOTA_EXCEEDED: `${platformName} 官方额度已用尽或触发限频，请在平台控制台确认配额后再试。`,
    MAP_PROVIDER_TIMEOUT: "地图服务响应超时，请稍后重试。",
    MAP_PROVIDER_NETWORK_ERROR: "地图服务网络异常，请检查网络或稍后重试。",
    MAP_PROVIDER_ERROR: `${platformName} 查询失败，请稍后重试或切换平台 Key。`,
    INVALID_MAP_SEARCH_REQUEST: "查询条件不完整，请检查平台、地区和关键词。",
    INVALID_BATCH_MAP_SEARCH_REQUEST: "批量查询条件不完整，请检查平台、关键词数量和地区。",
    MEMBERSHIP_REQUIRED: "该功能仅年会员可用，请开通或续费后继续。",
    INVALID_EXPORT_REQUEST: "导出内容为空或格式不正确。",
    INVALID_PAYMENT_PROVIDER: "请选择支付方式。",
    PAYMENT_SIGNATURE_INVALID: "支付回调校验失败，请稍后刷新订单状态。",
    PAYMENT_ORDER_NOT_FOUND: "支付订单不存在，请重新下单。",
  };

  return messages[error.code] ?? error.message ?? fallback;
}

function MctaiWatermark() {
  const [shouldRender, setShouldRender] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");

  useEffect(() => {
    setShouldRender(!document.getElementById("mctai-watermark"));
  }, []);

  async function handleShare() {
    const payload = {
      title: document.title || "Ideavibes app",
      text: "Built with Ideavibes.ai",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setShareLabel("Copied");
        window.setTimeout(() => setShareLabel("Share"), 1600);
      }
    } catch {
      setShareLabel("Share");
    }
  }

  if (!shouldRender) {
    return null;
  }

  return (
    <div id="mctai-watermark" className="mctai-watermark">
      <a href="https://ideavibes.ai" target="_blank" rel="noopener noreferrer">
        Built by Ideavibes.ai
      </a>
      <button type="button" onClick={() => void handleShare()}>
        {shareLabel}
      </button>
    </div>
  );
}

export function App() {
  const [activeRouteKey, setActiveRouteKey] = useState<MobileRouteKey>("query");
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
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
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>("alipay");
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrderSummary | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    getSession()
      .then((payload) => {
        if (!cancelled) {
          if (payload.authenticated) {
            setUser(payload.user);
            setAuthStatus("authenticated");
          } else {
            setAuthStatus("guest");
          }
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
          setKeyError(friendlyApiMessage(error, "Key 状态同步失败，请稍后重试。"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setSearchHistory([]);
      setHistoryState("idle");
      return;
    }

    if (activeRouteKey !== "history") {
      return;
    }

    let cancelled = false;
    setHistoryState("loading");
    setHistoryError(null);

    listSearchHistory()
      .then((payload) => {
        if (!cancelled) {
          setSearchHistory(payload.history);
          setHistoryState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setHistoryState("error");
          setHistoryError(
            error instanceof ApiRequestError && error.loginUrl
              ? "请先登录后查看查询历史。"
              : "查询历史加载失败，请稍后重试。",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeRouteKey, authStatus]);

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
  const annualPrice = formatPrice(
    paymentOrder?.amountCents ?? ANNUAL_PRICE_CENTS,
    paymentOrder?.currency,
  );

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
      setKeyError(friendlyApiMessage(error, "Key 保存失败，请检查后重试。", platform));
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

      setQueryError(friendlyApiMessage(error, "查询失败，请稍后重试。", selectedPlatform));
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

      setQueryError(friendlyApiMessage(error, "批量查询失败，请稍后重试。", selectedPlatform));
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
      const acceptedCompliance = window.confirm(EXPORT_COMPLIANCE_NOTICE);
      if (!acceptedCompliance) {
        setExportState("idle");
        return;
      }

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
      if (download.complianceNotice) {
        setExportError(null);
      }
      setExportState("idle");
    } catch (error) {
      setExportState("error");

      setExportError(friendlyApiMessage(error, "导出失败，请稍后重试。"));
    }
  }

  async function refreshSessionUser() {
    const payload = await getSession();
    if (payload.authenticated) {
      setUser(payload.user);
      setAuthStatus("authenticated");
    } else {
      setUser(null);
      setAuthStatus("guest");
    }
  }

  async function handleCreatePaymentOrder() {
    setPaymentState("creating");
    setPaymentError(null);
    setPaymentNotice(null);

    try {
      const payload = await createPaymentOrder({ provider: paymentProvider });
      setPaymentOrder(payload.order);

      if (payload.paymentUrl) {
        setPaymentState("pending");
        setPaymentNotice("支付订单已创建，正在打开支付页。");
        window.location.assign(payload.paymentUrl);
        return;
      }

      setPaymentState("pending");
      setPaymentNotice(
        payload.configured ? payload.message : "支付服务暂未配置，订单已创建但暂不能跳转付款。",
      );
    } catch (error) {
      setPaymentState("error");

      if (error instanceof ApiRequestError && error.loginUrl) {
        window.location.assign(error.loginUrl);
        return;
      }

      setPaymentError(friendlyApiMessage(error, "创建支付订单失败，请稍后重试。"));
    }
  }

  async function handleRefreshPaymentOrder() {
    if (!paymentOrder) {
      setPaymentNotice("暂无支付订单。");
      return;
    }

    setPaymentState("checking");
    setPaymentError(null);
    setPaymentNotice(null);

    try {
      const payload = await getPaymentOrder(paymentOrder.id);
      setPaymentOrder(payload.order);

      if (payload.order.status === "paid") {
        setPaymentState("paid");
        setPaymentNotice("支付已确认，会员状态已刷新。");
        await refreshSessionUser();
        return;
      }

      if (payload.order.status === "failed" || payload.order.status === "cancelled") {
        setPaymentState("error");
        setPaymentError("支付未完成，请重新下单。");
        return;
      }

      setPaymentState("pending");
      setPaymentNotice("支付尚未确认，请完成支付后再刷新。");
    } catch (error) {
      setPaymentState("error");

      if (error instanceof ApiRequestError && error.loginUrl) {
        window.location.assign(error.loginUrl);
        return;
      }

      setPaymentError("支付状态刷新失败，请稍后重试。");
    }
  }

  function applyHistoryToQuery(item: SearchHistoryItem) {
    const regionCodes = findRegionCodesByNames(item);
    setSelectedPlatform(item.platform);
    setSelectedProvinceCode(regionCodes.provinceCode);
    setSelectedCityCode(regionCodes.cityCode);
    setSelectedCountyCode(regionCodes.countyCode);
    setQueryError(null);
    setQueryState("idle");

    if (item.searchMode === "batch") {
      setQueryMode("batch");
      setBatchKeywords(splitHistoryKeywords(item).join("\n"));
    } else {
      setQueryMode("single");
      setKeyword(item.keyword);
    }

    setActiveRouteKey("query");
  }

  async function handleReplayHistory(item: SearchHistoryItem) {
    const regionCodes = findRegionCodesByNames(item);
    const replayRegion = findRegionSelection(
      regionCodes.provinceCode,
      regionCodes.cityCode,
      regionCodes.countyCode,
    );
    const replayKey = keyByPlatform(apiKeys, item.platform);

    applyHistoryToQuery(item);

    if (!replayKey) {
      setQueryState("error");
      setQueryError(`当前平台未配置 Key，请先在 Key 页保存${platformLabels[item.platform]} Key。`);
      return;
    }

    if (item.searchMode === "batch" && !isAnnualMember) {
      setQueryState("error");
      setQueryError("批量关键词查询仅年会员可用。");
      return;
    }

    setQueryState("searching");
    setQueryError(null);

    try {
      if (item.searchMode === "batch") {
        const keywords = splitHistoryKeywords(item);
        const payload = await searchByKeywords({
          platform: item.platform,
          keywords,
          province: replayRegion.province.name,
          city: replayRegion.city.name,
          district: replayRegion.county.name,
          pageSize: 20,
        });

        setLatestSearch(payload);
      } else {
        const payload = await searchByKeyword({
          platform: item.platform,
          keyword: item.keyword,
          province: replayRegion.province.name,
          city: replayRegion.city.name,
          district: replayRegion.county.name,
          page: 1,
          pageSize: 20,
        });

        setLatestSearch(payload);
      }

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

      setQueryError(friendlyApiMessage(error, "再次查询失败，请稍后重试。", item.platform));
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

  async function handlePlatformLogin() {
    setSubmitState("submitting");
    setFormError(null);

    try {
      const payload = await requestLogin();
      window.location.assign(payload.loginUrl);
    } catch (error) {
      if (error instanceof ApiRequestError && error.loginUrl) {
        window.location.assign(error.loginUrl);
        return;
      }

      setFormError(friendlyApiMessage(error, "平台登录暂时不可用，请稍后重试。"));
      setSubmitState("idle");
    }
  }

  if (authStatus === "checking") {
    return (
      <>
        <main className="app-shell auth-shell">
          <section className="auth-panel" aria-live="polite">
            <Loader2 className="spin" size={26} />
            <h1>正在校验登录态</h1>
            <p>请稍候，正在从云端读取会话。</p>
          </section>
        </main>
        <MctaiWatermark />
      </>
    );
  }

  if (authStatus === "guest") {
    return (
      <>
        <main className="app-shell auth-shell">
          <section className="auth-panel" aria-labelledby="auth-title">
            <div className="auth-icon" aria-hidden="true">
              <ShieldCheck size={28} />
            </div>
            <p className="eyebrow">账号访问</p>
            <h1 id="auth-title">登录</h1>
            <p className="auth-copy">
              使用平台账号统一登录。邮箱与账号信息会在登录成功后从安全会话中读取。
            </p>

            <div className="auth-form">
              {formError ? (
                <p className="form-error" role="alert">
                  <AlertCircle size={16} />
                  {formError}
                </p>
              ) : null}

              <button
                className="primary-action"
                type="button"
                disabled={submitState === "submitting"}
                onClick={() => void handlePlatformLogin()}
              >
                {submitState === "submitting" ? (
                  <Loader2 className="spin" size={19} />
                ) : (
                  <LogIn size={19} />
                )}
                <span>使用平台账号登录</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </section>
        </main>
        <MctaiWatermark />
      </>
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
                    <span>{EXPORT_COMPLIANCE_NOTICE}</span>
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
        ) : activeRoute.key === "membership" ? (
          <section className="membership-panel" aria-labelledby="membership-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">年会员权益</p>
                <h2 id="membership-title">会员开通 / 续费</h2>
              </div>
              <div className={isAnnualMember ? "member-pill member-active" : "member-pill"}>
                {isAnnualMember ? <Crown size={15} /> : <LockKeyhole size={15} />}
                <span>{isAnnualMember ? "已开通" : "免费账号"}</span>
              </div>
            </div>

            <div className="membership-plan">
              <div className="plan-top">
                <div>
                  <span>一年期会员</span>
                  <strong className="price-line">
                    {annualPrice}
                    <small>/ 年</small>
                  </strong>
                </div>
                <ShieldCheck size={30} />
              </div>
              <p>
                解锁批量查询、结果整理、多 Key 管理与 Excel / CSV 导出，查询仍使用你的官方平台 Key
                与自有额度。
              </p>
            </div>

            {!isAnnualMember && lockedResultCount > 0 ? (
              <div className="membership-preview-bridge" role="note">
                <LockKeyhole size={18} />
                <span>
                  当前结果预览已展示 {visibleResults.length} 条，还有 {lockedResultCount}{" "}
                  条开通后可查看。
                </span>
              </div>
            ) : null}

            {isAnnualMember ? (
              <div className="membership-active-note" role="note">
                <Crown size={18} />
                <span>当前账号已是年会员，续费会在现有有效期后顺延一年。</span>
              </div>
            ) : null}

            <div className="benefit-grid" aria-label="会员权益">
              {membershipBenefits.map((benefit) => (
                <div className="benefit-item" key={benefit.title}>
                  <div className="benefit-icon">
                    <CheckCircle2 size={17} />
                  </div>
                  <div>
                    <strong>{benefit.title}</strong>
                    <span>{benefit.copy}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="payment-box">
              <div className="payment-box-head">
                <div>
                  <strong>支付方式</strong>
                  <span>选择后创建开通 / 续费订单</span>
                </div>
                <QrCode size={22} />
              </div>

              <div className="payment-provider-grid" role="radiogroup" aria-label="支付方式">
                {(["alipay", "wechat"] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className={
                      paymentProvider === provider
                        ? "payment-provider payment-provider-active"
                        : "payment-provider"
                    }
                    aria-pressed={paymentProvider === provider}
                    onClick={() => {
                      setPaymentProvider(provider);
                      setPaymentError(null);
                      setPaymentNotice(null);
                    }}
                  >
                    <CreditCard size={18} />
                    <span>{paymentProviderLabels[provider]}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="membership-pay-action"
                disabled={paymentState === "creating" || paymentState === "checking"}
                onClick={() => void handleCreatePaymentOrder()}
              >
                {paymentState === "creating" ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <CreditCard size={18} />
                )}
                <span>{isAnnualMember ? "续费一年" : "开通年会员"}</span>
                <ArrowRight size={17} />
              </button>

              {paymentOrder ? (
                <div className="payment-order-strip" aria-label="支付订单">
                  <div className="payment-order-meta">
                    <strong>{paymentStatusLabel(paymentOrder)}</strong>
                    <span>
                      {paymentProviderLabels[paymentOrder.provider]} ·{" "}
                      {paymentOrder.providerOrderId}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-action"
                    title="刷新支付状态"
                    aria-label="刷新支付状态"
                    disabled={paymentState === "checking"}
                    onClick={() => void handleRefreshPaymentOrder()}
                  >
                    {paymentState === "checking" ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <RefreshCw size={17} />
                    )}
                  </button>
                </div>
              ) : null}

              {paymentOrder?.checkoutUrl ? (
                <a className="payment-link" href={paymentOrder.checkoutUrl}>
                  <ExternalLink size={16} />
                  <span>打开支付页</span>
                </a>
              ) : null}

              {paymentNotice ? (
                <p className="payment-notice" role="status">
                  <CheckCircle2 size={16} />
                  {paymentNotice}
                </p>
              ) : null}

              {paymentError ? (
                <p className="form-error" role="alert">
                  <AlertCircle size={16} />
                  {paymentError}
                </p>
              ) : null}
            </div>
          </section>
        ) : activeRoute.key === "history" ? (
          <section className="history-panel" aria-labelledby="history-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">云端同步</p>
                <h2 id="history-title">查询历史</h2>
              </div>
              <button
                type="button"
                className="icon-action"
                title="刷新历史"
                aria-label="刷新历史"
                disabled={historyState === "loading"}
                onClick={() => {
                  setHistoryState("loading");
                  setHistoryError(null);
                  void listSearchHistory()
                    .then((payload) => {
                      setSearchHistory(payload.history);
                      setHistoryState("ready");
                    })
                    .catch(() => {
                      setHistoryState("error");
                      setHistoryError("查询历史加载失败，请稍后重试。");
                    });
                }}
              >
                {historyState === "loading" ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <RefreshCw size={17} />
                )}
              </button>
            </div>

            <p className="panel-copy">{routeDescription(activeRoute)}</p>

            {historyError ? (
              <p className="form-error" role="alert">
                <AlertCircle size={16} />
                {historyError}
              </p>
            ) : null}

            {historyState === "loading" ? (
              <div className="empty-results">
                <Loader2 className="spin" size={24} />
                <strong>正在加载历史</strong>
                <span>同步当前账号的云端查询记录。</span>
              </div>
            ) : searchHistory.length === 0 ? (
              <div className="empty-results">
                <Clock3 size={24} />
                <strong>暂无查询历史</strong>
                <span>完成一次关键词查询后会自动保存到云端。</span>
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
              <div className="history-list" aria-label="查询历史记录">
                {searchHistory.map((item) => (
                  <article className="history-card" key={item.id}>
                    <button
                      type="button"
                      className="history-main"
                      onClick={() => applyHistoryToQuery(item)}
                    >
                      <div className="history-icon">
                        {item.searchMode === "batch" ? (
                          <MapPinned size={18} />
                        ) : (
                          <Search size={18} />
                        )}
                      </div>
                      <div className="history-content">
                        <div className="history-head">
                          <strong>{item.keyword}</strong>
                          <span>{formatHistoryTime(item.createdAt)}</span>
                        </div>
                        <span>
                          {platformLabels[item.platform]} · {historyRegionLabel(item) || "全部区域"}
                        </span>
                        <small>
                          {item.searchMode === "batch" ? "批量查询" : "关键词查询"} · 返回{" "}
                          {item.resultCount} 条
                          {item.totalCount !== null ? ` / 官方总数 ${item.totalCount}` : ""}
                        </small>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="history-rerun"
                      onClick={() => void handleReplayHistory(item)}
                    >
                      <RefreshCw size={16} />
                      <span>再次查询</span>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : activeRoute.key === "profile" ? (
          <section className="profile-panel" aria-labelledby="profile-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">个人中心</p>
                <h2 id="profile-title">我的账号</h2>
              </div>
              <div className={isAnnualMember ? "member-pill member-active" : "member-pill"}>
                {isAnnualMember ? <Crown size={15} /> : <UserRound size={15} />}
                <span>{membershipStatusLabel(user?.membershipStatus)}</span>
              </div>
            </div>

            {user ? (
              <>
                <div className="profile-card">
                  <div className="profile-avatar-large">
                    {user.pictureUrl ? (
                      <img src={user.pictureUrl} alt={userDisplayName(user)} />
                    ) : (
                      <UserRound size={28} />
                    )}
                  </div>
                  <div className="profile-card-main">
                    <strong>{userDisplayName(user)}</strong>
                    <span>{user.email}</span>
                    <small>账号 {user.account}</small>
                  </div>
                </div>

                <div className="profile-stats" aria-label="账号状态">
                  <div>
                    <span>会员状态</span>
                    <strong>{membershipStatusLabel(user.membershipStatus)}</strong>
                  </div>
                  <div>
                    <span>到期时间</span>
                    <strong>{formatProfileDate(user.membershipExpiresAt)}</strong>
                  </div>
                  <div>
                    <span>注册时间</span>
                    <strong>{formatProfileDate(user.registeredAt)}</strong>
                  </div>
                  <div>
                    <span>最近同步</span>
                    <strong>{formatProfileDate(user.lastSeenAt)}</strong>
                  </div>
                </div>

                <div className="profile-membership" role="note">
                  <div>{isAnnualMember ? <ShieldCheck size={20} /> : <Crown size={20} />}</div>
                  <div>
                    <strong>{isAnnualMember ? "会员权益已启用" : "当前为免费账号"}</strong>
                    <span>
                      {isAnnualMember
                        ? "批量查询、整理、多 Key 与导出功能可直接使用。"
                        : "开通年会员后可使用批量查询、结果整理与导出。"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="upgrade-action"
                    onClick={() => setActiveRouteKey("membership")}
                  >
                    <Crown size={17} />
                    <span>{isAnnualMember ? "续费" : "开通"}</span>
                  </button>
                </div>

                <div className="profile-links" aria-label="快捷入口">
                  <button type="button" onClick={() => setActiveRouteKey("keys")}>
                    <KeyRound size={18} />
                    <span>Key 管理</span>
                    <ArrowRight size={16} />
                  </button>
                  <button type="button" onClick={() => setActiveRouteKey("history")}>
                    <Clock3 size={18} />
                    <span>查询历史</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-results">
                <UserRound size={24} />
                <strong>账号未同步</strong>
                <span>请重新登录后查看个人中心。</span>
              </div>
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
      <MctaiWatermark />
    </main>
  );
}
