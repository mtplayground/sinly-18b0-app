import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import http from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type { QueryResult, QueryResultRow } from "pg";
import type { AppConfig } from "@sinly/config";
import type {
  ApiKeyPlatform,
  ApiKeyResponse,
  BatchKeywordSearchResponse,
  MapPoiResult,
  MapPoiSearchResponse,
  PaymentCallbackResponse,
  PaymentOrderResponse,
  PublicUser,
  SearchHistoryListResponse,
  SessionResponse,
} from "@sinly/shared";
import { createApp } from "../../apps/api/src/app.js";
import type { Database, QueryValues } from "@sinly/db";

type Row = QueryResultRow;
type DbClient = {
  query: <ResultRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: QueryValues,
  ) => Promise<QueryResult<ResultRow>>;
};

interface UserRow extends Row {
  sub: string;
  email: string;
  account: string;
  password_hash: string | null;
  name: string | null;
  picture_url: string | null;
  membership_status: "none" | "active" | "expired" | "cancelled";
  current_membership_id: string | null;
  registered_at: Date;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date;
}

interface ApiKeyRow extends Row {
  id: string;
  user_sub: string;
  platform: ApiKeyPlatform;
  label: string | null;
  encrypted_key: Buffer;
  key_iv: Buffer;
  key_auth_tag: Buffer;
  key_digest: string;
  key_fingerprint: string;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
}

interface MembershipRow extends Row {
  id: string;
  user_sub: string;
  status: "active" | "expired" | "cancelled";
  starts_at: Date;
  expires_at: Date;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentOrderRow extends Row {
  id: string;
  user_sub: string;
  provider: "alipay" | "wechat";
  provider_order_id: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  amount_cents: number;
  currency: string;
  membership_months: number;
  subject: string;
  checkout_url: string | null;
  order_expires_at: Date;
  paid_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  callback_payload: string | null;
  created_at: Date;
  updated_at: Date;
}

interface SearchHistoryRow extends Row {
  id: string;
  user_sub: string;
  platform: ApiKeyPlatform;
  keyword: string;
  search_mode: "single" | "batch";
  province: string | null;
  city: string | null;
  district: string | null;
  result_count: number;
  total_count: number | null;
  created_at: Date;
}

function queryResult<ResultRow extends QueryResultRow>(rows: ResultRow[]): QueryResult<ResultRow> {
  return {
    rows,
    rowCount: rows.length,
    command: "",
    oid: 0,
    fields: [],
  };
}

function addMonths(value: Date, months: number): Date {
  const next = new Date(value.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

class E2eDatabase {
  private readonly users = new Map<string, UserRow>();
  private readonly apiKeys = new Map<string, ApiKeyRow>();
  private readonly memberships = new Map<string, MembershipRow>();
  private readonly paymentOrders = new Map<string, PaymentOrderRow>();
  private readonly searchHistory: SearchHistoryRow[] = [];

  async query<ResultRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values: QueryValues = [],
  ): Promise<QueryResult<ResultRow>> {
    const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
    return queryResult(this.route(sql, values) as ResultRow[]);
  }

  async transaction<Result>(work: (client: DbClient) => Promise<Result>): Promise<Result> {
    return work({ query: this.query.bind(this) });
  }

  async healthCheck(): Promise<{ databaseName: string; serverTime: Date }> {
    return { databaseName: "e2e", serverTime: new Date() };
  }

  async close(): Promise<void> {
    return undefined;
  }

  private route(sql: string, values: QueryValues): Row[] {
    if (sql.startsWith("insert into users")) return [this.upsertUser(values)];
    if (sql.startsWith("select * from users where sub")) return this.findUserBySub(values);
    if (sql.startsWith("update users set last_seen_at")) return this.touchUser(values);
    if (sql.startsWith("update users set membership_status"))
      return this.updateUserMembership(values);

    if (sql.startsWith("insert into user_api_keys")) return [this.upsertApiKey(values)];
    if (sql.startsWith("select * from user_api_keys where user_sub = $1 and platform = $2")) {
      return this.findApiKey(values);
    }
    if (sql.startsWith("select * from user_api_keys where user_sub = $1 order by")) {
      return this.listApiKeys(values);
    }
    if (sql.startsWith("update user_api_keys set last_used_at")) return this.markApiKeyUsed(values);

    if (sql.startsWith("select * from memberships where user_sub")) {
      return this.findCurrentMembership(values);
    }
    if (sql.startsWith("select id, starts_at, expires_at, status from memberships")) {
      return this.findCurrentMembership(values);
    }
    if (sql.startsWith("insert into memberships")) return [this.insertMembership(values)];
    if (sql.startsWith("update memberships set")) return this.extendMembership(values);

    if (sql.startsWith("insert into payment_orders")) return [this.insertPaymentOrder(values)];
    if (sql.startsWith("update payment_orders set checkout_url"))
      return this.setCheckoutUrl(values);
    if (sql.startsWith("select * from payment_orders where id = $1 and user_sub = $2")) {
      return this.findPaymentOrderByUser(values);
    }
    if (sql.startsWith("select * from payment_orders where provider = $1")) {
      return this.findPaymentOrderForCallback(values);
    }
    if (sql.startsWith("update payment_orders set status = 'paid'")) {
      return this.markPaymentPaid(values);
    }
    if (sql.startsWith("update payment_orders set status = case")) {
      return this.markPaymentFailed(values);
    }

    if (sql.startsWith("insert into search_history")) return [this.insertSearchHistory(values)];
    if (sql.startsWith("select * from search_history where user_sub"))
      return this.listSearchHistory(values);
    if (sql.startsWith("select current_database()")) {
      return [{ database_name: "e2e", server_time: new Date() }];
    }

    throw new Error(`Unhandled E2E database query: ${sql}`);
  }

  private upsertUser(values: QueryValues): UserRow {
    const now = new Date();
    const sub = String(values[0]);
    const existing = this.users.get(sub);
    const row: UserRow = {
      sub,
      email: String(values[1]),
      account: String(values[2] ?? values[1]),
      password_hash: existing?.password_hash ?? null,
      name: values[3] === null ? null : String(values[3]),
      picture_url: values[4] === null ? null : String(values[4]),
      membership_status: existing?.membership_status ?? "none",
      current_membership_id: existing?.current_membership_id ?? null,
      registered_at: existing?.registered_at ?? now,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      last_seen_at: now,
    };
    this.users.set(sub, row);
    return row;
  }

  private findUserBySub(values: QueryValues): UserRow[] {
    const row = this.users.get(String(values[0]));
    return row ? [row] : [];
  }

  private touchUser(values: QueryValues): UserRow[] {
    const row = this.users.get(String(values[0]));
    if (!row) return [];
    row.last_seen_at = new Date();
    row.updated_at = row.last_seen_at;
    return [row];
  }

  private updateUserMembership(values: QueryValues): UserRow[] {
    const row = this.users.get(String(values[0]));
    if (!row) return [];
    row.membership_status = values[1] as UserRow["membership_status"];
    row.current_membership_id = values[2] === null ? null : String(values[2]);
    row.updated_at = new Date();
    return [row];
  }

  private apiKeyMapKey(userSub: string, platform: ApiKeyPlatform): string {
    return `${userSub}:${platform}`;
  }

  private upsertApiKey(values: QueryValues): ApiKeyRow {
    const now = new Date();
    const userSub = String(values[1]);
    const platform = values[2] as ApiKeyPlatform;
    const mapKey = this.apiKeyMapKey(userSub, platform);
    const existing = this.apiKeys.get(mapKey);
    const row: ApiKeyRow = {
      id: existing?.id ?? String(values[0]),
      user_sub: userSub,
      platform,
      label: values[3] === null ? null : String(values[3]),
      encrypted_key: values[4] as Buffer,
      key_iv: values[5] as Buffer,
      key_auth_tag: values[6] as Buffer,
      key_digest: String(values[7]),
      key_fingerprint: String(values[8]),
      created_at: existing?.created_at ?? now,
      updated_at: now,
      last_used_at: existing?.last_used_at ?? null,
    };
    this.apiKeys.set(mapKey, row);
    return row;
  }

  private findApiKey(values: QueryValues): ApiKeyRow[] {
    const row = this.apiKeys.get(this.apiKeyMapKey(String(values[0]), values[1] as ApiKeyPlatform));
    return row ? [row] : [];
  }

  private listApiKeys(values: QueryValues): ApiKeyRow[] {
    const userSub = String(values[0]);
    return [...this.apiKeys.values()]
      .filter((row) => row.user_sub === userSub)
      .sort((left, right) => right.updated_at.getTime() - left.updated_at.getTime());
  }

  private markApiKeyUsed(values: QueryValues): ApiKeyRow[] {
    const row = this.apiKeys.get(this.apiKeyMapKey(String(values[0]), values[1] as ApiKeyPlatform));
    if (!row) return [];
    row.last_used_at = new Date();
    row.updated_at = row.last_used_at;
    return [row];
  }

  private findCurrentMembership(values: QueryValues): MembershipRow[] {
    const userSub = String(values[0]);
    const at = values[1] instanceof Date ? values[1] : new Date();
    const current = [...this.memberships.values()]
      .filter((row) => row.user_sub === userSub)
      .sort((left, right) => {
        const leftRank = this.membershipRank(left, at);
        const rightRank = this.membershipRank(right, at);
        return leftRank - rightRank || right.expires_at.getTime() - left.expires_at.getTime();
      })[0];
    return current ? [current] : [];
  }

  private membershipRank(row: MembershipRow, at: Date): number {
    if (row.status === "active" && row.starts_at <= at && row.expires_at > at) return 0;
    if (row.status === "active") return 1;
    if (row.status === "cancelled") return 2;
    return 3;
  }

  private insertMembership(values: QueryValues): MembershipRow {
    const now = new Date();
    const status = values[2] === "active" || values[2] === "expired" ? values[2] : "active";
    const row: MembershipRow = {
      id: String(values[0]),
      user_sub: String(values[1]),
      status,
      starts_at: values[2] instanceof Date ? values[2] : (values[3] as Date),
      expires_at: values[3] instanceof Date ? values[3] : (values[4] as Date),
      cancelled_at: null,
      created_at: now,
      updated_at: now,
    };
    this.memberships.set(row.id, row);
    return row;
  }

  private extendMembership(values: QueryValues): MembershipRow[] {
    const row = this.memberships.get(String(values[0]));
    if (!row) return [];
    const startsAt = values[1] as Date;
    row.status = "active";
    row.starts_at = row.starts_at > startsAt ? startsAt : row.starts_at;
    row.expires_at = values[2] as Date;
    row.cancelled_at = null;
    row.updated_at = new Date();
    return [row];
  }

  private insertPaymentOrder(values: QueryValues): PaymentOrderRow {
    const now = new Date();
    const row: PaymentOrderRow = {
      id: String(values[0]),
      user_sub: String(values[1]),
      provider: values[2] as PaymentOrderRow["provider"],
      provider_order_id: String(values[3]),
      status: "pending",
      amount_cents: Number(values[4]),
      currency: String(values[5]),
      membership_months: Number(values[6]),
      subject: String(values[7]),
      checkout_url: null,
      order_expires_at: values[8] as Date,
      paid_at: null,
      failed_at: null,
      failure_reason: null,
      callback_payload: null,
      created_at: now,
      updated_at: now,
    };
    this.paymentOrders.set(row.id, row);
    return row;
  }

  private setCheckoutUrl(values: QueryValues): PaymentOrderRow[] {
    const row = this.paymentOrders.get(String(values[0]));
    if (!row) return [];
    row.checkout_url = values[1] === null ? null : String(values[1]);
    row.updated_at = new Date();
    return [row];
  }

  private findPaymentOrderByUser(values: QueryValues): PaymentOrderRow[] {
    const row = this.paymentOrders.get(String(values[0]));
    return row && row.user_sub === String(values[1]) ? [row] : [];
  }

  private findPaymentOrderForCallback(values: QueryValues): PaymentOrderRow[] {
    const provider = values[0];
    const orderId = values[1];
    const providerOrderId = values[2];
    const row = [...this.paymentOrders.values()].find(
      (candidate) =>
        candidate.provider === provider &&
        ((orderId !== null && candidate.id === orderId) ||
          (providerOrderId !== null && candidate.provider_order_id === providerOrderId)),
    );
    return row ? [row] : [];
  }

  private markPaymentPaid(values: QueryValues): PaymentOrderRow[] {
    const row = this.paymentOrders.get(String(values[0]));
    if (!row) return [];
    row.status = "paid";
    row.paid_at = values[1] as Date;
    row.callback_payload = String(values[2]);
    row.updated_at = new Date();
    return [row];
  }

  private markPaymentFailed(values: QueryValues): PaymentOrderRow[] {
    const row = this.findPaymentOrderForCallback(values)[0];
    if (!row) return [];
    if (row.status !== "paid") {
      row.status = "failed";
      row.failed_at = values[3] as Date;
      row.failure_reason = String(values[4]);
    }
    row.callback_payload = String(values[5]);
    row.updated_at = new Date();
    return [row];
  }

  private insertSearchHistory(values: QueryValues): SearchHistoryRow {
    const row: SearchHistoryRow = {
      id: String(values[0]),
      user_sub: String(values[1]),
      platform: values[2] as ApiKeyPlatform,
      keyword: String(values[3]),
      search_mode: values[4] as SearchHistoryRow["search_mode"],
      province: values[5] === null ? null : String(values[5]),
      city: values[6] === null ? null : String(values[6]),
      district: values[7] === null ? null : String(values[7]),
      result_count: Number(values[8]),
      total_count: values[9] === null ? null : Number(values[9]),
      created_at: new Date(),
    };
    this.searchHistory.push(row);
    return row;
  }

  private listSearchHistory(values: QueryValues): SearchHistoryRow[] {
    const userSub = String(values[0]);
    const limit = Math.min(Math.max(Number(values[1] ?? 50), 1), 100);
    return this.searchHistory
      .filter((row) => row.user_sub === userSub)
      .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())
      .slice(0, limit);
  }
}

interface JsonResponse<T> {
  status: number;
  headers: Headers;
  body: T;
}

async function readJson<T>(response: Response): Promise<JsonResponse<T>> {
  const body = (await response.json()) as T;
  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}

async function startHttpServer(
  handler: http.RequestListener,
): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function mapProviderPayload(url: URL): Response {
  const keyword = url.searchParams.get("keywords") ?? url.searchParams.get("keyword") ?? "关键词";
  const pois = Array.from({ length: 15 }, (_, index) => {
    const duplicate = index === 1;
    const stableIndex = duplicate ? 0 : index;
    return {
      id: `amap-${stableIndex}`,
      name: duplicate ? `${keyword} 商户 0` : `${keyword} 商户 ${index}`,
      address: duplicate ? " 东城区 测试路 0 号 " : ` 东城区 测试路 ${index} 号 `,
      pname: "北京市",
      cityname: "北京市",
      adname: "东城区",
      type: "餐饮服务;中餐厅",
      tel: duplicate
        ? "010 8000-0000；010 8000-0000"
        : `010 8000-00${String(index).padStart(2, "0")}`,
      location: `116.4${index},39.9${index}`,
    };
  });

  return Response.json({ status: "1", count: "15", pois });
}

function installFetchMock(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input.toString() : input.url,
    );

    if (url.hostname === "restapi.amap.com") {
      return mapProviderPayload(url);
    }

    if (url.hostname === "payments.test") {
      return Response.json({ paymentUrl: "https://payments.test/checkout/e2e" });
    }

    return originalFetch(input, init);
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function authCookie(
  privateKey: string | Buffer,
  keyId: string,
  authUrl: string,
  appToken: string,
): string {
  const token = jwt.sign(
    {
      sub: "user-e2e-001",
      email: "e2e@example.com",
      name: "端到端测试用户",
      picture: "https://example.com/e2e.png",
      aud: appToken,
      iss: authUrl,
    },
    privateKey,
    { algorithm: "RS256", keyid: keyId, expiresIn: "1h" },
  );
  return `mctai_session=${token}`;
}

function hmacSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function createConfig(authUrl: string, appBaseUrl: string): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 0,
      nodeEnv: "test",
      selfUrl: appBaseUrl,
    },
    auth: {
      authUrl,
      appToken: "app_e2e",
      jwksUrl: `${authUrl}/.well-known/jwks.json`,
    },
    database: {
      connectionString: "postgres://e2e.invalid/e2e",
      maxConnections: 1,
      idleTimeoutMillis: 1_000,
      connectionTimeoutMillis: 1_000,
      statementTimeoutMillis: 5_000,
      ssl: false,
    },
    email: {},
    keyEncryption: {
      secret: "e2e-api-key-secret",
      salt: "e2e-api-key-salt",
    },
    payment: {
      provider: "alipay",
      appId: "e2e-app",
      merchantId: "e2e-merchant",
      gatewayUrl: "https://payments.test/create",
      webhookSecret: "e2e-webhook-secret",
      annualPriceCents: 19900,
      currency: "CNY",
    },
    maps: {},
  };
}

void test("critical registered-user POI flow from key setup through member export", async (t) => {
  const restoreFetch = installFetchMock();
  t.after(restoreFetch);

  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const keyId = "e2e-key";
  const jwksServer = await startHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [{ ...jwk, kid: keyId, alg: "RS256", use: "sig" }] }));
  });
  t.after(() => closeServer(jwksServer.server));

  const database = new E2eDatabase();
  const appServer = await startHttpServer((req, res) => {
    const config = createConfig(jwksServer.url, `http://${req.headers.host ?? "127.0.0.1"}`);
    const app = createApp(config.server, {
      auth: config.auth,
      database: database as unknown as Database,
      email: config.email,
      keyEncryption: config.keyEncryption,
      payment: config.payment,
    });
    app(req, res);
  });
  t.after(() => closeServer(appServer.server));

  const cookie = authCookie(
    privateKey.export({ format: "pem", type: "pkcs8" }),
    keyId,
    jwksServer.url,
    "app_e2e",
  );
  const request = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${appServer.url}${path}`, {
      ...init,
      headers: {
        cookie,
        "content-type": "application/json",
        ...init.headers,
      },
    });

  const session = await readJson<SessionResponse>(await request("/api/auth/session"));
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.email, "e2e@example.com");
  assert.equal(session.body.user.membershipStatus, "none");

  const keySave = await readJson<ApiKeyResponse>(
    await request("/api/api-keys", {
      method: "POST",
      body: JSON.stringify({ platform: "amap", apiKey: "amap-e2e-key", label: "高德测试 Key" }),
    }),
  );
  assert.equal(keySave.status, 201);
  assert.equal(keySave.body.key.platform, "amap");
  assert.match(keySave.body.key.maskedKey, /^\*\*\*\*/);

  const singleSearch = await readJson<MapPoiSearchResponse>(
    await request("/api/searches", {
      method: "POST",
      body: JSON.stringify({
        platform: "amap",
        province: "北京市",
        city: "北京市",
        district: "东城区",
        keyword: "餐饮",
        pageSize: 20,
      }),
    }),
  );
  assert.equal(singleSearch.status, 200);
  assert.equal(singleSearch.body.results.length, 14);
  assert.equal(singleSearch.body.results.slice(0, 10).length, 10);
  assert.equal(singleSearch.body.results[0]?.contact.phone, "0108000-0000");
  assert.equal(singleSearch.body.results[0]?.address, "北京市北京市东城区测试路0号");

  const lockedBatch = await readJson<{ error: { code: string; message: string } }>(
    await request("/api/searches/batch", {
      method: "POST",
      body: JSON.stringify({
        platform: "amap",
        keywords: ["餐饮", "酒店"],
        province: "北京市",
        city: "北京市",
        district: "东城区",
      }),
    }),
  );
  assert.equal(lockedBatch.status, 403);
  assert.equal(lockedBatch.body.error.code, "MEMBERSHIP_REQUIRED");

  const orderResponse = await readJson<PaymentOrderResponse>(
    await request("/api/payments/orders", {
      method: "POST",
      body: JSON.stringify({ provider: "alipay" }),
    }),
  );
  assert.equal(orderResponse.status, 201);
  assert.equal(orderResponse.body.paymentUrl, "https://payments.test/checkout/e2e");
  assert.equal(orderResponse.body.order.status, "pending");

  const paidAt = new Date().toISOString();
  const callbackBody = JSON.stringify({
    providerOrderId: orderResponse.body.order.providerOrderId,
    status: "paid",
    amountCents: orderResponse.body.order.amountCents,
    paidAt,
  });
  const callback = await readJson<PaymentCallbackResponse>(
    await fetch(`${appServer.url}/api/payments/callback/alipay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": hmacSignature("e2e-webhook-secret", callbackBody),
      },
      body: callbackBody,
    }),
  );
  assert.equal(callback.status, 200);
  assert.equal(callback.body.status, "paid");
  assert.ok(callback.body.membershipExpiresAt);

  const memberSession = await readJson<SessionResponse>(await request("/api/auth/session"));
  assert.equal(memberSession.status, 200);
  assert.equal(memberSession.body.user.membershipStatus, "active");
  assertValidMembershipExpiry(memberSession.body.user, paidAt);

  const batchSearch = await readJson<BatchKeywordSearchResponse>(
    await request("/api/searches/batch", {
      method: "POST",
      body: JSON.stringify({
        platform: "amap",
        keywords: ["餐饮", "酒店"],
        province: "北京市",
        city: "北京市",
        district: "东城区",
        pageSize: 20,
      }),
    }),
  );
  assert.equal(batchSearch.status, 200);
  assert.equal(batchSearch.body.batch, true);
  assert.deepEqual(batchSearch.body.keywords, ["餐饮", "酒店"]);
  assert.equal(
    new Set(batchSearch.body.results.map(resultIdentity)).size,
    batchSearch.body.results.length,
  );
  assert.ok(batchSearch.body.results.length > 10);
  assert.ok(batchSearch.body.results.some((result) => result.name === "酒店 商户 2"));

  const exportResponse = await request("/api/exports/results", {
    method: "POST",
    body: JSON.stringify({
      format: "csv",
      title: "E2E 查询结果",
      results: batchSearch.body.results.slice(0, 12),
    }),
  });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-disposition") ?? "", /poi-results-.*\.csv/);
  const complianceNotice = decodeURIComponent(
    exportResponse.headers.get("x-export-compliance-notice") ?? "",
  );
  assert.match(complianceNotice, /合法授权范围/);
  const csv = await exportResponse.text();
  assert.match(csv, /名称/);
  assert.match(csv, /餐饮 商户 2/);

  const history = await readJson<SearchHistoryListResponse>(await request("/api/history?limit=10"));
  assert.equal(history.status, 200);
  assert.ok(
    history.body.history.some((item) => item.searchMode === "single" && item.keyword === "餐饮"),
  );
  assert.ok(
    history.body.history.some(
      (item) => item.searchMode === "batch" && item.keyword === "餐饮 / 酒店",
    ),
  );
});

function resultIdentity(result: MapPoiResult): string {
  return `${result.name}:${result.contact.phone ?? ""}:${result.address ?? ""}`;
}

function assertValidMembershipExpiry(user: PublicUser, paidAt: string): void {
  assert.ok(user.membershipExpiresAt);
  const expectedLowerBound = addMonths(new Date(paidAt), 12).getTime() - 60_000;
  assert.ok(new Date(user.membershipExpiresAt).getTime() >= expectedLowerBound);
}
