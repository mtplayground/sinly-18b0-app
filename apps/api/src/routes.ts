import { Router } from "express";
import type { HealthResponse } from "@sinly/shared";
import { mobileRoutes } from "@sinly/shared";

export function createApiRouter(startedAt: number, version: string): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    const payload: HealthResponse = {
      status: "ok",
      service: "api",
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
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
