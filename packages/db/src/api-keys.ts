import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Database } from "./database.js";
import { Repository } from "./repository.js";

const API_KEY_CIPHER_ALGORITHM = "aes-256-gcm";
const API_KEY_CIPHER_AAD = Buffer.from("sinly:user-api-key:v1", "utf8");
const API_KEY_IV_BYTES = 12;
const API_KEY_FINGERPRINT_CHARS = 12;

export const apiKeyPlatforms = ["amap", "baidu", "tencent"] as const;
export type ApiKeyPlatform = (typeof apiKeyPlatforms)[number];

export interface ApiKeyEncryptionConfig {
  secret?: string;
  salt?: string;
}

export interface EncryptedApiKeyPayload {
  encryptedKey: Buffer;
  keyIv: Buffer;
  keyAuthTag: Buffer;
  keyDigest: string;
  keyFingerprint: string;
}

export interface ApiKeyRecord {
  id: string;
  userSub: string;
  platform: ApiKeyPlatform;
  label: string | null;
  keyFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}

export interface ApiKeySecretRecord extends ApiKeyRecord {
  apiKey: string;
}

export interface SaveApiKeyInput {
  userSub: string;
  platform: ApiKeyPlatform;
  apiKey: string;
  label?: string | null;
}

interface ApiKeyRow extends QueryResultRow {
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

function normalizeApiKey(apiKey: string): string {
  const normalized = apiKey.trim();
  if (!normalized) {
    throw new Error("API key must not be empty");
  }

  return normalized;
}

function requireEncryptionConfig(config: ApiKeyEncryptionConfig): { secret: string; salt: string } {
  const secret = config.secret?.trim();
  const salt = config.salt?.trim();

  if (!secret || !salt) {
    throw new Error("API key encryption secret and salt are required");
  }

  return { secret, salt };
}

export function isApiKeyPlatform(value: string): value is ApiKeyPlatform {
  return apiKeyPlatforms.includes(value as ApiKeyPlatform);
}

function toApiKeyRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    userSub: row.user_sub,
    platform: row.platform,
    label: row.label,
    keyFingerprint: row.key_fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

export class ApiKeyCipher {
  private readonly key: Buffer;

  constructor(config: ApiKeyEncryptionConfig) {
    const { secret, salt } = requireEncryptionConfig(config);
    this.key = scryptSync(secret, salt, 32);
  }

  encrypt(apiKey: string): EncryptedApiKeyPayload {
    const normalizedApiKey = normalizeApiKey(apiKey);
    const keyIv = randomBytes(API_KEY_IV_BYTES);
    const cipher = createCipheriv(API_KEY_CIPHER_ALGORITHM, this.key, keyIv);
    cipher.setAAD(API_KEY_CIPHER_AAD);

    const encryptedKey = Buffer.concat([cipher.update(normalizedApiKey, "utf8"), cipher.final()]);
    const keyAuthTag = cipher.getAuthTag();
    const keyDigest = this.digest(normalizedApiKey);

    return {
      encryptedKey,
      keyIv,
      keyAuthTag,
      keyDigest,
      keyFingerprint: keyDigest.slice(0, API_KEY_FINGERPRINT_CHARS),
    };
  }

  decrypt(payload: Pick<EncryptedApiKeyPayload, "encryptedKey" | "keyAuthTag" | "keyIv">): string {
    try {
      const decipher = createDecipheriv(API_KEY_CIPHER_ALGORITHM, this.key, payload.keyIv);
      decipher.setAAD(API_KEY_CIPHER_AAD);
      decipher.setAuthTag(payload.keyAuthTag);

      return Buffer.concat([decipher.update(payload.encryptedKey), decipher.final()]).toString(
        "utf8",
      );
    } catch {
      throw new Error("API key decryption failed");
    }
  }

  digest(apiKey: string): string {
    return createHmac("sha256", this.key).update(normalizeApiKey(apiKey)).digest("hex");
  }
}

export class ApiKeyRepository extends Repository {
  constructor(
    database: Database,
    private readonly cipher: ApiKeyCipher,
  ) {
    super(database);
  }

  async upsert(input: SaveApiKeyInput): Promise<ApiKeyRecord> {
    const encrypted = this.cipher.encrypt(input.apiKey);
    const row = await this.one<ApiKeyRow>(
      `
        INSERT INTO user_api_keys (
          id,
          user_sub,
          platform,
          label,
          encrypted_key,
          key_iv,
          key_auth_tag,
          key_digest,
          key_fingerprint
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_sub, platform)
        DO UPDATE SET
          label = EXCLUDED.label,
          encrypted_key = EXCLUDED.encrypted_key,
          key_iv = EXCLUDED.key_iv,
          key_auth_tag = EXCLUDED.key_auth_tag,
          key_digest = EXCLUDED.key_digest,
          key_fingerprint = EXCLUDED.key_fingerprint
        RETURNING *
      `,
      [
        randomUUID(),
        input.userSub,
        input.platform,
        input.label ?? null,
        encrypted.encryptedKey,
        encrypted.keyIv,
        encrypted.keyAuthTag,
        encrypted.keyDigest,
        encrypted.keyFingerprint,
      ],
    );

    return toApiKeyRecord(row);
  }

  async listByUser(userSub: string): Promise<ApiKeyRecord[]> {
    const result = await this.query<ApiKeyRow>(
      `
        SELECT *
        FROM user_api_keys
        WHERE user_sub = $1
        ORDER BY updated_at DESC
      `,
      [userSub],
    );

    return result.rows.map(toApiKeyRecord);
  }

  async findByPlatform(userSub: string, platform: ApiKeyPlatform): Promise<ApiKeyRecord | null> {
    const row = await this.oneOrNone<ApiKeyRow>(
      `
        SELECT *
        FROM user_api_keys
        WHERE user_sub = $1
          AND platform = $2
      `,
      [userSub, platform],
    );

    return row ? toApiKeyRecord(row) : null;
  }

  async getSecretByPlatform(
    userSub: string,
    platform: ApiKeyPlatform,
  ): Promise<ApiKeySecretRecord | null> {
    const row = await this.oneOrNone<ApiKeyRow>(
      `
        SELECT *
        FROM user_api_keys
        WHERE user_sub = $1
          AND platform = $2
      `,
      [userSub, platform],
    );

    if (!row) {
      return null;
    }

    return {
      ...toApiKeyRecord(row),
      apiKey: this.cipher.decrypt({
        encryptedKey: row.encrypted_key,
        keyIv: row.key_iv,
        keyAuthTag: row.key_auth_tag,
      }),
    };
  }

  async markUsed(userSub: string, platform: ApiKeyPlatform): Promise<ApiKeyRecord | null> {
    const row = await this.oneOrNone<ApiKeyRow>(
      `
        UPDATE user_api_keys
        SET last_used_at = NOW()
        WHERE user_sub = $1
          AND platform = $2
        RETURNING *
      `,
      [userSub, platform],
    );

    return row ? toApiKeyRecord(row) : null;
  }

  async deleteByPlatform(userSub: string, platform: ApiKeyPlatform): Promise<boolean> {
    const result = await this.query(
      `
        DELETE FROM user_api_keys
        WHERE user_sub = $1
          AND platform = $2
      `,
      [userSub, platform],
    );

    return result.rowCount === 1;
  }
}
