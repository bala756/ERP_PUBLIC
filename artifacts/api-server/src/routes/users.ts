import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, type Role, type DepartmentCode } from "@workspace/db";
import { eq, and, type SQL } from "drizzle-orm";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUsersQueryParams,
  GetUserParams,
  UpdateUserParams,
  DeactivateUserParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const usersRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    phone: user.phone,
    designation: user.designation,
    dateOfJoining: user.dateOfJoining,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

usersRouter.get("/users", requireAuth, async (req, res) => {
  const parsed = GetUsersQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  const conditions: SQL[] = [];
  if (params.department) {
    conditions.push(eq(usersTable.department, params.department as DepartmentCode));
  }
  if (params.role) {
    conditions.push(eq(usersTable.role, params.role as Role));
  }
  if (params.isActive !== undefined) {
    conditions.push(eq(usersTable.isActive, params.isActive));
  }

  const users = await db
    .select()
    .from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(users.map(formatUser));
});

usersRouter.post(
  "/users",
  requireRole("admin", "director"),
  async (req, res) => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const { password, role, department, ...rest } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(usersTable)
      .values({
        ...rest,
        role: role as Role,
        department: department as DepartmentCode,
        email: rest.email.toLowerCase().trim(),
        passwordHash,
      })
      .returning();

    res.status(201).json(formatUser(user));
  },
);

usersRouter.get("/users/:id", requireAuth, async (req, res) => {
  const parsed = GetUserParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

usersRouter.patch("/users/:id", requireRole("admin", "director"), async (req, res) => {
  const paramsParsed = UpdateUserParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.email !== undefined)
    updates.email = parsed.data.email.toLowerCase().trim();
  if (parsed.data.role !== undefined) updates.role = parsed.data.role as Role;
  if (parsed.data.department !== undefined)
    updates.department = parsed.data.department as DepartmentCode;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.designation !== undefined)
    updates.designation = parsed.data.designation;
  if (parsed.data.dateOfJoining !== undefined)
    updates.dateOfJoining = parsed.data.dateOfJoining;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, paramsParsed.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

usersRouter.patch(
  "/users/:id/deactivate",
  requireRole("admin", "director"),
  async (req, res) => {
    const parsed = DeactivateUserParams.safeParse({
      id: Number(req.params.id),
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ isActive: false })
      .where(eq(usersTable.id, parsed.data.id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(formatUser(user));
  },
);

export default usersRouter;
