import { Router } from "express";
import {
  db,
  stockMovementsTable,
  stockTransactionsTable,
  inventoryItemsTable,
  workOrdersTable,
  workOrderItemsTable,
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

const stockInSchema = z.object({
  itemId: z.number().int().positive(),
  qty: z.number().positive(),
  unitCost: z.number().min(0),
  sourceType: z.enum(SOURCE_TYPES).default("manual"),
  sourceId: z.number().int().positive().optional().nullable(),
  sourceNumber: z.string().max(100).optional().nullable(),
  workOrderId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const stockOutSchema = z.object({
  itemId: z.number().int().positive(),
  qty: z.number().positive(),
  workOrderId: z.number().int().positive(),
  sourceType: z.enum(SOURCE_TYPES).default("workOrderIssue"),
  notes: z.string().optional().nullable(),
});

function serializeMovement(
  row: typeof stockMovementsTable.$inferSelect & {
    item?: { name: string; itemCode: string | null; unit: string } | null;
    workOrder?: { woNumber: string } | null;
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
    notes: row.notes ?? null,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Compute the moving-average unit cost for OUT movements.
 * Source of truth: stock_movements (new). Legacy stock_transactions is mirrored
 * for the legacy ledger UI but NOT summed here to avoid double-counting writes
 * that exist in both tables. Pre-cutover legacy-only rows can be migrated
 * separately if/when needed.
 */
async function getMovingAvgCost(itemId: number): Promise<number> {
  const movRes = await db.execute<{ qty: string; cost: string }>(
    sql`SELECT COALESCE(SUM(qty),0) AS qty,
               COALESCE(SUM(qty * unit_cost),0) AS cost
        FROM stock_movements
        WHERE item_id = ${itemId} AND movement_type = 'in'`,
  );
  const totalQty = parseFloat(
    (movRes.rows[0] as { qty: string }).qty ?? "0",
  );
  const totalCost = parseFloat(
    (movRes.rows[0] as { cost: string }).cost ?? "0",
  );
  return totalQty > 0 ? totalCost / totalQty : 0;
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
          createdBy: r.createdBy ? { name: r.createdBy.name } : null,
        }),
      ),
    );
  },
);

// ─── POST /stock-movements/in ────────────────────────────────────────────────
stockMovementsRouter.post(
  "/stock-movements/in",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = stockInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const d = parsed.data;
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
        sourceId: d.sourceId ?? null,
        sourceNumber: d.sourceNumber ?? null,
        workOrderId: d.workOrderId ?? null,
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
        referenceType:
          d.sourceType === "purchaseOrder"
            ? "po"
            : d.sourceType === "workOrderIssue"
              ? "workOrder"
              : "manual",
        referenceId: d.sourceId ?? null,
        referenceNumber: d.sourceNumber ?? null,
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

// ─── POST /stock-movements/out ───────────────────────────────────────────────
stockMovementsRouter.post(
  "/stock-movements/out",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = stockOutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

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

    // Mirror into legacy stock_transactions
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

    res
      .status(201)
      .json({ id: created.id, unitCost, totalCost });
  },
);

export default stockMovementsRouter;
