import { Router } from "express";
import {
  db,
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  leaveBalancesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, sql, like, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const employeesRouter = Router();

// SALARY_ROLES: can manage employee records, see salaries, run payroll
const SALARY_ROLES = ["director", "admin", "accounts", "cfo"] as const;
// ATTENDANCE_MARK_ROLES: can mark/edit attendance for any employee (includes managers)
const ATTENDANCE_MARK_ROLES = ["manager", "director", "admin", "accounts", "cfo"] as const;
// APPROVE_ROLES: can approve leave; managers are limited to their own department (enforced in handler)
const APPROVE_ROLES = ["manager", "director", "admin"] as const;
// VIEW_ROLES: all staff can see the sanitized employee directory and their own records
const VIEW_ROLES = ["manager", "director", "admin", "accounts", "cfo", "staff", "sales", "purchase", "production", "service", "stores"] as const;
// SENIOR_APPROVE_ROLES: can approve leave for any department
const SENIOR_APPROVE_ROLES = ["director", "admin"] as const;

function canManageSalary(role: string) { return (SALARY_ROLES as readonly string[]).includes(role); }
function canMarkAttendance(role: string) { return (ATTENDANCE_MARK_ROLES as readonly string[]).includes(role); }
function isSeniorApprover(role: string) { return (SENIOR_APPROVE_ROLES as readonly string[]).includes(role); }

async function getOwnEmployeeId(userId: number): Promise<number | null> {
  const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
    .where(eq(employeesTable.userId, userId));
  return emp?.id ?? null;
}

async function getOwnEmployee(userId: number): Promise<{ id: number; department: string | null } | null> {
  const [emp] = await db
    .select({ id: employeesTable.id, department: employeesTable.department })
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId));
  return emp ?? null;
}

// ─── Serializers ─────────────────────────────────────────────────────────────

// includeSalary: SALARY_ROLES only — controls salary + contact-info visibility
function serializeEmployee(
  e: typeof employeesTable.$inferSelect & { userName?: string | null },
  includeSalary = true,
) {
  // Public directory fields — safe for all authenticated users
  const publicBase = {
    id: e.id,
    employeeCode: e.employeeCode,
    userId: e.userId,
    userName: e.userName ?? null,
    name: e.name,
    designation: e.designation ?? null,
    department: e.department ?? null,
    dateOfJoining: e.dateOfJoining ?? null,
    employmentType: e.employmentType,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
  if (!includeSalary) {
    // Sanitized — no contact info, no salary
    return {
      ...publicBase,
      phone: null,
      email: null,
      basicSalary: null,
      hra: null,
      otherAllowances: null,
      grossSalary: null,
      workingDaysPerMonth: null,
    };
  }
  const basic = parseFloat(e.basicSalary ?? "0");
  const hra = parseFloat(e.hra ?? "0");
  const other = parseFloat(e.otherAllowances ?? "0");
  return {
    ...publicBase,
    phone: e.phone ?? null,
    email: e.email ?? null,
    basicSalary: basic,
    hra,
    otherAllowances: other,
    grossSalary: basic + hra + other,
    workingDaysPerMonth: e.workingDaysPerMonth,
  };
}

function serializeAttendance(r: typeof attendanceRecordsTable.$inferSelect & { employeeName?: string | null }) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName ?? null,
    date: r.date,
    status: r.status,
    notes: r.notes ?? null,
    markedById: r.markedById ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeLeaveRequest(r: typeof leaveRequestsTable.$inferSelect & { employeeName?: string | null; approvedByName?: string | null }) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employeeName ?? null,
    leaveType: r.leaveType,
    fromDate: r.fromDate,
    toDate: r.toDate,
    reason: r.reason ?? null,
    status: r.status,
    approvedById: r.approvedById ?? null,
    approvedByName: r.approvedByName ?? null,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    rejectionNote: r.rejectionNote ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createEmployeeSchema = z.object({
  employeeCode: z.string().min(1).max(20),
  userId: z.number().int().positive().optional(),
  name: z.string().min(1).max(255),
  designation: z.string().max(255).optional(),
  department: z.string().max(100).optional(),
  dateOfJoining: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(255).optional(),
  employmentType: z.enum(["fullTime", "contract", "partTime"]).default("fullTime"),
  basicSalary: z.number().min(0).default(0),
  hra: z.number().min(0).default(0),
  otherAllowances: z.number().min(0).default(0),
  workingDaysPerMonth: z.number().int().min(1).max(31).default(26),
});

const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const markAttendanceSchema = z.object({
  employeeId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["present", "absent", "halfDay", "late", "onLeave"]),
  notes: z.string().optional(),
});

const bulkAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({
    employeeId: z.number().int().positive(),
    status: z.enum(["present", "absent", "halfDay", "late", "onLeave"]),
    notes: z.string().optional(),
  })).min(1),
});

const createLeaveRequestSchema = z.object({
  employeeId: z.number().int().positive(),
  leaveType: z.enum(["casual", "sick", "earned"]),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
});

const approveLeaveSchema = z.object({
  note: z.string().optional(),
});

const rejectLeaveSchema = z.object({
  rejectionNote: z.string().optional(),
});

const setLeaveBalanceSchema = z.object({
  leaveType: z.enum(["casual", "sick", "earned"]),
  year: z.number().int().min(2020),
  totalDays: z.number().int().min(0),
});

// ─── Employee CRUD ─────────────────────────────────────────────────────────────

employeesRouter.get("/employees", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  const { department, isActive, search } = req.query as { department?: string; isActive?: string; search?: string };
  const userRole = req.session.userRole ?? "";
  const withSalary = canManageSalary(userRole);

  const rows = await db
    .select({
      employee: employeesTable,
      userName: usersTable.name,
    })
    .from(employeesTable)
    .leftJoin(usersTable, eq(employeesTable.userId, usersTable.id))
    .orderBy(employeesTable.name);

  let results = rows.map((r) => serializeEmployee({ ...r.employee, userName: r.userName }, withSalary));

  if (department) results = results.filter((e) => e.department === department);
  if (isActive !== undefined) results = results.filter((e) => e.isActive === (isActive === "true"));
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        (e.designation ?? "").toLowerCase().includes(q),
    );
  }

  res.json(results);
});

employeesRouter.post("/employees", requireAuth, requireRole(...SALARY_ROLES), async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const d = parsed.data;

  const existing = await db.select().from(employeesTable).where(eq(employeesTable.employeeCode, d.employeeCode));
  if (existing.length > 0) { res.status(409).json({ error: "Employee code already exists" }); return; }

  const [emp] = await db.insert(employeesTable).values({
    ...d,
    basicSalary: d.basicSalary.toString(),
    hra: d.hra.toString(),
    otherAllowances: d.otherAllowances.toString(),
  }).returning();

  logger.info({ empId: emp.id, code: emp.employeeCode }, "Employee created");
  res.status(201).json(serializeEmployee(emp));
});

employeesRouter.get("/employees/:id", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const userRole = req.session.userRole ?? "";
  const withSalary = canManageSalary(userRole);
  const canViewAll = canMarkAttendance(userRole); // managers+ can view any employee profile

  // Non-manager users can only view their own employee record
  if (!canViewAll) {
    const ownEmpId = await getOwnEmployeeId(req.session.userId!);
    // Deny if no linked employee record, or trying to access someone else's record
    if (ownEmpId === null || ownEmpId !== id) {
      res.status(403).json({ error: "Access denied" }); return;
    }
  }

  const [row] = await db
    .select({ employee: employeesTable, userName: usersTable.name })
    .from(employeesTable)
    .leftJoin(usersTable, eq(employeesTable.userId, usersTable.id))
    .where(eq(employeesTable.id, id));

  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }

  const balances = await db.select().from(leaveBalancesTable).where(eq(leaveBalancesTable.employeeId, id));

  res.json({
    ...serializeEmployee({ ...row.employee, userName: row.userName }, withSalary),
    leaveBalances: balances.map((b) => ({
      id: b.id,
      leaveType: b.leaveType,
      year: b.year,
      totalDays: b.totalDays,
      usedDays: b.usedDays,
      remainingDays: Math.max(0, b.totalDays - b.usedDays),
    })),
  });
});

employeesRouter.patch("/employees/:id", requireAuth, requireRole(...SALARY_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { basicSalary, hra, otherAllowances, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (basicSalary !== undefined) updateData.basicSalary = basicSalary.toString();
  if (hra !== undefined) updateData.hra = hra.toString();
  if (otherAllowances !== undefined) updateData.otherAllowances = otherAllowances.toString();

  const [updated] = await db.update(employeesTable).set(updateData).where(eq(employeesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Employee not found" }); return; }

  res.json(serializeEmployee(updated));
});

employeesRouter.patch("/employees/:id/deactivate", requireAuth, requireRole(...SALARY_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db.update(employeesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(employeesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Employee not found" }); return; }

  res.json(serializeEmployee(updated));
});

// ─── Leave Balances ───────────────────────────────────────────────────────────

employeesRouter.get("/employees/:id/leave-balances", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  const empId = parseInt(String(req.params.id), 10);
  if (isNaN(empId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const userRole = req.session.userRole ?? "";
  // Non-SALARY_ROLES employees can only see their own leave balances
  if (!canManageSalary(userRole)) {
    const ownEmpId = await getOwnEmployeeId(req.session.userId!);
    if (ownEmpId !== empId) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  const year = new Date().getFullYear();
  const balances = await db
    .select()
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.employeeId, empId), eq(leaveBalancesTable.year, year)));

  res.json(balances.map((b) => ({
    id: b.id,
    leaveType: b.leaveType,
    year: b.year,
    totalDays: b.totalDays,
    usedDays: b.usedDays,
    remainingDays: Math.max(0, b.totalDays - b.usedDays),
  })));
});

employeesRouter.post("/employees/:id/leave-balances", requireAuth, requireRole(...SALARY_ROLES), async (req, res) => {
  const empId = parseInt(String(req.params.id), 10);
  if (isNaN(empId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = setLeaveBalanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { leaveType, year, totalDays } = parsed.data;

  const existing = await db
    .select()
    .from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.employeeId, empId), eq(leaveBalancesTable.leaveType, leaveType), eq(leaveBalancesTable.year, year)));

  let balance;
  if (existing.length > 0) {
    [balance] = await db.update(leaveBalancesTable).set({ totalDays }).where(eq(leaveBalancesTable.id, existing[0].id)).returning();
  } else {
    [balance] = await db.insert(leaveBalancesTable).values({ employeeId: empId, leaveType, year, totalDays }).returning();
  }

  res.json({
    id: balance!.id,
    leaveType: balance!.leaveType,
    year: balance!.year,
    totalDays: balance!.totalDays,
    usedDays: balance!.usedDays,
    remainingDays: Math.max(0, balance!.totalDays - balance!.usedDays),
  });
});

// ─── Attendance ────────────────────────────────────────────────────────────────

employeesRouter.get("/attendance", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  const { employeeId, month, year, date: dateParam } = req.query as {
    employeeId?: string; month?: string; year?: string; date?: string;
  };

  const userRole = req.session.userRole ?? "";
  // Non-manager users can only see their own attendance records
  let scopedEmployeeId: number | null = null;
  if (!canMarkAttendance(userRole)) {
    scopedEmployeeId = await getOwnEmployeeId(req.session.userId!);
    // If no employee record linked, return empty
    if (scopedEmployeeId === null) { res.json([]); return; }
  }

  const rows = await db
    .select({ record: attendanceRecordsTable, employeeName: employeesTable.name })
    .from(attendanceRecordsTable)
    .leftJoin(employeesTable, eq(attendanceRecordsTable.employeeId, employeesTable.id))
    .orderBy(desc(attendanceRecordsTable.date));

  let results = rows.map((r) => serializeAttendance({ ...r.record, employeeName: r.employeeName }));

  // Scope to own employee for non-managers; managers+ can filter by any employeeId
  const effectiveEmpId = scopedEmployeeId ?? (employeeId ? parseInt(employeeId, 10) : null);
  if (effectiveEmpId !== null) results = results.filter((r) => r.employeeId === effectiveEmpId);
  if (dateParam) results = results.filter((r) => r.date === dateParam);
  if (month && year) {
    const prefix = `${year}-${month.padStart(2, "0")}`;
    results = results.filter((r) => r.date.startsWith(prefix));
  }

  res.json(results);
});

employeesRouter.post("/attendance", requireAuth, requireRole(...ATTENDANCE_MARK_ROLES), async (req, res) => {
  const parsed = markAttendanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { employeeId, date, status, notes } = parsed.data;

  const existing = await db
    .select()
    .from(attendanceRecordsTable)
    .where(and(eq(attendanceRecordsTable.employeeId, employeeId), eq(attendanceRecordsTable.date, date)));

  let record;
  if (existing.length > 0) {
    [record] = await db
      .update(attendanceRecordsTable)
      .set({ status, notes, markedById: req.session.userId, updatedAt: new Date() })
      .where(eq(attendanceRecordsTable.id, existing[0].id))
      .returning();
  } else {
    [record] = await db
      .insert(attendanceRecordsTable)
      .values({ employeeId, date, status, notes, markedById: req.session.userId })
      .returning();
  }

  res.status(201).json(serializeAttendance(record!));
});

employeesRouter.post("/attendance/bulk", requireAuth, requireRole(...ATTENDANCE_MARK_ROLES), async (req, res) => {
  const parsed = bulkAttendanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { date, records } = parsed.data;

  const results = await db.transaction(async (tx) => {
    const inserted = [];
    for (const rec of records) {
      const existing = await tx
        .select()
        .from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.employeeId, rec.employeeId), eq(attendanceRecordsTable.date, date)));

      if (existing.length > 0) {
        const [updated] = await tx
          .update(attendanceRecordsTable)
          .set({ status: rec.status, notes: rec.notes, markedById: req.session.userId, updatedAt: new Date() })
          .where(eq(attendanceRecordsTable.id, existing[0].id))
          .returning();
        inserted.push(updated);
      } else {
        const [created] = await tx
          .insert(attendanceRecordsTable)
          .values({ employeeId: rec.employeeId, date, status: rec.status, notes: rec.notes, markedById: req.session.userId })
          .returning();
        inserted.push(created);
      }
    }
    return inserted;
  });

  res.status(201).json(results.map((r) => serializeAttendance(r!)));
});

employeesRouter.get("/attendance/summary", requireAuth, requireRole(...ATTENDANCE_MARK_ROLES), async (req, res) => {
  const { month, year } = req.query as { month?: string; year?: string };
  if (!month || !year) { res.status(400).json({ error: "month and year are required" }); return; }

  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  const employees = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.isActive, true))
    .orderBy(employeesTable.name);

  const attendanceRows = await db
    .select()
    .from(attendanceRecordsTable)
    .where(sql`${attendanceRecordsTable.date} LIKE ${prefix + "-%"}`);

  const byEmployee = new Map<number, typeof attendanceRows>();
  for (const row of attendanceRows) {
    if (!byEmployee.has(row.employeeId)) byEmployee.set(row.employeeId, []);
    byEmployee.get(row.employeeId)!.push(row);
  }

  const userRole = req.session.userRole ?? "";
  const includeSalaryInSummary = canManageSalary(userRole);

  const summary = employees.map((emp) => {
    const records = byEmployee.get(emp.id) ?? [];
    const present = records.filter((r) => r.status === "present").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const halfDay = records.filter((r) => r.status === "halfDay").length;
    const late = records.filter((r) => r.status === "late").length;
    const onLeave = records.filter((r) => r.status === "onLeave").length;
    const effectiveDays = present + late + halfDay * 0.5 + onLeave;

    const base = {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      department: emp.department ?? null,
      present,
      absent,
      halfDay,
      late,
      onLeave,
      effectiveDays,
      workingDaysPerMonth: emp.workingDaysPerMonth,
    };

    if (!includeSalaryInSummary) {
      return { ...base, basicSalary: null, hra: null, otherAllowances: null, grossSalary: null, netPay: null };
    }

    const basic = parseFloat(emp.basicSalary ?? "0");
    const hra = parseFloat(emp.hra ?? "0");
    const other = parseFloat(emp.otherAllowances ?? "0");
    const grossSalary = basic + hra + other;
    const netPay = emp.workingDaysPerMonth > 0 ? (effectiveDays / emp.workingDaysPerMonth) * grossSalary : 0;
    return { ...base, basicSalary: basic, hra, otherAllowances: other, grossSalary, netPay: Math.round(netPay * 100) / 100 };
  });

  res.json(summary);
});

// ─── Leave Requests ────────────────────────────────────────────────────────────

employeesRouter.get("/leave-requests", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  const { employeeId, status } = req.query as { employeeId?: string; status?: string };

  const userRole = req.session.userRole ?? "";

  // Non-attendance-mark roles: see only their own requests
  let scopedEmployeeId: number | null = null;
  if (!canMarkAttendance(userRole)) {
    scopedEmployeeId = await getOwnEmployeeId(req.session.userId!);
    if (scopedEmployeeId === null) { res.json([]); return; }
  }

  // Managers (not senior approvers): see only their department's requests
  // If the manager has no linked employee record or no department, default to empty (safe denial)
  let deptScope: string | null = null;
  if (userRole === "manager" && !isSeniorApprover(userRole)) {
    const ownEmp = await getOwnEmployee(req.session.userId!);
    if (!ownEmp) { res.json([]); return; }
    if (!ownEmp.department) { res.json([]); return; }
    deptScope = ownEmp.department;
  }

  const rows = await db
    .select({
      request: leaveRequestsTable,
      employeeName: employeesTable.name,
      employeeDepartment: employeesTable.department,
      approvedByName: usersTable.name,
    })
    .from(leaveRequestsTable)
    .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .leftJoin(usersTable, eq(leaveRequestsTable.approvedById, usersTable.id))
    .orderBy(desc(leaveRequestsTable.createdAt));

  let results = rows.map((r) =>
    serializeLeaveRequest({ ...r.request, employeeName: r.employeeName, approvedByName: r.approvedByName }),
  );

  // Apply department scope for managers
  if (deptScope) {
    const deptEmpIds = rows
      .filter((r) => r.employeeDepartment === deptScope)
      .map((r) => r.request.employeeId);
    results = results.filter((r) => deptEmpIds.includes(r.employeeId));
  }

  const effectiveEmpId = scopedEmployeeId ?? (employeeId ? parseInt(employeeId, 10) : null);
  if (effectiveEmpId !== null) results = results.filter((r) => r.employeeId === effectiveEmpId);
  if (status) results = results.filter((r) => r.status === status);

  res.json(results);
});

employeesRouter.post("/leave-requests", requireAuth, requireRole(...VIEW_ROLES), async (req, res) => {
  const parsed = createLeaveRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { employeeId, leaveType, fromDate, toDate, reason } = parsed.data;

  if (fromDate > toDate) { res.status(400).json({ error: "fromDate must be <= toDate" }); return; }

  const userRole = req.session.userRole ?? "";
  // Only salary-management roles may submit leave on behalf of others
  if (!canManageSalary(userRole)) {
    const ownEmpId = await getOwnEmployeeId(req.session.userId!);
    if (ownEmpId === null) {
      res.status(403).json({ error: "No employee record linked to your account" }); return;
    }
    if (ownEmpId !== employeeId) {
      res.status(403).json({ error: "You can only submit leave for your own employee record" }); return;
    }
  }

  const [request] = await db
    .insert(leaveRequestsTable)
    .values({ employeeId, leaveType, fromDate, toDate, reason })
    .returning();

  res.status(201).json(serializeLeaveRequest(request!));
});

employeesRouter.patch("/leave-requests/:id/approve", requireAuth, requireRole(...APPROVE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const userRole = req.session.userRole ?? "";
  const [existing] = await db
    .select({ lr: leaveRequestsTable, empDept: employeesTable.department })
    .from(leaveRequestsTable)
    .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .where(eq(leaveRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Leave request not found" }); return; }
  if (existing.lr.status !== "pending") { res.status(400).json({ error: "Leave request is not pending" }); return; }

  // Managers can only approve leave for their own department
  if (!isSeniorApprover(userRole)) {
    const managerEmp = await getOwnEmployee(req.session.userId!);
    if (!managerEmp || !managerEmp.department || managerEmp.department !== existing.empDept) {
      res.status(403).json({ error: "Managers may only approve leave for employees in their own department" });
      return;
    }
  }

  const [updated] = await db
    .update(leaveRequestsTable)
    .set({ status: "approved", approvedById: req.session.userId, approvedAt: new Date() })
    .where(eq(leaveRequestsTable.id, id))
    .returning();

  // Increment usedDays in leave balance
  const from = new Date(existing.lr.fromDate);
  const to = new Date(existing.lr.toDate);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const currentYear = from.getFullYear();

  const [bal] = await db
    .select()
    .from(leaveBalancesTable)
    .where(
      and(
        eq(leaveBalancesTable.employeeId, existing.lr.employeeId),
        eq(leaveBalancesTable.leaveType, existing.lr.leaveType),
        eq(leaveBalancesTable.year, currentYear),
      ),
    );

  if (bal) {
    await db
      .update(leaveBalancesTable)
      .set({ usedDays: bal.usedDays + days })
      .where(eq(leaveBalancesTable.id, bal.id));
  }

  res.json(serializeLeaveRequest(updated!));
});

employeesRouter.patch("/leave-requests/:id/reject", requireAuth, requireRole(...APPROVE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = rejectLeaveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const userRole = req.session.userRole ?? "";
  const [existing] = await db
    .select({ lr: leaveRequestsTable, empDept: employeesTable.department })
    .from(leaveRequestsTable)
    .leftJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
    .where(eq(leaveRequestsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Leave request not found" }); return; }
  if (existing.lr.status !== "pending") { res.status(400).json({ error: "Leave request is not pending" }); return; }

  // Managers can only reject leave for employees in their own department
  if (!isSeniorApprover(userRole)) {
    const managerEmp = await getOwnEmployee(req.session.userId!);
    if (!managerEmp || !managerEmp.department || managerEmp.department !== existing.empDept) {
      res.status(403).json({ error: "Managers may only reject leave for employees in their own department" });
      return;
    }
  }

  const [updated] = await db
    .update(leaveRequestsTable)
    .set({
      status: "rejected",
      approvedById: req.session.userId,
      approvedAt: new Date(),
      rejectionNote: parsed.data.rejectionNote,
    })
    .where(eq(leaveRequestsTable.id, id))
    .returning();

  res.json(serializeLeaveRequest(updated!));
});

// ─── Payroll Summary ───────────────────────────────────────────────────────────

employeesRouter.get("/payroll", requireAuth, requireRole(...SALARY_ROLES), async (req, res) => {
  const { month, year } = req.query as { month?: string; year?: string };
  if (!month || !year) { res.status(400).json({ error: "month and year are required" }); return; }

  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  const employees = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.isActive, true))
    .orderBy(employeesTable.name);

  const attendanceRows = await db
    .select()
    .from(attendanceRecordsTable)
    .where(sql`${attendanceRecordsTable.date} LIKE ${prefix + "-%"}`);

  const byEmployee = new Map<number, typeof attendanceRows>();
  for (const row of attendanceRows) {
    if (!byEmployee.has(row.employeeId)) byEmployee.set(row.employeeId, []);
    byEmployee.get(row.employeeId)!.push(row);
  }

  const payroll = employees.map((emp) => {
    const records = byEmployee.get(emp.id) ?? [];
    const present = records.filter((r) => r.status === "present").length;
    const halfDay = records.filter((r) => r.status === "halfDay").length;
    const late = records.filter((r) => r.status === "late").length;
    const onLeave = records.filter((r) => r.status === "onLeave").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const effectiveDays = present + late + halfDay * 0.5 + onLeave;
    const basic = parseFloat(emp.basicSalary ?? "0");
    const hra = parseFloat(emp.hra ?? "0");
    const other = parseFloat(emp.otherAllowances ?? "0");
    const grossSalary = basic + hra + other;
    const workDays = emp.workingDaysPerMonth;
    const earnedBasic = workDays > 0 ? (effectiveDays / workDays) * basic : 0;
    const earnedHra = workDays > 0 ? (effectiveDays / workDays) * hra : 0;
    const earnedOther = workDays > 0 ? (effectiveDays / workDays) * other : 0;
    const netPay = Math.round((earnedBasic + earnedHra + earnedOther) * 100) / 100;
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      department: emp.department ?? null,
      designation: emp.designation ?? null,
      employmentType: emp.employmentType,
      month: parseInt(month, 10),
      year: parseInt(year, 10),
      workingDays: workDays,
      present,
      halfDay,
      late,
      onLeave,
      absent,
      effectiveDays,
      basicSalary: basic,
      hra,
      otherAllowances: other,
      grossSalary,
      netPay,
    };
  });

  res.json(payroll);
});

export default employeesRouter;
