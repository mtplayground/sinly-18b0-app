import type { AuthServiceConfig } from "@sinly/config";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { GetPublicKeyOrSecret, JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export interface SessionClaims extends JwtPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

class AuthConfigurationError extends Error {
  readonly code = "AUTH_NOT_CONFIGURED";
  readonly status = 503;

  constructor() {
    super("Authentication service is not configured");
    this.name = "AuthConfigurationError";
  }
}

function requireAuthConfig(config: AuthServiceConfig): Required<AuthServiceConfig> {
  if (!config.authUrl || !config.appToken || !config.jwksUrl) {
    throw new AuthConfigurationError();
  }

  return {
    authUrl: config.authUrl,
    appToken: config.appToken,
    jwksUrl: config.jwksUrl,
  };
}

function isSessionClaims(decoded: string | JwtPayload | undefined): decoded is SessionClaims {
  if (!decoded || typeof decoded === "string") {
    return false;
  }

  return (
    typeof decoded.sub === "string" &&
    (decoded.email === undefined || typeof decoded.email === "string")
  );
}

export async function verifySession(
  req: Request,
  config: AuthServiceConfig,
): Promise<SessionClaims | null> {
  const token = req.cookies?.mctai_session;
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }

  const authConfig = requireAuthConfig(config);
  const jwks = jwksClient({ jwksUri: authConfig.jwksUrl });
  const getKey: GetPublicKeyOrSecret = (header, callback) => {
    if (!header.kid) {
      callback(new Error("Session token is missing a key id"));
      return;
    }

    jwks
      .getSigningKey(header.kid)
      .then((key) => callback(null, key.getPublicKey()))
      .catch((error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error))),
      );
  };

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: authConfig.appToken,
        issuer: authConfig.authUrl,
      },
      (error, decoded) => {
        if (error) {
          resolve(null);
          return;
        }

        if (!isSessionClaims(decoded)) {
          reject(new Error("Session token did not include required user claims"));
          return;
        }

        resolve(decoded);
      },
    );
  });
}
