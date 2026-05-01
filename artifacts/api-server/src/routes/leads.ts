import { Router } from "express";
import { db, leadsTable, proposalsTable, usersTable, workOrdersTable, workOrderItemsTable } from "@workspace/db";
import { eq, and, or, ilike, desc, lt, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";
import { autoAssignLead } from "../lib/leadRouting";
import { logLeadActivity } from "../lib/leadActivities";

const leadsRouter = Router();

const SALES_ROLES = ["sales", "manager", "director", "admin"] as const;
const VIEW_ROLES = ["sales", "manager", "director", "admin", "cfo"] as const;

const createLeadSchema = z.object({
  customerName: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  gstNumber: z.string().optional(),
  billingAddress: z.string().optional(),
  deliveryAddress: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  source: z
    .enum(["indiaMart", "website", "referral", "direct", "other"])
    .default("other"),
  productInterest: z.string().optional(),
  notes: z.string().optional(),
  assignedToId: z.number().int().optional(),
  lastFollowupNote: z.string().optional(),
  lastFollowupAt: z.string().datetime().optional(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  status: z
    .enum(["new", "contacted", "proposalSent", "negotiating", "won", "lost", "onHold"])
    .optional(),
});

function serializeLead(
  lead: typeof leadsTable.$inferSelect & {
    assignedTo?: { name: string } | null;
  },
) {
  return {
    id: lead.id,
    customerName: lead.customerName,
    company: lead.company ?? null,
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    gstNumber: lead.gstNumber ?? null,
    billingAddress: lead.billingAddress ?? null,
    deliveryAddress: lead.deliveryAddress ?? null,
    state: lead.state ?? null,
    city: lead.city ?? null,
    source: lead.source,
    productInterest: lead.productInterest ?? null,
    notes: lead.notes ?? null,
    lastFollowupNote: lead.lastFollowupNote ?? null,
    lastFollowupAt: lead.lastFollowupAt ? lead.lastFollowupAt.toISOString() : null,
    status: lead.status,
    assignedToId: lead.assignedToId ?? null,
    assignedToName: lead.assignedTo?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

leadsRouter.get("/leads", requireRole(...VIEW_ROLES), async (req, res) => {
  const { status, search, assignedToId } = req.query as {
    status?: string;
    search?: string;
    assignedToId?: string;
  };

  const conditions = [];
  if (status) {
    conditions.push(
      eq(leadsTable.status, status as typeof leadsTable.status._.data),
    );
  }
  if (search) {
    conditions.push(
      or(
        ilike(leadsTable.customerName, `%${search}%`),
        ilike(leadsTable.company, `%${search}%`),
      ),
    );
  }
  if (assignedToId) {
    conditions.push(eq(leadsTable.assignedToId, parseInt(assignedToId, 10)));
  }

  const leads = await db
    .select({
      lead: leadsTable,
      assignedTo: { name: usersTable.name },
    })
    .from(leadsTable)
    .leftJoin(usersTable, eq(leadsTable.assignedToId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(leadsTable.createdAt));

  res.json(
    leads.map((row) =>
      serializeLead({ ...row.lead, assignedTo: row.assignedTo }),
    ),
  );
});

leadsRouter.post("/leads", requireRole(...SALES_ROLES), async (req, res) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { lastFollowupAt, ...leadData } = parsed.data;

  let assignedToId = leadData.assignedToId ?? null;
  let autoMatch = null as Awaited<ReturnType<typeof autoAssignLead>>;
  if (!assignedToId) {
    autoMatch = await autoAssignLead({
      state: leadData.state ?? null,
      productInterest: leadData.productInterest ?? null,
      billingAddress: leadData.billingAddress ?? null,
      deliveryAddress: leadData.deliveryAddress ?? null,
      notes: leadData.notes ?? null,
    });
    if (autoMatch) {
      assignedToId = autoMatch.salespersonId;
    }
  }

  const [lead] = await db
    .insert(leadsTable)
    .values({
      ...leadData,
      assignedToId,
      lastFollowupAt: lastFollowupAt ? new Date(lastFollowupAt) : undefined,
    })
    .returning();

  await logLeadActivity({
    leadId: lead.id,
    type: "created",
    actorUserId: req.session.userId ?? null,
    payload: { source: lead.source },
  });

  if (autoMatch) {
    await logLeadActivity({
      leadId: lead.id,
      type: "assignmentChanged",
      actorUserId: null,
      payload: {
        auto: true,
        ruleId: autoMatch.ruleId,
        ruleName: autoMatch.ruleName,
        salespersonId: autoMatch.salespersonId,
        matchedState: autoMatch.matchedState,
        matchedKeyword: autoMatch.matchedKeyword,
      },
    });
  } else if (leadData.assignedToId) {
    await logLeadActivity({
      leadId: lead.id,
      type: "assignmentChanged",
      actorUserId: req.session.userId ?? null,
      payload: { auto: false, salespersonId: leadData.assignedToId },
    });
  }

  res.status(201).json(serializeLead(lead));
});

leadsRouter.get(
  "/leads/funnel/stats",
  requireRole(...VIEW_ROLES),
  async (_req, res) => {
    const rows = await db
      .select({
        status: leadsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(leadsTable)
      .groupBy(leadsTable.status);

    const statusOrder = [
      "new",
      "contacted",
      "proposalSent",
      "negotiating",
      "won",
      "lost",
      "onHold",
    ] as const;

    const countMap = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    const funnel = statusOrder.map((s) => ({
      status: s,
      count: countMap[s] ?? 0,
    }));

    res.json(funnel);
  },
);

leadsRouter.get(
  "/leads/:id",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({
        lead: leadsTable,
        assignedTo: { name: usersTable.name },
      })
      .from(leadsTable)
      .leftJoin(usersTable, eq(leadsTable.assignedToId, usersTable.id))
      .where(eq(leadsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json(serializeLead({ ...row.lead, assignedTo: row.assignedTo }));
  },
);

leadsRouter.patch(
  "/leads/:id",
  requireRole(...SALES_ROLES, "cfo"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { lastFollowupAt, ...updateData } = parsed.data;

    const [before] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const isReassign =
      updateData.assignedToId !== undefined &&
      updateData.assignedToId !== before.assignedToId;
    if (isReassign) {
      const role = req.session.userRole ?? "";
      const ALLOWED_REASSIGN = [
        "admin",
        "director",
        "cfo",
        "manager",
      ];
      if (!ALLOWED_REASSIGN.includes(role)) {
        res
          .status(403)
          .json({ error: "Only managers/directors/admins can reassign leads" });
        return;
      }
    }

    const [updated] = await db
      .update(leadsTable)
      .set({
        ...updateData,
        lastFollowupAt: lastFollowupAt ? new Date(lastFollowupAt) : undefined,
      })
      .where(eq(leadsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    if (updateData.status && updateData.status !== before.status) {
      await logLeadActivity({
        leadId: id,
        type: "statusChanged",
        actorUserId: req.session.userId ?? null,
        payload: { from: before.status, to: updateData.status },
      });
    }

    if (isReassign) {
      await logLeadActivity({
        leadId: id,
        type: "assignmentChanged",
        actorUserId: req.session.userId ?? null,
        payload: {
          auto: false,
          from: before.assignedToId,
          to: updateData.assignedToId,
        },
      });
    }

    const editableFields = [
      "customerName",
      "company",
      "phone",
      "email",
      "gstNumber",
      "billingAddress",
      "deliveryAddress",
      "state",
      "city",
      "productInterest",
      "notes",
    ] as const;
    const fieldDiff: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of editableFields) {
      if (
        updateData[f] !== undefined &&
        (before as Record<string, unknown>)[f] !== updateData[f]
      ) {
        fieldDiff[f] = {
          from: (before as Record<string, unknown>)[f],
          to: updateData[f],
        };
      }
    }
    if (Object.keys(fieldDiff).length > 0) {
      await logLeadActivity({
        leadId: id,
        type: "fieldEdited",
        actorUserId: req.session.userId ?? null,
        payload: { changes: fieldDiff },
      });
    }

    res.json(serializeLead(updated));
  },
);

leadsRouter.delete(
  "/leads/:id",
  requireRole(...SALES_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [deleted] = await db
      .delete(leadsTable)
      .where(eq(leadsTable.id, id))
      .returning({ id: leadsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json({ success: true });
  },
);

const lineItemSchema = z.object({
  description: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  gstRate: z.number().min(0).max(100).default(18),
});

const createProposalSchema = z.object({
  leadId: z.number().int(),
  salespersonId: z.number().int().optional(),
  lineItems: z.array(lineItemSchema).default([]),
  discountPercent: z.number().min(0).max(100).default(0),
  gstRate: z.number().min(0).max(100).default(18),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "sent", "won", "onHold", "lost"]).default("draft"),
});

const updateProposalSchema = createProposalSchema.partial().omit({ leadId: true });

function calcTotals(
  lineItems: Array<{ qty: number; unitPrice: number; gstRate: number }>,
  discountPercent: number,
  gstRate: number,
) {
  const lineSubtotal = lineItems.reduce(
    (sum, li) => sum + li.qty * li.unitPrice,
    0,
  );
  const discountAmount = (lineSubtotal * discountPercent) / 100;
  const taxable = lineSubtotal - discountAmount;
  const gstAmount = (taxable * gstRate) / 100;
  const total = taxable + gstAmount;
  return {
    subtotal: lineSubtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    total: total.toFixed(2),
  };
}

function serializeProposal(
  proposal: typeof proposalsTable.$inferSelect & {
    lead?: { customerName: string; company: string | null } | null;
    salesperson?: { name: string } | null;
  },
) {
  const lineItems: unknown[] = Array.isArray(proposal.lineItems)
    ? (proposal.lineItems as unknown[])
    : [];

  const isOnHoldReminder =
    proposal.status === "onHold" &&
    proposal.onHoldAt !== null &&
    Date.now() - new Date(proposal.onHoldAt).getTime() >=
      7 * 24 * 60 * 60 * 1000;

  return {
    id: proposal.id,
    proposalNumber: proposal.proposalNumber,
    leadId: proposal.leadId,
    customerName: proposal.lead?.customerName ?? null,
    company: proposal.lead?.company ?? null,
    salespersonId: proposal.salespersonId ?? null,
    salespersonName: proposal.salesperson?.name ?? null,
    lineItems,
    discountPercent: parseFloat(proposal.discountPercent),
    gstRate: parseFloat(proposal.gstRate),
    subtotal: parseFloat(proposal.subtotal),
    discountAmount: parseFloat(proposal.discountAmount),
    gstAmount: parseFloat(proposal.gstAmount),
    total: parseFloat(proposal.total),
    status: proposal.status,
    validUntil: proposal.validUntil ?? null,
    notes: proposal.notes ?? null,
    onHoldReminderDue: isOnHoldReminder,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

async function generateProposalNumber(): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('proposal_seq')`,
  );
  const nextval = (result.rows[0] as { nextval: string }).nextval;
  const seq = String(nextval).padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `PROP-${year}-${seq}`;
}

leadsRouter.get(
  "/proposals",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const { status, salespersonId, from, to } = req.query as {
      status?: string;
      salespersonId?: string;
      from?: string;
      to?: string;
    };

    const conditions = [];
    if (status)
      conditions.push(
        eq(
          proposalsTable.status,
          status as typeof proposalsTable.status._.data,
        ),
      );
    if (salespersonId)
      conditions.push(
        eq(proposalsTable.salespersonId, parseInt(salespersonId, 10)),
      );
    if (from)
      conditions.push(
        sql`${proposalsTable.createdAt} >= ${from}::timestamptz`,
      );
    if (to)
      conditions.push(
        sql`${proposalsTable.createdAt} <= ${to}::timestamptz`,
      );

    const rows = await db
      .select({
        proposal: proposalsTable,
        lead: {
          customerName: leadsTable.customerName,
          company: leadsTable.company,
        },
        salesperson: { name: usersTable.name },
      })
      .from(proposalsTable)
      .leftJoin(leadsTable, eq(proposalsTable.leadId, leadsTable.id))
      .leftJoin(
        usersTable,
        eq(proposalsTable.salespersonId, usersTable.id),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(proposalsTable.createdAt));

    res.json(
      rows.map((r) =>
        serializeProposal({
          ...r.proposal,
          lead: r.lead,
          salesperson: r.salesperson,
        }),
      ),
    );
  },
);

const DISCOUNT_APPROVAL_ROLES = ["manager", "director", "admin", "cfo"];
const DISCOUNT_LIMIT_NO_APPROVAL = 5;

leadsRouter.post(
  "/proposals",
  requireRole(...SALES_ROLES),
  async (req, res) => {
    const parsed = createProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const userRole = req.session.userRole ?? "";
    if (
      parsed.data.discountPercent > DISCOUNT_LIMIT_NO_APPROVAL &&
      !DISCOUNT_APPROVAL_ROLES.includes(userRole)
    ) {
      res.status(403).json({
        error: `Discount above ${DISCOUNT_LIMIT_NO_APPROVAL}% requires manager approval`,
      });
      return;
    }

    const { lineItems, discountPercent, gstRate, ...rest } = parsed.data;
    const totals = calcTotals(lineItems, discountPercent, gstRate);
    const proposalNumber = await generateProposalNumber();

    const insertStatus = rest.status ?? "draft";
    const [proposal] = await db
      .insert(proposalsTable)
      .values({
        ...rest,
        proposalNumber,
        lineItems: lineItems as unknown[],
        discountPercent: discountPercent.toString(),
        gstRate: gstRate.toString(),
        ...totals,
        onHoldAt: insertStatus === "onHold" ? new Date() : undefined,
        lostAt: insertStatus === "lost" ? new Date() : undefined,
      })
      .returning();

    await db
      .update(leadsTable)
      .set({ status: "proposalSent" })
      .where(eq(leadsTable.id, parsed.data.leadId));

    res.status(201).json(serializeProposal(proposal));
  },
);

leadsRouter.post(
  "/proposals/cleanup/lost",
  requireRole("admin", "director"),
  async (_req, res) => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(proposalsTable)
      .where(
        and(
          eq(proposalsTable.status, "lost"),
          lt(proposalsTable.lostAt, cutoff),
        ),
      )
      .returning({ id: proposalsTable.id });

    logger.info(
      `Cleaned up ${deleted.length} lost proposals older than 90 days`,
    );
    res.json({ success: true, deleted: deleted.length });
  },
);

leadsRouter.post(
  "/proposals/:id/won",
  requireRole(...SALES_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [proposal] = await db
      .select({ proposal: proposalsTable, lead: leadsTable })
      .from(proposalsTable)
      .leftJoin(leadsTable, eq(proposalsTable.leadId, leadsTable.id))
      .where(eq(proposalsTable.id, id));

    if (!proposal) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    const [updated] = await db
      .update(proposalsTable)
      .set({ status: "won" })
      .where(eq(proposalsTable.id, id))
      .returning();

    await db
      .update(leadsTable)
      .set({ status: "won" })
      .where(eq(leadsTable.id, proposal.proposal.leadId));

    const existingWO = await db
      .select()
      .from(workOrdersTable)
      .where(eq(workOrdersTable.proposalId, id))
      .limit(1);

    let wo: typeof workOrdersTable.$inferSelect;

    if (existingWO.length > 0) {
      wo = existingWO[0];
    } else {
      const woResult = await db.execute<{ nextval: string }>(
        sql`SELECT nextval('work_order_seq')`,
      );
      const woSeq = String((woResult.rows[0] as { nextval: string }).nextval).padStart(4, "0");
      const woYear = new Date().getFullYear().toString().slice(-2);
      const woNumber = `WO-${woYear}-${woSeq}`;

      const lineItems = (Array.isArray(proposal.proposal.lineItems) ? proposal.proposal.lineItems : []) as Array<{
        description?: string;
        qty?: number;
        unitPrice?: number;
      }>;

      const [created] = await db
        .insert(workOrdersTable)
        .values({
          woNumber,
          proposalId: id,
          customerName: proposal.lead?.customerName ?? "Unknown",
          company: proposal.lead?.company ?? null,
          total: proposal.proposal.total,
          status: "inProgress",
          createdById: req.session.userId,
        })
        .returning();

      wo = created;

      if (lineItems.length > 0) {
        await db.insert(workOrderItemsTable).values(
          lineItems.map((li) => ({
            workOrderId: wo.id,
            description: li.description ?? "Item",
            qty: String(li.qty ?? 1),
            unitPrice: String(li.unitPrice ?? 0),
          })),
        );
      }
    }

    const workOrderStub = {
      proposalId: id,
      proposalNumber: proposal.proposal.proposalNumber,
      leadId: proposal.proposal.leadId,
      customerName: proposal.lead?.customerName ?? null,
      total: parseFloat(proposal.proposal.total),
      status: wo.status,
      message: `Work order ${wo.woNumber} ready. Navigate to Work Orders to manage it.`,
      woId: wo.id,
      woNumber: wo.woNumber,
    };

    res.json({ proposal: serializeProposal(updated), workOrder: workOrderStub });
  },
);

leadsRouter.get(
  "/proposals/:id",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({
        proposal: proposalsTable,
        lead: {
          customerName: leadsTable.customerName,
          company: leadsTable.company,
        },
        salesperson: { name: usersTable.name },
      })
      .from(proposalsTable)
      .leftJoin(leadsTable, eq(proposalsTable.leadId, leadsTable.id))
      .leftJoin(
        usersTable,
        eq(proposalsTable.salespersonId, usersTable.id),
      )
      .where(eq(proposalsTable.id, id));

    if (!row) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    res.json(
      serializeProposal({
        ...row.proposal,
        lead: row.lead,
        salesperson: row.salesperson,
      }),
    );
  },
);

leadsRouter.patch(
  "/proposals/:id",
  requireRole(...SALES_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = updateProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const userRole = req.session.userRole ?? "";
    if (
      parsed.data.discountPercent !== undefined &&
      parsed.data.discountPercent > DISCOUNT_LIMIT_NO_APPROVAL &&
      !DISCOUNT_APPROVAL_ROLES.includes(userRole)
    ) {
      res.status(403).json({
        error: `Discount above ${DISCOUNT_LIMIT_NO_APPROVAL}% requires manager approval`,
      });
      return;
    }

    const { lineItems, discountPercent, gstRate, status, ...rest } = parsed.data;

    const [existing] = await db
      .select()
      .from(proposalsTable)
      .where(eq(proposalsTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    const updateData: Record<string, unknown> = { ...rest };
    if (lineItems !== undefined) updateData.lineItems = lineItems;
    if (discountPercent !== undefined)
      updateData.discountPercent = discountPercent.toString();
    if (gstRate !== undefined) updateData.gstRate = gstRate.toString();
    if (status !== undefined) {
      updateData.status = status;
      if (status === "onHold" && existing.status !== "onHold")
        updateData.onHoldAt = new Date();
      if (status === "lost" && existing.status !== "lost")
        updateData.lostAt = new Date();
    }

    if (
      lineItems !== undefined ||
      discountPercent !== undefined ||
      gstRate !== undefined
    ) {
      const items = lineItems ??
        (Array.isArray(existing.lineItems)
          ? (existing.lineItems as Array<{
              qty: number;
              unitPrice: number;
              gstRate: number;
            }>)
          : []);
      const disc =
        discountPercent ?? parseFloat(existing.discountPercent);
      const gst = gstRate ?? parseFloat(existing.gstRate);
      const totals = calcTotals(items, disc, gst);
      Object.assign(updateData, totals);
    }

    const [updated] = await db
      .update(proposalsTable)
      .set(updateData)
      .where(eq(proposalsTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    if (status === "won") {
      await db
        .update(leadsTable)
        .set({ status: "won" })
        .where(eq(leadsTable.id, updated.leadId));
    } else if (status === "lost") {
      await db
        .update(leadsTable)
        .set({ status: "lost" })
        .where(eq(leadsTable.id, updated.leadId));
    }

    res.json(serializeProposal(updated));
  },
);

leadsRouter.delete(
  "/proposals/:id",
  requireRole(...SALES_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [deleted] = await db
      .delete(proposalsTable)
      .where(eq(proposalsTable.id, id))
      .returning({ id: proposalsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }

    res.json({ success: true });
  },
);

export default leadsRouter;
