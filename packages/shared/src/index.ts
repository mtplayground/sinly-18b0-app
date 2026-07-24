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
