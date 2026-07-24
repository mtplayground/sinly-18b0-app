import type { AuthServiceConfig, KeyEncryptionConfig, ServerConfig } from "@sinly/config";
import type { Database } from "@sinly/db";
import { Router } from "express";
import { requireAuthenticatedUser } from "./auth/middleware.js";
import { createMapSearchHandler } from "./map-search.js";

interface SearchRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  keyEncryption: KeyEncryptionConfig;
  server: ServerConfig;
}

export function createSearchRouter(dependencies: SearchRouterDependencies): Router {
  const router = Router();
  const requireUser = requireAuthenticatedUser({
    auth: dependencies.auth,
    database: dependencies.database,
    server: dependencies.server,
  });

  router.use(requireUser);
  router.post("/", createMapSearchHandler(dependencies));

  return router;
}
