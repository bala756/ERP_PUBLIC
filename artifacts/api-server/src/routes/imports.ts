import { Router } from "express";
import {
  db,
  importJobsTable,
  importJobItemsTable,
  importExpensesTable,
  importCostAllocationsTable,
  inventoryItemsTable,
  purchaseOrdersTable,
  poLineItemsTable,
  purchaseRequestsTable,
  purchaseRequestItemsTable,
  usersTable,
  stockMovementsTable,
  stockTransactionsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { logger } from "../lib/logger";

const importsRouter = Router();

const VIEW_ROLES = [
  "purchase",
  "manager",
  "director",
  "admin",
  "cfo",
  "accounts",
  "stores",
] as const;
const WRITE_ROLES = [
  "purchase",
  "manager",
  "director",
  "admin",
  "cfo",
] as const;

const ALLOC_METHODS = [
  "cbm",
  "value",
  "quantity",
  "weight",
  "equal",
  "manual",
] as const;

const EXPENSE_TYPES = [
  "oceanFreight",
  "airFreight",
  "customsDuty",
  "swsCess",
  "igst",
  "chaCharges",
  "insurance",
  "localTransport",
  "portCharges",
  "documentation",
  "exWorks",
  "handling",
  "other",
] as const;

const STATUSES = [
  "draft",
  "inTransit",
  "arrived",
  "cleared",
  "received",
  "closed",
  "cancelled",
] as const;

// ---------- Validation Schemas ----------

const createJobSchema = z.object({
  title: z.string().min(1).max(255),
  vendorName: z.string().min(1).max(255),
  vendorCountry: z.string().max(100).optional(),
  currency: z.string().min(1).max(10).default("USD"),
  exchangeRate: z.number().positive().default(83),
  purchaseRequestId: z.number().int().positive().optional().nullable(),
  purchaseOrderId: z.number().int().positive().optional().nullable(),
  supplierInvoiceNumber: z.string().max(100).optional().nullable(),
  supplierInvoiceDate: z.string().max(20).optional().nullable(),
  supplierInvoiceAmount: z.number().min(0).default(0),
  containerCbm: z.number().min(0).default(0),
  containerNumber: z.string().max(50).optional().nullable(),
  blNumber: z.string().max(100).optional().nullable(),
  vesselName: z.string().max(100).optional().nullable(),
  etd: z.string().max(20).optional().nullable(),
  eta: z.string().max(20).optional().nullable(),
  arrivalDate: z.string().max(20).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateJobSchema = createJobSchema.partial().extend({
  status: z.enum(STATUSES).optional(),
});

const itemSchema = z.object({
  inventoryItemId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1).max(500),
  hsnCode: z.string().max(20).optional().nullable(),
  qty: z.number().min(0),
  unit: z.string().max(50).default("pcs"),
  unitPriceForeign: z.number().min(0),
  exchangeRate: z.number().positive().default(83),
  unitCbm: z.number().min(0).default(0),
  unitGrossWeight: z.number().min(0).default(0),
  dutyPercent: z.number().min(0).max(100).default(20),
  swsPercent: z.number().min(0).max(100).default(10),
  igstPercent: z.number().min(0).max(100).default(18),
});

const expenseSchema = z.object({
  expenseType: z.enum(EXPENSE_TYPES),
  vendorName: z.string().min(1).max(255),
  billNumber: z.string().max(100).optional().nullable(),
  billDate: z.string().max(20).optional().nullable(),
  currency: z.string().min(1).max(10).default("INR"),
  amountForeign: z.number().min(0),
  exchangeRate: z.number().positive().default(1),
  gstAmount: z.number().min(0).default(0),
  allocationMethod: z.enum(ALLOC_METHODS).default("cbm"),
  isAllocatable: z.boolean().default(true),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
  notes: z.string().optional().nullable(),
});

// ---------- Helpers ----------

async function generateJobNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.execute<{ nextval: number }>(
    sql`SELECT nextval('import_job_seq') AS nextval`,
  );
  const seq = (result.rows[0] as { nextval: number }).nextval;
  return `IMP-${year}-${String(seq).padStart(4, "0")}`;
}

async function generatePoNumber(): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('po_seq')`,
  );
  const seq = String(result.rows[0].nextval).padStart(4, "0");
  const year = new Date().getFullYear().toString().slice(-2);
  return `PO-${year}-${seq}`;
}

async function syncImportPurchaseOrder(jobId: number): Promise<void> {
  const [job] = await db
    .select()
    .from(importJobsTable)
    .where(eq(importJobsTable.id, jobId));
  if (!job?.purchaseRequestId) return;

  const [pr] = await db
    .select()
    .from(purchaseRequestsTable)
    .where(eq(purchaseRequestsTable.id, job.purchaseRequestId));
  if (!pr) return;

  const items = await db
    .select()
    .from(importJobItemsTable)
    .where(eq(importJobItemsTable.importJobId, jobId));
  if (items.length === 0) return;

  const total = items.reduce((sum, item) => sum + num(item.landedCostInr), 0);
  let purchaseOrderId = job.purchaseOrderId;

  if (!purchaseOrderId) {
    const poNumber = await generatePoNumber();
    const [po] = await db
      .insert(purchaseOrdersTable)
      .values({
        poNumber,
        workOrderId: pr.workOrderId,
        supplierName: job.vendorName,
        type: "imported",
        quotedAmount: total.toFixed(2),
        poAmount: total.toFixed(2),
        status: "draft",
        createdById: job.createdById ?? null,
        notes: `Auto-created from import job ${job.jobNumber}`,
      })
      .returning();
    purchaseOrderId = po.id;
    await db
      .update(importJobsTable)
      .set({ purchaseOrderId, updatedAt: new Date() })
      .where(eq(importJobsTable.id, jobId));
  } else {
    await db
      .update(purchaseOrdersTable)
      .set({
        supplierName: job.vendorName,
        quotedAmount: total.toFixed(2),
        poAmount: total.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrdersTable.id, purchaseOrderId));
    await db
      .delete(poLineItemsTable)
      .where(eq(poLineItemsTable.purchaseOrderId, purchaseOrderId));
  }

  await db.insert(poLineItemsTable).values(
    items.map((item) => ({
      purchaseOrderId: purchaseOrderId!,
      productId: item.inventoryItemId ?? null,
      description: item.description,
      hsnCode: item.hsnCode ?? null,
      unit: item.unit,
      qty: item.qty,
      unitPrice: item.perUnitLandedCostInr,
      gstRate: "0",
    })),
  );

  await db
    .update(purchaseRequestItemsTable)
    .set({ status: "convertedToImport", importJobId: jobId })
    .where(eq(purchaseRequestItemsTable.purchaseRequestId, pr.id));
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * The allocation + landed-cost engine.
 *
 * For each item:
 *   exwCostInr      = qty * unitPriceForeign * exchangeRate
 *   freightShare    = sum of allocations from oceanFreight / airFreight expenses
 *   insuranceShare  = sum of allocations from insurance expenses
 *   localCharges    = sum of allocations from cha / port / localTransport / handling / documentation
 *   otherCharges    = sum of allocations from "other" or expenses that didn't match above
 *   assessableValue = exwCostInr + freightShare + insuranceShare
 *   customsDuty     = assessableValue * dutyPercent/100  (or read from customsDuty expense allocation)
 *   sws             = customsDuty * swsPercent/100         (or read from swsCess expense allocation)
 *   landedCost      = exwCostInr + freightShare + insuranceShare + customsDuty + sws + localCharges + otherCharges
 *   perUnit         = landedCost / qty
 */
async function recalculateLandedCost(jobId: number): Promise<void> {
  const items = await db
    .select()
    .from(importJobItemsTable)
    .where(eq(importJobItemsTable.importJobId, jobId));

  const expenses = await db
    .select()
    .from(importExpensesTable)
    .where(eq(importExpensesTable.importJobId, jobId));

  // Compute totals per basis using actual item values
  const totalCbm = items.reduce((s, it) => s + num(it.unitCbm), 0);
  const totalQty = items.reduce((s, it) => s + num(it.qty), 0);
  const totalWeight = items.reduce(
    (s, it) => s + num(it.qty) * num(it.unitGrossWeight),
    0,
  );

  // exwCostInr per item (used as basis for "value" allocation method)
  const itemExwInr = new Map<number, number>();
  for (const it of items) {
    const exw = num(it.qty) * num(it.unitPriceForeign);
    itemExwInr.set(it.id, exw);
  }
  const totalValue = Array.from(itemExwInr.values()).reduce((a, b) => a + b, 0);

  // Wipe existing allocations for this job and recompute
  await db
    .delete(importCostAllocationsTable)
    .where(eq(importCostAllocationsTable.importJobId, jobId));

  // For each expense, compute amountInr and allocate
  const itemAlloc: Record<
    number,
    {
      freight: number;
      insurance: number;
      customsDuty: number;
      sws: number;
      localCharges: number;
      otherCharges: number;
    }
  > = {};
  for (const it of items) {
    itemAlloc[it.id] = {
      freight: 0,
      insurance: 0,
      customsDuty: 0,
      sws: 0,
      localCharges: 0,
      otherCharges: 0,
    };
  }

  const allocationRows: Array<{
    importJobId: number;
    importExpenseId: number;
    importJobItemId: number;
    allocatedAmountInr: string;
    basis: string;
    basisValue: string;
  }> = [];

  for (const exp of expenses) {
    const amountInr = round2(num(exp.amountForeign) * num(exp.exchangeRate));
    // persist the computed amountInr back on the expense row
    await db
      .update(importExpensesTable)
      .set({ amountInr: amountInr.toString() })
      .where(eq(importExpensesTable.id, exp.id));

    if (!exp.isAllocatable || amountInr === 0 || items.length === 0) continue;

    const method = exp.allocationMethod;
    let totalBasis = 0;
    const itemBasis = new Map<number, number>();

    if (method === "cbm") {
      totalBasis = totalCbm;
      for (const it of items) {
        itemBasis.set(it.id, num(it.unitCbm));
      }
    } else if (method === "value") {
      totalBasis = totalValue;
      for (const it of items) {
        itemBasis.set(it.id, itemExwInr.get(it.id) ?? 0);
      }
    } else if (method === "quantity") {
      totalBasis = totalQty;
      for (const it of items) {
        itemBasis.set(it.id, num(it.qty));
      }
    } else if (method === "weight") {
      totalBasis = totalWeight;
      for (const it of items) {
        itemBasis.set(it.id, num(it.qty) * num(it.unitGrossWeight));
      }
    } else if (method === "equal") {
      totalBasis = items.length;
      for (const it of items) {
        itemBasis.set(it.id, 1);
      }
    } else {
      // manual: skip auto-alloc; user must input directly (Phase 2)
      continue;
    }

    if (totalBasis <= 0) {
      // fallback to equal split when chosen basis is zero
      totalBasis = items.length;
      for (const it of items) itemBasis.set(it.id, 1);
    }

    // Allocate proportionally with rounding-residue correction on last item
    let allocatedSoFar = 0;
    items.forEach((it, idx) => {
      const basisVal = itemBasis.get(it.id) ?? 0;
      let share =
        idx === items.length - 1
          ? round2(amountInr - allocatedSoFar)
          : round2((amountInr * basisVal) / totalBasis);
      allocatedSoFar += share;

      allocationRows.push({
        importJobId: jobId,
        importExpenseId: exp.id,
        importJobItemId: it.id,
        allocatedAmountInr: share.toString(),
        basis: method,
        basisValue: round4(basisVal).toString(),
      });

      const bucket = itemAlloc[it.id];
      switch (exp.expenseType) {
        case "oceanFreight":
        case "airFreight":
          bucket.freight += share;
          break;
        case "insurance":
          bucket.insurance += share;
          break;
        case "customsDuty":
          bucket.customsDuty += share;
          break;
        case "swsCess":
          bucket.sws += share;
          break;
        case "chaCharges":
        case "localTransport":
        case "portCharges":
        case "handling":
        case "documentation":
          bucket.localCharges += share;
          break;
        case "exWorks":
          // EXW is part of base cost — bundle into ex-works share via "other" bucket?
          // Treat as additional vendor charge that adds to cost basis:
          bucket.otherCharges += share;
          break;
        case "igst":
          // IGST on imports is creditable, don't add to landed cost
          break;
        case "other":
        default:
          bucket.otherCharges += share;
          break;
      }
    });
  }

  if (allocationRows.length > 0) {
    await db.insert(importCostAllocationsTable).values(allocationRows);
  }

  // Now compute landed cost per item
  for (const it of items) {
    const qty = num(it.qty);
    const exwInr = round2(
      qty * num(it.unitPriceForeign) * num(it.exchangeRate),
    );

    const bucket = itemAlloc[it.id];
    let freight = round2(bucket.freight);
    let insurance = round2(bucket.insurance);
    let localCharges = round2(bucket.localCharges);
    let otherCharges = round2(bucket.otherCharges);

    const assessable = round2(exwInr + freight + insurance);

    // If a customsDuty expense was provided, use its allocation; otherwise compute
    // from dutyPercent on the assessable value.
    let customsDuty =
      bucket.customsDuty > 0
        ? round2(bucket.customsDuty)
        : round2((assessable * num(it.dutyPercent)) / 100);

    let sws =
      bucket.sws > 0
        ? round2(bucket.sws)
        : round2((customsDuty * num(it.swsPercent)) / 100);

    const landed =
      exwInr +
      freight +
      insurance +
      customsDuty +
      sws +
      localCharges +
      otherCharges;
    const landedRounded = round2(landed);
    const perUnit = qty > 0 ? round4(landedRounded / qty) : 0;

    await db
      .update(importJobItemsTable)
      .set({
        exwCostInr: exwInr.toString(),
        freightShareInr: freight.toString(),
        insuranceShareInr: insurance.toString(),
        assessableValueInr: assessable.toString(),
        customsDutyInr: customsDuty.toString(),
        swsAmountInr: sws.toString(),
        localChargesShareInr: localCharges.toString(),
        otherChargesShareInr: otherCharges.toString(),
        landedCostInr: landedRounded.toString(),
        perUnitLandedCostInr: perUnit.toString(),
      })
      .where(eq(importJobItemsTable.id, it.id));
  }

  await syncImportPurchaseOrder(jobId);
}

// ---------- Routes ----------

importsRouter.use("/import-jobs", requireAuth);

// LIST
importsRouter.get(
  "/import-jobs",
  requireRole(...VIEW_ROLES),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: importJobsTable.id,
          jobNumber: importJobsTable.jobNumber,
          title: importJobsTable.title,
          vendorName: importJobsTable.vendorName,
          vendorCountry: importJobsTable.vendorCountry,
          currency: importJobsTable.currency,
          exchangeRate: importJobsTable.exchangeRate,
          purchaseRequestId: importJobsTable.purchaseRequestId,
          status: importJobsTable.status,
          eta: importJobsTable.eta,
          etd: importJobsTable.etd,
          arrivalDate: importJobsTable.arrivalDate,
          containerNumber: importJobsTable.containerNumber,
          containerCbm: importJobsTable.containerCbm,
          supplierInvoiceAmount: importJobsTable.supplierInvoiceAmount,
          createdAt: importJobsTable.createdAt,
          updatedAt: importJobsTable.updatedAt,
        })
        .from(importJobsTable)
        .orderBy(desc(importJobsTable.createdAt));

      // Compute summary totals per job
      const ids = rows.map((r) => r.id);
      const summaries: Record<
        number,
        { itemCount: number; totalLandedCostInr: number; totalExpensesInr: number }
      > = {};
      for (const id of ids) {
        summaries[id] = {
          itemCount: 0,
          totalLandedCostInr: 0,
          totalExpensesInr: 0,
        };
      }
      if (ids.length > 0) {
        const itemAgg = await db
          .select({
            jobId: importJobItemsTable.importJobId,
            count: sql<number>`COUNT(*)::int`,
            landed: sql<string>`COALESCE(SUM(${importJobItemsTable.landedCostInr}), 0)`,
          })
          .from(importJobItemsTable)
          .groupBy(importJobItemsTable.importJobId);
        for (const r of itemAgg) {
          if (summaries[r.jobId]) {
            summaries[r.jobId].itemCount = Number(r.count);
            summaries[r.jobId].totalLandedCostInr = num(r.landed);
          }
        }
        const expAgg = await db
          .select({
            jobId: importExpensesTable.importJobId,
            total: sql<string>`COALESCE(SUM(${importExpensesTable.amountInr}), 0)`,
          })
          .from(importExpensesTable)
          .groupBy(importExpensesTable.importJobId);
        for (const r of expAgg) {
          if (summaries[r.jobId])
            summaries[r.jobId].totalExpensesInr = num(r.total);
        }
      }

      res.json(rows.map((r) => ({ ...r, ...summaries[r.id] })));
    } catch (err) {
      logger.error({ err }, "Failed to list import jobs");
      res.status(500).json({ message: "Failed to list import jobs" });
    }
  },
);

// CREATE
importsRouter.post(
  "/import-jobs",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      const jobNumber = await generateJobNumber();
      const data = parsed.data;
      const userId = (req as { user?: { id: number } }).user?.id;
      const [created] = await db
        .insert(importJobsTable)
        .values({
          jobNumber,
          title: data.title,
          vendorName: data.vendorName,
          vendorCountry: data.vendorCountry ?? "China",
          currency: data.currency,
          exchangeRate: data.exchangeRate.toString(),
          purchaseRequestId: data.purchaseRequestId ?? null,
          purchaseOrderId: data.purchaseOrderId ?? null,
          supplierInvoiceNumber: data.supplierInvoiceNumber ?? null,
          supplierInvoiceDate: data.supplierInvoiceDate ?? null,
          supplierInvoiceAmount: data.supplierInvoiceAmount.toString(),
          containerCbm: data.containerCbm.toString(),
          containerNumber: data.containerNumber ?? null,
          blNumber: data.blNumber ?? null,
          vesselName: data.vesselName ?? null,
          etd: data.etd ?? null,
          eta: data.eta ?? null,
          arrivalDate: data.arrivalDate ?? null,
          notes: data.notes ?? null,
          createdById: userId ?? null,
        })
        .returning();
      return res.status(201).json(created);
    } catch (err) {
      logger.error({ err }, "Failed to create import job");
      return res
        .status(500)
        .json({ message: "Failed to create import job" });
    }
  },
);

// DETAIL
importsRouter.get(
  "/import-jobs/:id",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res.status(400).json({ message: "Invalid id" });

      const [job] = await db
        .select()
        .from(importJobsTable)
        .leftJoin(usersTable, eq(importJobsTable.createdById, usersTable.id))
        .where(eq(importJobsTable.id, id));

      if (!job) return res.status(404).json({ message: "Not found" });

      const items = await db
        .select({
          id: importJobItemsTable.id,
          importJobId: importJobItemsTable.importJobId,
          inventoryItemId: importJobItemsTable.inventoryItemId,
          inventoryItemCode: inventoryItemsTable.itemCode,
          inventoryItemName: inventoryItemsTable.name,
          description: importJobItemsTable.description,
          hsnCode: importJobItemsTable.hsnCode,
          qty: importJobItemsTable.qty,
          unit: importJobItemsTable.unit,
          unitPriceForeign: importJobItemsTable.unitPriceForeign,
          exchangeRate: importJobItemsTable.exchangeRate,
          unitCbm: importJobItemsTable.unitCbm,
          unitGrossWeight: importJobItemsTable.unitGrossWeight,
          dutyPercent: importJobItemsTable.dutyPercent,
          swsPercent: importJobItemsTable.swsPercent,
          igstPercent: importJobItemsTable.igstPercent,
          exwCostInr: importJobItemsTable.exwCostInr,
          freightShareInr: importJobItemsTable.freightShareInr,
          insuranceShareInr: importJobItemsTable.insuranceShareInr,
          assessableValueInr: importJobItemsTable.assessableValueInr,
          customsDutyInr: importJobItemsTable.customsDutyInr,
          swsAmountInr: importJobItemsTable.swsAmountInr,
          localChargesShareInr: importJobItemsTable.localChargesShareInr,
          otherChargesShareInr: importJobItemsTable.otherChargesShareInr,
          landedCostInr: importJobItemsTable.landedCostInr,
          perUnitLandedCostInr: importJobItemsTable.perUnitLandedCostInr,
        })
        .from(importJobItemsTable)
        .leftJoin(
          inventoryItemsTable,
          eq(importJobItemsTable.inventoryItemId, inventoryItemsTable.id),
        )
        .where(eq(importJobItemsTable.importJobId, id));

      const expenses = await db
        .select()
        .from(importExpensesTable)
        .where(eq(importExpensesTable.importJobId, id))
        .orderBy(importExpensesTable.id);

      const allocations = await db
        .select()
        .from(importCostAllocationsTable)
        .where(eq(importCostAllocationsTable.importJobId, id));

      let purchaseOrder: {
        id: number;
        poNumber: string;
        supplierName: string;
      } | null = null;
      if (job.import_jobs.purchaseOrderId) {
        const [po] = await db
          .select({
            id: purchaseOrdersTable.id,
            poNumber: purchaseOrdersTable.poNumber,
            supplierName: purchaseOrdersTable.supplierName,
          })
          .from(purchaseOrdersTable)
          .where(eq(purchaseOrdersTable.id, job.import_jobs.purchaseOrderId));
        purchaseOrder = po ?? null;
      }

      return res.json({
        ...job.import_jobs,
        createdByName: job.users?.name ?? null,
        purchaseOrder,
        items,
        expenses,
        allocations,
      });
    } catch (err) {
      logger.error({ err }, "Failed to get import job");
      return res.status(500).json({ message: "Failed to get import job" });
    }
  },
);

// UPDATE
importsRouter.patch(
  "/import-jobs/:id",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ message: "Invalid id" });
    const parsed = updateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      const data = parsed.data;
      const update: Record<string, unknown> = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.vendorName !== undefined) update.vendorName = data.vendorName;
      if (data.vendorCountry !== undefined)
        update.vendorCountry = data.vendorCountry;
      if (data.currency !== undefined) update.currency = data.currency;
      if (data.exchangeRate !== undefined)
        update.exchangeRate = data.exchangeRate.toString();
      if (data.purchaseRequestId !== undefined)
        update.purchaseRequestId = data.purchaseRequestId;
      if (data.purchaseOrderId !== undefined)
        update.purchaseOrderId = data.purchaseOrderId;
      if (data.supplierInvoiceNumber !== undefined)
        update.supplierInvoiceNumber = data.supplierInvoiceNumber;
      if (data.supplierInvoiceDate !== undefined)
        update.supplierInvoiceDate = data.supplierInvoiceDate;
      if (data.supplierInvoiceAmount !== undefined)
        update.supplierInvoiceAmount = data.supplierInvoiceAmount.toString();
      if (data.containerCbm !== undefined)
        update.containerCbm = data.containerCbm.toString();
      if (data.containerNumber !== undefined)
        update.containerNumber = data.containerNumber;
      if (data.blNumber !== undefined) update.blNumber = data.blNumber;
      if (data.vesselName !== undefined) update.vesselName = data.vesselName;
      if (data.etd !== undefined) update.etd = data.etd;
      if (data.eta !== undefined) update.eta = data.eta;
      if (data.arrivalDate !== undefined)
        update.arrivalDate = data.arrivalDate;
      if (data.notes !== undefined) update.notes = data.notes;
      if (data.status !== undefined) update.status = data.status;

      await db
        .update(importJobsTable)
        .set(update)
        .where(eq(importJobsTable.id, id));

      // If exchange rate changed, recompute landed cost
      if (data.exchangeRate !== undefined) {
        await recalculateLandedCost(id);
      }
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to update import job");
      return res
        .status(500)
        .json({ message: "Failed to update import job" });
    }
  },
);

// DELETE
importsRouter.delete(
  "/import-jobs/:id",
  requireRole("director", "admin", "cfo"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ message: "Invalid id" });
    try {
      await db.delete(importJobsTable).where(eq(importJobsTable.id, id));
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to delete import job");
      return res
        .status(500)
        .json({ message: "Failed to delete import job" });
    }
  },
);

// ITEMS
importsRouter.post(
  "/import-jobs/:id/items",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ message: "Invalid id" });
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      const d = parsed.data;
      // If inventoryItemId provided, hydrate defaults from product master
      let unitCbm = d.unitCbm;
      let unitGross = d.unitGrossWeight;
      let dutyPercent = 20;
      let hsn = d.hsnCode;
      if (d.inventoryItemId) {
        const [it] = await db
          .select()
          .from(inventoryItemsTable)
          .where(eq(inventoryItemsTable.id, d.inventoryItemId));
        if (it) {
          if (!unitCbm) unitCbm = num(it.unitCbm);
          if (!unitGross) unitGross = num(it.grossWeightKg);
          if (!hsn) hsn = it.hsnCode ?? undefined;
        }
      }
      const [created] = await db
        .insert(importJobItemsTable)
        .values({
          importJobId: id,
          inventoryItemId: d.inventoryItemId ?? null,
          description: d.description,
          hsnCode: hsn ?? null,
          qty: d.qty.toString(),
          unit: d.unit,
          unitPriceForeign: d.unitPriceForeign.toString(),
          exchangeRate: d.exchangeRate.toString(),
          unitCbm: unitCbm.toString(),
          unitGrossWeight: unitGross.toString(),
          dutyPercent: "20",
          swsPercent: d.swsPercent.toString(),
          igstPercent: d.igstPercent.toString(),
        })
        .returning();
      await recalculateLandedCost(id);
      return res.status(201).json(created);
    } catch (err) {
      logger.error({ err }, "Failed to create import item");
      return res
        .status(500)
        .json({ message: "Failed to create import item" });
    }
  },
);

importsRouter.patch(
  "/import-jobs/:id/items/:itemId",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(jobId) || !Number.isFinite(itemId))
      return res.status(400).json({ message: "Invalid ids" });
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      const d = parsed.data;
      const update: Record<string, unknown> = {};
      if (d.inventoryItemId !== undefined)
        update.inventoryItemId = d.inventoryItemId;
      if (d.description !== undefined) update.description = d.description;
      if (d.hsnCode !== undefined) update.hsnCode = d.hsnCode;
      if (d.qty !== undefined) update.qty = d.qty.toString();
      if (d.unit !== undefined) update.unit = d.unit;
      if (d.unitPriceForeign !== undefined)
        update.unitPriceForeign = d.unitPriceForeign.toString();
      if (d.exchangeRate !== undefined)
        update.exchangeRate = d.exchangeRate.toString();
      if (d.unitCbm !== undefined) update.unitCbm = d.unitCbm.toString();
      if (d.unitGrossWeight !== undefined)
        update.unitGrossWeight = d.unitGrossWeight.toString();
      update.dutyPercent = "20";
      if (d.swsPercent !== undefined)
        update.swsPercent = d.swsPercent.toString();
      if (d.igstPercent !== undefined)
        update.igstPercent = d.igstPercent.toString();
      await db
        .update(importJobItemsTable)
        .set(update)
        .where(
          and(
            eq(importJobItemsTable.id, itemId),
            eq(importJobItemsTable.importJobId, jobId),
          ),
        );
      await recalculateLandedCost(jobId);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to update import item");
      return res
        .status(500)
        .json({ message: "Failed to update import item" });
    }
  },
);

importsRouter.delete(
  "/import-jobs/:id/items/:itemId",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isFinite(jobId) || !Number.isFinite(itemId))
      return res.status(400).json({ message: "Invalid ids" });
    try {
      await db
        .delete(importJobItemsTable)
        .where(
          and(
            eq(importJobItemsTable.id, itemId),
            eq(importJobItemsTable.importJobId, jobId),
          ),
        );
      await recalculateLandedCost(jobId);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to delete import item");
      return res
        .status(500)
        .json({ message: "Failed to delete import item" });
    }
  },
);

// EXPENSES
importsRouter.post(
  "/import-jobs/:id/expenses",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isFinite(jobId))
      return res.status(400).json({ message: "Invalid id" });
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      const d = parsed.data;
      const userId = (req as { user?: { id: number } }).user?.id;
      const amountInr = round2(d.amountForeign * d.exchangeRate);
      const [created] = await db
        .insert(importExpensesTable)
        .values({
          importJobId: jobId,
          expenseType: d.expenseType,
          vendorName: d.vendorName,
          billNumber: d.billNumber ?? null,
          billDate: d.billDate ?? null,
          currency: d.currency,
          amountForeign: d.amountForeign.toString(),
          exchangeRate: d.exchangeRate.toString(),
          amountInr: amountInr.toString(),
          gstAmount: d.gstAmount.toString(),
          allocationMethod: d.allocationMethod,
          isAllocatable: d.isAllocatable,
          paymentStatus: d.paymentStatus,
          notes: d.notes ?? null,
          createdById: userId ?? null,
        })
        .returning();
      await recalculateLandedCost(jobId);
      return res.status(201).json(created);
    } catch (err) {
      logger.error({ err }, "Failed to create import expense");
      return res
        .status(500)
        .json({ message: "Failed to create import expense" });
    }
  },
);

importsRouter.patch(
  "/import-jobs/:id/expenses/:expenseId",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const expenseId = Number(req.params.expenseId);
    if (!Number.isFinite(jobId) || !Number.isFinite(expenseId))
      return res.status(400).json({ message: "Invalid ids" });
    const parsed = expenseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      const d = parsed.data;
      const update: Record<string, unknown> = {};
      if (d.expenseType !== undefined) update.expenseType = d.expenseType;
      if (d.vendorName !== undefined) update.vendorName = d.vendorName;
      if (d.billNumber !== undefined) update.billNumber = d.billNumber;
      if (d.billDate !== undefined) update.billDate = d.billDate;
      if (d.currency !== undefined) update.currency = d.currency;
      if (d.amountForeign !== undefined)
        update.amountForeign = d.amountForeign.toString();
      if (d.exchangeRate !== undefined)
        update.exchangeRate = d.exchangeRate.toString();
      if (d.gstAmount !== undefined) update.gstAmount = d.gstAmount.toString();
      if (d.allocationMethod !== undefined)
        update.allocationMethod = d.allocationMethod;
      if (d.isAllocatable !== undefined)
        update.isAllocatable = d.isAllocatable;
      if (d.paymentStatus !== undefined)
        update.paymentStatus = d.paymentStatus;
      if (d.notes !== undefined) update.notes = d.notes;
      await db
        .update(importExpensesTable)
        .set(update)
        .where(
          and(
            eq(importExpensesTable.id, expenseId),
            eq(importExpensesTable.importJobId, jobId),
          ),
        );
      await recalculateLandedCost(jobId);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to update import expense");
      return res
        .status(500)
        .json({ message: "Failed to update import expense" });
    }
  },
);

importsRouter.delete(
  "/import-jobs/:id/expenses/:expenseId",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const expenseId = Number(req.params.expenseId);
    if (!Number.isFinite(jobId) || !Number.isFinite(expenseId))
      return res.status(400).json({ message: "Invalid ids" });
    try {
      await db
        .delete(importExpensesTable)
        .where(
          and(
            eq(importExpensesTable.id, expenseId),
            eq(importExpensesTable.importJobId, jobId),
          ),
        );
      await recalculateLandedCost(jobId);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to delete import expense");
      return res
        .status(500)
        .json({ message: "Failed to delete import expense" });
    }
  },
);

// MANUAL RECALC
importsRouter.post(
  "/import-jobs/:id/recalculate",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ message: "Invalid id" });
    try {
      await recalculateLandedCost(id);
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "Failed to recalc landed cost");
      return res
        .status(500)
        .json({ message: "Failed to recalculate landed cost" });
    }
  },
);

// ─── POST /import-jobs/:id/receive ────────────────────────────────────────────
// Posts stock_movements IN for each line at the per-unit landed cost (INR).
// Recomputes landed cost first to ensure costs are fresh.
importsRouter.post(
  "/import-jobs/:id/receive",
  requireRole(...WRITE_ROLES),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    try {
      const [job] = await db
        .select()
        .from(importJobsTable)
        .where(eq(importJobsTable.id, id));
      if (!job) {
        res.status(404).json({ message: "Not found" });
        return;
      }
      if (job.status === "received" || job.status === "closed") {
        res.status(400).json({ message: `Import job already ${job.status}` });
        return;
      }

      await recalculateLandedCost(id);

      const items = await db
        .select()
        .from(importJobItemsTable)
        .where(eq(importJobItemsTable.importJobId, id));

      const movementIds: number[] = [];
      for (const it of items) {
        if (!it.inventoryItemId) continue;
        const qty = parseFloat(it.qty);
        if (qty <= 0) continue;
        const unitCost = parseFloat(it.perUnitLandedCostInr);
        const totalCost = qty * unitCost;
        const [m] = await db
          .insert(stockMovementsTable)
          .values({
            itemId: it.inventoryItemId,
            movementType: "in",
            qty: qty.toString(),
            unitCost: unitCost.toString(),
            totalCost: totalCost.toString(),
            sourceType: "importJob",
            sourceId: id,
            sourceNumber: job.jobNumber,
            notes: `Imported via ${job.jobNumber}`,
            createdById: req.session.userId ?? null,
          })
          .returning();
        movementIds.push(m.id);
        try {
          await db.insert(stockTransactionsTable).values({
            itemId: it.inventoryItemId,
            type: "in",
            qty: qty.toString(),
            rate: unitCost.toString(),
            referenceType: "manual",
            referenceNumber: job.jobNumber,
            notes: `Imported via ${job.jobNumber}`,
            createdById: req.session.userId ?? null,
          });
        } catch (err) {
          logger.warn(
            { err },
            "Failed to mirror import receive into stock_transactions",
          );
        }
      }

      await db
        .update(importJobsTable)
        .set({ status: "received", updatedAt: new Date() })
        .where(eq(importJobsTable.id, id));

      res.json({ ok: true, movementIds });
    } catch (err) {
      logger.error({ err }, "Failed to receive import job");
      res.status(500).json({ message: "Failed to receive import job" });
    }
  },
);


export default importsRouter;
