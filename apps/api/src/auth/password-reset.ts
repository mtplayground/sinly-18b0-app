import type { AuthServiceConfig, EmailServiceConfig, ServerConfig } from "@sinly/config";
import { PasswordResetTokenRepository, UserRepository } from "@sinly/db";
import type { Database } from "@sinly/db";
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import type { PasswordResetConfirmResponse, PasswordResetRequestResponse } from "@sinly/shared";
import { sendEmail } from "../email/service.js";
import { buildLoginUrl, isAuthConfigured, isValidEmail, publicOrigin } from "./common.js";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;

interface PasswordResetRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  email: EmailServiceConfig;
  server: ServerConfig;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

function resetExpiresAt(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}

function readEmail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("email" in body)) {
    return null;
  }

  const value = body.email;
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function readToken(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("token" in body)) {
    return null;
  }

  const value = body.token;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildConfirmUrl(token: string, origin: string): string {
  const url = new URL("/api/auth/password-reset/confirm", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildResetEmailHtml(confirmUrl: string): string {
  return `
    <p>请点击以下链接继续账号找回：</p>
    <p><a href="${confirmUrl}">继续账号找回</a></p>
    <p>链接将在 ${RESET_TOKEN_TTL_MINUTES} 分钟后失效。</p>
  `;
}

function genericRequestResponse(emailSent: boolean): PasswordResetRequestResponse {
  return {
    accepted: true,
    emailSent,
    expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
  };
}

export function createPasswordResetRouter(dependencies: PasswordResetRouterDependencies): Router {
  const router = Router();
  const users = new UserRepository(dependencies.database);
  const resetTokens = new PasswordResetTokenRepository(dependencies.database);

  router.post("/password-reset/request", async (req, res, next) => {
    try {
      const email = readEmail(req.body);
      if (!email || !isValidEmail(email)) {
        res.status(422).json({
          error: {
            code: "INVALID_EMAIL",
            message: "Email format is invalid",
          },
        });
        return;
      }

      const user = await users.findByEmail(email);
      if (!user) {
        res.json(genericRequestResponse(false));
        return;
      }

      const token = createResetToken();
      await resetTokens.create({
        tokenHash: hashToken(token),
        userSub: user.sub,
        email: user.email,
        expiresAt: resetExpiresAt(),
      });

      const confirmUrl = buildConfirmUrl(token, publicOrigin(req, dependencies.server));
      const emailResult = await sendEmail(dependencies.email, {
        to: user.email,
        subject: "账号找回链接",
        html: buildResetEmailHtml(confirmUrl),
        text: `请打开以下链接继续账号找回：${confirmUrl}`,
      });

      res.json(genericRequestResponse(!emailResult.skipped));
    } catch (error) {
      next(error);
    }
  });

  router.post("/password-reset/confirm", async (req, res, next) => {
    try {
      const token = readToken(req.body);
      if (!token) {
        res.status(422).json({
          error: {
            code: "INVALID_TOKEN",
            message: "Reset token is required",
          },
        });
        return;
      }

      const record = await resetTokens.consumeValid(hashToken(token));
      if (!record) {
        res.status(410).json({
          error: {
            code: "TOKEN_EXPIRED",
            message: "Reset token is invalid or expired",
          },
        });
        return;
      }

      if (!isAuthConfigured(dependencies.auth)) {
        res.status(503).json({
          error: {
            code: "AUTH_NOT_CONFIGURED",
            message: "Authentication service is not configured",
          },
        });
        return;
      }

      const payload: PasswordResetConfirmResponse = {
        confirmed: true,
        loginUrl: buildLoginUrl(req, dependencies.server, dependencies.auth),
      };
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/password-reset/confirm", async (req, res, next) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : null;
      if (!token) {
        res.status(422).send("Reset token is required");
        return;
      }

      const record = await resetTokens.consumeValid(hashToken(token));
      if (!record) {
        res.status(410).send("Reset token is invalid or expired");
        return;
      }

      if (!isAuthConfigured(dependencies.auth)) {
        res.status(503).send("Authentication service is not configured");
        return;
      }

      res.redirect(302, buildLoginUrl(req, dependencies.server, dependencies.auth));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
