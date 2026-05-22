import { Router } from "express";
import { z } from "zod";
import {
  db,
  gstInvoicesTable,
  invoiceLineItemsTable,
  invoicePaymentsTable,
  supplierBillsTable,
  supplierBillPaymentsTable,
  expensesTable,
  workOrdersTable,
} from "@workspace/db";
import { eq, desc, and, like, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { generateInvoiceNumber, calcGst } from "../lib/invoiceHelpers";

const financeRouter = Router();

const FINANCE_ROLES = ["accounts", "cfo", "director", "admin"] as const;
const PURCHASE_ROLES = [...FINANCE_ROLES, "purchase"] as const;
const VIEW_FINANCE_ROLES = [...FINANCE_ROLES] as const;

function canManageFinance(role: string) {
  return (FINANCE_ROLES as readonly string[]).includes(role);
}

function canViewExpenses(role: string) {
  return (FINANCE_ROLES as readonly string[]).includes(role);
}

// ─── GST Invoice helpers ────────────────────────────────────────────────────────
// generateInvoiceNumber and calcGst are imported from ../lib/invoiceHelpers

const createInvoiceSchema = z.object({
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  customerGstin: z.string().optional(),
  bcaGstin: z.string().optional(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional(),
  workOrderId: z.number().int().optional(),
  transactionType: z.enum(["intrastate", "interstate"]).default("intrastate"),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    hsnCode: z.string().optional(),
    qty: z.number().positive(),
    unitPrice: z.number().min(0),
    gstRate: z.number().min(0).max(100).default(18),
  })).min(1),
});

// ─── GST Invoices ───────────────────────────────────────────────────────────────

financeRouter.get("/gst-invoices", requireAuth, requireRole(...VIEW_FINANCE_ROLES), async (req, res) => {
  const { status, month, year, search } = req.query as Record<string, string>;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(gstInvoicesTable.status, status));
  if (year && month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    conditions.push(like(gstInvoicesTable.invoiceDate, `${prefix}%`) as ReturnType<typeof eq>);
  } else if (year) {
    conditions.push(like(gstInvoicesTable.invoiceDate, `${year}%`) as ReturnType<typeof eq>);
  }

  const invoices = await db
    .select()
    .from(gstInvoicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(gstInvoicesTable.createdAt));

  if (search) {
    const s = search.toLowerCase();
    const filtered = invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(s) ||
        inv.customerName.toLowerCase().includes(s)
    );
    res.json(filtered);
    return;
  }

  res.json(invoices);
});

financeRouter.post("/gst-invoices", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return; }

  const { lineItems, transactionType, ...invoiceData } = parsed.data;

  let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
  const computedItems = lineItems.map((li) => {
    const taxableValue = li.qty * li.unitPrice;
    const { cgst, sgst, igst } = calcGst(taxableValue, li.gstRate, transactionType);
    subtotal += taxableValue;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    return { ...li, taxableValue, cgst, sgst, igst, lineTotal: taxableValue + cgst + sgst + igst };
  });

  const rawTotal = subtotal + totalCgst + totalSgst + totalIgst;
  const roundedTotal = Math.round(rawTotal);
  const roundOff = roundedTotal - rawTotal;
  const invoiceNumber = await generateInvoiceNumber();

  const [invoice] = await db.insert(gstInvoicesTable).values({
    invoiceNumber,
    invoiceDate: invoiceData.invoiceDate,
    customerName: invoiceData.customerName,
    customerAddress: invoiceData.customerAddress,
    customerGstin: invoiceData.customerGstin,
    bcaGstin: invoiceData.bcaGstin,
    workOrderId: invoiceData.workOrderId,
    transactionType,
    subtotal: subtotal.toFixed(2),
    cgstAmount: totalCgst.toFixed(2),
    sgstAmount: totalSgst.toFixed(2),
    igstAmount: totalIgst.toFixed(2),
    roundOff: roundOff.toFixed(2),
    total: roundedTotal.toFixed(2),
    dueDate: invoiceData.dueDate,
    notes: invoiceData.notes,
    createdById: req.session.userId,
    status: "unpaid",
    paidAmount: "0",
  }).returning();

  await db.insert(invoiceLineItemsTable).values(
    computedItems.map((li) => ({
      invoiceId: invoice.id,
      description: li.description,
      hsnCode: li.hsnCode,
      qty: li.qty.toFixed(2),
      unitPrice: li.unitPrice.toFixed(2),
      taxableValue: li.taxableValue.toFixed(2),
      gstRate: li.gstRate.toFixed(2),
      cgstAmount: li.cgst.toFixed(2),
      sgstAmount: li.sgst.toFixed(2),
      igstAmount: li.igst.toFixed(2),
      lineTotal: li.lineTotal.toFixed(2),
    }))
  );

  const lineItemsResult = await db.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, invoice.id));
  res.status(201).json({ ...invoice, lineItems: lineItemsResult, payments: [] });
});

financeRouter.get("/gst-invoices/:id", requireAuth, requireRole(...VIEW_FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db.select().from(gstInvoicesTable).where(eq(gstInvoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const lineItems = await db.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));
  const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, id)).orderBy(invoicePaymentsTable.paymentDate);

  res.json({ ...invoice, lineItems, payments });
});

financeRouter.patch("/gst-invoices/:id", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { notes, dueDate } = req.body as { notes?: string; dueDate?: string };
  const [updated] = await db
    .update(gstInvoicesTable)
    .set({ notes, dueDate, updatedAt: new Date() })
    .where(eq(gstInvoicesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(updated);
});

financeRouter.post("/gst-invoices/:id/payments", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const paymentSchema = z.object({
    paymentDate: z.string().min(1),
    amount: z.number().positive().finite(),
    paymentMode: z.enum(["cash", "bank", "cheque", "upi", "neft", "rtgs"]).default("bank"),
    reference: z.string().optional(),
    notes: z.string().optional(),
  });

  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payment data" }); return; }

  const [invoice] = await db.select().from(gstInvoicesTable).where(eq(gstInvoicesTable.id, id));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const outstanding = parseFloat(invoice.total ?? "0") - parseFloat(invoice.paidAmount ?? "0");
  if (parsed.data.amount > outstanding + 0.005) {
    res.status(400).json({ error: `Amount exceeds outstanding balance of ₹${outstanding.toFixed(2)}` }); return;
  }

  const [payment] = await db.insert(invoicePaymentsTable).values({
    invoiceId: id,
    paymentDate: parsed.data.paymentDate,
    amount: parsed.data.amount.toFixed(2),
    paymentMode: parsed.data.paymentMode,
    reference: parsed.data.reference,
    notes: parsed.data.notes,
  }).returning();

  const newPaid = parseFloat(invoice.paidAmount ?? "0") + parsed.data.amount;
  const total = parseFloat(invoice.total ?? "0");
  const newStatus = newPaid >= total ? "paid" : newPaid > 0 ? "partial" : "unpaid";

  await db.update(gstInvoicesTable)
    .set({ paidAmount: newPaid.toFixed(2), status: newStatus, updatedAt: new Date() })
    .where(eq(gstInvoicesTable.id, id));

  res.status(201).json(payment);
});

// ─── GST Monthly Summary ────────────────────────────────────────────────────────

financeRouter.get("/gst-summary", requireAuth, requireRole(...VIEW_FINANCE_ROLES), async (req, res) => {
  const { year, month } = req.query as { year?: string; month?: string };
  if (!year || !month) { res.status(400).json({ error: "year and month required" }); return; }

  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  const invoices = await db
    .select()
    .from(gstInvoicesTable)
    .where(and(
      like(gstInvoicesTable.invoiceDate, `${prefix}%`),
      sql`${gstInvoicesTable.status} != 'cancelled'`
    ));

  const bills = await db
    .select()
    .from(supplierBillsTable)
    .where(like(supplierBillsTable.billDate, `${prefix}%`));

  const outputCgst = invoices.reduce((s, i) => s + parseFloat(i.cgstAmount ?? "0"), 0);
  const outputSgst = invoices.reduce((s, i) => s + parseFloat(i.sgstAmount ?? "0"), 0);
  const outputIgst = invoices.reduce((s, i) => s + parseFloat(i.igstAmount ?? "0"), 0);
  const outputGst = outputCgst + outputSgst + outputIgst;
  const outputSubtotal = invoices.reduce((s, i) => s + parseFloat(i.subtotal ?? "0"), 0);

  const inputCgst = bills.reduce((s, b) => s + parseFloat(b.cgstAmount ?? "0"), 0);
  const inputSgst = bills.reduce((s, b) => s + parseFloat(b.sgstAmount ?? "0"), 0);
  const inputIgst = bills.reduce((s, b) => s + parseFloat(b.igstAmount ?? "0"), 0);
  const inputGst = inputCgst + inputSgst + inputIgst;
  const inputSubtotal = bills.reduce((s, b) => s + parseFloat(b.subtotal ?? "0"), 0);

  res.json({
    year,
    month,
    invoiceCount: invoices.length,
    outputSubtotal,
    outputCgst,
    outputSgst,
    outputIgst,
    outputGst,
    billCount: bills.length,
    inputSubtotal,
    inputCgst,
    inputSgst,
    inputIgst,
    inputGst,
    netCgst: outputCgst - inputCgst,
    netSgst: outputSgst - inputSgst,
    netIgst: outputIgst - inputIgst,
    netGstLiability: outputGst - inputGst,
  });
});

// ─── AR Ageing ─────────────────────────────────────────────────────────────────

financeRouter.get("/gst-invoices/report/ar-ageing", requireAuth, requireRole(...VIEW_FINANCE_ROLES), async (req, res) => {
  const invoices = await db
    .select()
    .from(gstInvoicesTable)
    .where(sql`${gstInvoicesTable.status} IN ('unpaid', 'partial')`);

  const today = new Date();
  const buckets = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };
  const rows = invoices.map((inv) => {
    const due = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
    const outstanding = parseFloat(inv.total ?? "0") - parseFloat(inv.paidAmount ?? "0");

    if (daysOverdue <= 0) buckets.current += outstanding;
    else if (daysOverdue <= 30) buckets.days30 += outstanding;
    else if (daysOverdue <= 60) buckets.days60 += outstanding;
    else if (daysOverdue <= 90) buckets.days90 += outstanding;
    else buckets.days90plus += outstanding;

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      total: parseFloat(inv.total ?? "0"),
      paidAmount: parseFloat(inv.paidAmount ?? "0"),
      outstanding,
      daysOverdue: Math.max(0, daysOverdue),
      status: inv.status,
    };
  });

  res.json({ rows, summary: buckets });
});

// ─── Supplier Bills ─────────────────────────────────────────────────────────────

const createBillSchema = z.object({
  billNumber: z.string().min(1),
  supplierName: z.string().min(1),
  supplierGstin: z.string().optional(),
  purchaseOrderId: z.number().int().optional(),
  referencePoNumber: z.string().optional(),
  billDate: z.string().min(1),
  dueDate: z.string().optional(),
  transactionType: z.enum(["intrastate", "interstate"]).default("intrastate"),
  itemDetails: z.array(z.object({
    description: z.string().min(1),
    qty: z.number().positive(),
    unitPrice: z.number().min(0),
    amount: z.number().min(0),
  })).min(1),
  gstRate: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
});

financeRouter.get("/supplier-bills", requireAuth, requireRole(...PURCHASE_ROLES), async (req, res) => {
  const { status } = req.query as { status?: string };
  const role = req.session.userRole ?? "";
  const isPurchaseOnly = role === "purchase";

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(supplierBillsTable.status, status));
  if (isPurchaseOnly) conditions.push(eq(supplierBillsTable.createdById, req.session.userId!));

  const bills = await db
    .select()
    .from(supplierBillsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supplierBillsTable.createdAt));
  res.json(bills);
});

financeRouter.post("/supplier-bills", requireAuth, requireRole(...PURCHASE_ROLES), async (req, res) => {
  const parsed = createBillSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return; }

  const normalizedItems = parsed.data.itemDetails.map((item) => {
    const amount = item.qty * item.unitPrice;
    return {
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
      amount: Number(amount.toFixed(2)),
    };
  });
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
  const gstAmount = subtotal * (parsed.data.gstRate / 100);
  const cgstAmount = parsed.data.transactionType === "intrastate" ? gstAmount / 2 : 0;
  const sgstAmount = parsed.data.transactionType === "intrastate" ? gstAmount / 2 : 0;
  const igstAmount = parsed.data.transactionType === "interstate" ? gstAmount : 0;
  const total = subtotal + gstAmount;

  const [bill] = await db.insert(supplierBillsTable).values({
    ...parsed.data,
    itemDetails: normalizedItems,
    subtotal: subtotal.toFixed(2),
    gstRate: parsed.data.gstRate.toFixed(2),
    cgstAmount: cgstAmount.toFixed(2),
    sgstAmount: sgstAmount.toFixed(2),
    igstAmount: igstAmount.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    total: total.toFixed(2),
    status: "pending",
    paidAmount: "0",
    createdById: req.session.userId,
  }).returning();

  res.status(201).json(bill);
});

financeRouter.get("/supplier-bills/:id", requireAuth, requireRole(...PURCHASE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [bill] = await db.select().from(supplierBillsTable).where(eq(supplierBillsTable.id, id));
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  const role = req.session.userRole ?? "";
  const isPurchaseOnly = role === "purchase";
  if (isPurchaseOnly && bill.createdById !== req.session.userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  res.json(bill);
});

financeRouter.post("/supplier-bills/:id/pay", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const paySchema = z.object({
    paymentDate: z.string().min(1),
    amount: z.number().positive().finite(),
    paymentMode: z.enum(["cash", "bank", "cheque", "upi", "neft", "rtgs"]).default("bank"),
    reference: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "amount (positive number) and paymentDate required" }); return; }
  const { amount, paymentDate, paymentMode, reference, notes } = parsed.data;

  const [bill] = await db.select().from(supplierBillsTable).where(eq(supplierBillsTable.id, id));
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }

  const outstanding = parseFloat(bill.total ?? "0") - parseFloat(bill.paidAmount ?? "0");
  if (amount > outstanding + 0.005) {
    res.status(400).json({ error: `Amount exceeds outstanding balance of ₹${outstanding.toFixed(2)}` }); return;
  }

  // Persist the payment event
  const [payment] = await db.insert(supplierBillPaymentsTable).values({
    billId: id,
    paymentDate,
    amount: amount.toFixed(2),
    paymentMode,
    reference,
    notes,
  }).returning();

  const newPaid = parseFloat(bill.paidAmount ?? "0") + amount;
  const total = parseFloat(bill.total ?? "0");
  const newStatus = newPaid >= total - 0.005 ? "paid" : "partial";

  const [updated] = await db
    .update(supplierBillsTable)
    .set({ paidAmount: newPaid.toFixed(2), status: newStatus, updatedAt: new Date() })
    .where(eq(supplierBillsTable.id, id))
    .returning();

  res.status(201).json({ bill: updated, payment });
});

// ─── AP Ageing ─────────────────────────────────────────────────────────────────

financeRouter.get("/supplier-bills/report/ap-ageing", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const bills = await db
    .select()
    .from(supplierBillsTable)
    .where(sql`${supplierBillsTable.status} IN ('pending', 'partial')`);

  const today = new Date();
  const buckets = { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 };
  const rows = bills.map((bill) => {
    const due = bill.dueDate ? new Date(bill.dueDate) : new Date(bill.billDate);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
    const outstanding = parseFloat(bill.total ?? "0") - parseFloat(bill.paidAmount ?? "0");

    if (daysOverdue <= 0) buckets.current += outstanding;
    else if (daysOverdue <= 30) buckets.days30 += outstanding;
    else if (daysOverdue <= 60) buckets.days60 += outstanding;
    else if (daysOverdue <= 90) buckets.days90 += outstanding;
    else buckets.days90plus += outstanding;

    return {
      billId: bill.id,
      billNumber: bill.billNumber,
      supplierName: bill.supplierName,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      total: parseFloat(bill.total ?? "0"),
      paidAmount: parseFloat(bill.paidAmount ?? "0"),
      outstanding,
      daysOverdue: Math.max(0, daysOverdue),
      status: bill.status,
    };
  });

  res.json({ rows, summary: buckets });
});

// ─── Expenses ───────────────────────────────────────────────────────────────────

const createExpenseSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  workOrderId: z.number().int().positive().optional().nullable(),
  category: z.string().default("general"),
  expenseDate: z.string().min(1),
  gstRate: z.number().min(0).max(100).default(0),
  notes: z.string().optional(),
  receiptRef: z.string().optional(),
});

const EXPENSE_CATEGORIES = ["general", "travel", "meals", "utilities", "office", "marketing", "maintenance", "other"] as const;

financeRouter.get("/expenses", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const { status } = req.query as { status?: string };
  const expenses = expensesTable as typeof expensesTable & {
    workOrderId: typeof workOrdersTable.id;
  };
  let query = db
    .select({
      expense: expensesTable,
      woNumber: workOrdersTable.woNumber,
    })
    .from(expensesTable)
    .leftJoin(workOrdersTable, eq(workOrdersTable.id, expenses.workOrderId))
    .orderBy(desc(expensesTable.expenseDate))
    .$dynamic();
  if (status) query = query.where(eq(expensesTable.status, status));
  const rows = await query;
  res.json(rows.map((row) => ({ ...row.expense, workOrderNumber: row.woNumber ?? null, woNumber: row.woNumber ?? null })));
});

financeRouter.post("/expenses", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return; }
  const gstAmount = parsed.data.amount * (parsed.data.gstRate / 100);

  const [expense] = await db.insert(expensesTable).values({
    ...parsed.data,
    workOrderId: parsed.data.workOrderId ?? null,
    amount: parsed.data.amount.toFixed(2),
    gstRate: parsed.data.gstRate.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    status: "pending",
    createdById: req.session.userId,
  } as typeof expensesTable.$inferInsert & { workOrderId?: number | null; gstRate?: string; gstAmount?: string }).returning();

  res.status(201).json(expense);
});

financeRouter.get("/expenses/categories", requireAuth, requireRole(...FINANCE_ROLES), async (_req, res) => {
  res.json(EXPENSE_CATEGORIES);
});

financeRouter.patch("/expenses/:id/approve", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  if (expense.status !== "pending") { res.status(400).json({ error: "Only pending expenses can be approved" }); return; }

  const [updated] = await db
    .update(expensesTable)
    .set({ status: "approved", approvedById: req.session.userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(expensesTable.id, id))
    .returning();

  res.json(updated);
});

financeRouter.patch("/expenses/:id/reject", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  if (expense.status !== "pending") { res.status(400).json({ error: "Only pending expenses can be rejected" }); return; }

  const [updated] = await db
    .update(expensesTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(expensesTable.id, id))
    .returning();

  res.json(updated);
});

financeRouter.patch("/expenses/:id", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (existing.status === "approved") { res.status(400).json({ error: "Approved expenses cannot be edited" }); return; }

  const schema = createExpenseSchema.partial();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount.toFixed(2);

  const [updated] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, id)).returning();
  res.json(updated);
});

financeRouter.delete("/expenses/:id", requireAuth, requireRole(...FINANCE_ROLES), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  if (existing.status === "approved") { res.status(400).json({ error: "Approved expenses cannot be deleted" }); return; }

  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.json({ success: true });
});

export default financeRouter;
