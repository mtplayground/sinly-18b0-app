import { Router } from "express";
import type {
  AuthServiceConfig,
  EmailServiceConfig,
  KeyEncryptionConfig,
  ServerConfig,
} from "@sinly/config";
import type { Database } from "@sinly/db";
import type { HealthResponse } from "@sinly/shared";
import { mobileRoutes } from "@sinly/shared";
import { createApiKeyRouter } from "./api-keys.js";
import { createLoginRouter } from "./auth/login.js";
import { createPasswordResetRouter } from "./auth/password-reset.js";
import { createRegisterRouter } from "./auth/register.js";
import { createSessionRouter } from "./auth/session-route.js";
import { createMapSearchRouter } from "./map-search.js";

export interface ApiRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  email: EmailServiceConfig;
  keyEncryption: KeyEncryptionConfig;
  server: ServerConfig;
}

export function createApiRouter(
  startedAt: number,
  version: string,
  dependencies: ApiRouterDependencies,
): Router {
  const router = Router();

  router.use(
    "/auth",
    createLoginRouter({
      auth: dependencies.auth,
      database: dependencies.database,
      server: dependencies.server,
    }),
  );
  router.use(
    "/auth",
    createPasswordResetRouter({
      auth: dependencies.auth,
      database: dependencies.database,
      email: dependencies.email,
      server: dependencies.server,
    }),
  );
  router.use(
    "/auth",
    createRegisterRouter({
      auth: dependencies.auth,
      database: dependencies.database,
      server: dependencies.server,
    }),
  );
  router.use(
    "/auth",
    createSessionRouter({
      auth: dependencies.auth,
      database: dependencies.database,
      server: dependencies.server,
    }),
  );
  router.use(
    "/api-keys",
    createApiKeyRouter({
      auth: dependencies.auth,
      database: dependencies.database,
      keyEncryption: dependencies.keyEncryption,
      server: dependencies.server,
    }),
  );
  router.use(
    "/map-search",
    createMapSearchRouter({
      auth: dependencies.auth,
      database: dependencies.database,
      keyEncryption: dependencies.keyEncryption,
      server: dependencies.server,
    }),
  );

  router.get("/health", async (_req, res, next) => {
    const databaseStartedAt = Date.now();

    try {
      await dependencies.database.healthCheck();
    } catch (error) {
      next(error);
      return;
    }

    const payload: HealthResponse = {
      status: "ok",
      service: "api",
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      database: {
        status: "ok",
        latencyMs: Date.now() - databaseStartedAt,
      },
    };

    res.json(payload);
  });

  router.get("/mobile-shell", (_req, res) => {
    res.json({
      routes: mobileRoutes,
      navigationMode: "single-page-tabs",
    });
  });

  return router;
}
