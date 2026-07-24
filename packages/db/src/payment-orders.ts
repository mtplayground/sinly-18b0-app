import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import type { Database } from "./database.js";
import { Repository } from "./repository.js";

export type PaymentProvider = "alipay" | "wechat";
export type PaymentOrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface PaymentOrderRecord {
  id: string;
  userSub: string;
  provider: PaymentProvider;
  providerOrderId: string;
  status: PaymentOrderStatus;
  amountCents: number;
  currency: string;
  membershipMonths: number;
  subject: string;
  checkoutUrl: string | null;
  orderExpiresAt: Date;
  paidAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  callbackPayload: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentOrderInput {
  userSub: string;
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  membershipMonths: number;
  subject: string;
  orderExpiresAt: Date;
}

export interface PaymentCheckoutInput {
  orderId: string;
  providerOrderId: string;
  checkoutUrl: string | null;
}

export interface CompletePaymentInput {
  provider: PaymentProvider;
  orderId?: string;
  providerOrderId?: string;
  amountCents?: number;
  paidAt: Date;
  callbackPayload: unknown;
}

export interface FailPaymentInput {
  provider: PaymentProvider;
  orderId?: string;
  providerOrderId?: string;
  failedAt: Date;
  reason: string;
  callbackPayload: unknown;
}

export interface CompletedPayment {
  order: PaymentOrderRecord;
  membershipId: string | null;
  membershipExpiresAt: Date;
  alreadyPaid: boolean;
}

interface PaymentOrderRow extends QueryResultRow {
  id: string;
  user_sub: string;
  provider: PaymentProvider;
  provider_order_id: string;
  status: PaymentOrderStatus;
  amount_cents: number;
  currency: string;
  membership_months: number;
  subject: string;
  checkout_url: string | null;
  order_expires_at: Date;
  paid_at: Date | null;
  failed_at: Date | null;
  failure_reason: string | null;
  callback_payload: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MembershipRow extends QueryResultRow {
  id: string;
  starts_at: Date;
  expires_at: Date;
  status: "active" | "expired" | "cancelled";
}

function toPaymentOrder(row: PaymentOrderRow): PaymentOrderRecord {
  return {
    id: row.id,
    userSub: row.user_sub,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    membershipMonths: row.membership_months,
    subject: row.subject,
    checkoutUrl: row.checkout_url,
    orderExpiresAt: row.order_expires_at,
    paidAt: row.paid_at,
    failedAt: row.failed_at,
    failureReason: row.failure_reason,
    callbackPayload: row.callback_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function providerOrderId(provider: PaymentProvider, orderId: string): string {
  return `${provider}_${orderId}`;
}

function addMonths(value: Date, months: number): Date {
  const next = new Date(value.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

async function findCurrentMembershipForUpdate(
  client: PoolClient,
  userSub: string,
  at: Date,
): Promise<MembershipRow | null> {
  const result = await client.query<MembershipRow>(
    `
      SELECT id, starts_at, expires_at, status
      FROM memberships
      WHERE user_sub = $1
      ORDER BY
        CASE
          WHEN status = 'active' AND starts_at <= $2 AND expires_at > $2 THEN 0
          WHEN status = 'active' THEN 1
          WHEN status = 'cancelled' THEN 2
          ELSE 3
        END,
        expires_at DESC,
        created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [userSub, at],
  );

  return result.rows[0] ?? null;
}

export function isPaymentProvider(value: string): value is PaymentProvider {
  return value === "alipay" || value === "wechat";
}

export class PaymentOrderRepository extends Repository {
  constructor(database: Database) {
    super(database);
  }

  async createPending(input: CreatePaymentOrderInput): Promise<PaymentOrderRecord> {
    const id = randomUUID();
    const row = await this.one<PaymentOrderRow>(
      `
        INSERT INTO payment_orders (
          id,
          user_sub,
          provider,
          provider_order_id,
          amount_cents,
          currency,
          membership_months,
          subject,
          order_expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        id,
        input.userSub,
        input.provider,
        providerOrderId(input.provider, id),
        input.amountCents,
        input.currency,
        input.membershipMonths,
        input.subject,
        input.orderExpiresAt,
      ],
    );

    return toPaymentOrder(row);
  }

  async setCheckoutUrl(orderId: string, checkoutUrl: string | null): Promise<PaymentOrderRecord> {
    const row = await this.one<PaymentOrderRow>(
      `
        UPDATE payment_orders
        SET checkout_url = $2
        WHERE id = $1
        RETURNING *
      `,
      [orderId, checkoutUrl],
    );

    return toPaymentOrder(row);
  }

  async findByUserOrder(userSub: string, orderId: string): Promise<PaymentOrderRecord | null> {
    const row = await this.oneOrNone<PaymentOrderRow>(
      "SELECT * FROM payment_orders WHERE id = $1 AND user_sub = $2",
      [orderId, userSub],
    );

    return row ? toPaymentOrder(row) : null;
  }

  async markFailed(input: FailPaymentInput): Promise<PaymentOrderRecord | null> {
    const callbackPayload = JSON.stringify(input.callbackPayload ?? {});
    const row = await this.oneOrNone<PaymentOrderRow>(
      `
        UPDATE payment_orders
        SET
          status = CASE WHEN status = 'paid' THEN status ELSE 'failed' END,
          failed_at = CASE WHEN status = 'paid' THEN failed_at ELSE $4 END,
          failure_reason = CASE WHEN status = 'paid' THEN failure_reason ELSE $5 END,
          callback_payload = $6::jsonb
        WHERE provider = $1
          AND (
            ($2::uuid IS NOT NULL AND id = $2::uuid)
            OR ($3::text IS NOT NULL AND provider_order_id = $3::text)
          )
        RETURNING *
      `,
      [
        input.provider,
        input.orderId ?? null,
        input.providerOrderId ?? null,
        input.failedAt,
        input.reason.slice(0, 500),
        callbackPayload,
      ],
    );

    return row ? toPaymentOrder(row) : null;
  }

  async completePaid(input: CompletePaymentInput): Promise<CompletedPayment | null> {
    const callbackPayload = JSON.stringify(input.callbackPayload ?? {});

    return this.database.transaction(async (client) => {
      const orderResult = await client.query<PaymentOrderRow>(
        `
          SELECT *
          FROM payment_orders
          WHERE provider = $1
            AND (
              ($2::uuid IS NOT NULL AND id = $2::uuid)
              OR ($3::text IS NOT NULL AND provider_order_id = $3::text)
            )
          FOR UPDATE
        `,
        [input.provider, input.orderId ?? null, input.providerOrderId ?? null],
      );
      const order = orderResult.rows[0];
      if (!order) {
        return null;
      }

      if (order.status === "paid") {
        const currentMembership = await findCurrentMembershipForUpdate(
          client,
          order.user_sub,
          input.paidAt,
        );

        return {
          order: toPaymentOrder(order),
          membershipId: currentMembership?.id ?? null,
          membershipExpiresAt: currentMembership?.expires_at ?? order.paid_at ?? input.paidAt,
          alreadyPaid: true,
        };
      }

      if (order.status !== "pending") {
        throw new Error(`Payment order ${order.id} is not payable from status ${order.status}`);
      }

      if (order.order_expires_at.getTime() <= input.paidAt.getTime()) {
        await client.query(
          `
            UPDATE payment_orders
            SET
              status = 'failed',
              failed_at = $2,
              failure_reason = 'payment callback arrived after order expiry',
              callback_payload = $3::jsonb
            WHERE id = $1
          `,
          [order.id, input.paidAt, callbackPayload],
        );
        throw new Error(`Payment order ${order.id} is expired`);
      }

      if (input.amountCents !== undefined && input.amountCents !== order.amount_cents) {
        await client.query(
          `
            UPDATE payment_orders
            SET
              status = 'failed',
              failed_at = $2,
              failure_reason = 'payment amount mismatch',
              callback_payload = $3::jsonb
            WHERE id = $1
          `,
          [order.id, input.paidAt, callbackPayload],
        );
        throw new Error(`Payment order ${order.id} amount mismatch`);
      }

      const currentMembership = await findCurrentMembershipForUpdate(
        client,
        order.user_sub,
        input.paidAt,
      );
      const active =
        currentMembership?.status === "active" &&
        currentMembership.starts_at.getTime() <= input.paidAt.getTime() &&
        currentMembership.expires_at.getTime() > input.paidAt.getTime();
      const startsAt = active ? currentMembership.expires_at : input.paidAt;
      const expiresAt = addMonths(startsAt, order.membership_months);
      let membershipId: string;

      if (currentMembership?.status === "active") {
        membershipId = currentMembership.id;
        await client.query(
          `
            UPDATE memberships
            SET
              status = 'active',
              starts_at = CASE WHEN starts_at > $2 THEN $2 ELSE starts_at END,
              expires_at = $3,
              cancelled_at = NULL
            WHERE id = $1
          `,
          [membershipId, input.paidAt, expiresAt],
        );
      } else {
        membershipId = randomUUID();
        await client.query(
          `
            INSERT INTO memberships (
              id,
              user_sub,
              status,
              starts_at,
              expires_at
            )
            VALUES ($1, $2, 'active', $3, $4)
          `,
          [membershipId, order.user_sub, input.paidAt, expiresAt],
        );
      }

      const paidResult = await client.query<PaymentOrderRow>(
        `
          UPDATE payment_orders
          SET
            status = 'paid',
            paid_at = $2,
            callback_payload = $3::jsonb
          WHERE id = $1
          RETURNING *
        `,
        [order.id, input.paidAt, callbackPayload],
      );
      const paidOrder = paidResult.rows[0];
      if (!paidOrder) {
        throw new Error(`Payment order ${order.id} disappeared while marking paid`);
      }

      await client.query(
        `
          UPDATE users
          SET
            membership_status = 'active',
            current_membership_id = $2
          WHERE sub = $1
        `,
        [order.user_sub, membershipId],
      );

      return {
        order: toPaymentOrder(paidOrder),
        membershipId,
        membershipExpiresAt: expiresAt,
        alreadyPaid: false,
      };
    });
  }
}
