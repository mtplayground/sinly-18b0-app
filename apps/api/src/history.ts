import { SearchHistoryRepository } from "@sinly/db";
import type { Database } from "@sinly/db";
import { Router } from "express";
import type { RequestHandler } from "express";
import type { AuthServiceConfig, ServerConfig } from "@sinly/config";
import type { SearchHistoryItem, SearchHistoryListResponse } from "@sinly/shared";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./auth/middleware.js";

interface HistoryRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  server: ServerConfig;
}

function readLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 50;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 50;
  }

  return Math.min(parsed, 100);
}

function toHistoryItem(record: {
  id: string;
  platform: SearchHistoryItem["platform"];
  keyword: string;
  searchMode: SearchHistoryItem["searchMode"];
  province: string | null;
  city: string | null;
  district: string | null;
  resultCount: number;
  totalCount: number | null;
  createdAt: Date;
}): SearchHistoryItem {
  return {
    id: record.id,
    platform: record.platform,
    keyword: record.keyword,
    searchMode: record.searchMode,
    region: {
      province: record.province,
      city: record.city,
      district: record.district,
    },
    resultCount: record.resultCount,
    totalCount: record.totalCount,
    createdAt: record.createdAt.toISOString(),
  };
}

function createListHistoryHandler(database: Database): RequestHandler {
  const history = new SearchHistoryRepository(database);

  return async (req, res, next) => {
    try {
      const authContext = getAuthenticatedUser(res);
      const records = await history.listByUser(authContext.user.sub, readLimit(req.query.limit));
      const payload: SearchHistoryListResponse = {
        history: records.map(toHistoryItem),
      };

      res.json(payload);
    } catch (error) {
      next(error);
    }
  };
}

export function createHistoryRouter(dependencies: HistoryRouterDependencies): Router {
  const router = Router();
  const requireUser = requireAuthenticatedUser({
    auth: dependencies.auth,
    database: dependencies.database,
    server: dependencies.server,
  });

  router.use(requireUser);
  router.get("/", createListHistoryHandler(dependencies.database));

  return router;
}
