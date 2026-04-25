import { Router } from "express";
import {
  db,
  inventoryItemsTable,
  stockTransactionsTable,
  bomTemplatesTable,
  bomLineItemsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const inventoryRouter = Router();

const VIEW_ROLES = ["stores", "manager", "director", "admin", "cfo", "purchase", "accounts", "production"] as const;
const WRITE_ROLES = ["stores", "manager", "director", "admin", "cfo"] as const;
const ITEM_MGMT_ROLES = ["manager", "director", "admin", "cfo"] as const;

const createItemSchema = z.object({
  itemCode: z.string().max(50).optional(),
  name: z.string().min(1).max(255),
  category: z.enum(["rawMaterial", "wip", "finishedGoods"]).default("rawMaterial"),
  unit: z.string().min(1).max(50).default("pcs"),
  hsnCode: z.string().max(20).optional(),
  gstRate: z.number().min(0).max(100).default(18),
  reorderLevel: z.number().min(0).default(0),
  description: z.string().optional(),
  lengthM: z.number().min(0).default(0),
  widthM: z.number().min(0).default(0),
  heightM: z.number().min(0).default(0),
  unitCbm: z.number().min(0).default(0),
  grossWeightKg: z.number().min(0).default(0),
  netWeightKg: z.number().min(0).default(0),
  dutyPercent: z.number().min(0).max(100).default(0),
});

const updateItemSchema = createItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const stockTransactionSchema = z.object({
  itemId: z.number().int().positive(),
  type: z.enum(["in", "out"]),
  qty: z.number().positive(),
  rate: z.number().min(0).default(0),
  referenceType: z.enum(["po", "workOrder", "manual"]).optional(),
  referenceId: z.number().int().positive().optional(),
  referenceNumber: z.string().max(100).optional(),
  poNumber: z.string().max(100).optional(),
  supplierBillNumber: z.string().max(100).optional(),
  dcNumber: z.string().max(100).optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === "in") {
    if (!data.poNumber) ctx.addIssue({ code: "custom", path: ["poNumber"], message: "PO number is required for Stock IN" });
    if (!data.supplierBillNumber) ctx.addIssue({ code: "custom", path: ["supplierBillNumber"], message: "Supplier bill number is required for Stock IN" });
  }
  if (data.type === "out" && !data.dcNumber) {
    ctx.addIssue({ code: "custom", path: ["dcNumber"], message: "DC number is required for Stock OUT" });
  }
});

const bulkTransactionSchema = z.object({
  type: z.enum(["in", "out"]),
  referenceType: z.enum(["po", "workOrder", "manual"]).optional(),
  referenceId: z.number().int().positive().optional(),
  referenceNumber: z.string().max(100).optional(),
  poNumber: z.string().max(100).optional(),
  supplierBillNumber: z.string().max(100).optional(),
  dcNumber: z.string().max(100).optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    itemId: z.number().int().positive(),
    qty: z.number().positive(),
    rate: z.number().min(0).default(0),
  })).min(1),
}).superRefine((data, ctx) => {
  if (data.type === "in") {
    if (!data.poNumber) ctx.addIssue({ code: "custom", path: ["poNumber"], message: "PO number is required for Stock IN" });
    if (!data.supplierBillNumber) ctx.addIssue({ code: "custom", path: ["supplierBillNumber"], message: "Supplier bill number is required for Stock IN" });
  }
  if (data.type === "out" && !data.dcNumber) {
    ctx.addIssue({ code: "custom", path: ["dcNumber"], message: "DC number is required for Stock OUT" });
  }
});

const createBomSchema = z.object({
  finishedItemId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  lineItems: z.array(z.object({
    rawMaterialItemId: z.number().int().positive(),
    qty: z.number().positive(),
    unit: z.string().max(50).optional(),
    notes: z.string().optional(),
  })).default([]),
});

const updateBomSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  lineItems: z.array(z.object({
    rawMaterialItemId: z.number().int().positive(),
    qty: z.number().positive(),
    unit: z.string().max(50).optional(),
    notes: z.string().optional(),
  })).optional(),
});

function serializeItem(item: typeof inventoryItemsTable.$inferSelect, stockBalance?: number) {
  return {
    id: item.id,
    itemCode: item.itemCode,
    name: item.name,
    category: item.category,
    unit: item.unit,
    hsnCode: item.hsnCode ?? null,
    gstRate: parseFloat(item.gstRate),
    reorderLevel: parseFloat(item.reorderLevel),
    description: item.description ?? null,
    lengthM: parseFloat(item.lengthM),
    widthM: parseFloat(item.widthM),
    heightM: parseFloat(item.heightM),
    unitCbm: parseFloat(item.unitCbm),
    grossWeightKg: parseFloat(item.grossWeightKg),
    netWeightKg: parseFloat(item.netWeightKg),
    dutyPercent: parseFloat(item.dutyPercent),
    isActive: item.isActive,
    stockBalance: stockBalance ?? 0,
    isLowStock: stockBalance !== undefined && parseFloat(item.reorderLevel) > 0
      ? stockBalance < parseFloat(item.reorderLevel)
      : false,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeTransaction(
  tx: typeof stockTransactionsTable.$inferSelect & { createdByName?: string | null },
) {
  return {
    id: tx.id,
    itemId: tx.itemId,
    type: tx.type,
    qty: parseFloat(tx.qty),
    rate: parseFloat(tx.rate),
    referenceType: tx.referenceType ?? null,
    referenceId: tx.referenceId ?? null,
    referenceNumber: tx.referenceNumber ?? null,
    poNumber: tx.poNumber ?? null,
    supplierBillNumber: tx.supplierBillNumber ?? null,
    dcNumber: tx.dcNumber ?? null,
    notes: tx.notes ?? null,
    createdByName: tx.createdByName ?? null,
    createdAt: tx.createdAt.toISOString(),
  };
}

async function getStockBalance(itemId: number): Promise<number> {
  const result = await db.execute<{ balance: string }>(
    sql`SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN qty ELSE -qty END), 0) AS balance
        FROM stock_transactions WHERE item_id = ${itemId}`,
  );
  return parseFloat((result.rows[0] as { balance: string }).balance ?? "0");
}

async function getAllStockBalances(): Promise<Map<number, number>> {
  const result = await db.execute<{ item_id: number; balance: string }>(
    sql`SELECT item_id, COALESCE(SUM(CASE WHEN type = 'in' THEN qty ELSE -qty END), 0) AS balance
        FROM stock_transactions GROUP BY item_id`,
  );
  const map = new Map<number, number>();
  for (const row of result.rows as { item_id: number; balance: string }[]) {
    map.set(row.item_id, parseFloat(row.balance));
  }
  return map;
}

inventoryRouter.get("/inventory/items", requireRole(...VIEW_ROLES), async (req, res) => {
  const { category, lowStock, search } = req.query as {
    category?: string;
    lowStock?: string;
    search?: string;
  };

  const conditions = [];
  if (category) conditions.push(eq(inventoryItemsTable.category, category));
  conditions.push(eq(inventoryItemsTable.isActive, true));

  let items = await db
    .select()
    .from(inventoryItemsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(inventoryItemsTable.name);

  if (search) {
    const s = search.toLowerCase();
    items = items.filter(
      (i) => i.name.toLowerCase().includes(s) || (i.itemCode ?? "").toLowerCase().includes(s),
    );
  }

  const balances = await getAllStockBalances();

  let result = items.map((item) => serializeItem(item, balances.get(item.id) ?? 0));

  if (lowStock === "true") {
    result = result.filter((i) => i.isLowStock);
  }

  res.json(result);
});

inventoryRouter.post("/inventory/items", requireRole(...ITEM_MGMT_ROLES), async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  if (parsed.data.itemCode) {
    const existing = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.itemCode, parsed.data.itemCode));
    if (existing.length > 0) {
      res.status(409).json({ error: "Item code already exists" });
      return;
    }
  }

  const [item] = await db
    .insert(inventoryItemsTable)
    .values({
      ...parsed.data,
      gstRate: parsed.data.gstRate.toString(),
      reorderLevel: parsed.data.reorderLevel.toString(),
      lengthM: parsed.data.lengthM.toString(),
      widthM: parsed.data.widthM.toString(),
      heightM: parsed.data.heightM.toString(),
      unitCbm: parsed.data.unitCbm.toString(),
      grossWeightKg: parsed.data.grossWeightKg.toString(),
      netWeightKg: parsed.data.netWeightKg.toString(),
      dutyPercent: parsed.data.dutyPercent.toString(),
    })
    .returning();

  res.status(201).json(serializeItem(item, 0));
});

inventoryRouter.get("/inventory/items/:id", requireRole(...VIEW_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const balance = await getStockBalance(id);
  res.json(serializeItem(item, balance));
});

inventoryRouter.patch("/inventory/items/:id", requireRole(...ITEM_MGMT_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.itemCode !== undefined) updateData.itemCode = d.itemCode;
  if (d.name !== undefined) updateData.name = d.name;
  if (d.category !== undefined) updateData.category = d.category;
  if (d.unit !== undefined) updateData.unit = d.unit;
  if (d.hsnCode !== undefined) updateData.hsnCode = d.hsnCode;
  if (d.gstRate !== undefined) updateData.gstRate = d.gstRate.toString();
  if (d.reorderLevel !== undefined) updateData.reorderLevel = d.reorderLevel.toString();
  if (d.description !== undefined) updateData.description = d.description;
  if (d.lengthM !== undefined) updateData.lengthM = d.lengthM.toString();
  if (d.widthM !== undefined) updateData.widthM = d.widthM.toString();
  if (d.heightM !== undefined) updateData.heightM = d.heightM.toString();
  if (d.unitCbm !== undefined) updateData.unitCbm = d.unitCbm.toString();
  if (d.grossWeightKg !== undefined) updateData.grossWeightKg = d.grossWeightKg.toString();
  if (d.netWeightKg !== undefined) updateData.netWeightKg = d.netWeightKg.toString();
  if (d.dutyPercent !== undefined) updateData.dutyPercent = d.dutyPercent.toString();
  if (d.isActive !== undefined) updateData.isActive = d.isActive;

  const [updated] = await db
    .update(inventoryItemsTable)
    .set(updateData)
    .where(eq(inventoryItemsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Item not found" }); return; }
  const balance = await getStockBalance(id);
  res.json(serializeItem(updated, balance));
});

inventoryRouter.post("/inventory/transactions", requireRole(...WRITE_ROLES), async (req, res) => {
  const parsed = stockTransactionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, parsed.data.itemId));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  if (parsed.data.type === "out") {
    const balance = await getStockBalance(parsed.data.itemId);
    if (balance < parsed.data.qty) {
      res.status(400).json({ error: `Insufficient stock. Available: ${balance}` });
      return;
    }
  }

  const [tx] = await db
    .insert(stockTransactionsTable)
    .values({
      itemId: parsed.data.itemId,
      type: parsed.data.type,
      qty: parsed.data.qty.toString(),
      rate: parsed.data.rate.toString(),
      referenceType: parsed.data.referenceType,
      referenceId: parsed.data.referenceId,
      referenceNumber: parsed.data.referenceNumber,
      poNumber: parsed.data.poNumber,
      supplierBillNumber: parsed.data.supplierBillNumber,
      dcNumber: parsed.data.dcNumber,
      notes: parsed.data.notes,
      createdById: req.session.userId,
    })
    .returning();

  logger.info({ txId: tx.id, type: tx.type, qty: tx.qty, itemId: tx.itemId }, "Stock transaction recorded");
  res.status(201).json(serializeTransaction(tx));
});

inventoryRouter.post("/inventory/transactions/bulk", requireRole(...WRITE_ROLES), async (req, res) => {
  const parsed = bulkTransactionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { items: txItems, ...rest } = parsed.data;

  if (rest.type === "out") {
    const totalsByItemId = new Map<number, number>();
    for (const txItem of txItems) {
      totalsByItemId.set(txItem.itemId, (totalsByItemId.get(txItem.itemId) ?? 0) + txItem.qty);
    }

    for (const [itemId, totalQty] of totalsByItemId.entries()) {
      const balance = await getStockBalance(itemId);
      if (balance < totalQty) {
        const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, itemId));
        res.status(400).json({
          error: `Insufficient stock for item ${item?.name ?? itemId}. Requested: ${totalQty}, Available: ${balance}`,
        });
        return;
      }
    }
  }

  const inserted = await db.transaction(async (tx) => {
    return tx
      .insert(stockTransactionsTable)
      .values(
        txItems.map((txItem) => ({
          itemId: txItem.itemId,
          type: rest.type,
          qty: txItem.qty.toString(),
          rate: txItem.rate.toString(),
          referenceType: rest.referenceType,
          referenceId: rest.referenceId,
          referenceNumber: rest.referenceNumber,
          poNumber: rest.poNumber,
          supplierBillNumber: rest.supplierBillNumber,
          dcNumber: rest.dcNumber,
          notes: rest.notes,
          createdById: req.session.userId,
        })),
      )
      .returning();
  });

  res.status(201).json(inserted.map((tx) => serializeTransaction(tx)));
});

inventoryRouter.get("/inventory/items/:id/ledger", requireRole(...VIEW_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [item] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const transactions = await db
    .select({
      tx: stockTransactionsTable,
      createdByName: usersTable.name,
    })
    .from(stockTransactionsTable)
    .leftJoin(usersTable, eq(stockTransactionsTable.createdById, usersTable.id))
    .where(eq(stockTransactionsTable.itemId, id))
    .orderBy(stockTransactionsTable.createdAt);

  let runningBalance = 0;
  const ledger = transactions.map(({ tx, createdByName }) => {
    const qty = parseFloat(tx.qty);
    runningBalance += tx.type === "in" ? qty : -qty;
    return {
      ...serializeTransaction({ ...tx, createdByName }),
      runningBalance,
    };
  });

  const currentBalance = await getStockBalance(id);
  res.json({ item: serializeItem(item, currentBalance), ledger });
});

inventoryRouter.get("/inventory/low-stock", requireRole(...VIEW_ROLES), async (req, res) => {
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.isActive, true));

  const balances = await getAllStockBalances();
  const lowStock = items
    .map((item) => serializeItem(item, balances.get(item.id) ?? 0))
    .filter((i) => i.isLowStock);

  res.json(lowStock);
});

inventoryRouter.get("/inventory/dashboard", requireRole(...VIEW_ROLES), async (req, res) => {
  const allItems = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.isActive, true));

  const balances = await getAllStockBalances();
  const withBalances = allItems.map((item) => serializeItem(item, balances.get(item.id) ?? 0));
  const lowStockCount = withBalances.filter((i) => i.isLowStock).length;

  const recentTxs = await db
    .select({
      tx: stockTransactionsTable,
      itemName: inventoryItemsTable.name,
      createdByName: usersTable.name,
    })
    .from(stockTransactionsTable)
    .leftJoin(inventoryItemsTable, eq(stockTransactionsTable.itemId, inventoryItemsTable.id))
    .leftJoin(usersTable, eq(stockTransactionsTable.createdById, usersTable.id))
    .orderBy(desc(stockTransactionsTable.createdAt))
    .limit(10);

  res.json({
    totalSkus: allItems.length,
    lowStockCount,
    recentTransactions: recentTxs.map(({ tx, itemName, createdByName }) => ({
      ...serializeTransaction({ ...tx, createdByName }),
      itemName,
    })),
  });
});

inventoryRouter.get("/bom", requireRole(...VIEW_ROLES), async (req, res) => {
  const boms = await db
    .select({
      bom: bomTemplatesTable,
      finishedItemName: inventoryItemsTable.name,
    })
    .from(bomTemplatesTable)
    .leftJoin(inventoryItemsTable, eq(bomTemplatesTable.finishedItemId, inventoryItemsTable.id))
    .orderBy(bomTemplatesTable.name);

  const bomIds = boms.map((b) => b.bom.id);
  const allLineItems = bomIds.length > 0
    ? await db
        .select({
          li: bomLineItemsTable,
          rawMaterialName: inventoryItemsTable.name,
          rawMaterialCode: inventoryItemsTable.itemCode,
        })
        .from(bomLineItemsTable)
        .leftJoin(inventoryItemsTable, eq(bomLineItemsTable.rawMaterialItemId, inventoryItemsTable.id))
        .where(inArray(bomLineItemsTable.bomId, bomIds))
    : [];

  const liByBom = new Map<number, typeof allLineItems>();
  for (const li of allLineItems) {
    const arr = liByBom.get(li.li.bomId) ?? [];
    arr.push(li);
    liByBom.set(li.li.bomId, arr);
  }

  res.json(boms.map(({ bom, finishedItemName }) => ({
    id: bom.id,
    finishedItemId: bom.finishedItemId,
    finishedItemName,
    name: bom.name,
    description: bom.description ?? null,
    isActive: bom.isActive,
    createdAt: bom.createdAt.toISOString(),
    updatedAt: bom.updatedAt.toISOString(),
    lineItems: (liByBom.get(bom.id) ?? []).map(({ li, rawMaterialName, rawMaterialCode }) => ({
      id: li.id,
      bomId: li.bomId,
      rawMaterialItemId: li.rawMaterialItemId,
      rawMaterialName,
      rawMaterialCode,
      qty: parseFloat(li.qty),
      unit: li.unit ?? null,
      notes: li.notes ?? null,
    })),
  })));
});

inventoryRouter.post("/bom", requireRole(...WRITE_ROLES), async (req, res) => {
  const parsed = createBomSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [finishedItem] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, parsed.data.finishedItemId));
  if (!finishedItem) { res.status(404).json({ error: "Finished item not found" }); return; }

  const [bom] = await db
    .insert(bomTemplatesTable)
    .values({
      finishedItemId: parsed.data.finishedItemId,
      name: parsed.data.name,
      description: parsed.data.description,
    })
    .returning();

  if (parsed.data.lineItems.length > 0) {
    await db.insert(bomLineItemsTable).values(
      parsed.data.lineItems.map((li) => ({
        bomId: bom.id,
        rawMaterialItemId: li.rawMaterialItemId,
        qty: li.qty.toString(),
        unit: li.unit,
        notes: li.notes,
      })),
    );
  }

  const [fullBom] = await db
    .select({ bom: bomTemplatesTable, finishedItemName: inventoryItemsTable.name })
    .from(bomTemplatesTable)
    .leftJoin(inventoryItemsTable, eq(bomTemplatesTable.finishedItemId, inventoryItemsTable.id))
    .where(eq(bomTemplatesTable.id, bom.id));

  const lineItems = await db
    .select({
      li: bomLineItemsTable,
      rawMaterialName: inventoryItemsTable.name,
      rawMaterialCode: inventoryItemsTable.itemCode,
    })
    .from(bomLineItemsTable)
    .leftJoin(inventoryItemsTable, eq(bomLineItemsTable.rawMaterialItemId, inventoryItemsTable.id))
    .where(eq(bomLineItemsTable.bomId, bom.id));

  res.status(201).json({
    id: bom.id,
    finishedItemId: bom.finishedItemId,
    finishedItemName: fullBom?.finishedItemName ?? null,
    name: bom.name,
    description: bom.description ?? null,
    isActive: bom.isActive,
    createdAt: bom.createdAt.toISOString(),
    updatedAt: bom.updatedAt.toISOString(),
    lineItems: lineItems.map(({ li, rawMaterialName, rawMaterialCode }) => ({
      id: li.id,
      bomId: li.bomId,
      rawMaterialItemId: li.rawMaterialItemId,
      rawMaterialName,
      rawMaterialCode,
      qty: parseFloat(li.qty),
      unit: li.unit ?? null,
      notes: li.notes ?? null,
    })),
  });
});

inventoryRouter.get("/bom/:id", requireRole(...VIEW_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ bom: bomTemplatesTable, finishedItemName: inventoryItemsTable.name })
    .from(bomTemplatesTable)
    .leftJoin(inventoryItemsTable, eq(bomTemplatesTable.finishedItemId, inventoryItemsTable.id))
    .where(eq(bomTemplatesTable.id, id));

  if (!row) { res.status(404).json({ error: "BOM not found" }); return; }

  const lineItems = await db
    .select({
      li: bomLineItemsTable,
      rawMaterialName: inventoryItemsTable.name,
      rawMaterialCode: inventoryItemsTable.itemCode,
    })
    .from(bomLineItemsTable)
    .leftJoin(inventoryItemsTable, eq(bomLineItemsTable.rawMaterialItemId, inventoryItemsTable.id))
    .where(eq(bomLineItemsTable.bomId, id));

  res.json({
    id: row.bom.id,
    finishedItemId: row.bom.finishedItemId,
    finishedItemName: row.finishedItemName ?? null,
    name: row.bom.name,
    description: row.bom.description ?? null,
    isActive: row.bom.isActive,
    createdAt: row.bom.createdAt.toISOString(),
    updatedAt: row.bom.updatedAt.toISOString(),
    lineItems: lineItems.map(({ li, rawMaterialName, rawMaterialCode }) => ({
      id: li.id,
      bomId: li.bomId,
      rawMaterialItemId: li.rawMaterialItemId,
      rawMaterialName,
      rawMaterialCode,
      qty: parseFloat(li.qty),
      unit: li.unit ?? null,
      notes: li.notes ?? null,
    })),
  });
});

inventoryRouter.patch("/bom/:id", requireRole(...WRITE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = updateBomSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [existing] = await db.select().from(bomTemplatesTable).where(eq(bomTemplatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "BOM not found" }); return; }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

  await db.update(bomTemplatesTable).set(updateData).where(eq(bomTemplatesTable.id, id));

  if (parsed.data.lineItems !== undefined) {
    await db.delete(bomLineItemsTable).where(eq(bomLineItemsTable.bomId, id));
    if (parsed.data.lineItems.length > 0) {
      await db.insert(bomLineItemsTable).values(
        parsed.data.lineItems.map((li) => ({
          bomId: id,
          rawMaterialItemId: li.rawMaterialItemId,
          qty: li.qty.toString(),
          unit: li.unit,
          notes: li.notes,
        })),
      );
    }
  }

  const [updated] = await db
    .select({ bom: bomTemplatesTable, finishedItemName: inventoryItemsTable.name })
    .from(bomTemplatesTable)
    .leftJoin(inventoryItemsTable, eq(bomTemplatesTable.finishedItemId, inventoryItemsTable.id))
    .where(eq(bomTemplatesTable.id, id));

  const lineItems = await db
    .select({
      li: bomLineItemsTable,
      rawMaterialName: inventoryItemsTable.name,
      rawMaterialCode: inventoryItemsTable.itemCode,
    })
    .from(bomLineItemsTable)
    .leftJoin(inventoryItemsTable, eq(bomLineItemsTable.rawMaterialItemId, inventoryItemsTable.id))
    .where(eq(bomLineItemsTable.bomId, id));

  res.json({
    id: updated!.bom.id,
    finishedItemId: updated!.bom.finishedItemId,
    finishedItemName: updated!.finishedItemName ?? null,
    name: updated!.bom.name,
    description: updated!.bom.description ?? null,
    isActive: updated!.bom.isActive,
    createdAt: updated!.bom.createdAt.toISOString(),
    updatedAt: updated!.bom.updatedAt.toISOString(),
    lineItems: lineItems.map(({ li, rawMaterialName, rawMaterialCode }) => ({
      id: li.id,
      bomId: li.bomId,
      rawMaterialItemId: li.rawMaterialItemId,
      rawMaterialName,
      rawMaterialCode,
      qty: parseFloat(li.qty),
      unit: li.unit ?? null,
      notes: li.notes ?? null,
    })),
  });
});

inventoryRouter.delete("/bom/:id", requireRole(...ITEM_MGMT_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(bomLineItemsTable).where(eq(bomLineItemsTable.bomId, id));
  const [deleted] = await db.delete(bomTemplatesTable).where(eq(bomTemplatesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "BOM not found" }); return; }

  res.json({ success: true });
});

export default inventoryRouter;
