import { Router } from "express";
import {
  db,
  subcontractJobsTable,
  subcontractJobItemsTable,
  stockMovementsTable,
  stockTransactionsTable,
  inventoryItemsTable,
  workOrdersTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const subcontractJobsRouter = Router();

const VIEW_ROLES = [
  "stores",
  "purchase",
  "manager",
  "director",
  "admin",
  "cfo",
  "production",
  "accounts",
] as const;
const WRITE_ROLES = [
  "stores",
  "production",
  "purchase",
  "manager",
  "director",
  "admin",
] as const;

subcontractJobsRouter.use("/subcontract-jobs", requireAuth);

async function generateSubcontractJobNumber(): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('subcontract_job_seq')`,
  );
  const seq = String(result.rows[0].nextval).padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `SCJ-${year}-${seq}`;
}

// Source of truth: stock_movements (new). stock_transactions is mirrored for
// the legacy ledger UI but NOT summed here to avoid double-counting writes
// that exist in both tables.
//
// Perpetual weighted-average over remaining inventory value:
//   cost = (Σ in_value − Σ out_value) / (Σ in_qty − Σ out_qty)
// Each OUT row carries its issue-time unit_cost, so subtracting Σ(out qty *
// out unit_cost) leaves the current on-hand layer's value. After full
// depletion the basis resets via the most recent IN fallback. This MUST
// match stockMovements.ts:getMovingAvgCost so subcontract send-out and
// stores out stamp consistent unit costs.
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

const createSchema = z.object({
  workOrderId: z.number().int().positive().optional().nullable(),
  vendorName: z.string().min(1).max(255),
  vendorContact: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        rawItemId: z.number().int().positive(),
        sentQty: z.number().positive(),
        finishedItemId: z.number().int().positive().optional().nullable(),
        vendorChargePerUnit: z.number().min(0).default(0),
      }),
    )
    .min(1),
});

const receiveSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        receivedQty: z.number().min(0),
        scrapQty: z.number().min(0).default(0),
        finishedItemId: z.number().int().positive().optional().nullable(),
        vendorChargePerUnit: z.number().min(0).optional(),
      }),
    )
    .min(1),
});

function serializeJob(
  j: typeof subcontractJobsTable.$inferSelect & {
    workOrder?: { woNumber: string } | null;
    createdBy?: { name: string } | null;
    itemCount?: number;
  },
) {
  return {
    id: j.id,
    jobNumber: j.jobNumber,
    workOrderId: j.workOrderId ?? null,
    workOrderNumber: j.workOrder?.woNumber ?? null,
    woNumber: j.workOrder?.woNumber ?? null,
    vendorName: j.vendorName,
    vendorContact: j.vendorContact ?? null,
    status: j.status,
    totalVendorCost: parseFloat(j.totalVendorCost),
    notes: j.notes ?? null,
    sentAt: j.sentAt.toISOString(),
    receivedAt: j.receivedAt?.toISOString() ?? null,
    createdByName: j.createdBy?.name ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    itemCount: j.itemCount ?? 0,
  };
}

function serializeJobItem(
  i: typeof subcontractJobItemsTable.$inferSelect & {
    rawItem?: { name: string; itemCode: string | null; unit: string } | null;
    finishedItem?: { name: string; itemCode: string | null; unit: string } | null;
  },
) {
  return {
    id: i.id,
    subcontractJobId: i.subcontractJobId,
    rawItemId: i.rawItemId,
    rawItemName: i.rawItem?.name ?? null,
    rawItemCode: i.rawItem?.itemCode ?? null,
    sentQty: parseFloat(i.sentQty),
    sentUnitCost: parseFloat(i.sentUnitCost),
    finishedItemId: i.finishedItemId ?? null,
    finishedItemName: i.finishedItem?.name ?? null,
    finishedItemCode: i.finishedItem?.itemCode ?? null,
    receivedQty: parseFloat(i.receivedQty),
    scrapQty: parseFloat(i.scrapQty),
    vendorChargePerUnit: parseFloat(i.vendorChargePerUnit),
    computedUnitCost: parseFloat(i.computedUnitCost),
    notes: i.notes ?? null,
  };
}

// ─── POST /subcontract-jobs ──────────────────────────────────────────────────
subcontractJobsRouter.post(
  "/subcontract-jobs",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const d = parsed.data;

    // Verify on-hand for each raw item
    for (const it of d.items) {
      const onHand = await getOnHand(it.rawItemId);
      if (onHand < it.sentQty) {
        const [item] = await db
          .select({ name: inventoryItemsTable.name })
          .from(inventoryItemsTable)
          .where(eq(inventoryItemsTable.id, it.rawItemId));
        res.status(400).json({
          error: `Insufficient stock for ${item?.name ?? "item " + it.rawItemId}: on hand ${onHand}, need ${it.sentQty}`,
        });
        return;
      }
    }

    const jobNumber = await generateSubcontractJobNumber();
    const [job] = await db
      .insert(subcontractJobsTable)
      .values({
        jobNumber,
        workOrderId: d.workOrderId ?? null,
        vendorName: d.vendorName,
        vendorContact: d.vendorContact ?? null,
        status: "sentOut",
        notes: d.notes ?? null,
        createdById: req.session.userId ?? null,
      })
      .returning();

    let totalVendorCost = 0;

    for (const it of d.items) {
      const sentUnitCost = await getMovingAvgCost(it.rawItemId);
      const lineVendorCost = it.sentQty * (it.vendorChargePerUnit ?? 0);
      totalVendorCost += lineVendorCost;

      await db.insert(subcontractJobItemsTable).values({
        subcontractJobId: job.id,
        rawItemId: it.rawItemId,
        sentQty: it.sentQty.toString(),
        sentUnitCost: sentUnitCost.toString(),
        finishedItemId: it.finishedItemId ?? null,
        vendorChargePerUnit: (it.vendorChargePerUnit ?? 0).toString(),
      });

      // Issue raw stock OUT
      const totalCost = it.sentQty * sentUnitCost;
      await db.insert(stockMovementsTable).values({
        itemId: it.rawItemId,
        movementType: "out",
        qty: it.sentQty.toString(),
        unitCost: sentUnitCost.toString(),
        totalCost: totalCost.toString(),
        sourceType: "subcontractIssue",
        sourceId: job.id,
        sourceNumber: jobNumber,
        workOrderId: d.workOrderId ?? null,
        notes: `Sent out to ${d.vendorName}`,
        createdById: req.session.userId ?? null,
      });
      try {
        await db.insert(stockTransactionsTable).values({
          itemId: it.rawItemId,
          type: "out",
          qty: it.sentQty.toString(),
          rate: sentUnitCost.toString(),
          referenceType: "manual",
          referenceNumber: jobNumber,
          notes: `Subcontract issue to ${d.vendorName}`,
          createdById: req.session.userId ?? null,
        });
      } catch (err) {
        logger.warn({ err }, "Failed to mirror subcontract OUT into stock_transactions");
      }
    }

    await db
      .update(subcontractJobsTable)
      .set({
        totalVendorCost: totalVendorCost.toString(),
        updatedAt: new Date(),
      })
      .where(eq(subcontractJobsTable.id, job.id));

    res.status(201).json({ id: job.id, jobNumber });

    return;
  },
);

// ─── GET /subcontract-jobs ───────────────────────────────────────────────────
subcontractJobsRouter.get(
  "/subcontract-jobs",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const { status, workOrderId } = req.query as {
      status?: string;
      workOrderId?: string;
    };
    const conds = [] as ReturnType<typeof eq>[];
    if (status)
      conds.push(eq(subcontractJobsTable.status, status as never));
    if (workOrderId)
      conds.push(
        eq(subcontractJobsTable.workOrderId, Number(workOrderId)),
      );

    const rows = await db
      .select({
        j: subcontractJobsTable,
        wo: workOrdersTable,
        createdBy: usersTable,
        itemCount: sql<number>`(
          SELECT COUNT(*)::int FROM ${subcontractJobItemsTable}
          WHERE ${subcontractJobItemsTable.subcontractJobId} = ${subcontractJobsTable.id}
        )`,
      })
      .from(subcontractJobsTable)
      .leftJoin(
        workOrdersTable,
        eq(workOrdersTable.id, subcontractJobsTable.workOrderId),
      )
      .leftJoin(
        usersTable,
        eq(usersTable.id, subcontractJobsTable.createdById),
      )
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(subcontractJobsTable.id));

    res.json(
      rows.map((r) =>
        serializeJob({
          ...r.j,
          workOrder: r.wo ? { woNumber: r.wo.woNumber } : null,
          createdBy: r.createdBy ? { name: r.createdBy.name } : null,
          itemCount: r.itemCount ?? 0,
        }),
      ),
    );
  },
);

// ─── GET /subcontract-jobs/:id ───────────────────────────────────────────────
subcontractJobsRouter.get(
  "/subcontract-jobs/:id",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({
        j: subcontractJobsTable,
        wo: workOrdersTable,
        createdBy: usersTable,
      })
      .from(subcontractJobsTable)
      .leftJoin(
        workOrdersTable,
        eq(workOrdersTable.id, subcontractJobsTable.workOrderId),
      )
      .leftJoin(
        usersTable,
        eq(usersTable.id, subcontractJobsTable.createdById),
      )
      .where(eq(subcontractJobsTable.id, id));
    if (!row) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const items = await db
      .select({
        i: subcontractJobItemsTable,
        raw: inventoryItemsTable,
      })
      .from(subcontractJobItemsTable)
      .leftJoin(
        inventoryItemsTable,
        eq(inventoryItemsTable.id, subcontractJobItemsTable.rawItemId),
      )
      .where(eq(subcontractJobItemsTable.subcontractJobId, id))
      .orderBy(subcontractJobItemsTable.id);

    const finishedById = new Map<number, typeof inventoryItemsTable.$inferSelect>();
    const finishedIds = items
      .map((r) => r.i.finishedItemId)
      .filter((x): x is number => x !== null);
    if (finishedIds.length > 0) {
      const finishedRows = await db
        .select()
        .from(inventoryItemsTable)
        .where(inArray(inventoryItemsTable.id, finishedIds));
      for (const f of finishedRows) finishedById.set(f.id, f);
    }

    const woSummary: { woNumber: string } | null = row.wo
      ? { woNumber: row.wo!.woNumber }
      : null;
    const creatorSummary: { name: string } | null = row.createdBy
      ? { name: row.createdBy!.name }
      : null;
    res.json({
      ...serializeJob({
        ...row.j,
        workOrder: woSummary,
        createdBy: creatorSummary,
        itemCount: items.length,
      }),
      items: items.map((r) => {
        const fid = r.i.finishedItemId;
        const f = fid !== null ? finishedById.get(fid) : undefined;
        return serializeJobItem({
          ...r.i,
          rawItem: r.raw
            ? { name: r.raw.name, itemCode: r.raw.itemCode, unit: r.raw.unit }
            : null,
          finishedItem: f
            ? { name: f.name, itemCode: f.itemCode, unit: f.unit }
            : null,
        });
      }),
    });
  },
);

// ─── POST /subcontract-jobs/:id/receive ──────────────────────────────────────
subcontractJobsRouter.post(
  "/subcontract-jobs/:id/receive",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = receiveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const data = parsed.data;

    const [job] = await db
      .select()
      .from(subcontractJobsTable)
      .where(eq(subcontractJobsTable.id, id));
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (job.status === "received") {
      res.status(400).json({ error: "Job already received" });
      return;
    }

    // Pre-validate: every passed-in item id MUST belong to this job.
    // Without this scoping check a caller could mark items on another
    // job as received and create stock movements under the wrong job.
    const itemIds = data.items.map((it) => it.id);
    const ownedItems = await db
      .select({ id: subcontractJobItemsTable.id })
      .from(subcontractJobItemsTable)
      .where(
        and(
          eq(subcontractJobItemsTable.subcontractJobId, id),
          inArray(subcontractJobItemsTable.id, itemIds),
        ),
      );
    if (ownedItems.length !== itemIds.length) {
      res
        .status(400)
        .json({ error: "One or more items do not belong to this job" });
      return;
    }

    for (const it of data.items) {
      const [existing] = await db
        .select()
        .from(subcontractJobItemsTable)
        .where(
          and(
            eq(subcontractJobItemsTable.id, it.id),
            eq(subcontractJobItemsTable.subcontractJobId, id),
          ),
        );
      if (!existing) continue;

      // Default to the raw item if neither create-time nor receive-time
      // payload provided a finished item ("same as raw" semantics).
      const finishedItemId =
        it.finishedItemId ?? existing.finishedItemId ?? existing.rawItemId;
      if (!finishedItemId) {
        res.status(400).json({
          error: `Line ${it.id}: cannot determine finishedItemId`,
        });
        return;
      }

      const vendorCharge =
        it.vendorChargePerUnit ?? parseFloat(existing.vendorChargePerUnit);

      // computed unit cost = (raw cost in + vendor charge per output unit)
      // Total raw cost for this line = sentQty * sentUnitCost
      const sentQty = parseFloat(existing.sentQty);
      const sentUnitCost = parseFloat(existing.sentUnitCost);
      const totalRawCost = sentQty * sentUnitCost;
      const recvQty = it.receivedQty;
      const computedUnitCost =
        recvQty > 0 ? totalRawCost / recvQty + vendorCharge : 0;

      await db
        .update(subcontractJobItemsTable)
        .set({
          receivedQty: recvQty.toString(),
          scrapQty: it.scrapQty.toString(),
          finishedItemId,
          vendorChargePerUnit: vendorCharge.toString(),
          computedUnitCost: computedUnitCost.toString(),
        })
        .where(eq(subcontractJobItemsTable.id, it.id));

      if (recvQty > 0) {
        const totalCost = recvQty * computedUnitCost;
        await db.insert(stockMovementsTable).values({
          itemId: finishedItemId,
          movementType: "in",
          qty: recvQty.toString(),
          unitCost: computedUnitCost.toString(),
          totalCost: totalCost.toString(),
          sourceType: "subcontractIn",
          sourceId: job.id,
          sourceNumber: job.jobNumber,
          workOrderId: job.workOrderId ?? null,
          notes: `Received from ${job.vendorName}`,
          createdById: req.session.userId ?? null,
        });
        try {
          await db.insert(stockTransactionsTable).values({
            itemId: finishedItemId,
            type: "in",
            qty: recvQty.toString(),
            rate: computedUnitCost.toString(),
            referenceType: "manual",
            referenceNumber: job.jobNumber,
            notes: `Subcontract receipt from ${job.vendorName}`,
            createdById: req.session.userId ?? null,
          });
        } catch (err) {
          logger.warn(
            { err },
            "Failed to mirror subcontract IN into stock_transactions",
          );
        }
      }
    }

    await db
      .update(subcontractJobsTable)
      .set({
        status: "received",
        receivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subcontractJobsTable.id, id));

    res.json({ ok: true });
  },
);

export default subcontractJobsRouter;
