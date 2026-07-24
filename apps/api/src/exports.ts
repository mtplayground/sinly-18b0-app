import type { AuthServiceConfig, ServerConfig } from "@sinly/config";
import type { Database } from "@sinly/db";
import type { MapPoiResult, ResultExportFormat, ResultExportRequest } from "@sinly/shared";
import { Router } from "express";
import type { RequestHandler } from "express";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./auth/middleware.js";
import { requireActiveMembership } from "./membership.js";

const MAX_EXPORT_RESULTS = 1_000;
const COMPLIANCE_NOTICE = "仅可在合法授权范围内使用导出数据，避免超范围留存、共享或处理个人信息。";

interface ExportRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  server: ServerConfig;
}

interface ExportRow {
  name: string;
  phone: string;
  address: string;
  province: string;
  city: string;
  district: string;
  category: string;
  provider: string;
}

function readBody(body: unknown): Partial<ResultExportRequest> {
  return body && typeof body === "object" ? (body as Partial<ResultExportRequest>) : {};
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isExportFormat(value: unknown): value is ResultExportFormat {
  return value === "csv" || value === "excel";
}

function isResult(value: unknown): value is MapPoiResult {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeCell(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function resultAddress(result: MapPoiResult): string {
  return (
    normalizeCell(result.address) ||
    [result.province, result.city, result.district].map(normalizeCell).filter(Boolean).join("")
  );
}

function toRow(result: MapPoiResult): ExportRow | null {
  const name = normalizeCell(result.name);
  if (!name) {
    return null;
  }

  return {
    name,
    phone: normalizeCell(result.contact?.phone),
    address: resultAddress(result),
    province: normalizeCell(result.province),
    city: normalizeCell(result.city),
    district: normalizeCell(result.district),
    category: normalizeCell(result.category),
    provider: result.provider,
  };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: ExportRow[]): string {
  const header = ["名称", "联系方式", "地址", "省", "市", "区县", "分类", "平台"];
  const body = rows.map((row) =>
    [
      row.name,
      row.phone,
      row.address,
      row.province,
      row.city,
      row.district,
      row.category,
      row.provider,
    ]
      .map(csvCell)
      .join(","),
  );

  return `\uFEFF${[header.map(csvCell).join(","), ...body].join("\n")}\n`;
}

function htmlCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExcelHtml(title: string, rows: ExportRow[]): string {
  const headers = ["名称", "联系方式", "地址", "省", "市", "区县", "分类", "平台"];
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${[
          row.name,
          row.phone,
          row.address,
          row.province,
          row.city,
          row.district,
          row.category,
          row.provider,
        ]
          .map((cell) => `<td>${htmlCell(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlCell(title)}</title>
</head>
<body>
  <table>
    <thead><tr>${headers.map((header) => `<th>${htmlCell(header)}</th>`).join("")}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
}

function createExportResultsHandler(database: Database): RequestHandler {
  return async (req, res, next) => {
    try {
      const authContext = getAuthenticatedUser(res);
      if (!(await requireActiveMembership(database, authContext.user, res))) {
        return;
      }

      const body = readBody(req.body);
      if (!isExportFormat(body.format)) {
        res.status(422).json({
          error: {
            code: "INVALID_EXPORT_REQUEST",
            message: "format must be csv or excel",
          },
        });
        return;
      }

      const rows = Array.isArray(body.results)
        ? body.results
            .filter(isResult)
            .slice(0, MAX_EXPORT_RESULTS)
            .map(toRow)
            .filter((row): row is ExportRow => Boolean(row))
        : [];

      if (rows.length === 0) {
        res.status(422).json({
          error: {
            code: "INVALID_EXPORT_REQUEST",
            message: "at least one result is required",
          },
        });
        return;
      }

      const title = readText(body.title) || "整理后的查询结果";
      const extension = body.format === "csv" ? "csv" : "xls";
      const filename = `poi-results-${timestampForFilename()}.${extension}`;

      res.setHeader("X-Export-Compliance-Notice", COMPLIANCE_NOTICE);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      if (body.format === "csv") {
        res.type("text/csv; charset=utf-8").send(buildCsv(rows));
        return;
      }

      res.type("application/vnd.ms-excel; charset=utf-8").send(buildExcelHtml(title, rows));
    } catch (error) {
      next(error);
    }
  };
}

export function createExportRouter(dependencies: ExportRouterDependencies): Router {
  const router = Router();
  const requireUser = requireAuthenticatedUser({
    auth: dependencies.auth,
    database: dependencies.database,
    server: dependencies.server,
  });

  router.use(requireUser);
  router.post("/results", createExportResultsHandler(dependencies.database));

  return router;
}
