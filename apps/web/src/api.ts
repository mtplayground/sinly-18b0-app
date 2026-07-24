import type {
  ApiKeyDeleteResponse,
  ApiKeyListResponse,
  ApiKeyPlatform,
  ApiKeyResponse,
  ApiKeySaveRequest,
  BatchKeywordSearchRequest,
  BatchKeywordSearchResponse,
  HealthResponse,
  KeywordSearchRequest,
  KeywordSearchResponse,
  LoginResponse,
  MobileRouteDefinition,
  PaymentOrderRequest,
  PaymentOrderResponse,
  RegisterResponse,
  ResultExportFormat,
  ResultExportRequest,
  SearchHistoryListResponse,
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

export interface ResultExportDownload {
  blob: Blob;
  filename: string;
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

export function listApiKeys(): Promise<ApiKeyListResponse> {
  return requestJson<ApiKeyListResponse>("/api/api-keys");
}

export function createApiKey(input: ApiKeySaveRequest): Promise<ApiKeyResponse> {
  return requestJson<ApiKeyResponse>("/api/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateApiKey(
  platform: ApiKeyPlatform,
  input: ApiKeySaveRequest,
): Promise<ApiKeyResponse> {
  return requestJson<ApiKeyResponse>(`/api/api-keys/${platform}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteApiKey(platform: ApiKeyPlatform): Promise<ApiKeyDeleteResponse> {
  return requestJson<ApiKeyDeleteResponse>(`/api/api-keys/${platform}`, {
    method: "DELETE",
  });
}

export function searchByKeyword(input: KeywordSearchRequest): Promise<KeywordSearchResponse> {
  return requestJson<KeywordSearchResponse>("/api/searches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function searchByKeywords(
  input: BatchKeywordSearchRequest,
): Promise<BatchKeywordSearchResponse> {
  return requestJson<BatchKeywordSearchResponse>("/api/searches/batch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createPaymentOrder(input: PaymentOrderRequest): Promise<PaymentOrderResponse> {
  return requestJson<PaymentOrderResponse>("/api/payments/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPaymentOrder(
  orderId: string,
): Promise<{ order: PaymentOrderResponse["order"] }> {
  return requestJson<{ order: PaymentOrderResponse["order"] }>(`/api/payments/orders/${orderId}`);
}

export function listSearchHistory(limit = 50): Promise<SearchHistoryListResponse> {
  return requestJson<SearchHistoryListResponse>(`/api/history?limit=${limit}`);
}

function filenameFromDisposition(disposition: string | null, format: ResultExportFormat): string {
  const fallback = `poi-results.${format === "csv" ? "csv" : "xls"}`;
  if (!disposition) {
    return fallback;
  }

  const match = /filename="([^"]+)"/i.exec(disposition);
  return match?.[1] ?? fallback;
}

export async function exportResults(input: ResultExportRequest): Promise<ResultExportDownload> {
  const response = await fetch("/api/exports/results", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "text/csv, application/vnd.ms-excel",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
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

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("Content-Disposition"), input.format),
  };
}
