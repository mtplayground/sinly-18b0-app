import { Router } from "express";
import type { LoginResponse } from "@sinly/shared";
import type { AuthDependencies } from "./common.js";
import { buildLoginUrl, isAuthConfigured } from "./common.js";

export function createLoginRouter(dependencies: AuthDependencies): Router {
  const router = Router();

  router.get("/login", (req, res) => {
    if (!isAuthConfigured(dependencies.auth)) {
      res.status(503).json({
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message: "Authentication service is not configured",
        },
      });
      return;
    }

    res.redirect(302, buildLoginUrl(req, dependencies.server, dependencies.auth));
  });

  router.post("/login", (req, res) => {
    if (!isAuthConfigured(dependencies.auth)) {
      res.status(503).json({
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message: "Authentication service is not configured",
        },
      });
      return;
    }

    const payload: LoginResponse = {
      loginUrl: buildLoginUrl(req, dependencies.server, dependencies.auth),
    };
    res.json(payload);
  });

  return router;
}
