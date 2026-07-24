import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentConfig, AuthServiceConfig, ServerConfig } from "@sinly/config";
import {
  isPaymentProvider,
  PaymentOrderRepository,
  type Database,
  type PaymentOrderRecord,
  type PaymentProvider,
} from "@sinly/db";
import { Router } from "express";
import type { Request, RequestHandler } from "express";
import type {
  PaymentCallbackResponse,
  PaymentOrderRequest,
  PaymentOrderResponse,
  PaymentOrderSummary,
} from "@sinly/shared";
import { getAuthenticatedUser, requireAuthenticatedUser } from "./auth/middleware.js";

const MEMBERSHIP_MONTHS = 12;
const ORDER_TTL_MINUTES = 30;
const PAYMENT_SUBJECT = "一年期会员";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAID_STATUSES = new Set(["paid", "success", "trade_success", "trade_finished"]);
const FAILED_STATUSES = new Set(["failed", "closed", "cancelled", "trade_closed"]);

interface PaymentRouterDependencies {
  auth: AuthServiceConfig;
  database: Database;
  payment: PaymentConfig;
  server: ServerConfig;
}

interface PaymentGatewayResponse {
  paymentUrl?: unknown;
  checkoutUrl?: unknown;
  qrCodeUrl?: unknown;
}

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function toSummary(order: PaymentOrderRecord): PaymentOrderSummary {
  return {
    id: order.id,
    provider: order.provider,
    providerOrderId: order.providerOrderId,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    membershipMonths: order.membershipMonths,
    subject: order.subject,
    checkoutUrl: order.checkoutUrl,
    orderExpiresAt: order.orderExpiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

function readBody<T extends object>(body: unknown): Partial<T> {
  return body && typeof body === "object" ? (body as Partial<T>) : {};
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown): string | null {
  const text = readText(value);
  return text && UUID_PATTERN.test(text) ? text : null;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readAmountCents(body: Record<string, unknown>): number | undefined {
  const cents = readInteger(body.amountCents ?? body.amount_cents);
  if (cents !== undefined) {
    return cents;
  }

  const amount = readText(body.totalAmount) ?? readText(body.total_amount);
  if (!amount) {
    return undefined;
  }

  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function readDate(value: unknown, fallback: Date): Date {
  const text = readText(value);
  if (!text) {
    return fallback;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function readProvider(value: unknown, fallback: string | undefined): PaymentProvider | null {
  const provider = readText(value) ?? fallback ?? "alipay";
  return isPaymentProvider(provider) ? provider : null;
}

function orderExpiresAt(now: Date): Date {
  return new Date(now.getTime() + ORDER_TTL_MINUTES * 60 * 1000);
}

function buildPublicUrl(server: ServerConfig, path: string): string | undefined {
  if (!server.selfUrl) {
    return undefined;
  }

  return new URL(path, server.selfUrl).toString();
}

function rawBody(req: Request): Buffer {
  const raw = (req as RawBodyRequest).rawBody;
  return raw ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}

function normalizeSignature(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const signature = value.trim().replace(/^sha256=/i, "");
  return /^[a-f0-9]{64}$/i.test(signature) ? signature.toLowerCase() : null;
}

function verifyCallbackSignature(req: Request, secret: string): boolean {
  const received = normalizeSignature(req.get("x-payment-signature"));
  if (!received) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody(req)).digest("hex");
  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function createGatewayCheckout(
  payment: PaymentConfig,
  order: PaymentOrderRecord,
  server: ServerConfig,
): Promise<{ checkoutUrl: string | null; configured: boolean; message: string }> {
  if (!payment.gatewayUrl || !payment.appId || !payment.merchantId) {
    return {
      checkoutUrl: null,
      configured: false,
      message: "Payment provider is not configured; order is pending and cannot be paid yet",
    };
  }

  const notifyUrl =
    payment.notifyUrl ?? buildPublicUrl(server, `/api/payments/callback/${order.provider}`);
  const returnUrl = payment.returnUrl ?? buildPublicUrl(server, "/membership");
  const response = await fetch(payment.gatewayUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: order.provider,
      app_id: payment.appId,
      merchant_id: payment.merchantId,
      out_trade_no: order.providerOrderId,
      subject: order.subject,
      total_amount: (order.amountCents / 100).toFixed(2),
      amount_cents: order.amountCents,
      currency: order.currency,
      notify_url: notifyUrl,
      return_url: returnUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Payment gateway order creation failed: ${response.status}`);
  }

  const payload = (await response.json()) as PaymentGatewayResponse;
  const checkoutUrl =
    readText(payload.paymentUrl) ?? readText(payload.checkoutUrl) ?? readText(payload.qrCodeUrl);
  if (!checkoutUrl) {
    throw new Error("Payment gateway response did not include a payment URL");
  }

  return {
    checkoutUrl,
    configured: true,
    message: "Payment order created",
  };
}

function readCallbackOrderId(body: Record<string, unknown>): string | undefined {
  return readUuid(body.orderId) ?? readUuid(body.order_id) ?? undefined;
}

function readCallbackProviderOrderId(body: Record<string, unknown>): string | undefined {
  return (
    readText(body.providerOrderId) ??
    readText(body.outTradeNo) ??
    readText(body.out_trade_no) ??
    undefined
  );
}

function readCallbackStatus(body: Record<string, unknown>): string {
  return (
    readText(body.status) ??
    readText(body.tradeStatus) ??
    readText(body.trade_status) ??
    "unknown"
  ).toLowerCase();
}

function createOrderHandler(dependencies: PaymentRouterDependencies): RequestHandler {
  const payments = new PaymentOrderRepository(dependencies.database);

  return async (req, res, next) => {
    try {
      const body = readBody<PaymentOrderRequest>(req.body);
      const provider = readProvider(body.provider, dependencies.payment.provider);
      if (!provider) {
        res.status(422).json({
          error: {
            code: "INVALID_PAYMENT_PROVIDER",
            message: "Payment provider must be alipay or wechat",
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const order = await payments.createPending({
        userSub: authContext.user.sub,
        provider,
        amountCents: dependencies.payment.annualPriceCents,
        currency: dependencies.payment.currency,
        membershipMonths: MEMBERSHIP_MONTHS,
        subject: PAYMENT_SUBJECT,
        orderExpiresAt: orderExpiresAt(new Date()),
      });
      let checkout: Awaited<ReturnType<typeof createGatewayCheckout>>;
      try {
        checkout = await createGatewayCheckout(dependencies.payment, order, dependencies.server);
      } catch (error) {
        await payments.markFailed({
          provider,
          orderId: order.id,
          failedAt: new Date(),
          reason: error instanceof Error ? error.message : "payment gateway order creation failed",
          callbackPayload: {},
        });
        throw error;
      }

      const savedOrder = await payments.setCheckoutUrl(order.id, checkout.checkoutUrl);
      const payload: PaymentOrderResponse = {
        order: toSummary(savedOrder),
        paymentUrl: checkout.checkoutUrl,
        configured: checkout.configured,
        message: checkout.message,
      };

      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  };
}

function getOrderHandler(dependencies: PaymentRouterDependencies): RequestHandler {
  const payments = new PaymentOrderRepository(dependencies.database);

  return async (req, res, next) => {
    try {
      const orderId = readUuid(req.params.orderId);
      if (!orderId) {
        res.status(422).json({
          error: {
            code: "INVALID_PAYMENT_ORDER",
            message: "Payment order id is required",
          },
        });
        return;
      }

      const authContext = getAuthenticatedUser(res);
      const order = await payments.findByUserOrder(authContext.user.sub, orderId);
      if (!order) {
        res.status(404).json({
          error: {
            code: "PAYMENT_ORDER_NOT_FOUND",
            message: "Payment order was not found",
          },
        });
        return;
      }

      res.json({ order: toSummary(order) });
    } catch (error) {
      next(error);
    }
  };
}

function callbackHandler(dependencies: PaymentRouterDependencies): RequestHandler {
  const payments = new PaymentOrderRepository(dependencies.database);

  return async (req, res, next) => {
    try {
      const provider = readProvider(req.params.provider, undefined);
      if (!provider) {
        res.status(422).json({
          error: {
            code: "INVALID_PAYMENT_PROVIDER",
            message: "Payment provider must be alipay or wechat",
          },
        });
        return;
      }

      if (!dependencies.payment.webhookSecret) {
        res.status(503).json({
          error: {
            code: "PAYMENT_WEBHOOK_NOT_CONFIGURED",
            message: "Payment callback verification is not configured",
          },
        });
        return;
      }

      if (!verifyCallbackSignature(req, dependencies.payment.webhookSecret)) {
        res.status(401).json({
          error: {
            code: "PAYMENT_SIGNATURE_INVALID",
            message: "Payment callback signature is invalid",
          },
        });
        return;
      }

      const body = readBody<Record<string, unknown>>(req.body);
      const orderId = readCallbackOrderId(body);
      const providerOrderId = readCallbackProviderOrderId(body);
      if (!orderId && !providerOrderId) {
        res.status(422).json({
          error: {
            code: "INVALID_PAYMENT_CALLBACK",
            message: "Payment callback must include order id or provider order id",
          },
        });
        return;
      }

      const status = readCallbackStatus(body);
      const paidAt = readDate(body.paidAt ?? body.paid_at, new Date());
      const amountCents = readAmountCents(body);

      if (PAID_STATUSES.has(status)) {
        const completed = await payments.completePaid({
          provider,
          orderId,
          providerOrderId,
          amountCents,
          paidAt,
          callbackPayload: body,
        });

        if (!completed) {
          res.status(404).json({
            error: {
              code: "PAYMENT_ORDER_NOT_FOUND",
              message: "Payment order was not found",
            },
          });
          return;
        }

        const payload: PaymentCallbackResponse = {
          accepted: true,
          orderId: completed.order.id,
          status: completed.order.status,
          alreadyPaid: completed.alreadyPaid,
          membershipExpiresAt: completed.membershipExpiresAt.toISOString(),
        };
        res.json(payload);
        return;
      }

      if (FAILED_STATUSES.has(status)) {
        const failed = await payments.markFailed({
          provider,
          orderId,
          providerOrderId,
          failedAt: new Date(),
          reason: `payment provider returned ${status}`,
          callbackPayload: body,
        });

        if (!failed) {
          res.status(404).json({
            error: {
              code: "PAYMENT_ORDER_NOT_FOUND",
              message: "Payment order was not found",
            },
          });
          return;
        }

        const payload: PaymentCallbackResponse = {
          accepted: true,
          orderId: failed.id,
          status: failed.status,
          alreadyPaid: failed.status === "paid",
          membershipExpiresAt: null,
        };
        res.json(payload);
        return;
      }

      res.status(422).json({
        error: {
          code: "UNSUPPORTED_PAYMENT_STATUS",
          message: "Payment callback status is not supported",
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export function createPaymentRouter(dependencies: PaymentRouterDependencies): Router {
  const router = Router();
  const requireUser = requireAuthenticatedUser({
    auth: dependencies.auth,
    database: dependencies.database,
    server: dependencies.server,
  });

  router.post("/callback/:provider", callbackHandler(dependencies));
  router.use(requireUser);
  router.post("/orders", createOrderHandler(dependencies));
  router.get("/orders/:orderId", getOrderHandler(dependencies));

  return router;
}
