import { Router } from "express";
import type { SessionResponse } from "@sinly/shared";
import type { AuthDependencies } from "./common.js";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./middleware.js";
import { toPublicUser } from "./common.js";
import { checkActiveMembership } from "../membership.js";

export function createSessionRouter(dependencies: AuthDependencies): Router {
  const router = Router();

  router.get("/session", requireAuthenticatedUser(dependencies), async (_req, res, next) => {
    try {
      const authContext = getAuthenticatedUser(res);
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
