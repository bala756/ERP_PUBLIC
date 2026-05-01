import { Router } from "express";
import {
  db,
  purchaseRequestsTable,
  purchaseRequestItemsTable,
  workOrdersTable,
  workOrderItemsTable,
  inventoryItemsTable,
  bomTemplatesTable,
  bomLineItemsTable,
  stockMovementsTable,
  stockTransactionsTable,
  purchaseOrdersTable,
  poLineItemsTable,
  importJobsTable,
  importJobItemsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const purchaseRequestsRouter = Router();

const VIEW_ROLES = [
  "sales",
  "purchase",
  "manager",
  "director",
  "admin",
  "cfo",
  "stores",
  "accounts",
  "production",
] as const;
const APPROVE_ROLES = ["manager", "director", "admin", "cfo"] as const;
const EDIT_ROLES = ["purchase", "manager", "director", "admin", "cfo"] as const;

purchaseRequestsRouter.use("/purchase-requests", requireAuth);
purchaseRequestsRouter.use("/work-orders", requireAuth);

async function generatePrNumber(): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('pr_seq')`,
  );
  const nextval = (result.rows[0] as { nextval: string }).nextval;
  const seq = String(nextval).padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `PR-${year}-${seq}`;
}

async function getOnHandQty(itemId: number): Promise<number> {
  // Source of truth: stock_movements (new). stock_transactions is mirrored
  // for the legacy ledger UI but NOT summed here to avoid double-counting.
  const movementsRes = await db.execute<{ balance: string }>(
    sql`SELECT COALESCE(SUM(CASE WHEN movement_type = 'in' THEN qty ELSE -qty END), 0) AS balance
        FROM stock_movements WHERE item_id = ${itemId}`,
  );
  return (
    parseFloat(
      (movementsRes.rows[0] as { balance: string } | undefined)?.balance ?? "0",
    )
  );
}

function classifyBranch(
  category: string | null | undefined,
  workflowType: string | null | undefined,
): "manufactured" | "raw" | "imported" {
  if (workflowType === "imported") return "imported";
  if (category === "finishedGoods" || category === "wip") return "manufactured";
  return "raw";
}

function serializePr(
  pr: typeof purchaseRequestsTable.$inferSelect & {
    workOrder?: { woNumber: string; customerName: string } | null;
    createdBy?: { name: string } | null;
    approvedBy?: { name: string } | null;
    itemCount?: number;
    totalEstimatedValue?: number;
  },
) {
  return {
    id: pr.id,
    prNumber: pr.prNumber,
    workOrderId: pr.workOrderId,
    workOrderNumber: pr.workOrder?.woNumber ?? null,
    woNumber: pr.workOrder?.woNumber ?? null,
    customerName: pr.workOrder?.customerName ?? null,
    status: pr.status,
    notes: pr.notes ?? null,
    createdByName: pr.createdBy?.name ?? null,
    approvedByName: pr.approvedBy?.name ?? null,
    approvedAt: pr.approvedAt?.toISOString() ?? null,
    createdAt: pr.createdAt.toISOString(),
    updatedAt: pr.updatedAt.toISOString(),
    itemCount: pr.itemCount ?? 0,
    totalEstimatedValue: pr.totalEstimatedValue ?? 0,
  };
}

async function getPrItemTotals(
  prIds: number[],
): Promise<Map<number, { itemCount: number; totalEstimatedValue: number }>> {
  const map = new Map<
    number,
    { itemCount: number; totalEstimatedValue: number }
  >();
  if (prIds.length === 0) return map;
  const rows = await db
    .select({
      purchaseRequestId: purchaseRequestItemsTable.purchaseRequestId,
      itemCount: sql<string>`COUNT(*)`.as("item_count"),
      totalEstimatedValue:
        sql<string>`COALESCE(SUM(${purchaseRequestItemsTable.shortfallQty}::numeric * ${purchaseRequestItemsTable.estimatedUnitCost}::numeric), 0)`.as(
          "total_est",
        ),
    })
    .from(purchaseRequestItemsTable)
    .where(inArray(purchaseRequestItemsTable.purchaseRequestId, prIds))
    .groupBy(purchaseRequestItemsTable.purchaseRequestId);
  for (const r of rows) {
    map.set(r.purchaseRequestId, {
      itemCount: parseInt(r.itemCount, 10),
      totalEstimatedValue: parseFloat(r.totalEstimatedValue),
    });
  }
  return map;
}

function serializePrItem(
  item: typeof purchaseRequestItemsTable.$inferSelect & {
    product?: { name: string; itemCode: string | null; unit: string } | null;
  },
) {
  return {
    id: item.id,
    purchaseRequestId: item.purchaseRequestId,
    workOrderItemId: item.workOrderItemId ?? null,
    productId: item.productId ?? null,
    productName: item.product?.name ?? null,
    productCode: item.product?.itemCode ?? null,
    branch: item.branch,
    description: item.description,
    unit: item.unit ?? item.product?.unit ?? null,
    requiredQty: parseFloat(item.requiredQty),
    onHandQty: parseFloat(item.onHandQty),
    shortfallQty: parseFloat(item.shortfallQty),
    estimatedUnitCost: parseFloat(item.estimatedUnitCost),
    status: item.status,
    purchaseOrderId: item.purchaseOrderId ?? null,
    importJobId: item.importJobId ?? null,
    notes: item.notes ?? null,
  };
}

// ─── POST /work-orders/:id/release ────────────────────────────────────────────
purchaseRequestsRouter.post(
  "/work-orders/:id/release",
  requireRole(...EDIT_ROLES),
  async (req, res) => {
    const woId = Number(req.params.id);
    if (!Number.isFinite(woId)) {
      res.status(400).json({ error: "Invalid work order id" });
      return;
    }

    try {
      const [wo] = await db
        .select()
        .from(workOrdersTable)
        .where(eq(workOrdersTable.id, woId));
      if (!wo) {
        res.status(404).json({ error: "Work order not found" });
        return;
      }
      // Don't allow re-release if a non-rejected PR already exists
      const existing = await db
        .select()
        .from(purchaseRequestsTable)
        .where(
          and(
            eq(purchaseRequestsTable.workOrderId, woId),
            inArray(purchaseRequestsTable.status, ["proposed", "approved"]),
          ),
        );
      if (existing.length > 0) {
        res.status(409).json({
          error: "An active Purchase Request already exists for this WO",
          purchaseRequestId: existing[0].id,
        });
        return;
      }

      const items = await db
        .select()
        .from(workOrderItemsTable)
        .where(eq(workOrderItemsTable.workOrderId, woId));
      if (items.length === 0) {
        res.status(400).json({ error: "Work order has no line items" });
        return;
      }

      type Aggregate = {
        productId: number | null;
        workOrderItemId: number;
        branch: "manufactured" | "raw" | "imported";
        description: string;
        unit: string | null;
        requiredQty: number;
        estimatedUnitCost: number;
      };
      const aggregated: Aggregate[] = [];

      for (const item of items) {
        const qty = parseFloat(item.qty);
        let product:
          | typeof inventoryItemsTable.$inferSelect
          | undefined;
        if (item.productId) {
          [product] = await db
            .select()
            .from(inventoryItemsTable)
            .where(eq(inventoryItemsTable.id, item.productId));
        }

        const branch = classifyBranch(
          product?.category ?? null,
          item.workflowType ?? null,
        );

        // Manufactured + has BOM → explode to raw materials, branch=raw for each
        if (branch === "manufactured" && product?.bomTemplateId) {
          const lines = await db
            .select()
            .from(bomLineItemsTable)
            .where(eq(bomLineItemsTable.bomId, product.bomTemplateId));

          // Also keep an entry for the manufactured FG itself so it can be tracked
          aggregated.push({
            productId: product.id,
            workOrderItemId: item.id,
            branch: "manufactured",
            description: product.name,
            unit: product.unit ?? item.unit ?? null,
            requiredQty: qty,
            estimatedUnitCost: parseFloat(product.defaultPurchasePrice),
          });

          for (const line of lines) {
            const [raw] = await db
              .select()
              .from(inventoryItemsTable)
              .where(eq(inventoryItemsTable.id, line.rawMaterialItemId));
            if (!raw) continue;
            aggregated.push({
              productId: raw.id,
              workOrderItemId: item.id,
              branch: "raw",
              description: raw.name,
              unit: line.unit ?? raw.unit ?? null,
              requiredQty: parseFloat(line.qty) * qty,
              estimatedUnitCost: parseFloat(raw.defaultPurchasePrice),
            });
          }
        } else {
          aggregated.push({
            productId: product?.id ?? null,
            workOrderItemId: item.id,
            branch,
            description: product?.name ?? item.description,
            unit: product?.unit ?? item.unit ?? null,
            requiredQty: qty,
            estimatedUnitCost: product
              ? parseFloat(product.defaultPurchasePrice)
              : parseFloat(item.unitPrice),
          });
        }
      }

      // Coalesce by (productId, branch, workOrderItemId)
      const merged = new Map<string, Aggregate>();
      for (const a of aggregated) {
        const key = `${a.productId ?? "null"}|${a.branch}|${a.workOrderItemId}`;
        const prev = merged.get(key);
        if (prev) {
          prev.requiredQty += a.requiredQty;
        } else {
          merged.set(key, { ...a });
        }
      }

      const prNumber = await generatePrNumber();
      const [pr] = await db
        .insert(purchaseRequestsTable)
        .values({
          prNumber,
          workOrderId: woId,
          status: "proposed",
          createdById: req.session.userId ?? null,
        })
        .returning();

      const itemsToInsert = await Promise.all(
        Array.from(merged.values()).map(async (a) => {
          const onHand = a.productId ? await getOnHandQty(a.productId) : 0;
          const shortfall = Math.max(0, a.requiredQty - onHand);
          return {
            purchaseRequestId: pr.id,
            workOrderItemId: a.workOrderItemId,
            productId: a.productId,
            branch: a.branch,
            description: a.description,
            unit: a.unit,
            requiredQty: a.requiredQty.toString(),
            onHandQty: onHand.toString(),
            shortfallQty: shortfall.toString(),
            estimatedUnitCost: a.estimatedUnitCost.toString(),
            status: "pending" as const,
          };
        }),
      );

      if (itemsToInsert.length > 0) {
        await db.insert(purchaseRequestItemsTable).values(itemsToInsert);
      }

      // Bump WO status from draft → inProduction if it was draft
      if (wo.status === "draft") {
        await db
          .update(workOrdersTable)
          .set({ status: "inProgress", updatedAt: new Date() })
          .where(eq(workOrdersTable.id, woId));
      }

      res.status(201).json({ id: pr.id, prNumber, workOrderId: woId });

      return;
    } catch (err) {
      logger.error({ err }, "Failed to release WO");
      res.status(500).json({ error: "Failed to release work order" });
      return;
    }
  },
);

// ─── GET /purchase-requests ───────────────────────────────────────────────────
purchaseRequestsRouter.get(
  "/purchase-requests",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const { status, workOrderId } = req.query as {
      status?: string;
      workOrderId?: string;
    };
    const conds = [] as ReturnType<typeof eq>[];
    if (status) conds.push(eq(purchaseRequestsTable.status, status as never));
    if (workOrderId)
      conds.push(eq(purchaseRequestsTable.workOrderId, Number(workOrderId)));

    const rows = await db
      .select({
        pr: purchaseRequestsTable,
        wo: workOrdersTable,
        createdBy: usersTable,
      })
      .from(purchaseRequestsTable)
      .leftJoin(
        workOrdersTable,
        eq(workOrdersTable.id, purchaseRequestsTable.workOrderId),
      )
      .leftJoin(
        usersTable,
        eq(usersTable.id, purchaseRequestsTable.createdById),
      )
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(purchaseRequestsTable.id));

    const totals = await getPrItemTotals(rows.map((r) => r.pr.id));

    res.json(
      rows.map((r) => {
        const t = totals.get(r.pr.id);
        return serializePr({
          ...r.pr,
          workOrder: r.wo
            ? { woNumber: r.wo.woNumber, customerName: r.wo.customerName }
            : null,
          createdBy: r.createdBy ? { name: r.createdBy.name } : null,
          approvedBy: null,
          itemCount: t?.itemCount ?? 0,
          totalEstimatedValue: t?.totalEstimatedValue ?? 0,
        });
      }),
    );
  },
);

// ─── GET /purchase-requests/:id ──────────────────────────────────────────────
purchaseRequestsRouter.get(
  "/purchase-requests/:id",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({
        pr: purchaseRequestsTable,
        wo: workOrdersTable,
      })
      .from(purchaseRequestsTable)
      .leftJoin(
        workOrdersTable,
        eq(workOrdersTable.id, purchaseRequestsTable.workOrderId),
      )
      .where(eq(purchaseRequestsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "PR not found" });
      return;
    }
    let createdBy: { name: string } | null = null;
    let approvedBy: { name: string } | null = null;
    const createdById = row.pr.createdById;
    const approvedById = row.pr.approvedById;
    if (typeof createdById === "number") {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, createdById));
      createdBy = u ?? null;
    }
    if (typeof approvedById === "number") {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, approvedById));
      approvedBy = u ?? null;
    }

    const items = await db
      .select({
        item: purchaseRequestItemsTable,
        product: inventoryItemsTable,
      })
      .from(purchaseRequestItemsTable)
      .leftJoin(
        inventoryItemsTable,
        eq(inventoryItemsTable.id, purchaseRequestItemsTable.productId),
      )
      .where(eq(purchaseRequestItemsTable.purchaseRequestId, id))
      .orderBy(purchaseRequestItemsTable.id);

    const itemCount = items.length;
    const totalEstimatedValue = items.reduce(
      (sum, r) =>
        sum +
        parseFloat(r.item.shortfallQty) *
          parseFloat(r.item.estimatedUnitCost),
      0,
    );

    const woSummary: { woNumber: string; customerName: string } | null = row.wo
      ? { woNumber: row.wo!.woNumber, customerName: row.wo!.customerName }
      : null;
    res.json({
      ...serializePr({
        ...row.pr,
        workOrder: woSummary,
        createdBy,
        approvedBy,
        itemCount,
        totalEstimatedValue,
      }),
      items: items.map((r) =>
        serializePrItem({
          ...r.item,
          product: r.product
            ? {
                name: r.product.name,
                itemCode: r.product.itemCode,
                unit: r.product.unit,
              }
            : null,
        }),
      ),
    });
  },
);

// ─── PATCH /purchase-requests/:id ────────────────────────────────────────────
const patchPrSchema = z.object({
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        requiredQty: z.number().min(0).optional(),
        estimatedUnitCost: z.number().min(0).optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

purchaseRequestsRouter.patch(
  "/purchase-requests/:id",
  requireRole(...EDIT_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = patchPrSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;

    const [pr] = await db
      .select()
      .from(purchaseRequestsTable)
      .where(eq(purchaseRequestsTable.id, id));
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }
    if (pr.status !== "proposed") {
      res.status(400).json({ error: "Only proposed PRs can be edited" });
      return;
    }

    if (data.notes !== undefined) {
      await db
        .update(purchaseRequestsTable)
        .set({ notes: data.notes ?? null, updatedAt: new Date() })
        .where(eq(purchaseRequestsTable.id, id));
    }

    if (data.items) {
      for (const it of data.items) {
        const update: Record<string, unknown> = {};
        const reqQty = it.requiredQty;
        if (reqQty !== undefined) {
          update.requiredQty = reqQty.toString();
          // recompute shortfall
          const [existing] = await db
            .select()
            .from(purchaseRequestItemsTable)
            .where(eq(purchaseRequestItemsTable.id, it.id));
          if (existing) {
            update.shortfallQty = Math.max(
              0,
              reqQty - parseFloat(existing.onHandQty),
            ).toString();
          }
        }
        const estCost = it.estimatedUnitCost;
        if (estCost !== undefined)
          update.estimatedUnitCost = estCost.toString();
        if (it.notes !== undefined) update.notes = it.notes;
        if (Object.keys(update).length > 0) {
          await db
            .update(purchaseRequestItemsTable)
            .set(update)
            .where(eq(purchaseRequestItemsTable.id, it.id));
        }
      }
    }

    res.json({ ok: true });
  },
);

// ─── POST /purchase-requests/:id/approve ──────────────────────────────────────
const approveSchema = z.object({
  vendorByItemId: z
    .record(z.string(), z.string().min(1).max(255))
    .optional(),
});

purchaseRequestsRouter.post(
  "/purchase-requests/:id/approve",
  requireRole(...APPROVE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = approveSchema.safeParse(req.body ?? {});
    const vendorMap =
      parsed.success && parsed.data ? parsed.data.vendorByItemId ?? {} : {};

    const [pr] = await db
      .select()
      .from(purchaseRequestsTable)
      .where(eq(purchaseRequestsTable.id, id));
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }
    if (pr.status !== "proposed") {
      res.status(400).json({ error: "PR is not in proposed state" });
      return;
    }

    const items = await db
      .select()
      .from(purchaseRequestItemsTable)
      .where(eq(purchaseRequestItemsTable.purchaseRequestId, id));

    const createdPoIds: number[] = [];
    const createdImportJobIds: number[] = [];

    // Group items needing purchase by branch + vendor
    type Group = {
      branch: "manufactured" | "raw" | "imported";
      vendor: string;
      items: typeof items;
    };
    const groups = new Map<string, Group>();

    for (const it of items) {
      const shortfall = parseFloat(it.shortfallQty);
      const onHand = parseFloat(it.onHandQty);

      // Issue from stock if fully covered
      if (shortfall <= 0) {
        await db
          .update(purchaseRequestItemsTable)
          .set({ status: "issuedFromStock" })
          .where(eq(purchaseRequestItemsTable.id, it.id));
        continue;
      }

      // Manufactured FG with BOM stays "pending" — handled in-house via subcontract
      // or production from raw materials (which are the other PR rows)
      if (it.branch === "manufactured") {
        await db
          .update(purchaseRequestItemsTable)
          .set({ status: "pending" })
          .where(eq(purchaseRequestItemsTable.id, it.id));
        continue;
      }

      const vendor = vendorMap[String(it.id)] ?? "TBD";
      const key = `${it.branch}|${vendor}`;
      const existingGroup = groups.get(key);
      if (existingGroup) {
        existingGroup.items.push(it);
      } else {
        groups.set(key, { branch: it.branch, vendor, items: [it] });
      }
    }

    for (const [, group] of groups) {
      if (group.branch === "raw") {
        // Create a PO of type rawMaterial
        const poNumberRes = await db.execute<{ nextval: string }>(
          sql`SELECT nextval('po_seq')`,
        );
        const seq = String(poNumberRes.rows[0].nextval).padStart(4, "0");
        const year = new Date().getFullYear().toString().slice(-2);
        const poNumber = `PO-${year}-${seq}`;
        const totalAmt = group.items.reduce(
          (sum, i) =>
            sum + parseFloat(i.shortfallQty) * parseFloat(i.estimatedUnitCost),
          0,
        );
        const [po] = await db
          .insert(purchaseOrdersTable)
          .values({
            poNumber,
            workOrderId: pr.workOrderId,
            workOrderItemId: group.items[0].workOrderItemId,
            supplierName: group.vendor,
            type: "rawMaterial",
            quotedAmount: totalAmt.toString(),
            poAmount: totalAmt.toString(),
            status: "pendingApproval",
            requiresCfoApproval: totalAmt > 100000,
            createdById: req.session.userId ?? null,
          })
          .returning();
        createdPoIds.push(po.id);

        for (const it of group.items) {
          await db.insert(poLineItemsTable).values({
            purchaseOrderId: po.id,
            productId: it.productId,
            description: it.description,
            qty: it.shortfallQty,
            unitPrice: it.estimatedUnitCost,
            gstRate: "18",
            unit: it.unit ?? null,
          });
          await db
            .update(purchaseRequestItemsTable)
            .set({ status: "convertedToPo", purchaseOrderId: po.id })
            .where(eq(purchaseRequestItemsTable.id, it.id));
        }
      } else if (group.branch === "imported") {
        // Create a draft import job containing these items
        const ijNumRes = await db.execute<{ nextval: string }>(
          sql`SELECT nextval('import_job_seq')`,
        );
        const seq = String(ijNumRes.rows[0].nextval).padStart(4, "0");
        const year = new Date().getFullYear().toString().slice(-2);
        const jobNumber = `IMP-${year}-${seq}`;
        const [ij] = await db
          .insert(importJobsTable)
          .values({
            jobNumber,
            title: `Auto from ${pr.prNumber}`,
            vendorName: group.vendor,
            currency: "USD",
            exchangeRate: "83.0000",
            status: "draft",
            createdById: req.session.userId ?? null,
          })
          .returning();
        createdImportJobIds.push(ij.id);

        for (const it of group.items) {
          await db.insert(importJobItemsTable).values({
            importJobId: ij.id,
            inventoryItemId: it.productId,
            description: it.description,
            qty: it.shortfallQty,
            unit: it.unit ?? "pcs",
            unitPriceForeign: "0",
          });
          await db
            .update(purchaseRequestItemsTable)
            .set({ status: "convertedToImport", importJobId: ij.id })
            .where(eq(purchaseRequestItemsTable.id, it.id));
        }
      }
    }

    await db
      .update(purchaseRequestsTable)
      .set({
        status: "approved",
        approvedById: req.session.userId ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequestsTable.id, id));

    res.json({
      ok: true,
      purchaseOrderIds: createdPoIds,
      importJobIds: createdImportJobIds,
    });
  },
);

// ─── POST /purchase-requests/:id/reject ──────────────────────────────────────
purchaseRequestsRouter.post(
  "/purchase-requests/:id/reject",
  requireRole(...APPROVE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [pr] = await db
      .select()
      .from(purchaseRequestsTable)
      .where(eq(purchaseRequestsTable.id, id));
    if (!pr) {
      res.status(404).json({ error: "PR not found" });
      return;
    }
    if (pr.status !== "proposed") {
      res.status(400).json({ error: "PR is not in proposed state" });
      return;
    }

    await db
      .update(purchaseRequestsTable)
      .set({
        status: "rejected",
        approvedById: req.session.userId ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequestsTable.id, id));

    res.json({ ok: true });
  },
);

export default purchaseRequestsRouter;
