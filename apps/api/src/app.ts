import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiRouter } from "./routes.js";
import type { AuthServiceConfig } from "@sinly/config";
import type { EmailServiceConfig } from "@sinly/config";
import type { KeyEncryptionConfig } from "@sinly/config";
import type { ServerConfig } from "@sinly/config";
import type { Database } from "@sinly/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveWebDist(): string {
  return process.env.WEB_DIST_DIR ?? path.resolve(__dirname, "../../web/dist");
}

export interface AppDependencies {
  auth: AuthServiceConfig;
  database: Database;
  email: EmailServiceConfig;
  keyEncryption: KeyEncryptionConfig;
}

export function createApp(config: ServerConfig, dependencies: AppDependencies): express.Express {
  const app = express();
  const startedAt = Date.now();
  const version = process.env.npm_package_version ?? "0.1.0";

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || !config.allowedCorsOrigin || origin === config.allowedCorsOrigin) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(
    "/api",
    createApiRouter(startedAt, version, {
      auth: dependencies.auth,
      database: dependencies.database,
      email: dependencies.email,
      keyEncryption: dependencies.keyEncryption,
      server: config,
    }),
  );

  const webDist = resolveWebDist();
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }

      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "API route not found",
      },
    });
  });

  app.use(
    (
      err: Error & { code?: string; status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Unhandled request error", {
        name: err.name,
        code: err.code,
        message: err.message,
        stack: err.stack,
      });

      res.status(err.status ?? 500).json({
        error: {
          code: err.code ?? "INTERNAL_SERVER_ERROR",
          message: "Request failed",
        },
      });
    },
  );

  return app;
}
