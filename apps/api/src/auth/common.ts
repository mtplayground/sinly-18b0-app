import type { AuthServiceConfig, ServerConfig } from "@sinly/config";
import { UserRepository } from "@sinly/db";
import type { Database, UserRecord } from "@sinly/db";
import type { Request } from "express";
import type { PublicUser } from "@sinly/shared";
import { refreshUserMembership } from "../membership.js";
import type { SessionClaims } from "./session.js";
import { verifySession } from "./session.js";

export interface AuthDependencies {
  auth: AuthServiceConfig;
  database: Database;
  server: ServerConfig;
}

export interface AuthenticatedUserContext {
  claims: SessionClaims;
  user: UserRecord;
}

export interface ErrorWithCode {
  code?: string;
  constraint?: string;
}

function firstHeaderValue(value: string | undefined): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function requestProtocol(req: Request): string {
  const forwardedProto = firstHeaderValue(req.get("x-forwarded-proto"));
  const protocol = forwardedProto ?? req.protocol?.trim() ?? "";
  return protocol ? protocol.replace(/:$/, "") : "https";
}

export function publicOrigin(req: Request, server: ServerConfig): string {
  const requestHost =
    firstHeaderValue(req.get("x-forwarded-host")) ?? firstHeaderValue(req.get("host"));

  if (requestHost) {
    return new URL(`${requestProtocol(req)}://${requestHost}`).origin;
  }

  if (server.selfUrl) {
    return new URL(server.selfUrl).origin;
  }

  throw new Error("Unable to determine public host for auth redirect");
}

export function isAuthConfigured(auth: AuthServiceConfig): auth is Required<AuthServiceConfig> {
  return Boolean(auth.authUrl && auth.appToken && auth.jwksUrl);
}

export function buildLoginUrl(
  req: Request,
  server: ServerConfig,
  auth: Required<AuthServiceConfig>,
): string {
  const loginUrl = new URL("/login", auth.authUrl);
  loginUrl.searchParams.set("app_token", auth.appToken);
  loginUrl.searchParams.set("return_to", new URL("/", publicOrigin(req, server)).toString());
  loginUrl.searchParams.set("provider", "wechat");
  loginUrl.searchParams.set("mode", "one_tap");
  return loginUrl.toString();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailFromClaims(claims: SessionClaims): string | null {
  const email = claims.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  if (!isValidEmail(email)) {
    const error = new Error("Email format is invalid") as Error & { code: string; status: number };
    error.code = "INVALID_EMAIL";
    error.status = 422;
    throw error;
  }

  return email;
}

export function toPublicUser(
  user: UserRecord,
  membershipExpiresAt: Date | null = null,
): PublicUser {
  return {
    sub: user.sub,
    email: user.email,
    account: user.account,
    name: user.name,
    pictureUrl: user.pictureUrl,
    membershipStatus: user.membershipStatus,
    membershipExpiresAt: membershipExpiresAt?.toISOString() ?? null,
    registeredAt: user.registeredAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

export function isUniqueViolation(error: unknown): error is ErrorWithCode {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function upsertUserFromClaims(
  database: Database,
  claims: SessionClaims,
): Promise<UserRecord> {
  const email = emailFromClaims(claims);

  const users = new UserRepository(database);
  const user = await users.upsertIdentity({
    sub: claims.sub,
    email,
    account: email ?? claims.sub,
    name: claims.name ?? null,
    pictureUrl: claims.picture ?? null,
  });

  return refreshUserMembership(database, user);
}

export async function authenticateRequest(
  req: Request,
  dependencies: AuthDependencies,
): Promise<AuthenticatedUserContext | null> {
  const claims = await verifySession(req, dependencies.auth);

  if (!claims) {
    return null;
  }

  const user = await upsertUserFromClaims(dependencies.database, claims);
  return { claims, user };
}
