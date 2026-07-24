import type { AuthServiceConfig, ServerConfig } from "@sinly/config";
import { UserRepository } from "@sinly/db";
import type { Database, UserRecord } from "@sinly/db";
import { Router } from "express";
import type { Request } from "express";
import type { PublicUser, RegisterResponse } from "@sinly/shared";
import { verifySession } from "./session.js";

interface RegisterRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  server: ServerConfig;
}

interface ErrorWithCode {
  code?: string;
  constraint?: string;
}

function publicOrigin(req: Request, server: ServerConfig): string {
  if (server.selfUrl) {
    return new URL(server.selfUrl).origin;
  }

  const forwardedHost = req.get("x-forwarded-host");
  const host = forwardedHost ?? req.get("host");
  if (!host) {
    throw new Error("Unable to determine public host for auth redirect");
  }

  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}`;
}

function buildLoginUrl(
  req: Request,
  server: ServerConfig,
  auth: Required<AuthServiceConfig>,
): string {
  const loginUrl = new URL("/login", auth.authUrl);
  loginUrl.searchParams.set("app_token", auth.appToken);
  loginUrl.searchParams.set("return_to", new URL("/", publicOrigin(req, server)).toString());
  return loginUrl.toString();
}

function isAuthConfigured(auth: AuthServiceConfig): auth is Required<AuthServiceConfig> {
  return Boolean(auth.authUrl && auth.appToken && auth.jwksUrl);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    sub: user.sub,
    email: user.email,
    account: user.account,
    name: user.name,
    pictureUrl: user.pictureUrl,
    membershipStatus: user.membershipStatus,
    registeredAt: user.registeredAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): error is ErrorWithCode {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
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
      const user = await users.upsertIdentity({
        sub: claims.sub,
        email,
        account: email,
        name: claims.name ?? null,
        pictureUrl: claims.picture ?? null,
      });
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
