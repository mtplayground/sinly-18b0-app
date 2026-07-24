import type { AuthServiceConfig, ServerConfig } from "@sinly/config";
import { UserRepository } from "@sinly/db";
import type { Database } from "@sinly/db";
import { Router } from "express";
import type { RegisterResponse } from "@sinly/shared";
import {
  buildLoginUrl,
  isAuthConfigured,
  isUniqueViolation,
  isValidEmail,
  toPublicUser,
  upsertUserFromClaims,
} from "./common.js";
import { verifySession } from "./session.js";

interface RegisterRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  server: ServerConfig;
}

export function createRegisterRouter(dependencies: RegisterRouterDependencies): Router {
  const router = Router();
  const users = new UserRepository(dependencies.database);

  router.post("/register", async (req, res, next) => {
    try {
      if (!isAuthConfigured(dependencies.auth)) {
        res.status(503).json({
          error: {
            code: "AUTH_NOT_CONFIGURED",
            message: "Authentication service is not configured",
          },
        });
        return;
      }

      const claims = await verifySession(req, dependencies.auth);

      if (!claims) {
        res.status(401).json({
          error: {
            code: "AUTH_REQUIRED",
            message: "Authentication is required",
          },
          loginUrl: buildLoginUrl(req, dependencies.server, dependencies.auth),
        });
        return;
      }

      const email = claims.email.toLowerCase();
      if (!isValidEmail(email)) {
        res.status(422).json({
          error: {
            code: "INVALID_EMAIL",
            message: "Email format is invalid",
          },
        });
        return;
      }

      const existingUser = await users.findBySub(claims.sub);
      const user = await upsertUserFromClaims(dependencies.database, claims);
      const payload: RegisterResponse = {
        registered: !existingUser,
        user: toPublicUser(user),
      };

      res.status(existingUser ? 200 : 201).json(payload);
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({
          error: {
            code: "ACCOUNT_ALREADY_EXISTS",
            message: "Account already exists",
          },
        });
        return;
      }

      next(error);
    }
  });

  return router;
}
