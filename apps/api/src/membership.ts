import { MembershipRepository } from "@sinly/db";
import type { Database, UserRecord } from "@sinly/db";
import type { Response } from "express";

export interface MembershipCheck {
  active: boolean;
  user: UserRecord;
  expiresAt: Date | null;
}

export async function refreshUserMembership(
  database: Database,
  user: UserRecord,
): Promise<UserRecord> {
  const memberships = new MembershipRepository(database);
  const snapshot = await memberships.refreshUserMembershipStatus(user.sub);

  return {
    ...user,
    membershipStatus: snapshot.status,
    currentMembershipId: snapshot.membershipId,
  };
}

export async function checkActiveMembership(
  database: Database,
  user: UserRecord,
): Promise<MembershipCheck> {
  const memberships = new MembershipRepository(database);
  const snapshot = await memberships.refreshUserMembershipStatus(user.sub);
  const refreshedUser: UserRecord = {
    ...user,
    membershipStatus: snapshot.status,
    currentMembershipId: snapshot.membershipId,
  };

  return {
    active: snapshot.status === "active",
    user: refreshedUser,
    expiresAt: snapshot.expiresAt,
  };
}

export async function requireActiveMembership(
  database: Database,
  user: UserRecord,
  res: Response,
): Promise<UserRecord | null> {
  const membership = await checkActiveMembership(database, user);
  if (membership.active) {
    return membership.user;
  }

  res.status(403).json({
    error: {
      code: "MEMBERSHIP_REQUIRED",
      message: "Active annual membership is required",
    },
  });
  return null;
}
