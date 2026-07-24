import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Crown,
  KeyRound,
  type LucideIcon,
  MapPinned,
  Search,
  UserRound,
} from "lucide-react";
import type { HealthResponse, MobileRouteDefinition, MobileRouteKey } from "@sinly/shared";
import { mobileRoutes } from "@sinly/shared";

type ApiState = "checking" | "ready" | "offline";

const defaultRoute = mobileRoutes[0] as MobileRouteDefinition | undefined;

if (!defaultRoute) {
  throw new Error("At least one mobile route must be defined");
}

const fallbackRoute: MobileRouteDefinition = defaultRoute;

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
    query: "保留核心查询入口，后续接入地区选择与关键词搜索。",
    results: "承载列表结果、数量限制与后续格式整理能力。",
    keys: "预留平台 API Key 管理与平台切换入口。",
    membership: "预留会员状态、开通续费与权益提示入口。",
    history: "预留查询历史筛选与复用入口。",
    profile: "预留账号信息、设置与常用操作入口。",
  };

  return descriptions[route.key];
}

async function loadHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Health check failed with ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}

export function App() {
  const [activeRouteKey, setActiveRouteKey] = useState<MobileRouteKey>("query");
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadHealth()
      .then((payload) => {
        if (!cancelled) {
          setHealth(payload);
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
  }, []);

  const activeRoute = useMemo(
    () => mobileRoutes.find((route) => route.key === activeRouteKey) ?? fallbackRoute,
    [activeRouteKey],
  );

  const ActiveIcon = iconByRoute[activeRoute.key];

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="screen-title">
        <div className="topbar">
          <div>
            <p className="eyebrow">H5 单页应用</p>
            <h1 id="screen-title">移动端查询工作台</h1>
          </div>
          <div className={`status-pill status-${apiState}`}>
            <span aria-hidden="true" />
            {apiState === "ready" ? "API 正常" : apiState === "checking" ? "检查中" : "API 离线"}
          </div>
        </div>

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
            <span>路由 {activeRoute.path}</span>
            <span>关联 Issue #{activeRoute.issue}</span>
          </div>
        </div>

        <div className="structure-list" aria-label="项目结构">
          <div>
            <strong>前端</strong>
            <span>React + Vite + TypeScript</span>
          </div>
          <div>
            <strong>后端</strong>
            <span>Express API, 生产端口 8080</span>
          </div>
          <div>
            <strong>共享</strong>
            <span>统一 DTO 与路由元数据</span>
          </div>
        </div>

        {health ? (
          <p className="health-line">
            服务版本 {health.version}, 已运行 {health.uptimeSeconds}s
          </p>
        ) : null}
      </section>

      <nav className="bottom-tabs" aria-label="主导航">
        {mobileRoutes.map((route) => {
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
