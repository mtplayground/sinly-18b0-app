import { Router } from "express";
import type { AuthServiceConfig, ServerConfig } from "@sinly/config";
import type { Database } from "@sinly/db";
import type { HealthResponse } from "@sinly/shared";
import { mobileRoutes } from "@sinly/shared";
import { createRegisterRouter } from "./auth/register.js";

export interface ApiRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
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
    createRegisterRouter({
      auth: dependencies.auth,
      database: dependencies.database,
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
