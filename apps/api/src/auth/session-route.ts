import { Router } from "express";
import type { SessionResponse } from "@sinly/shared";
import type { AuthDependencies } from "./common.js";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./middleware.js";
import { toPublicUser } from "./common.js";

export function createSessionRouter(dependencies: AuthDependencies): Router {
  const router = Router();

  router.get("/session", requireAuthenticatedUser(dependencies), (_req, res) => {
    const authContext = getAuthenticatedUser(res);
    const payload: SessionResponse = {
      authenticated: true,
      user: toPublicUser(authContext.user),
    };

    res.json(payload);
  });

  return router;
}
