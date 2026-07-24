import { loadDatabaseConfig } from "@sinly/db";
import type { DatabaseConfig } from "@sinly/db";
import { readInteger, readOptionalString, readOptionalUrl, readString } from "./env.js";

export interface ServerConfig {
  host: string;
  port: number;
  nodeEnv: string;
  selfUrl?: string;
  allowedCorsOrigin?: string;
}

export interface AuthServiceConfig {
  authUrl?: string;
  appToken?: string;
  jwksUrl?: string;
}

export interface EmailServiceConfig {
  url?: string;
  appToken?: string;
}

export interface KeyEncryptionConfig {
  salt?: string;
  secret?: string;
}

export interface PaymentConfig {
  provider?: string;
  appId?: string;
  merchantId?: string;
  gatewayUrl?: string;
  webhookSecret?: string;
  returnUrl?: string;
  notifyUrl?: string;
  annualPriceCents: number;
  currency: string;
}

export interface MapProviderConfig {
  amapApiKey?: string;
  tencentMapApiKey?: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  auth: AuthServiceConfig;
  email: EmailServiceConfig;
  keyEncryption: KeyEncryptionConfig;
  payment: PaymentConfig;
  maps: MapProviderConfig;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: readString(env, "HOST", "0.0.0.0"),
    port: readInteger(env, "PORT", 8080, { min: 1, max: 65535 }),
    nodeEnv: readString(env, "NODE_ENV", "development"),
    selfUrl: readOptionalUrl(env, "SELF_URL"),
    allowedCorsOrigin: readOptionalUrl(env, "ALLOWED_CORS_ORIGIN"),
  };
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    server: loadServerConfig(env),
    database: loadDatabaseConfig(env),
    auth: {
      authUrl: readOptionalUrl(env, "MCTAI_AUTH_URL"),
      appToken: readOptionalString(env, "MCTAI_AUTH_APP_TOKEN"),
      jwksUrl: readOptionalUrl(env, "MCTAI_AUTH_JWKS_URL"),
    },
    email: {
      url: readOptionalUrl(env, "MCTAI_EMAIL_URL"),
      appToken: readOptionalString(env, "MCTAI_EMAIL_APP_TOKEN"),
    },
    keyEncryption: {
      salt: readOptionalString(env, "API_KEY_ENCRYPTION_SALT"),
      secret: readOptionalString(env, "API_KEY_ENCRYPTION_SECRET"),
    },
    payment: {
      provider: readOptionalString(env, "PAYMENT_PROVIDER"),
      appId: readOptionalString(env, "PAYMENT_APP_ID"),
      merchantId: readOptionalString(env, "PAYMENT_MERCHANT_ID"),
      gatewayUrl: readOptionalUrl(env, "PAYMENT_GATEWAY_URL"),
      webhookSecret: readOptionalString(env, "PAYMENT_WEBHOOK_SECRET"),
      returnUrl: readOptionalUrl(env, "PAYMENT_RETURN_URL"),
      notifyUrl: readOptionalUrl(env, "PAYMENT_NOTIFY_URL"),
      annualPriceCents: readInteger(env, "MEMBERSHIP_ANNUAL_PRICE_CENTS", 19900, {
        min: 1,
      }),
      currency: readOptionalString(env, "PAYMENT_CURRENCY") ?? "CNY",
    },
    maps: {
      amapApiKey: readOptionalString(env, "AMAP_API_KEY"),
      tencentMapApiKey: readOptionalString(env, "TENCENT_MAP_API_KEY"),
    },
  };
}
