import { Router } from "express";
import {
  db,
  workOrdersTable,
  workOrderItemsTable,
  purchaseOrdersTable,
  poLineItemsTable,
  subcontractRecordsTable,
  deliveryRecordsTable,
  proposalsTable,
  usersTable,
  gstInvoicesTable,
  invoiceLineItemsTable,
  stockMovementsTable,
  stockTransactionsTable,
  subcontractJobsTable,
  inventoryItemsTable,
} from "@workspace/db";
import { eq, and, or, ne, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";
import { generateInvoiceNumber, calcGst } from "../lib/invoiceHelpers";

const ordersRouter = Router();

const VIEW_ROLES = ["sales", "manager", "director", "admin", "cfo", "purchase", "stores", "accounts"] as const;
// Per-WO Profit & Loss exposes financial margin data and must be tighter
// than general view access. Only finance/leadership roles can see it.
const PNL_ROLES = ["manager", "director", "admin", "cfo", "accounts"] as const;
const PO_CREATE_ROLES = ["purchase", "manager", "director", "admin", "cfo"] as const;
const APPROVE_ROLES = ["stores", "manager", "director", "admin", "cfo"] as const;
const STOCK_ROLES = ["stores", "manager", "director", "admin"] as const;
const INVOICE_ROLES = ["accounts", "cfo", "director", "admin"] as const;
const WRITE_ROLES = ["sales", "purchase", "manager", "director", "admin", "cfo", "stores", "accounts"] as const;

function serializeWO(
  wo: typeof workOrdersTable.$inferSelect & {
    items?: (typeof workOrderItemsTable.$inferSelect & {
      purchaseOrders?: (typeof purchaseOrdersTable.$inferSelect)[];
      subcontracts?: (typeof subcontractRecordsTable.$inferSelect)[];
    })[];
    deliveries?: (typeof deliveryRecordsTable.$inferSelect)[];
    purchaseOrders?: (typeof purchaseOrdersTable.$inferSelect & {
      lineItems?: (typeof poLineItemsTable.$inferSelect)[];
    })[];
  },
) {
  return {
    id: wo.id,
    woNumber: wo.woNumber,
    proposalId: wo.proposalId ?? null,
    customerName: wo.customerName,
    company: wo.company ?? null,
    total: parseFloat(wo.total),
    status: wo.status,
    notes: wo.notes ?? null,
    createdAt: wo.createdAt.toISOString(),
    updatedAt: wo.updatedAt.toISOString(),
    items: (wo.items ?? []).map((item) => ({
      id: item.id,
      workOrderId: item.workOrderId,
      productId: item.productId ?? null,
      productCode: item.productCode ?? null,
      productImageUrl: item.productImageUrl ?? null,
      hsnCode: item.hsnCode ?? null,
      unit: item.unit ?? null,
      description: item.description,
      qty: parseFloat(item.qty),
      unitPrice: parseFloat(item.unitPrice),
      workflowType: item.workflowType ?? null,
      currentStep: item.currentStep,
      productionRequestNote: item.productionRequestNote ?? null,
      purchaseOrders: (item.purchaseOrders ?? []).map(serializePO),
      subcontracts: (item.subcontracts ?? []).map((s) => ({
        id: s.id,
        workOrderItemId: s.workOrderItemId,
        vendorName: s.vendorName,
        vendorContact: s.vendorContact ?? null,
        cost: parseFloat(s.cost),
        description: s.description ?? null,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
    })),
    deliveries: (wo.deliveries ?? []).map((d) => ({
      id: d.id,
      workOrderId: d.workOrderId,
      expectedDate: d.expectedDate ?? null,
      actualDispatchDate: d.actualDispatchDate ?? null,
      transporter: d.transporter ?? null,
      trackingNumber: d.trackingNumber ?? null,
      status: d.status,
      invoiceGenerated: d.invoiceGenerated,
      invoiceNumber: d.invoiceNumber ?? null,
      invoiceGeneratedAt: d.invoiceGeneratedAt?.toISOString() ?? null,
      notes: d.notes ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
    purchaseOrders: (wo.purchaseOrders ?? []).map(serializePO),
  };
}

function serializePO(
  po: typeof purchaseOrdersTable.$inferSelect & {
    lineItems?: (typeof poLineItemsTable.$inferSelect)[];
    approvedBy?: { name: string } | null;
    createdBy?: { name: string } | null;
  },
) {
  return {
    id: po.id,
    poNumber: po.poNumber,
    workOrderId: po.workOrderId,
    workOrderItemId: po.workOrderItemId ?? null,
    supplierName: po.supplierName,
    supplierContact: po.supplierContact ?? null,
    type: po.type,
    quotedAmount: parseFloat(po.quotedAmount),
    poAmount: parseFloat(po.poAmount),
    status: po.status,
    requiresCfoApproval: po.requiresCfoApproval,
    approvedById: po.approvedById ?? null,
    approvedByName: po.approvedBy?.name ?? null,
    approvedAt: po.approvedAt?.toISOString() ?? null,
    rejectionNote: po.rejectionNote ?? null,
    receivedAt: po.receivedAt?.toISOString() ?? null,
    notes: po.notes ?? null,
    createdByName: po.createdBy?.name ?? null,
    lineItems: (po.lineItems ?? []).map((li) => ({
      id: li.id,
      purchaseOrderId: li.purchaseOrderId,
      productId: li.productId ?? null,
      productCode: li.productCode ?? null,
      productImageUrl: li.productImageUrl ?? null,
      hsnCode: li.hsnCode ?? null,
      unit: li.unit ?? null,
      description: li.description,
      qty: parseFloat(li.qty),
      unitPrice: parseFloat(li.unitPrice),
      gstRate: parseFloat(li.gstRate),
    })),
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
  };
}

async function generateWoNumber(): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('work_order_seq')`,
  );
  const nextval = (result.rows[0] as { nextval: string }).nextval;
  const seq = String(nextval).padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `WO-${year}-${seq}`;
}

async function generatePoNumber(): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('po_seq')`,
  );
  const nextval = (result.rows[0] as { nextval: string }).nextval;
  const seq = String(nextval).padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `PO-${year}-${seq}`;
}

const createWOSchema = z.object({
  proposalId: z.number().int().optional(),
  customerName: z.string().min(1),
  company: z.string().optional(),
  total: z.number().min(0).default(0),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        productCode: z.string().optional(),
        productImageUrl: z.string().nullable().optional(),
        hsnCode: z.string().nullable().optional(),
        unit: z.string().optional(),
        description: z.string().min(1),
        qty: z.number().positive().default(1),
        unitPrice: z.number().min(0).default(0),
        workflowType: z.enum(["imported", "manufacturing"]).optional(),
      }),
    )
    .default([]),
});

const updateWOSchema = z.object({
  status: z
    .enum(["draft", "inProgress", "pendingApproval", "delivered", "cancelled"])
    .optional(),
  notes: z.string().optional(),
  customerName: z.string().optional(),
});

const updateWOItemSchema = z.object({
  workflowType: z.enum(["imported", "manufacturing"]).optional(),
  currentStep: z
    .enum([
      "pending",
      "productionRequest",
      "poCreated",
      "poApproved",
      "rawMaterialIn",
      "inProduction",
      "finishedGoodsIn",
      "stockIn",
      "dispatched",
      "delivered",
      "invoiced",
    ])
    .optional(),
  productionRequestNote: z.string().optional(),
});

const createPOSchema = z.object({
  workOrderId: z.number().int(),
  workOrderItemId: z.number().int().optional(),
  supplierName: z.string().min(1),
  supplierContact: z.string().optional(),
  type: z.enum(["imported", "rawMaterial"]).default("imported"),
  quotedAmount: z.number().min(0).default(0),
  poAmount: z.number().min(0).default(0),
  notes: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        productCode: z.string().optional(),
        productImageUrl: z.string().nullable().optional(),
        hsnCode: z.string().nullable().optional(),
        unit: z.string().optional(),
        description: z.string().min(1),
        qty: z.number().positive().default(1),
        unitPrice: z.number().min(0).default(0),
        gstRate: z.number().min(0).max(100).default(18),
      }),
    )
    .min(1, "At least one product line item is required"),
});

const updatePOSchema = createPOSchema.omit({ workOrderId: true }).partial();

const deliverySchema = z.object({
  expectedDate: z.string().optional(),
  actualDispatchDate: z.string().optional(),
  transporter: z.string().optional(),
  trackingNumber: z.string().optional(),
  status: z.enum(["scheduled", "dispatched", "delivered"]).optional(),
  notes: z.string().optional(),
});

const subcontractSchema = z.object({
  workOrderItemId: z.number().int(),
  vendorName: z.string().min(1),
  vendorContact: z.string().optional(),
  cost: z.number().min(0).default(0),
  description: z.string().optional(),
  status: z.string().optional(),
});

ordersRouter.post("/work-orders", requireRole(...WRITE_ROLES), async (req, res) => {
  const parsed = createWOSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const woNumber = await generateWoNumber();
  const userId = req.session.userId;

  const [wo] = await db
    .insert(workOrdersTable)
    .values({
      woNumber,
      proposalId: parsed.data.proposalId,
      customerName: parsed.data.customerName,
      company: parsed.data.company,
      total: parsed.data.total.toString(),
      notes: parsed.data.notes,
      createdById: userId,
      status: "inProgress",
    })
    .returning();

  if (parsed.data.items.length > 0) {
    await db.insert(workOrderItemsTable).values(
      parsed.data.items.map((item) => ({
        workOrderId: wo.id,
        productId: item.productId,
        productCode: item.productCode ?? null,
        productImageUrl: item.productImageUrl ?? null,
        hsnCode: item.hsnCode ?? null,
        unit: item.unit ?? null,
        description: item.description,
        qty: item.qty.toString(),
        unitPrice: item.unitPrice.toString(),
        workflowType: item.workflowType ?? null,
      })),
    );
  }

  if (parsed.data.proposalId) {
    await db
      .update(proposalsTable)
      .set({ status: "won" })
      .where(eq(proposalsTable.id, parsed.data.proposalId));
  }

  const full = await getWOWithDetails(wo.id);
  res.status(201).json(full);
});

async function getWOWithDetails(id: number) {
  const [wo] = await db
    .select()
    .from(workOrdersTable)
    .where(eq(workOrdersTable.id, id));

  if (!wo) return null;

  const items = await db
    .select()
    .from(workOrderItemsTable)
    .where(eq(workOrderItemsTable.workOrderId, id));

  const allItemIds = items.map((i) => i.id);

  const itemPOs =
    allItemIds.length > 0
      ? await db
          .select({
            po: purchaseOrdersTable,
            lineItems: poLineItemsTable,
            approvedBy: { name: usersTable.name },
          })
          .from(purchaseOrdersTable)
          .leftJoin(
            poLineItemsTable,
            eq(poLineItemsTable.purchaseOrderId, purchaseOrdersTable.id),
          )
          .leftJoin(usersTable, eq(purchaseOrdersTable.approvedById, usersTable.id))
          .where(
            or(
              ...allItemIds.map((id) =>
                eq(purchaseOrdersTable.workOrderItemId, id),
              ),
            ),
          )
      : [];

  const itemSubcontracts =
    allItemIds.length > 0
      ? await db
          .select()
          .from(subcontractRecordsTable)
          .where(
            or(
              ...allItemIds.map((id) =>
                eq(subcontractRecordsTable.workOrderItemId, id),
              ),
            ),
          )
      : [];

  const deliveries = await db
    .select()
    .from(deliveryRecordsTable)
    .where(eq(deliveryRecordsTable.workOrderId, id));

  const itemsWithDetails = items.map((item) => {
    const poMap = new Map<number, (typeof purchaseOrdersTable.$inferSelect) & { lineItems: (typeof poLineItemsTable.$inferSelect)[]; approvedBy: { name: string } | null }>();
    for (const row of itemPOs) {
      if (row.po.workOrderItemId !== item.id) continue;
      if (!poMap.has(row.po.id)) {
        poMap.set(row.po.id, { ...row.po, lineItems: [], approvedBy: row.approvedBy });
      }
      if (row.lineItems?.id) {
        poMap.get(row.po.id)!.lineItems.push(row.lineItems);
      }
    }

    return {
      ...item,
      purchaseOrders: Array.from(poMap.values()),
      subcontracts: itemSubcontracts.filter(
        (s) => s.workOrderItemId === item.id,
      ),
    };
  });

  const woPOMap = new Map<number, (typeof purchaseOrdersTable.$inferSelect) & { lineItems: (typeof poLineItemsTable.$inferSelect)[]; approvedBy: { name: string } | null }>();
  for (const row of itemPOs) {
    if (!woPOMap.has(row.po.id)) {
      woPOMap.set(row.po.id, { ...row.po, lineItems: [], approvedBy: row.approvedBy });
    }
    if (row.lineItems?.id) {
      woPOMap.get(row.po.id)!.lineItems.push(row.lineItems);
    }
  }

  return serializeWO({
    ...wo,
    items: itemsWithDetails,
    deliveries,
    purchaseOrders: Array.from(woPOMap.values()),
  });
}

ordersRouter.get("/work-orders", requireRole(...VIEW_ROLES), async (req, res) => {
  const { status } = req.query as { status?: string };

  const rows = await db
    .select({
      wo: workOrdersTable,
      itemCount: sql<number>`COUNT(${workOrderItemsTable.id})`,
    })
    .from(workOrdersTable)
    .leftJoin(workOrderItemsTable, eq(workOrderItemsTable.workOrderId, workOrdersTable.id))
    .where(
      status
        ? eq(workOrdersTable.status, status as typeof workOrdersTable.status._.data)
        : undefined,
    )
    .groupBy(workOrdersTable.id)
    .orderBy(desc(workOrdersTable.createdAt));

  res.json(rows.map(({ wo, itemCount }) => ({ ...serializeWO(wo), itemCount: Number(itemCount) })));
});

// ─── GET /work-orders/pnl-summary ─────────────────────────────────────────────
ordersRouter.get(
  "/work-orders/pnl-summary",
  requireRole(...PNL_ROLES),
  async (_req, res) => {
    // Revenue per WO
    const revRows = await db
      .select({
        workOrderId: gstInvoicesTable.workOrderId,
        revenue: sql<string>`COALESCE(SUM(${gstInvoicesTable.subtotal}), 0)`.as(
          "revenue",
        ),
        invoiceCount: sql<string>`COUNT(*)`.as("invoice_count"),
      })
      .from(gstInvoicesTable)
      .groupBy(gstInvoicesTable.workOrderId);

    const cogsRows = await db
      .select({
        workOrderId: stockMovementsTable.workOrderId,
        cogs: sql<string>`COALESCE(SUM(${stockMovementsTable.totalCost}), 0)`.as(
          "cogs",
        ),
        outCount: sql<string>`COUNT(*)`.as("out_count"),
      })
      .from(stockMovementsTable)
      .where(
        and(
          eq(stockMovementsTable.movementType, "out"),
          // Exclude transfers to subcontractors — those are not WO COGS
          ne(stockMovementsTable.sourceType, "subcontractIssue"),
        ),
      )
      .groupBy(stockMovementsTable.workOrderId);

    const subRows = await db
      .select({
        workOrderId: subcontractJobsTable.workOrderId,
        subCost:
          sql<string>`COALESCE(SUM(${subcontractJobsTable.totalVendorCost}), 0)`.as(
            "sub_cost",
          ),
      })
      .from(subcontractJobsTable)
      .groupBy(subcontractJobsTable.workOrderId);

    const revMap = new Map<number, { revenue: number; invoiceCount: number }>();
    for (const r of revRows) {
      if (r.workOrderId !== null)
        revMap.set(r.workOrderId, {
          revenue: parseFloat(r.revenue),
          invoiceCount: parseInt(r.invoiceCount, 10),
        });
    }
    const cogsMap = new Map<number, { cogs: number; outCount: number }>();
    for (const r of cogsRows) {
      if (r.workOrderId !== null)
        cogsMap.set(r.workOrderId, {
          cogs: parseFloat(r.cogs),
          outCount: parseInt(r.outCount, 10),
        });
    }
    const subMap = new Map<number, number>();
    for (const r of subRows) {
      if (r.workOrderId !== null) subMap.set(r.workOrderId, parseFloat(r.subCost));
    }

    const allWoIds = Array.from(
      new Set<number>([
        ...revMap.keys(),
        ...cogsMap.keys(),
        ...subMap.keys(),
      ]),
    );
    if (allWoIds.length === 0) {
      res.json([]);
      return;
    }
    const wos = await db
      .select()
      .from(workOrdersTable)
      .where(inArray(workOrdersTable.id, allWoIds));

    const rows = wos.map((wo) => {
      const rev = revMap.get(wo.id);
      const cogsEntry = cogsMap.get(wo.id);
      const revenueInvoiced = rev?.revenue ?? 0;
      const revenueOrderValue = parseFloat(wo.total ?? "0") || 0;
      const costStoresOut = cogsEntry?.cogs ?? 0;
      // costSubcontract is reported separately for visibility but NOT
      // re-added to totalCost: vendor charges are already capitalised into
      // the finished-goods unit cost stamped on the subcontract receipt
      // stock_movements row, which then flows through Stores Out into
      // costStoresOut. Adding it again would double-count it.
      const costSubcontract = subMap.get(wo.id) ?? 0;
      const costImportExpenses = 0;
      const directExpenses = 0;
      const totalCost = costStoresOut + costImportExpenses + directExpenses;
      const margin = revenueInvoiced - totalCost;
      const marginPercent =
        revenueInvoiced > 0 ? (margin / revenueInvoiced) * 100 : 0;
      return {
        workOrderId: wo.id,
        workOrderNumber: wo.woNumber,
        customerName: wo.customerName,
        status: wo.status,
        revenueInvoiced,
        revenueOrderValue,
        costStoresOut,
        costSubcontract,
        costImportExpenses,
        directExpenses,
        totalCost,
        margin,
        marginPercent,
        invoiceCount: rev?.invoiceCount ?? 0,
        storesOutCount: cogsEntry?.outCount ?? 0,
      };
    });

    rows.sort((a, b) => b.workOrderId - a.workOrderId);
    res.json(rows);
  },
);

ordersRouter.get("/work-orders/:id", requireRole(...VIEW_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const detail = await getWOWithDetails(id);
  if (!detail) {
    res.status(404).json({ error: "Work order not found" });
    return;
  }

  res.json(detail);
});

ordersRouter.patch("/work-orders/:id", requireRole(...WRITE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = updateWOSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [updated] = await db
    .update(workOrdersTable)
    .set(parsed.data)
    .where(eq(workOrdersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Work order not found" });
    return;
  }

  const detail = await getWOWithDetails(id);
  res.json(detail);
});

ordersRouter.patch(
  "/work-orders/:id/items/:itemId",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    const itemId = parseInt(String(req.params.itemId), 10);
    if (isNaN(id) || isNaN(itemId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = updateWOItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const [updated] = await db
      .update(workOrderItemsTable)
      .set(parsed.data)
      .where(
        and(
          eq(workOrderItemsTable.id, itemId),
          eq(workOrderItemsTable.workOrderId, id),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Work order item not found" });
      return;
    }

    const detail = await getWOWithDetails(id);
    res.json(detail);
  },
);

ordersRouter.post("/purchase-orders", requireRole(...PO_CREATE_ROLES), async (req, res) => {
  const parsed = createPOSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { lineItems, ...rest } = parsed.data;

  if (rest.workOrderItemId) {
    const [itemOwnership] = await db
      .select()
      .from(workOrderItemsTable)
      .where(
        and(
          eq(workOrderItemsTable.id, rest.workOrderItemId),
          eq(workOrderItemsTable.workOrderId, rest.workOrderId),
        ),
      );
    if (!itemOwnership) {
      res.status(400).json({ error: "Item does not belong to the specified work order" });
      return;
    }
  }

  const priceDiff = Math.abs(rest.quotedAmount - rest.poAmount);
  const requiresCfoApproval = priceDiff > 0;

  const poNumber = await generatePoNumber();
  const userId = req.session.userId;

  const [po] = await db
    .insert(purchaseOrdersTable)
    .values({
      ...rest,
      poNumber,
      quotedAmount: rest.quotedAmount.toString(),
      poAmount: rest.poAmount.toString(),
      requiresCfoApproval,
      status: "pendingApproval",
      createdById: userId,
    })
    .returning();

  if (lineItems.length > 0) {
    await db.insert(poLineItemsTable).values(
      lineItems.map((li) => ({
        purchaseOrderId: po.id,
        productId: li.productId ?? null,
        productCode: li.productCode ?? null,
        productImageUrl: li.productImageUrl ?? null,
        hsnCode: li.hsnCode ?? null,
        unit: li.unit ?? null,
        description: li.description,
        qty: li.qty.toString(),
        unitPrice: li.unitPrice.toString(),
        gstRate: li.gstRate.toString(),
      })),
    );
  }

  await db
    .update(workOrderItemsTable)
    .set({ currentStep: "poCreated" })
    .where(
      rest.workOrderItemId
        ? eq(workOrderItemsTable.id, rest.workOrderItemId)
        : eq(workOrderItemsTable.workOrderId, rest.workOrderId),
    );

  const [fullPO] = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.id, po.id));

  const liRows = await db
    .select()
    .from(poLineItemsTable)
    .where(eq(poLineItemsTable.purchaseOrderId, po.id));

  res.status(201).json(serializePO({ ...fullPO, lineItems: liRows }));
});

ordersRouter.get("/purchase-orders", requireRole(...VIEW_ROLES), async (req, res) => {
  const { workOrderId, status } = req.query as {
    workOrderId?: string;
    status?: string;
  };

  const conditions = [];
  if (workOrderId) conditions.push(eq(purchaseOrdersTable.workOrderId, parseInt(workOrderId, 10)));
  if (status) conditions.push(eq(purchaseOrdersTable.status, status as typeof purchaseOrdersTable.status._.data));

  const rows = await db
    .select({
      po: purchaseOrdersTable,
      approvedBy: { name: usersTable.name },
    })
    .from(purchaseOrdersTable)
    .leftJoin(usersTable, eq(purchaseOrdersTable.approvedById, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(purchaseOrdersTable.createdAt));

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const liRows = await db
        .select()
        .from(poLineItemsTable)
        .where(eq(poLineItemsTable.purchaseOrderId, row.po.id));
      return serializePO({ ...row.po, lineItems: liRows, approvedBy: row.approvedBy });
    }),
  );

  res.json(enriched);
});

ordersRouter.get("/purchase-orders/pending-my-approval", requireAuth, async (req, res) => {
  const userRole = req.session.userRole ?? "";
  const canApprove = APPROVE_ROLES.includes(userRole as typeof APPROVE_ROLES[number]);
  if (!canApprove) {
    res.json([]);
    return;
  }

  const isCfoLevel = ["cfo", "director", "admin"].includes(userRole);

  const conditions = isCfoLevel
    ? [eq(purchaseOrdersTable.status, "pendingApproval")]
    : [
        eq(purchaseOrdersTable.status, "pendingApproval"),
        eq(purchaseOrdersTable.requiresCfoApproval, false),
      ];

  const pendingPOs = await db
    .select()
    .from(purchaseOrdersTable)
    .where(and(...conditions))
    .orderBy(desc(purchaseOrdersTable.createdAt));

  res.json(pendingPOs.map((po) => serializePO(po)));
});

ordersRouter.get("/purchase-orders/:id", requireRole(...VIEW_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [row] = await db
    .select({
      po: purchaseOrdersTable,
      approvedBy: { name: usersTable.name },
    })
    .from(purchaseOrdersTable)
    .leftJoin(usersTable, eq(purchaseOrdersTable.approvedById, usersTable.id))
    .where(eq(purchaseOrdersTable.id, id));

  if (!row) {
    res.status(404).json({ error: "PO not found" });
    return;
  }

  const liRows = await db
    .select()
    .from(poLineItemsTable)
    .where(eq(poLineItemsTable.purchaseOrderId, id));

  res.json(serializePO({ ...row.po, lineItems: liRows, approvedBy: row.approvedBy }));
});

ordersRouter.patch("/purchase-orders/:id", requireRole(...PO_CREATE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = updatePOSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { lineItems, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = {};

  if (rest.supplierName) updateData.supplierName = rest.supplierName;
  if (rest.supplierContact !== undefined) updateData.supplierContact = rest.supplierContact;
  if (rest.quotedAmount !== undefined) updateData.quotedAmount = rest.quotedAmount.toString();
  if (rest.poAmount !== undefined) updateData.poAmount = rest.poAmount.toString();
  if (rest.notes !== undefined) updateData.notes = rest.notes;

  if (rest.quotedAmount !== undefined || rest.poAmount !== undefined) {
    const [existing] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (existing) {
      const quoted = rest.quotedAmount ?? parseFloat(existing.quotedAmount);
      const poAmt = rest.poAmount ?? parseFloat(existing.poAmount);
      const priceDiff = Math.abs(quoted - poAmt);
      updateData.requiresCfoApproval = priceDiff > 0;
    }
  }

  const [updated] = await db
    .update(purchaseOrdersTable)
    .set(updateData)
    .where(eq(purchaseOrdersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "PO not found" });
    return;
  }

  const liRows = await db.select().from(poLineItemsTable).where(eq(poLineItemsTable.purchaseOrderId, id));
  res.json(serializePO({ ...updated, lineItems: liRows }));
});

ordersRouter.post(
  "/purchase-orders/:id/approve",
  requireRole(...APPROVE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) {
      res.status(404).json({ error: "PO not found" });
      return;
    }

    if (po.status !== "pendingApproval") {
      res.status(400).json({ error: `PO cannot be approved in its current status: ${po.status}` });
      return;
    }

    const userRole = req.session.userRole ?? "";
    if (po.requiresCfoApproval && !["cfo", "director", "admin"].includes(userRole)) {
      res.status(403).json({
        error: "This PO requires CFO approval due to price discrepancy",
      });
      return;
    }

    const [updated] = await db
      .update(purchaseOrdersTable)
      .set({
        status: "approved",
        approvedById: req.session.userId,
        approvedAt: new Date(),
      })
      .where(eq(purchaseOrdersTable.id, id))
      .returning();

    await db
      .update(workOrderItemsTable)
      .set({ currentStep: "poApproved" })
      .where(
        updated.workOrderItemId
          ? eq(workOrderItemsTable.id, updated.workOrderItemId)
          : eq(workOrderItemsTable.workOrderId, updated.workOrderId),
      );

    const liRows = await db.select().from(poLineItemsTable).where(eq(poLineItemsTable.purchaseOrderId, id));
    res.json(serializePO({ ...updated, lineItems: liRows }));
  },
);

ordersRouter.post(
  "/purchase-orders/:id/reject",
  requireRole(...APPROVE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { rejectionNote } = req.body as { rejectionNote?: string };

    const [existing] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "PO not found" });
      return;
    }
    if (existing.status !== "pendingApproval") {
      res.status(400).json({ error: `PO cannot be rejected in its current status: ${existing.status}` });
      return;
    }

    const [updated] = await db
      .update(purchaseOrdersTable)
      .set({ status: "cancelled", rejectionNote: rejectionNote ?? null })
      .where(eq(purchaseOrdersTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "PO not found" });
      return;
    }

    const liRows = await db.select().from(poLineItemsTable).where(eq(poLineItemsTable.purchaseOrderId, id));
    res.json(serializePO({ ...updated, lineItems: liRows }));
  },
);

ordersRouter.post(
  "/purchase-orders/:id/receive",
  requireRole(...STOCK_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) {
      res.status(404).json({ error: "PO not found" });
      return;
    }
    if (po.status !== "approved") {
      res.status(400).json({ error: "PO must be approved before receiving goods" });
      return;
    }

    const [updated] = await db
      .update(purchaseOrdersTable)
      .set({ status: "received", receivedAt: new Date() })
      .where(eq(purchaseOrdersTable.id, id))
      .returning();

    const nextStep = po.type === "rawMaterial" ? "rawMaterialIn" : "stockIn";
    await db
      .update(workOrderItemsTable)
      .set({ currentStep: nextStep })
      .where(
        updated.workOrderItemId
          ? eq(workOrderItemsTable.id, updated.workOrderItemId)
          : eq(workOrderItemsTable.workOrderId, updated.workOrderId),
      );

    // Post Stores In: write a cost-stamped stock_movements row for each PO
    // line item that has a productId. This is the canonical receipt event
    // that downstream Stores Out / invoicing / P&L cost from.
    const liRows = await db
      .select()
      .from(poLineItemsTable)
      .where(eq(poLineItemsTable.purchaseOrderId, id));
    const movementInserts = liRows
      .filter((li) => li.productId !== null)
      .map((li) => {
        const qty = parseFloat(li.qty);
        const unitCost = parseFloat(li.unitPrice);
        return {
          itemId: li.productId as number,
          movementType: "in" as const,
          sourceType: "purchaseOrder" as const,
          sourceId: id,
          workOrderId: updated.workOrderId ?? null,
          qty: qty.toString(),
          unitCost: unitCost.toString(),
          totalCost: (qty * unitCost).toFixed(2),
          createdById: req.session.userId ?? null,
          notes: `PO receipt ${po.poNumber}`,
        };
      });
    if (movementInserts.length > 0) {
      await db.insert(stockMovementsTable).values(movementInserts);
      // Also mirror each receipt into stock_transactions so that the
      // legacy on-hand ledger (used by Product Master + Stores Out
      // pickers) reflects the new stock immediately. Wrapped in
      // try/catch so a partial mirror failure cannot poison the
      // canonical movements ledger we just wrote.
      try {
        await db.insert(stockTransactionsTable).values(
          movementInserts.map((m) => ({
            itemId: m.itemId,
            type: "in" as const,
            qty: m.qty,
            rate: m.unitCost,
            referenceType: "purchaseOrder" as const,
            referenceNumber: po.poNumber,
            notes: m.notes ?? null,
            createdById: req.session.userId ?? null,
          })),
        );
      } catch (err) {
        logger.error(
          { poId: id, err },
          "PO receive: stock_transactions mirror failed (stock_movements still posted)",
        );
      }
    }

    logger.info(
      { poId: id, movements: movementInserts.length },
      `Goods received for PO — Stores In posted; next WO step: ${nextStep}`,
    );

    res.json(serializePO({ ...updated, lineItems: liRows }));
  },
);

ordersRouter.post(
  "/work-orders/:id/subcontract",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = subcontractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const [itemCheck] = await db
      .select()
      .from(workOrderItemsTable)
      .where(
        and(
          eq(workOrderItemsTable.id, parsed.data.workOrderItemId),
          eq(workOrderItemsTable.workOrderId, id),
        ),
      );
    if (!itemCheck) {
      res.status(400).json({ error: "Item does not belong to this work order" });
      return;
    }

    const [record] = await db
      .insert(subcontractRecordsTable)
      .values({
        workOrderItemId: parsed.data.workOrderItemId,
        vendorName: parsed.data.vendorName,
        vendorContact: parsed.data.vendorContact,
        cost: parsed.data.cost.toString(),
        description: parsed.data.description,
        status: parsed.data.status ?? "pending",
      })
      .returning();

    await db
      .update(workOrderItemsTable)
      .set({ currentStep: "inProduction" })
      .where(eq(workOrderItemsTable.id, parsed.data.workOrderItemId));

    const detail = await getWOWithDetails(id);
    res.status(201).json(detail);
  },
);

ordersRouter.post(
  "/work-orders/:id/delivery",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = deliverySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const existing = await db
      .select()
      .from(deliveryRecordsTable)
      .where(eq(deliveryRecordsTable.workOrderId, id));

    let delivery;
    if (existing.length > 0) {
      const [updated] = await db
        .update(deliveryRecordsTable)
        .set(parsed.data)
        .where(eq(deliveryRecordsTable.workOrderId, id))
        .returning();
      delivery = updated;
    } else {
      const [created] = await db
        .insert(deliveryRecordsTable)
        .values({ ...parsed.data, workOrderId: id })
        .returning();
      delivery = created;
    }

    if (parsed.data.status === "dispatched") {
      await db
        .update(workOrdersTable)
        .set({ status: "inProgress" })
        .where(eq(workOrdersTable.id, id));
      await db
        .update(workOrderItemsTable)
        .set({ currentStep: "dispatched" })
        .where(eq(workOrderItemsTable.workOrderId, id));
    } else if (parsed.data.status === "delivered") {
      await db
        .update(workOrdersTable)
        .set({ status: "delivered" })
        .where(eq(workOrdersTable.id, id));
      await db
        .update(workOrderItemsTable)
        .set({ currentStep: "delivered" })
        .where(eq(workOrderItemsTable.workOrderId, id));
    }

    const detail = await getWOWithDetails(id);
    res.json(detail);
  },
);

ordersRouter.post(
  "/work-orders/:id/invoice",
  requireRole(...INVOICE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [woRow] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, id));
    if (!woRow) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }

    // Accept optional GST metadata from request body
    const invoiceParamsSchema = z.object({
      transactionType: z.enum(["intrastate", "interstate"]).default("intrastate"),
      customerGstin: z.string().optional(),
      bcaGstin: z.string().optional(),
      defaultGstRate: z.number().min(0).max(28).default(18),
      defaultHsnCode: z.string().max(20).optional(),
      dueDate: z.string().optional(),
    });
    const invoiceParams = invoiceParamsSchema.parse(req.body ?? {});

    const today = new Date().toISOString().slice(0, 10);

    // Check for existing invoice FIRST — idempotent path reuses persisted data
    const existingInvoices = await db
      .select({ id: gstInvoicesTable.id, invoiceNumber: gstInvoicesTable.invoiceNumber })
      .from(gstInvoicesTable)
      .where(eq(gstInvoicesTable.workOrderId, id));

    let gstInvoiceId: number;
    let invoiceNumber: string;

    if (existingInvoices.length > 0) {
      // Reuse the already-persisted invoice — do NOT generate a new number
      gstInvoiceId = existingInvoices[0].id;
      invoiceNumber = existingInvoices[0].invoiceNumber;
    } else {
      // Fresh invoice — generate number and fetch line items
      invoiceNumber = await generateInvoiceNumber();

      const woItems = await db
        .select()
        .from(workOrderItemsTable)
        .where(eq(workOrderItemsTable.workOrderId, id));

      let subtotal = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;

      const lineData = woItems.map((item) => {
        const qty = parseFloat(item.qty ?? "1") || 1;
        const unitPrice = parseFloat(item.unitPrice ?? "0") || 0;
        const taxableValue = qty * unitPrice;
        const gstRate = invoiceParams.defaultGstRate;
        const { cgst, sgst, igst } = calcGst(taxableValue, gstRate, invoiceParams.transactionType);
        subtotal += taxableValue;
        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;
        return {
          description: item.description,
          hsnCode: invoiceParams.defaultHsnCode ?? null,
          qty: item.qty ?? "1",
          unitPrice: item.unitPrice ?? "0",
          taxableValue: taxableValue.toFixed(2),
          gstRate: String(gstRate),
          cgstAmount: cgst.toFixed(2),
          sgstAmount: sgst.toFixed(2),
          igstAmount: igst.toFixed(2),
          lineTotal: (taxableValue + cgst + sgst + igst).toFixed(2),
        };
      });

      const total = subtotal + totalCgst + totalSgst + totalIgst;

      const [newInvoice] = await db
        .insert(gstInvoicesTable)
        .values({
          invoiceNumber,
          invoiceDate: today,
          customerName: woRow.customerName,
          customerGstin: invoiceParams.customerGstin,
          bcaGstin: invoiceParams.bcaGstin,
          workOrderId: id,
          transactionType: invoiceParams.transactionType,
          subtotal: subtotal.toFixed(2),
          cgstAmount: totalCgst.toFixed(2),
          sgstAmount: totalSgst.toFixed(2),
          igstAmount: totalIgst.toFixed(2),
          total: total.toFixed(2),
          dueDate: invoiceParams.dueDate,
          createdById: req.session.userId ?? null,
        })
        .returning();
      gstInvoiceId = newInvoice.id;

      if (lineData.length > 0) {
        await db.insert(invoiceLineItemsTable).values(
          lineData.map((l) => ({
            invoiceId: gstInvoiceId,
            description: l.description,
            hsnCode: l.hsnCode,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxableValue: l.taxableValue,
            gstRate: l.gstRate,
            cgstAmount: l.cgstAmount,
            sgstAmount: l.sgstAmount,
            igstAmount: l.igstAmount,
            lineTotal: l.lineTotal,
          })),
        );
      }
    }

    // Update delivery records using the canonical invoiceNumber from gst_invoices
    const existing = await db
      .select()
      .from(deliveryRecordsTable)
      .where(eq(deliveryRecordsTable.workOrderId, id));

    if (existing.length > 0) {
      await db
        .update(deliveryRecordsTable)
        .set({
          invoiceGenerated: true,
          invoiceNumber,
          invoiceGeneratedAt: new Date(),
          status: "delivered",
        })
        .where(eq(deliveryRecordsTable.workOrderId, id));
    } else {
      await db
        .insert(deliveryRecordsTable)
        .values({
          workOrderId: id,
          invoiceGenerated: true,
          invoiceNumber,
          invoiceGeneratedAt: new Date(),
          status: "delivered",
        });
    }

    await db
      .update(workOrdersTable)
      .set({ status: "delivered" })
      .where(eq(workOrdersTable.id, id));

    await db
      .update(workOrderItemsTable)
      .set({ currentStep: "invoiced" })
      .where(eq(workOrderItemsTable.workOrderId, id));

    logger.info({ invoiceNumber, woId: id, gstInvoiceId }, "GST invoice generated and linked to gst_invoices table");

    const detail = await getWOWithDetails(id);
    res.json({ workOrder: detail, invoiceNumber, gstInvoiceId });
  },
);

ordersRouter.post(
  "/work-orders/:id/items/:itemId/finished-goods",
  requireRole(...STOCK_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    const itemId = parseInt(String(req.params.itemId), 10);
    if (isNaN(id) || isNaN(itemId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [updated] = await db
      .update(workOrderItemsTable)
      .set({ currentStep: "finishedGoodsIn" })
      .where(
        and(
          eq(workOrderItemsTable.id, itemId),
          eq(workOrderItemsTable.workOrderId, id),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    const detail = await getWOWithDetails(id);
    res.json(detail);
  },
);

// ─── POST /work-orders/:id/generate-invoice-from-stores ──────────────────────
// Groups stock_movements OUT for this WO by product, computes total qty &
// COGS, and creates a GST invoice with one line per product. Falls back to
// existing invoice (idempotent) if one already exists.
ordersRouter.post(
  "/work-orders/:id/generate-invoice-from-stores",
  requireRole(...INVOICE_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [woRow] = await db.select().from(workOrdersTable).where(eq(workOrdersTable.id, id));
    if (!woRow) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }

    const paramsSchema = z.object({
      transactionType: z.enum(["intrastate", "interstate"]).default("intrastate"),
      customerGstin: z.string().optional(),
      bcaGstin: z.string().optional(),
      defaultGstRate: z.number().min(0).max(28).default(18),
      marginPercent: z.number().min(0).max(1000).default(20),
      dueDate: z.string().optional(),
    });
    const params = paramsSchema.parse(req.body ?? {});

    const existingInvoices = await db
      .select({ id: gstInvoicesTable.id, invoiceNumber: gstInvoicesTable.invoiceNumber })
      .from(gstInvoicesTable)
      .where(eq(gstInvoicesTable.workOrderId, id));

    if (existingInvoices.length > 0) {
      const detail = await getWOWithDetails(id);
      res.json({
        workOrder: detail,
        invoiceNumber: existingInvoices[0].invoiceNumber,
        gstInvoiceId: existingInvoices[0].id,
        reused: true,
      });
      return;
    }

    // Group stores-out movements by itemId. Exclude subcontract transfers —
    // those are not customer-billable issues, just material loans to vendors.
    const movements = await db
      .select()
      .from(stockMovementsTable)
      .where(
        and(
          eq(stockMovementsTable.workOrderId, id),
          eq(stockMovementsTable.movementType, "out"),
          ne(stockMovementsTable.sourceType, "subcontractIssue"),
        ),
      );
    if (movements.length === 0) {
      res.status(400).json({
        error: "No Stores-Out movements found for this WO. Issue stock first.",
      });
      return;
    }

    const byItem = new Map<number, { qty: number; cost: number }>();
    for (const m of movements) {
      const cur = byItem.get(m.itemId) ?? { qty: 0, cost: 0 };
      cur.qty += parseFloat(m.qty);
      cur.cost += parseFloat(m.totalCost);
      byItem.set(m.itemId, cur);
    }

    const itemIds = Array.from(byItem.keys());
    const products = await db
      .select()
      .from(inventoryItemsTable)
      .where(inArray(inventoryItemsTable.id, itemIds));
    const productById = new Map(products.map((p) => [p.id, p]));

    const today = new Date().toISOString().slice(0, 10);
    const invoiceNumber = await generateInvoiceNumber();

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const lineData = itemIds.map((itemId) => {
      const agg = byItem.get(itemId)!;
      const prod = productById.get(itemId);
      const cogsPerUnit = agg.qty > 0 ? agg.cost / agg.qty : 0;
      const salePerUnit =
        prod && parseFloat(prod.defaultSalePrice) > 0
          ? parseFloat(prod.defaultSalePrice)
          : cogsPerUnit * (1 + params.marginPercent / 100);
      const taxableValue = agg.qty * salePerUnit;
      const gstRate = prod ? parseFloat(prod.gstRate) : params.defaultGstRate;
      const { cgst, sgst, igst } = calcGst(taxableValue, gstRate, params.transactionType);
      subtotal += taxableValue;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      return {
        description: prod?.name ?? `Item ${itemId}`,
        hsnCode: prod?.hsnCode ?? null,
        qty: agg.qty.toFixed(4),
        unitPrice: salePerUnit.toFixed(2),
        taxableValue: taxableValue.toFixed(2),
        gstRate: String(gstRate),
        cgstAmount: cgst.toFixed(2),
        sgstAmount: sgst.toFixed(2),
        igstAmount: igst.toFixed(2),
        lineTotal: (taxableValue + cgst + sgst + igst).toFixed(2),
      };
    });

    const total = subtotal + totalCgst + totalSgst + totalIgst;

    const [newInvoice] = await db
      .insert(gstInvoicesTable)
      .values({
        invoiceNumber,
        invoiceDate: today,
        customerName: woRow.customerName,
        customerGstin: params.customerGstin,
        bcaGstin: params.bcaGstin,
        workOrderId: id,
        transactionType: params.transactionType,
        subtotal: subtotal.toFixed(2),
        cgstAmount: totalCgst.toFixed(2),
        sgstAmount: totalSgst.toFixed(2),
        igstAmount: totalIgst.toFixed(2),
        total: total.toFixed(2),
        dueDate: params.dueDate,
        createdById: req.session.userId ?? null,
      })
      .returning();

    if (lineData.length > 0) {
      await db.insert(invoiceLineItemsTable).values(
        lineData.map((l) => ({
          invoiceId: newInvoice.id,
          description: l.description,
          hsnCode: l.hsnCode,
          qty: l.qty,
          unitPrice: l.unitPrice,
          taxableValue: l.taxableValue,
          gstRate: l.gstRate,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
          lineTotal: l.lineTotal,
        })),
      );
    }

    // Mark as delivered + invoiced
    const existing = await db
      .select()
      .from(deliveryRecordsTable)
      .where(eq(deliveryRecordsTable.workOrderId, id));
    if (existing.length > 0) {
      await db
        .update(deliveryRecordsTable)
        .set({
          invoiceGenerated: true,
          invoiceNumber,
          invoiceGeneratedAt: new Date(),
          status: "delivered",
        })
        .where(eq(deliveryRecordsTable.workOrderId, id));
    } else {
      await db.insert(deliveryRecordsTable).values({
        workOrderId: id,
        invoiceGenerated: true,
        invoiceNumber,
        invoiceGeneratedAt: new Date(),
        status: "delivered",
      });
    }
    await db
      .update(workOrdersTable)
      .set({ status: "delivered" })
      .where(eq(workOrdersTable.id, id));
    await db
      .update(workOrderItemsTable)
      .set({ currentStep: "invoiced" })
      .where(eq(workOrderItemsTable.workOrderId, id));

    logger.info(
      { invoiceNumber, woId: id, gstInvoiceId: newInvoice.id, lines: lineData.length },
      "Stores-driven GST invoice generated",
    );
    const detail = await getWOWithDetails(id);
    res.json({
      workOrder: detail,
      invoiceNumber,
      gstInvoiceId: newInvoice.id,
      reused: false,
    });
  },
);

// ─── GET /work-orders/:id/pnl ────────────────────────────────────────────────
ordersRouter.get(
  "/work-orders/:id/pnl",
  requireRole(...PNL_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [woRow] = await db
      .select()
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, id));
    if (!woRow) {
      res.status(404).json({ error: "Work order not found" });
      return;
    }

    const invoiceRows = await db
      .select({
        subtotal: gstInvoicesTable.subtotal,
        total: gstInvoicesTable.total,
      })
      .from(gstInvoicesTable)
      .where(eq(gstInvoicesTable.workOrderId, id));
    const revenueInvoiced = invoiceRows.reduce(
      (sum, r) => sum + parseFloat(r.subtotal),
      0,
    );
    const revenueOrderValue = parseFloat(woRow.total ?? "0") || 0;

    const costRows = await db
      .select({ totalCost: stockMovementsTable.totalCost })
      .from(stockMovementsTable)
      .where(
        and(
          eq(stockMovementsTable.workOrderId, id),
          eq(stockMovementsTable.movementType, "out"),
          // Subcontract transfers are not WO COGS (they go out and the
          // received finished goods come back in via subcontractIn)
          ne(stockMovementsTable.sourceType, "subcontractIssue"),
        ),
      );
    const costStoresOut = costRows.reduce(
      (sum, r) => sum + parseFloat(r.totalCost),
      0,
    );

    const subRows = await db
      .select({ totalVendorCost: subcontractJobsTable.totalVendorCost })
      .from(subcontractJobsTable)
      .where(eq(subcontractJobsTable.workOrderId, id));
    // Reported for visibility only — see summary endpoint above for why
    // this is intentionally NOT re-added to totalCost (would double-count
    // vendor charges already capitalised into Stores Out unit costs).
    const costSubcontract = subRows.reduce(
      (sum, r) => sum + parseFloat(r.totalVendorCost),
      0,
    );

    const costImportExpenses = 0;
    const directExpenses = 0;
    const totalCost = costStoresOut + costImportExpenses + directExpenses;
    const margin = revenueInvoiced - totalCost;
    const marginPercent =
      revenueInvoiced > 0 ? (margin / revenueInvoiced) * 100 : 0;

    res.json({
      workOrderId: id,
      workOrderNumber: woRow.woNumber,
      customerName: woRow.customerName,
      status: woRow.status,
      revenueInvoiced,
      revenueOrderValue,
      costStoresOut,
      costSubcontract,
      costImportExpenses,
      directExpenses,
      totalCost,
      margin,
      marginPercent,
      invoiceCount: invoiceRows.length,
      storesOutCount: costRows.length,
    });
  },
);


export default ordersRouter;
