import type { KeyEncryptionConfig, ServerConfig } from "@sinly/config";
import {
  ApiKeyCipher,
  ApiKeyRepository,
  isApiKeyPlatform,
  SearchHistoryRepository,
} from "@sinly/db";
import type { ApiKeyPlatform, Database } from "@sinly/db";
import { Router } from "express";
import type { RequestHandler, Response } from "express";
import type {
  BatchKeywordSearchRequest,
  BatchKeywordSearchResponse,
  MapPoiResult,
  MapPoiSearchRequest,
  MapPoiSearchResponse,
} from "@sinly/shared";
import type { AuthServiceConfig } from "@sinly/config";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./auth/middleware.js";
import { requireActiveMembership } from "./membership.js";

const MAP_SEARCH_TIMEOUT_MS = 10_000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE = 10;
const MAX_PAGE_SIZE = 20;
const MAX_BATCH_KEYWORDS = 5;

export interface MapSearchRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  keyEncryption: KeyEncryptionConfig;
  server: ServerConfig;
}

type UnknownRecord = Record<string, unknown>;

class MapProviderError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    provider: ApiKeyPlatform,
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(`${provider} map search failed: ${message}`);
    this.name = "MapProviderError";
    this.status = options.status ?? 502;
    this.code = options.code ?? "MAP_PROVIDER_ERROR";
  }
}

export interface ValidatedSearchInput {
  platform: ApiKeyPlatform;
  keyword: string;
  province: string | null;
  city: string | null;
  district: string | null;
  page: number;
  pageSize: number;
}

interface SearchInputValidation {
  input: ValidatedSearchInput | null;
  errors: string[];
}

interface ProviderSearchInput extends ValidatedSearchInput {
  apiKey: string;
}

interface BatchSearchInput {
  platform: ApiKeyPlatform;
  keywords: string[];
  province: string | null;
  city: string | null;
  district: string | null;
  pageSize: number;
}

interface BatchSearchValidation {
  input: BatchSearchInput | null;
  errors: string[];
}

function createRepository(dependencies: MapSearchRouterDependencies): ApiKeyRepository | null {
  if (!dependencies.keyEncryption.secret || !dependencies.keyEncryption.salt) {
    return null;
  }

  return new ApiKeyRepository(
    dependencies.database,
    new ApiKeyCipher({
      secret: dependencies.keyEncryption.secret,
      salt: dependencies.keyEncryption.salt,
    }),
  );
}

function readBody<T extends object>(body: unknown): Partial<T> {
  return body && typeof body === "object" ? (body as Partial<T>) : {};
}

function readOptionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function readPositiveInteger(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function validateSearchInput(body: unknown): SearchInputValidation {
  const request = readBody<MapPoiSearchRequest>(body);
  const platform =
    typeof request.platform === "string" && isApiKeyPlatform(request.platform)
      ? request.platform
      : null;
  const keyword = readOptionalText(request.keyword, 80);
  const errors: string[] = [];

  if (!platform) {
    errors.push("platform must be one of amap, baidu, or tencent");
  }

  if (!keyword) {
    errors.push("keyword is required");
  }

  if (errors.length > 0 || !platform || !keyword) {
    return { input: null, errors };
  }

  return {
    input: {
      platform,
      keyword,
      province: readOptionalText(request.province, 40),
      city: readOptionalText(request.city, 40),
      district: readOptionalText(request.district, 40),
      page: readPositiveInteger(request.page, DEFAULT_PAGE, MAX_PAGE),
      pageSize: readPositiveInteger(request.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    },
    errors,
  };
}

function validateBatchSearchInput(body: unknown): BatchSearchValidation {
  const request = readBody<BatchKeywordSearchRequest>(body);
  const platform =
    typeof request.platform === "string" && isApiKeyPlatform(request.platform)
      ? request.platform
      : null;
  const keywords = Array.isArray(request.keywords)
    ? [
        ...new Set(
          request.keywords
            .map((keyword) => readOptionalText(keyword, 80))
            .filter((keyword): keyword is string => Boolean(keyword)),
        ),
      ]
    : [];
  const errors: string[] = [];

  if (!platform) {
    errors.push("platform must be one of amap, baidu, or tencent");
  }

  if (keywords.length < 2) {
    errors.push("at least two keywords are required for batch search");
  }

  if (keywords.length > MAX_BATCH_KEYWORDS) {
    errors.push(`batch search supports up to ${MAX_BATCH_KEYWORDS} keywords`);
  }

  if (errors.length > 0 || !platform) {
    return { input: null, errors };
  }

  return {
    input: {
      platform,
      keywords,
      province: readOptionalText(request.province, 40),
      city: readOptionalText(request.city, 40),
      district: readOptionalText(request.district, 40),
      pageSize: readPositiveInteger(request.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    },
    errors,
  };
}

function sendEncryptionUnavailable(res: Response): void {
  res.status(503).json({
    error: {
      code: "KEY_ENCRYPTION_NOT_CONFIGURED",
      message: "API key encryption is not configured",
    },
  });
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asRecordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is UnknownRecord => Boolean(item))
    : [];
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asTotal(value: unknown): number | null {
  const total = asNumber(value);
  return total === null ? null : Math.max(0, Math.trunc(total));
}

function firstText(value: unknown): string | null {
  if (Array.isArray(value)) {
    return value.map(asString).find((item): item is string => Boolean(item)) ?? null;
  }

  return asString(value);
}

function parseAmapLocation(value: unknown): { latitude: number | null; longitude: number | null } {
  const raw = asString(value);
  if (!raw) {
    return { latitude: null, longitude: null };
  }

  const [longitude, latitude] = raw.split(",").map((part) => asNumber(part));
  return { latitude: latitude ?? null, longitude: longitude ?? null };
}

function parseBaiduLocation(value: unknown): { latitude: number | null; longitude: number | null } {
  const location = asRecord(value);
  if (!location) {
    return { latitude: null, longitude: null };
  }

  return {
    latitude: asNumber(location.lat),
    longitude: asNumber(location.lng),
  };
}

function parseTencentLocation(value: unknown): {
  latitude: number | null;
  longitude: number | null;
} {
  const location = asRecord(value);
  if (!location) {
    return { latitude: null, longitude: null };
  }

  return {
    latitude: asNumber(location.lat),
    longitude: asNumber(location.lng),
  };
}

function normalizeText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/\s*([,，;；/])\s*/g, "$1")
    .trim();
  return normalized || null;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePhone(value: string | null): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const parts = text
    .replace(/[|、，；;]/g, "/")
    .split("/")
    .map((part) =>
      part
        .replace(/[^\d+()（）-]/g, "")
        .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);

  return parts.length > 0 ? [...new Set(parts)].join(" / ") : null;
}

function normalizeAddressPart(value: string | null): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  return text.replace(/\s+/g, "").replace(/[，,;；]+/g, "");
}

function normalizeAddress(result: MapPoiResult): string | null {
  const address = normalizeAddressPart(result.address);
  const regionParts = [result.province, result.city, result.district]
    .map(normalizeAddressPart)
    .filter((part): part is string => Boolean(part));

  if (!address) {
    return regionParts.join("") || null;
  }

  const prefix = regionParts.filter((part) => !address.includes(part)).join("");
  return `${prefix}${address}` || null;
}

function compactIdentity(value: string | null): string | null {
  const text = normalizeText(value);
  return text ? text.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "") : null;
}

function compactPhone(value: string | null): string | null {
  const phone = normalizePhone(value);
  return phone ? phone.replace(/[^\d+]/g, "") : null;
}

function formatResult(result: MapPoiResult): MapPoiResult | null {
  const name = normalizeName(result.name);
  if (!result.providerPoiId || !name) {
    return null;
  }

  return {
    ...result,
    providerPoiId: result.providerPoiId.trim(),
    name,
    address: normalizeAddress(result),
    province: normalizeAddressPart(result.province),
    city: normalizeAddressPart(result.city),
    district: normalizeAddressPart(result.district),
    category: normalizeText(result.category),
    contact: {
      phone: normalizePhone(result.contact.phone),
    },
  };
}

function resultDedupeKey(result: MapPoiResult): string {
  const name = compactIdentity(result.name);
  const phone = compactPhone(result.contact.phone);
  const address = compactIdentity(result.address);

  if (name && phone) {
    return `name-phone:${name}:${phone}`;
  }

  if (name && address) {
    return `name-address:${name}:${address}`;
  }

  return `provider:${result.provider}:${result.providerPoiId}`;
}

function formatAndDedupeResults(results: MapPoiResult[]): MapPoiResult[] {
  const seen = new Set<string>();
  const formattedResults: MapPoiResult[] = [];

  for (const result of results) {
    const formatted = formatResult(result);
    if (!formatted) {
      continue;
    }

    const key = resultDedupeKey(formatted);
    if (!seen.has(key)) {
      seen.add(key);
      formattedResults.push(formatted);
    }
  }

  return formattedResults;
}

async function fetchProviderJson(provider: ApiKeyPlatform, url: URL): Promise<UnknownRecord> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAP_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new MapProviderError(provider, `HTTP ${response.status}`, {
        status: response.status >= 500 ? 502 : 400,
      });
    }

    const payload = asRecord(await response.json());
    if (!payload) {
      throw new MapProviderError(provider, "invalid JSON response");
    }

    return payload;
  } catch (error) {
    if (error instanceof MapProviderError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new MapProviderError(provider, "request timed out", {
        code: "MAP_PROVIDER_TIMEOUT",
        status: 504,
      });
    }

    throw new MapProviderError(provider, "request failed");
  } finally {
    clearTimeout(timeout);
  }
}

function regionName(input: ValidatedSearchInput): string {
  return input.district ?? input.city ?? input.province ?? "";
}

async function searchAmap(input: ProviderSearchInput): Promise<MapPoiSearchResponse> {
  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("keywords", input.keyword);
  url.searchParams.set("offset", String(input.pageSize));
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("extensions", "base");
  url.searchParams.set("output", "json");

  const city = input.city ?? input.province;
  if (city) {
    url.searchParams.set("city", city);
    url.searchParams.set("citylimit", "true");
  }

  const payload = await fetchProviderJson("amap", url);
  if (asString(payload.status) !== "1") {
    throw new MapProviderError("amap", asString(payload.info) ?? "provider returned an error", {
      code: asString(payload.infocode) ?? "AMAP_PROVIDER_ERROR",
      status: 502,
    });
  }

  const pois = asRecordArray(payload.pois);
  const results: MapPoiResult[] = pois.map((poi) => {
    const location = parseAmapLocation(poi.location);

    return {
      provider: "amap",
      providerPoiId: asString(poi.id) ?? "",
      name: asString(poi.name) ?? "",
      address: firstText(poi.address),
      province: asString(poi.pname),
      city: asString(poi.cityname),
      district: asString(poi.adname),
      category: asString(poi.type),
      contact: {
        phone: firstText(poi.tel),
      },
      location,
    };
  });

  return buildResponse(input, asTotal(payload.count), results);
}

async function searchBaidu(input: ProviderSearchInput): Promise<MapPoiSearchResponse> {
  const url = new URL("https://api.map.baidu.com/place/v2/search");
  url.searchParams.set("ak", input.apiKey);
  url.searchParams.set("query", input.keyword);
  url.searchParams.set("output", "json");
  url.searchParams.set("scope", "2");
  url.searchParams.set("page_size", String(input.pageSize));
  url.searchParams.set("page_num", String(input.page - 1));

  const region = regionName(input);
  if (region) {
    url.searchParams.set("region", region);
    url.searchParams.set("city_limit", "true");
  }

  const payload = await fetchProviderJson("baidu", url);
  if (asNumber(payload.status) !== 0) {
    throw new MapProviderError("baidu", asString(payload.message) ?? "provider returned an error", {
      code: "BAIDU_PROVIDER_ERROR",
      status: 502,
    });
  }

  const results: MapPoiResult[] = asRecordArray(payload.results).map((poi) => {
    const detail = asRecord(poi.detail_info);

    return {
      provider: "baidu",
      providerPoiId: asString(poi.uid) ?? "",
      name: asString(poi.name) ?? "",
      address: asString(poi.address),
      province: asString(poi.province),
      city: asString(poi.city),
      district: asString(poi.area),
      category: asString(detail?.tag),
      contact: {
        phone: asString(poi.telephone),
      },
      location: parseBaiduLocation(poi.location),
    };
  });

  return buildResponse(input, asTotal(payload.total), results);
}

async function searchTencent(input: ProviderSearchInput): Promise<MapPoiSearchResponse> {
  const url = new URL("https://apis.map.qq.com/ws/place/v1/search");
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("keyword", input.keyword);
  url.searchParams.set("boundary", `region(${regionName(input) || "全国"},0)`);
  url.searchParams.set("page_size", String(input.pageSize));
  url.searchParams.set("page_index", String(input.page));
  url.searchParams.set("output", "json");

  const payload = await fetchProviderJson("tencent", url);
  if (asNumber(payload.status) !== 0) {
    throw new MapProviderError(
      "tencent",
      asString(payload.message) ?? "provider returned an error",
      {
        code: "TENCENT_PROVIDER_ERROR",
        status: 502,
      },
    );
  }

  const results: MapPoiResult[] = asRecordArray(payload.data).map((poi) => {
    const adInfo = asRecord(poi.ad_info);

    return {
      provider: "tencent",
      providerPoiId: asString(poi.id) ?? "",
      name: asString(poi.title) ?? "",
      address: asString(poi.address),
      province: null,
      city: null,
      district: asString(adInfo?.adcode),
      category: asString(poi.category),
      contact: {
        phone: asString(poi.tel),
      },
      location: parseTencentLocation(poi.location),
    };
  });

  return buildResponse(input, asTotal(payload.count), results);
}

function buildResponse(
  input: ValidatedSearchInput,
  total: number | null,
  results: MapPoiResult[],
): MapPoiSearchResponse {
  const formattedResults = formatAndDedupeResults(results);

  return {
    platform: input.platform,
    keyword: input.keyword,
    region: {
      province: input.province,
      city: input.city,
      district: input.district,
    },
    page: input.page,
    pageSize: input.pageSize,
    total,
    results: formattedResults,
  };
}

async function searchOfficialProvider(input: ProviderSearchInput): Promise<MapPoiSearchResponse> {
  if (input.platform === "amap") {
    return searchAmap(input);
  }

  if (input.platform === "baidu") {
    return searchBaidu(input);
  }

  return searchTencent(input);
}

async function runSingleSearch(
  apiKeys: ApiKeyRepository,
  userSub: string,
  input: ValidatedSearchInput,
): Promise<MapPoiSearchResponse | null> {
  const secret = await apiKeys.getSecretByPlatform(userSub, input.platform);
  if (!secret) {
    return null;
  }

  const payload = await searchOfficialProvider({
    ...input,
    apiKey: secret.apiKey,
  });
  await apiKeys.markUsed(userSub, input.platform);

  return payload;
}

function buildBatchResponse(
  input: BatchSearchInput,
  searches: MapPoiSearchResponse[],
): BatchKeywordSearchResponse {
  const results = formatAndDedupeResults(searches.flatMap((search) => search.results));

  return {
    batch: true,
    platform: input.platform,
    keyword: input.keywords.join(" / "),
    keywords: input.keywords,
    region: {
      province: input.province,
      city: input.city,
      district: input.district,
    },
    page: DEFAULT_PAGE,
    pageSize: input.pageSize,
    total: results.length,
    results,
    searches,
  };
}

async function recordSingleSearchHistory(
  history: SearchHistoryRepository,
  userSub: string,
  payload: MapPoiSearchResponse,
): Promise<void> {
  await history.create({
    userSub,
    platform: payload.platform,
    keyword: payload.keyword,
    searchMode: "single",
    province: payload.region.province,
    city: payload.region.city,
    district: payload.region.district,
    resultCount: payload.results.length,
    totalCount: payload.total,
  });
}

async function recordBatchSearchHistory(
  history: SearchHistoryRepository,
  userSub: string,
  payload: BatchKeywordSearchResponse,
): Promise<void> {
  await history.create({
    userSub,
    platform: payload.platform,
    keyword: payload.keywords.join(" / "),
    searchMode: "batch",
    province: payload.region.province,
    city: payload.region.city,
    district: payload.region.district,
    resultCount: payload.results.length,
    totalCount: payload.total,
  });
}

export function createMapSearchHandler(dependencies: MapSearchRouterDependencies): RequestHandler {
  const apiKeys = createRepository(dependencies);
  const history = new SearchHistoryRepository(dependencies.database);

  return async (req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const validation = validateSearchInput(req.body);
      const input = validation.input;
      if (!input) {
        res.status(422).json({
          error: {
            code: "INVALID_MAP_SEARCH_REQUEST",
            message: validation.errors.join("; "),
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const payload = await runSingleSearch(apiKeys, authContext.user.sub, input);
      if (!payload) {
        res.status(404).json({
          error: {
            code: "MAP_API_KEY_NOT_FOUND",
            message: "No API key is configured for the selected map platform",
          },
        });
        return;
      }

      await recordSingleSearchHistory(history, authContext.user.sub, payload);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  };
}

export function createBatchMapSearchHandler(
  dependencies: MapSearchRouterDependencies,
): RequestHandler {
  const apiKeys = createRepository(dependencies);
  const history = new SearchHistoryRepository(dependencies.database);

  return async (req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const authContext = getAuthenticatedUser(res);
      if (!(await requireActiveMembership(dependencies.database, authContext.user, res))) {
        return;
      }

      const validation = validateBatchSearchInput(req.body);
      const input = validation.input;
      if (!input) {
        res.status(422).json({
          error: {
            code: "INVALID_BATCH_MAP_SEARCH_REQUEST",
            message: validation.errors.join("; "),
          },
        });
        return;
      }

      const searches: MapPoiSearchResponse[] = [];
      for (const keyword of input.keywords) {
        const payload = await runSingleSearch(apiKeys, authContext.user.sub, {
          platform: input.platform,
          keyword,
          province: input.province,
          city: input.city,
          district: input.district,
          page: DEFAULT_PAGE,
          pageSize: input.pageSize,
        });

        if (!payload) {
          res.status(404).json({
            error: {
              code: "MAP_API_KEY_NOT_FOUND",
              message: "No API key is configured for the selected map platform",
            },
          });
          return;
        }

        searches.push(payload);
      }

      const payload = buildBatchResponse(input, searches);
      await recordBatchSearchHistory(history, authContext.user.sub, payload);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  };
}

export function createMapSearchRouter(dependencies: MapSearchRouterDependencies): Router {
  const router = Router();
  const requireUser = requireAuthenticatedUser({
    auth: dependencies.auth,
    database: dependencies.database,
    server: dependencies.server,
  });

  router.use(requireUser);
  router.post("/poi", createMapSearchHandler(dependencies));

  return router;
}
