import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthDependencies, AuthenticatedUserContext } from "./common.js";
import {
  authenticateRequest,
  buildLoginUrl,
  isAuthConfigured,
  isUniqueViolation,
} from "./common.js";

export function getAuthenticatedUser(res: Response): AuthenticatedUserContext {
  const authContext = res.locals.auth as AuthenticatedUserContext | undefined;
  if (!authContext) {
    throw new Error("Authenticated user context was not set");
  }

  return authContext;
}

export function requireAuthenticatedUser(dependencies: AuthDependencies): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
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

      const authContext = await authenticateRequest(req, dependencies);
      if (!authContext) {
        res.status(401).json({
          error: {
            code: "AUTH_REQUIRED",
            message: "Authentication is required",
          },
          loginUrl: buildLoginUrl(req, dependencies.server, dependencies.auth),
        });
        return;
      }

      res.locals.auth = authContext;
      next();
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
  };
}
