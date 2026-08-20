import { and, eq } from "drizzle-orm";
import { clinicMembers, clinics, practitionerProfiles, users } from "../../drizzle/schema";
import { getDb } from "../db";

export type WorkspaceRole = "admin" | "practitioner";

export async function ensureWorkspace(user: { id: number; name: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const existing = await db
    .select({ clinic: clinics, membership: clinicMembers, profile: practitionerProfiles })
    .from(clinicMembers)
    .innerJoin(clinics, eq(clinicMembers.clinicId, clinics.id))
    .leftJoin(practitionerProfiles, and(eq(practitionerProfiles.clinicId, clinics.id), eq(practitionerProfiles.userId, user.id)))
    .where(eq(clinicMembers.userId, user.id))
    .limit(1);

  if (existing[0]) return existing[0];

  const created = await db.insert(clinics).values({
    ownerUserId: user.id,
    name: "New clinic",
  }).$returningId();
  const clinicId = created[0]?.id;
  if (!clinicId) throw new Error("Unable to create clinic workspace");

  await db.insert(clinicMembers).values({ clinicId, userId: user.id, role: "admin" });
  await db.insert(practitionerProfiles).values({
    clinicId,
    userId: user.id,
    displayName: user.name || "Clinic administrator",
  });

  const workspace = await db
    .select({ clinic: clinics, membership: clinicMembers, profile: practitionerProfiles })
    .from(clinicMembers)
    .innerJoin(clinics, eq(clinicMembers.clinicId, clinics.id))
    .leftJoin(practitionerProfiles, and(eq(practitionerProfiles.clinicId, clinics.id), eq(practitionerProfiles.userId, user.id)))
    .where(and(eq(clinicMembers.clinicId, clinicId), eq(clinicMembers.userId, user.id)))
    .limit(1);

  if (!workspace[0]) throw new Error("Unable to initialize clinic workspace");
  return workspace[0];
}

export async function getWorkspace(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await db
    .select({ clinic: clinics, membership: clinicMembers, profile: practitionerProfiles, user: users })
    .from(clinicMembers)
    .innerJoin(clinics, eq(clinicMembers.clinicId, clinics.id))
    .innerJoin(users, eq(clinicMembers.userId, users.id))
    .leftJoin(practitionerProfiles, and(eq(practitionerProfiles.clinicId, clinics.id), eq(practitionerProfiles.userId, userId)))
    .where(eq(clinicMembers.userId, userId))
    .limit(1);
  return workspace[0] || null;
}

export async function requireWorkspace(user: { id: number; name: string | null }) {
  return (await getWorkspace(user.id)) || ensureWorkspace(user);
}

export async function requireAdmin(user: { id: number; name: string | null }) {
  const workspace = await requireWorkspace(user);
  if (workspace.membership.role !== "admin") throw new Error("Administrator permissions are required");
  return workspace;
}
