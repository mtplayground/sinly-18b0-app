import type { KeyEncryptionConfig, ServerConfig } from "@sinly/config";
import { ApiKeyCipher, ApiKeyRepository, isApiKeyPlatform } from "@sinly/db";
import type { ApiKeyPlatform, ApiKeyRecord, Database } from "@sinly/db";
import { Router } from "express";
import type { Response } from "express";
import type {
  ApiKeyDeleteResponse,
  ApiKeyListResponse,
  ApiKeyResponse,
  ApiKeySaveRequest,
  ApiKeySummary,
} from "@sinly/shared";
import type { AuthServiceConfig } from "@sinly/config";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./auth/middleware.js";
import { isUniqueViolation } from "./auth/common.js";

interface ApiKeyRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  keyEncryption: KeyEncryptionConfig;
  server: ServerConfig;
}

type SaveApiKeyBody = Partial<ApiKeySaveRequest>;

function createRepository(dependencies: ApiKeyRouterDependencies): ApiKeyRepository | null {
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

function toApiKeySummary(record: ApiKeyRecord): ApiKeySummary {
  return {
    id: record.id,
    platform: record.platform,
    label: record.label,
    keyFingerprint: record.keyFingerprint,
    maskedKey: `****${record.keyFingerprint}`,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
  };
}

function readBody(body: unknown): SaveApiKeyBody {
  return body && typeof body === "object" ? (body as SaveApiKeyBody) : {};
}

function readPlatform(value: unknown): ApiKeyPlatform | null {
  return typeof value === "string" && isApiKeyPlatform(value) ? value : null;
}

function readApiKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const apiKey = value.trim();
  return apiKey.length > 0 && apiKey.length <= 4096 ? apiKey : null;
}

function readLabel(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const label = value.trim();
  return label ? label.slice(0, 80) : null;
}

function sendEncryptionUnavailable(res: Response): void {
  res.status(503).json({
    error: {
      code: "KEY_ENCRYPTION_NOT_CONFIGURED",
      message: "API key encryption is not configured",
    },
  });
}

export function createApiKeyRouter(dependencies: ApiKeyRouterDependencies): Router {
  const router = Router();
  const apiKeys = createRepository(dependencies);
  const requireUser = requireAuthenticatedUser({
    auth: dependencies.auth,
    database: dependencies.database,
    server: dependencies.server,
  });

  router.use(requireUser);

  router.get("/", async (_req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const records = await apiKeys.listByUser(authContext.user.sub);
      const payload: ApiKeyListResponse = {
        keys: records.map(toApiKeySummary),
      };

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:platform", async (req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const platform = readPlatform(req.params.platform);
      if (!platform) {
        res.status(422).json({
          error: {
            code: "INVALID_PLATFORM",
            message: "Platform must be one of amap, baidu, or tencent",
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const record = await apiKeys.findByPlatform(authContext.user.sub, platform);
      if (!record) {
        res.status(404).json({
          error: {
            code: "API_KEY_NOT_FOUND",
            message: "API key was not found",
          },
        });
        return;
      }

      const payload: ApiKeyResponse = { key: toApiKeySummary(record) };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const body = readBody(req.body);
      const platform = readPlatform(body.platform);
      const apiKey = readApiKey(body.apiKey);
      const label = readLabel(body.label);

      if (!platform || !apiKey || label === undefined) {
        res.status(422).json({
          error: {
            code: "INVALID_API_KEY_REQUEST",
            message: "Platform, apiKey, and optional label are invalid",
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const existing = await apiKeys.findByPlatform(authContext.user.sub, platform);
      if (existing) {
        res.status(409).json({
          error: {
            code: "API_KEY_ALREADY_EXISTS",
            message: "API key already exists for this platform",
          },
        });
        return;
      }

      const record = await apiKeys.upsert({
        userSub: authContext.user.sub,
        platform,
        apiKey,
        label,
      });
      const payload: ApiKeyResponse = { key: toApiKeySummary(record) };

      res.status(201).json(payload);
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({
          error: {
            code: "API_KEY_ALREADY_EXISTS",
            message: "API key already exists for this platform",
          },
        });
        return;
      }

      next(error);
    }
  });

  router.put("/:platform", async (req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const platform = readPlatform(req.params.platform);
      const body = readBody(req.body);
      const apiKey = readApiKey(body.apiKey);
      const label = readLabel(body.label);

      if (!platform || !apiKey || label === undefined) {
        res.status(422).json({
          error: {
            code: "INVALID_API_KEY_REQUEST",
            message: "Platform, apiKey, and optional label are invalid",
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const existing = await apiKeys.findByPlatform(authContext.user.sub, platform);
      if (!existing) {
        res.status(404).json({
          error: {
            code: "API_KEY_NOT_FOUND",
            message: "API key was not found",
          },
        });
        return;
      }

      const record = await apiKeys.upsert({
        userSub: authContext.user.sub,
        platform,
        apiKey,
        label,
      });
      const payload: ApiKeyResponse = { key: toApiKeySummary(record) };

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:platform", async (req, res, next) => {
    try {
      if (!apiKeys) {
        sendEncryptionUnavailable(res);
        return;
      }

      const platform = readPlatform(req.params.platform);
      if (!platform) {
        res.status(422).json({
          error: {
            code: "INVALID_PLATFORM",
            message: "Platform must be one of amap, baidu, or tencent",
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const deleted = await apiKeys.deleteByPlatform(authContext.user.sub, platform);
      if (!deleted) {
        res.status(404).json({
          error: {
            code: "API_KEY_NOT_FOUND",
            message: "API key was not found",
          },
        });
        return;
      }

      const payload: ApiKeyDeleteResponse = { deleted: true };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
