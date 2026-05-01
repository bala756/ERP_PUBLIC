import { Router } from "express";
import {
  db,
  stockMovementsTable,
  stockTransactionsTable,
  inventoryItemsTable,
  workOrdersTable,
  purchaseOrdersTable,
  poLineItemsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const stockMovementsRouter = Router();

const VIEW_ROLES = [
  "stores",
  "purchase",
  "manager",
  "director",
  "admin",
  "cfo",
  "accounts",
  "production",
] as const;
const WRITE_ROLES = [
  "stores",
  "production",
  "manager",
  "director",
  "admin",
] as const;

stockMovementsRouter.use("/stock-movements", requireAuth);

const SOURCE_TYPES = [
  "purchaseOrder",
  "importJob",
  "subcontractIn",
  "production",
  "manual",
  "workOrderIssue",
  "subcontractIssue",
  "openingBalance",
] as const;

// Stores In hardening: every manual Stores In must be tied to an approved PO
// so on-hand additions are traceable to a supplier receipt. The PO existence
// + approved-status check is enforced in the route handler below.
const stockInSchema = z.object({
  itemId: z.number().int().positive(),
  qty: z.number().positive(),
  unitCost: z.number().min(0),
  purchaseOrderId: z.number().int().positive(),
  sourceType: z.enum(SOURCE_TYPES).default("purchaseOrder"),
  sourceId: z.number().int().positive().optional().nullable(),
  sourceNumber: z.string().max(100).optional().nullable(),
  workOrderId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Stores Out hardening: workOrderId is required (every issue is against a WO)
// and is rejected once a final-dispatch marker exists for that WO.
const stockOutSchema = z.object({
  itemId: z.number().int().positive(),
  qty: z.number().positive(),
  workOrderId: z.number().int().positive(),
  sourceType: z.enum(SOURCE_TYPES).default("workOrderIssue"),
  notes: z.string().optional().nullable(),
});

const stockInFromPoLineSchema = z.object({
  purchaseOrderLineId: z.number().int().positive(),
  receivedQty: z.number().min(0),
  unitCost: z.number().min(0).optional().nullable(),
});

const stockInFromPoSchema = z.object({
  purchaseOrderId: z.number().int().positive(),
  lines: z.array(stockInFromPoLineSchema).min(1),
  notes: z.string().optional().nullable(),
});

function serializeMovement(
  row: typeof stockMovementsTable.$inferSelect & {
    item?: { name: string; itemCode: string | null; unit: string } | null;
    workOrder?: { woNumber: string } | null;
    purchaseOrder?: { poNumber: string } | null;
    createdBy?: { name: string } | null;
  },
) {
  return {
    id: row.id,
    itemId: row.itemId,
    itemName: row.item?.name ?? null,
    itemCode: row.item?.itemCode ?? null,
    unit: row.item?.unit ?? null,
    movementType: row.movementType,
    qty: parseFloat(row.qty),
    unitCost: parseFloat(row.unitCost),
    totalCost: parseFloat(row.totalCost),
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    sourceNumber: row.sourceNumber ?? null,
    workOrderId: row.workOrderId ?? null,
    workOrderNumber: row.workOrder?.woNumber ?? null,
    woNumber: row.workOrder?.woNumber ?? null,
    purchaseOrderId: row.purchaseOrderId ?? null,
    purchaseOrderNumber: row.purchaseOrder?.poNumber ?? null,
    isShort: row.isShort,
    shortageQty: parseFloat(row.shortageQty),
    isFinalDispatch: row.isFinalDispatch,
    notes: row.notes ?? null,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Compute the perpetual weighted-average unit cost for the next OUT movement.
 *
 * Uses remaining-inventory valuation rather than all-time IN average:
 *   cost = (Σ in_value − Σ out_value) / (Σ in_qty − Σ out_qty)
 *
 * Each OUT row carries the unit_cost it was stamped with at issue time, so
 * subtracting Σ(out qty * out unit_cost) leaves the on-hand layer's value.
 * After full depletion (numerator and denominator both ~0) the next IN row
 * resets the basis. Pre-cutover legacy-only rows can be migrated separately
 * if/when needed.
 */
async function getMovingAvgCost(itemId: number): Promise<number> {
  const movRes = await db.execute<{ qty: string; cost: string }>(
    sql`SELECT
          COALESCE(SUM(CASE WHEN movement_type='in'  THEN qty ELSE -qty END), 0) AS qty,
          COALESCE(SUM(CASE WHEN movement_type='in'  THEN qty * unit_cost
                            ELSE -qty * unit_cost END), 0) AS cost
        FROM stock_movements
        WHERE item_id = ${itemId}`,
  );
  const remainingQty = parseFloat(
    (movRes.rows[0] as { qty: string }).qty ?? "0",
  );
  const remainingCost = parseFloat(
    (movRes.rows[0] as { cost: string }).cost ?? "0",
  );
  if (remainingQty > 0.0001) {
    return remainingCost / remainingQty;
  }
  const lastIn = await db.execute<{ unit_cost: string }>(
    sql`SELECT unit_cost FROM stock_movements
        WHERE item_id = ${itemId} AND movement_type='in'
        ORDER BY id DESC LIMIT 1`,
  );
  return lastIn.rows.length
    ? parseFloat((lastIn.rows[0] as { unit_cost: string }).unit_cost ?? "0")
    : 0;
}

async function getOnHand(itemId: number): Promise<number> {
  const movRes = await db.execute<{ balance: string }>(
    sql`SELECT COALESCE(SUM(CASE WHEN movement_type='in' THEN qty ELSE -qty END),0) AS balance
        FROM stock_movements WHERE item_id = ${itemId}`,
  );
  return parseFloat(
    (movRes.rows[0] as { balance: string }).balance ?? "0",
  );
}

/**
 * Returns true if a final-dispatch (invoice-emitted) marker already exists
 * for the given WO. When true, manual Stores Out entries against this WO
 * MUST be rejected — the dispatch is sealed by the invoice.
 */
async function hasFinalDispatch(workOrderId: number): Promise<boolean> {
  const r = await db.execute<{ c: string }>(
    sql`SELECT COUNT(*)::text AS c FROM stock_movements
        WHERE work_order_id = ${workOrderId} AND is_final_dispatch = true`,
  );
  return parseInt(r.rows[0]?.c ?? "0", 10) > 0;
}

// ─── GET /stock-movements ────────────────────────────────────────────────────
stockMovementsRouter.get(
  "/stock-movements",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const { workOrderId, itemId, movementType } = req.query as {
      workOrderId?: string;
      itemId?: string;
      movementType?: string;
    };

    const conds = [] as ReturnType<typeof eq>[];
    if (workOrderId)
      conds.push(eq(stockMovementsTable.workOrderId, Number(workOrderId)));
    if (itemId) conds.push(eq(stockMovementsTable.itemId, Number(itemId)));
    if (movementType)
      conds.push(
        eq(stockMovementsTable.movementType, movementType as never),
      );

    const rows = await db
      .select({
        m: stockMovementsTable,
        item: inventoryItemsTable,
        wo: workOrdersTable,
        po: purchaseOrdersTable,
        createdBy: usersTable,
      })
      .from(stockMovementsTable)
      .leftJoin(
        inventoryItemsTable,
        eq(inventoryItemsTable.id, stockMovementsTable.itemId),
      )
      .leftJoin(
        workOrdersTable,
        eq(workOrdersTable.id, stockMovementsTable.workOrderId),
      )
      .leftJoin(
        purchaseOrdersTable,
        eq(purchaseOrdersTable.id, stockMovementsTable.purchaseOrderId),
      )
      .leftJoin(
        usersTable,
        eq(usersTable.id, stockMovementsTable.createdById),
      )
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(stockMovementsTable.id))
      .limit(500);

    res.json(
      rows.map((r) =>
        serializeMovement({
          ...r.m,
          item: r.item
            ? {
                name: r.item.name,
                itemCode: r.item.itemCode,
                unit: r.item.unit,
              }
            : null,
          workOrder: r.wo ? { woNumber: r.wo.woNumber } : null,
          purchaseOrder: r.po ? { poNumber: r.po.poNumber } : null,
          createdBy: r.createdBy ? { name: r.createdBy.name } : null,
        }),
      ),
    );
  },
);

// ─── POST /stock-movements/in ────────────────────────────────────────────────
// Manual single-item Stores In. Requires a valid, approved/received PO so that
// on-hand additions are always traceable to an authorised supplier receipt.
stockMovementsRouter.post(
  "/stock-movements/in",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = stockInSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    const [po] = await db
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, d.purchaseOrderId));
    if (!po) {
      res.status(400).json({ error: "Purchase order not found" });
      return;
    }
    if (po.status !== "approved" && po.status !== "received") {
      res.status(400).json({
        error: `Stores In requires PO status approved or received (PO is ${po.status})`,
      });
      return;
    }

    const totalCost = d.qty * d.unitCost;

    const [created] = await db
      .insert(stockMovementsTable)
      .values({
        itemId: d.itemId,
        movementType: "in",
        qty: d.qty.toString(),
        unitCost: d.unitCost.toString(),
        totalCost: totalCost.toString(),
        sourceType: d.sourceType,
        sourceId: d.sourceId ?? d.purchaseOrderId,
        sourceNumber: d.sourceNumber ?? po.poNumber,
        purchaseOrderId: d.purchaseOrderId,
        workOrderId: d.workOrderId ?? po.workOrderId ?? null,
        notes: d.notes ?? null,
        createdById: req.session.userId ?? null,
      })
      .returning();

    // Mirror into legacy stock_transactions so the existing inventory ledger UI keeps working
    try {
      await db.insert(stockTransactionsTable).values({
        itemId: d.itemId,
        type: "in",
        qty: d.qty.toString(),
        rate: d.unitCost.toString(),
        referenceType: "purchaseOrder",
        referenceId: d.purchaseOrderId,
        referenceNumber: po.poNumber,
        notes: d.notes ?? null,
        createdById: req.session.userId ?? null,
      });
    } catch (err) {
      logger.warn(
        { err },
        "Failed to mirror stock_movements IN into stock_transactions",
      );
    }

    res.status(201).json({ id: created.id });
    return;
  },
);

// ─── POST /stock-movements/from-po ───────────────────────────────────────────
// Bulk Stores In keyed off a Purchase Order. Pre-fills receipts from approved
// PO line items, computes per-line shortage (orderedQty − receivedQty) and
// stamps it on each created stock_movements row.
stockMovementsRouter.post(
  "/stock-movements/from-po",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = stockInFromPoSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    const [po] = await db
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, d.purchaseOrderId));
    if (!po) {
      res.status(404).json({ error: "Purchase order not found" });
      return;
    }
    if (po.status !== "approved" && po.status !== "received") {
      res.status(400).json({
        error: `PO must be approved or received (currently ${po.status})`,
      });
      return;
    }

    const liRows = await db
      .select()
      .from(poLineItemsTable)
      .where(eq(poLineItemsTable.purchaseOrderId, d.purchaseOrderId));
    const liById = new Map(liRows.map((li) => [li.id, li]));

    // Cumulative receipts so far for this PO, keyed by productId. We
    // compute shortage against (ordered − historicalReceived − thisReceipt)
    // so installment receipts don't keep reporting the same shortage.
    const priorRows = await db
      .select({
        itemId: stockMovementsTable.itemId,
        qty: stockMovementsTable.qty,
      })
      .from(stockMovementsTable)
      .where(
        and(
          eq(stockMovementsTable.purchaseOrderId, d.purchaseOrderId),
          eq(stockMovementsTable.movementType, "in"),
        ),
      );
    const priorReceivedByItem = new Map<number, number>();
    for (const r of priorRows) {
      priorReceivedByItem.set(
        r.itemId,
        (priorReceivedByItem.get(r.itemId) ?? 0) + parseFloat(r.qty),
      );
    }

    const inserts: (typeof stockMovementsTable.$inferInsert)[] = [];
    let shortLines = 0;
    for (const line of d.lines) {
      const li = liById.get(line.purchaseOrderLineId);
      if (!li) {
        res.status(400).json({
          error: `PO line ${line.purchaseOrderLineId} not found on this PO`,
        });
        return;
      }
      if (li.productId === null) {
        // Skip PO lines that aren't tied to a product (free-form items
        // never feed inventory).
        continue;
      }
      const orderedQty = parseFloat(li.qty);
      const unitCost = line.unitCost ?? parseFloat(li.unitPrice);
      const receivedQty = line.receivedQty;
      const priorReceived = priorReceivedByItem.get(li.productId) ?? 0;
      const cumulativeReceived = priorReceived + receivedQty;
      const shortageQty = Math.max(0, orderedQty - cumulativeReceived);
      const isShort = shortageQty > 0.0001;
      if (isShort) shortLines += 1;

      if (receivedQty <= 0 && !isShort) continue;

      inserts.push({
        itemId: li.productId,
        movementType: "in",
        qty: receivedQty.toString(),
        unitCost: unitCost.toString(),
        totalCost: (receivedQty * unitCost).toFixed(2),
        sourceType: "purchaseOrder",
        sourceId: d.purchaseOrderId,
        sourceNumber: po.poNumber,
        purchaseOrderId: d.purchaseOrderId,
        workOrderId: po.workOrderId ?? null,
        isShort,
        shortageQty: shortageQty.toFixed(4),
        notes:
          d.notes ??
          (isShort
            ? `PO ${po.poNumber} — short by ${shortageQty} (${li.description})`
            : `PO ${po.poNumber} receipt`),
        createdById: req.session.userId ?? null,
      });
      // Update running tally so multiple lines on the same product within
      // one submission also chain correctly.
      priorReceivedByItem.set(li.productId, cumulativeReceived);
    }

    if (inserts.length === 0) {
      res.status(400).json({
        error: "No line receipts to record (all qtys zero or no productId)",
      });
      return;
    }

    await db.insert(stockMovementsTable).values(inserts);

    try {
      await db.insert(stockTransactionsTable).values(
        inserts.map((m) => ({
          itemId: m.itemId,
          type: "in" as const,
          qty: m.qty,
          rate: m.unitCost ?? "0",
          referenceType: "purchaseOrder" as const,
          referenceId: d.purchaseOrderId,
          referenceNumber: po.poNumber,
          notes: m.notes ?? null,
          createdById: req.session.userId ?? null,
        })),
      );
    } catch (err) {
      logger.warn(
        { err },
        "from-po: stock_transactions mirror failed (movements still posted)",
      );
    }

    logger.info(
      {
        poId: d.purchaseOrderId,
        movements: inserts.length,
        shortLines,
      },
      "Stores In from PO posted",
    );

    res.status(201).json({
      purchaseOrderId: d.purchaseOrderId,
      movementsCreated: inserts.length,
      shortLines,
    });
  },
);

// ─── POST /stock-movements/out ───────────────────────────────────────────────
// Manual Stores Out. workOrderId is mandatory and the route rejects new
// issues once the WO has been finalised by an invoice (final-dispatch marker).
stockMovementsRouter.post(
  "/stock-movements/out",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = stockOutSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    if (await hasFinalDispatch(d.workOrderId)) {
      res.status(409).json({
        error:
          "This WO has already been finalised by an invoice (final dispatch). Manual Stores Out is blocked.",
      });
      return;
    }

    const onHand = await getOnHand(d.itemId);
    if (onHand < d.qty) {
      res.status(400).json({ error: `Insufficient stock. On hand: ${onHand}` });
      return;
    }

    const unitCost = await getMovingAvgCost(d.itemId);
    const totalCost = d.qty * unitCost;

    const [wo] = await db
      .select({ woNumber: workOrdersTable.woNumber })
      .from(workOrdersTable)
      .where(eq(workOrdersTable.id, d.workOrderId));

    const [created] = await db
      .insert(stockMovementsTable)
      .values({
        itemId: d.itemId,
        movementType: "out",
        qty: d.qty.toString(),
        unitCost: unitCost.toString(),
        totalCost: totalCost.toString(),
        sourceType: d.sourceType,
        sourceId: d.workOrderId,
        sourceNumber: wo?.woNumber ?? null,
        workOrderId: d.workOrderId,
        notes: d.notes ?? null,
        createdById: req.session.userId ?? null,
      })
      .returning();

    try {
      await db.insert(stockTransactionsTable).values({
        itemId: d.itemId,
        type: "out",
        qty: d.qty.toString(),
        rate: unitCost.toString(),
        referenceType: "workOrder",
        referenceId: d.workOrderId,
        referenceNumber: wo?.woNumber ?? null,
        notes: d.notes ?? null,
        createdById: req.session.userId ?? null,
      });
    } catch (err) {
      logger.warn(
        { err },
        "Failed to mirror stock_movements OUT into stock_transactions",
      );
    }

    res.status(201).json({ id: created.id, unitCost, totalCost });
  },
);

export default stockMovementsRouter;
