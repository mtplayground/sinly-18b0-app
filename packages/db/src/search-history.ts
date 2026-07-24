import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { ApiKeyPlatform } from "./api-keys.js";
import type { Database } from "./database.js";
import { Repository } from "./repository.js";

export type SearchHistoryMode = "single" | "batch";

export interface SearchHistoryRecord {
  id: string;
  userSub: string;
  platform: ApiKeyPlatform;
  keyword: string;
  searchMode: SearchHistoryMode;
  province: string | null;
  city: string | null;
  district: string | null;
  resultCount: number;
  totalCount: number | null;
  createdAt: Date;
}

export interface CreateSearchHistoryInput {
  userSub: string;
  platform: ApiKeyPlatform;
  keyword: string;
  searchMode?: SearchHistoryMode;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  resultCount?: number;
  totalCount?: number | null;
}

interface SearchHistoryRow extends QueryResultRow {
  id: string;
  user_sub: string;
  platform: ApiKeyPlatform;
  keyword: string;
  search_mode: SearchHistoryMode;
  province: string | null;
  city: string | null;
  district: string | null;
  result_count: number;
  total_count: number | null;
  created_at: Date;
}

function normalizeKeyword(keyword: string): string {
  const normalized = keyword.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("Search history keyword must not be empty");
  }

  return normalized.slice(0, 500);
}

function normalizeRegionPart(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 80) : null;
}

function normalizeCount(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function toSearchHistoryRecord(row: SearchHistoryRow): SearchHistoryRecord {
  return {
    id: row.id,
    userSub: row.user_sub,
    platform: row.platform,
    keyword: row.keyword,
    searchMode: row.search_mode,
    province: row.province,
    city: row.city,
    district: row.district,
    resultCount: row.result_count,
    totalCount: row.total_count,
    createdAt: row.created_at,
  };
}

export class SearchHistoryRepository extends Repository {
  constructor(database: Database) {
    super(database);
  }

  async create(input: CreateSearchHistoryInput): Promise<SearchHistoryRecord> {
    const resultCount = normalizeCount(input.resultCount) ?? 0;
    const totalCount = normalizeCount(input.totalCount);
    const row = await this.one<SearchHistoryRow>(
      `
        INSERT INTO search_history (
          id,
          user_sub,
          platform,
          keyword,
          search_mode,
          province,
          city,
          district,
          result_count,
          total_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        randomUUID(),
        input.userSub,
        input.platform,
        normalizeKeyword(input.keyword),
        input.searchMode ?? "single",
        normalizeRegionPart(input.province),
        normalizeRegionPart(input.city),
        normalizeRegionPart(input.district),
        resultCount,
        totalCount,
      ],
    );

    return toSearchHistoryRecord(row);
  }

  async listByUser(userSub: string, limit = 50): Promise<SearchHistoryRecord[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.query<SearchHistoryRow>(
      `
        SELECT *
        FROM search_history
        WHERE user_sub = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [userSub, safeLimit],
    );

    return result.rows.map(toSearchHistoryRecord);
  }
}
