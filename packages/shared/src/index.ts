export type ApiStatus = "ok" | "degraded";

export interface HealthResponse {
  status: ApiStatus;
  service: "api";
  version: string;
  uptimeSeconds: number;
  database: {
    status: ApiStatus;
    latencyMs: number;
  };
}

export interface PublicUser {
  sub: string;
  email: string;
  account: string;
  name: string | null;
  pictureUrl: string | null;
  membershipStatus: "none" | "active" | "expired" | "cancelled";
  membershipExpiresAt: string | null;
  registeredAt: string;
  lastSeenAt: string;
}

export interface RegisterResponse {
  registered: boolean;
  user: PublicUser;
}

export interface LoginResponse {
  loginUrl: string;
}

export type SessionResponse =
  | {
      authenticated: true;
      user: PublicUser;
    }
  | {
      authenticated: false;
      loginUrl?: string;
    };

export interface PasswordResetRequestResponse {
  accepted: true;
  emailSent: boolean;
  expiresInMinutes: number;
}

export interface PasswordResetConfirmResponse {
  confirmed: true;
  loginUrl: string;
}

export type ApiKeyPlatform = "amap" | "baidu" | "tencent";

export const apiKeyPlatforms: readonly ApiKeyPlatform[] = ["amap", "baidu", "tencent"] as const;

export interface ApiKeySummary {
  id: string;
  platform: ApiKeyPlatform;
  label: string | null;
  keyFingerprint: string;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeyListResponse {
  keys: ApiKeySummary[];
}

export interface ApiKeyResponse {
  key: ApiKeySummary;
}

export interface ApiKeyDeleteResponse {
  deleted: true;
}

export interface ApiKeySaveRequest {
  platform: ApiKeyPlatform;
  apiKey: string;
  label?: string | null;
}

export interface MapPoiSearchRequest {
  platform: ApiKeyPlatform;
  keyword: string;
  province?: string;
  city?: string;
  district?: string;
  page?: number;
  pageSize?: number;
}

export interface MapPoiContact {
  phone: string | null;
}

export interface MapPoiResult {
  provider: ApiKeyPlatform;
  providerPoiId: string;
  name: string;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  category: string | null;
  contact: MapPoiContact;
  location: {
    latitude: number | null;
    longitude: number | null;
  };
}

export interface MapPoiSearchResponse {
  platform: ApiKeyPlatform;
  keyword: string;
  region: {
    province: string | null;
    city: string | null;
    district: string | null;
  };
  page: number;
  pageSize: number;
  total: number | null;
  results: MapPoiResult[];
}

export type KeywordSearchRequest = MapPoiSearchRequest;
export type KeywordSearchResponse = MapPoiSearchResponse;

export interface BatchKeywordSearchRequest {
  platform: ApiKeyPlatform;
  keywords: string[];
  province?: string;
  city?: string;
  district?: string;
  pageSize?: number;
}

export interface BatchKeywordSearchResponse extends MapPoiSearchResponse {
  batch: true;
  keywords: string[];
  searches: MapPoiSearchResponse[];
}

export type SearchHistoryMode = "single" | "batch";

export interface SearchHistoryItem {
  id: string;
  platform: ApiKeyPlatform;
  keyword: string;
  searchMode: SearchHistoryMode;
  region: {
    province: string | null;
    city: string | null;
    district: string | null;
  };
  resultCount: number;
  totalCount: number | null;
  createdAt: string;
}

export interface SearchHistoryListResponse {
  history: SearchHistoryItem[];
}

export type ResultExportFormat = "csv" | "excel";

export interface ResultExportRequest {
  format: ResultExportFormat;
  title?: string;
  results: MapPoiResult[];
}

export type PaymentProvider = "alipay" | "wechat";
export type PaymentOrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface PaymentOrderRequest {
  provider?: PaymentProvider;
}

export interface PaymentOrderSummary {
  id: string;
  provider: PaymentProvider;
  providerOrderId: string;
  status: PaymentOrderStatus;
  amountCents: number;
  currency: string;
  membershipMonths: number;
  subject: string;
  checkoutUrl: string | null;
  orderExpiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface PaymentOrderResponse {
  order: PaymentOrderSummary;
  paymentUrl: string | null;
  configured: boolean;
  message: string;
}

export interface PaymentCallbackResponse {
  accepted: true;
  orderId: string;
  status: PaymentOrderStatus;
  alreadyPaid: boolean;
  membershipExpiresAt: string | null;
}

export type MobileRouteKey = "query" | "results" | "keys" | "membership" | "history" | "profile";

export interface MobileRouteDefinition {
  key: MobileRouteKey;
  label: string;
  path: string;
  apiNamespace: string;
  issue: number;
}

export const mobileRoutes: readonly MobileRouteDefinition[] = [
  {
    key: "query",
    label: "查询",
    path: "/",
    apiNamespace: "/api/searches",
    issue: 15,
  },
  {
    key: "results",
    label: "结果",
    path: "/results",
    apiNamespace: "/api/searches",
    issue: 16,
  },
  {
    key: "keys",
    label: "Key",
    path: "/keys",
    apiNamespace: "/api/api-keys",
    issue: 11,
  },
  {
    key: "membership",
    label: "会员",
    path: "/membership",
    apiNamespace: "/api/membership",
    issue: 22,
  },
  {
    key: "history",
    label: "历史",
    path: "/history",
    apiNamespace: "/api/history",
    issue: 24,
  },
  {
    key: "profile",
    label: "我的",
    path: "/profile",
    apiNamespace: "/api/users",
    issue: 25,
  },
] as const;

export { chinaRegions, findRegionSelection } from "./regions.js";
export type { ChinaCity, ChinaCounty, ChinaProvince, RegionSelection } from "./regions.js";
