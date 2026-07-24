import { Router } from "express";
import type { SessionResponse } from "@sinly/shared";
import type { AuthDependencies } from "./common.js";
import { authenticateRequest, buildLoginUrl, isAuthConfigured, toPublicUser } from "./common.js";
import { checkActiveMembership } from "../membership.js";

export function createSessionRouter(dependencies: AuthDependencies): Router {
  const router = Router();

  router.get("/session", async (req, res, next) => {
    try {
      const authContext = await authenticateRequest(req, dependencies);
      if (!authContext) {
        const payload: SessionResponse = {
          authenticated: false,
          loginUrl: isAuthConfigured(dependencies.auth)
            ? buildLoginUrl(req, dependencies.server, dependencies.auth)
            : undefined,
        };

        res.json(payload);
        return;
      }

      const membership = await checkActiveMembership(dependencies.database, authContext.user);
      const payload: SessionResponse = {
        authenticated: true,
        user: toPublicUser(membership.user, membership.expiresAt),
      };

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
