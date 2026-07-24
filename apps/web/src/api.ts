import type {
  HealthResponse,
  LoginResponse,
  MobileRouteDefinition,
  RegisterResponse,
  SessionResponse,
} from "@sinly/shared";

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorPayload {
  error?: ApiErrorDetail;
  loginUrl?: string;
}

export interface MobileShellResponse {
  routes: readonly MobileRouteDefinition[];
  navigationMode: "single-page-tabs";
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly loginUrl?: string;

  constructor(status: number, payload: ApiErrorPayload | null) {
    super(payload?.error?.message ?? `Request failed with ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = payload?.error?.code ?? "REQUEST_FAILED";
    this.loginUrl = payload?.loginUrl;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = await readJson<ApiErrorPayload>(response);
    } catch {
      payload = null;
    }

    throw new ApiRequestError(response.status, payload);
  }

  return readJson<T>(response);
}

export function getSession(): Promise<SessionResponse> {
  return requestJson<SessionResponse>("/api/auth/session");
}

export function requestLogin(): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function requestRegister(email: string): Promise<RegisterResponse> {
  return requestJson<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function loadHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}

export function loadMobileShell(): Promise<MobileShellResponse> {
  return requestJson<MobileShellResponse>("/api/mobile-shell");
}
