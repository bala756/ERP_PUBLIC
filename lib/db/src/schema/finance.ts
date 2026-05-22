import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  varchar,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { workOrdersTable } from "./orders";
import { purchaseOrdersTable } from "./orders";

export const gstInvoicesTable = pgTable("gst_invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  invoiceDate: varchar("invoice_date", { length: 20 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerAddress: text("customer_address"),
  customerGstin: varchar("customer_gstin", { length: 20 }),
  bcaGstin: varchar("bca_gstin", { length: 20 }),
  workOrderId: integer("work_order_id").references(() => workOrdersTable.id, { onDelete: "set null" }),
  transactionType: varchar("transaction_type", { length: 20 }).notNull().default("intrastate"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  cgstAmount: numeric("cgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  sgstAmount: numeric("sgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  igstAmount: numeric("igst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  roundOff: numeric("round_off", { precision: 6, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("unpaid"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  dueDate: varchar("due_date", { length: 20 }),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoiceLineItemsTable = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => gstInvoicesTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  hsnCode: varchar("hsn_code", { length: 20 }),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  taxableValue: numeric("taxable_value", { precision: 14, scale: 2 }).notNull().default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  cgstAmount: numeric("cgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  sgstAmount: numeric("sgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  igstAmount: numeric("igst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const invoicePaymentsTable = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => gstInvoicesTable.id, { onDelete: "cascade" }),
  paymentDate: varchar("payment_date", { length: 20 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMode: varchar("payment_mode", { length: 30 }).notNull().default("bank"),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const supplierBillsTable = pgTable("supplier_bills", {
  id: serial("id").primaryKey(),
  billNumber: varchar("bill_number", { length: 100 }).notNull(),
  supplierName: varchar("supplier_name", { length: 255 }).notNull(),
  supplierGstin: varchar("supplier_gstin", { length: 20 }),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrdersTable.id, { onDelete: "set null" }),
  referencePoNumber: varchar("reference_po_number", { length: 100 }),
  billDate: varchar("bill_date", { length: 20 }).notNull(),
  dueDate: varchar("due_date", { length: 20 }),
  transactionType: varchar("transaction_type", { length: 20 }).notNull().default("intrastate"),
  itemDetails: jsonb("item_details").notNull().default([]),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  cgstAmount: numeric("cgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  sgstAmount: numeric("sgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  igstAmount: numeric("igst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supplierBillPaymentsTable = pgTable("supplier_bill_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => supplierBillsTable.id, { onDelete: "cascade" }),
  paymentDate: varchar("payment_date", { length: 20 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMode: varchar("payment_mode", { length: 30 }).notNull().default("bank"),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  workOrderId: integer("work_order_id").references(() => workOrdersTable.id, { onDelete: "set null" }),
  category: varchar("category", { length: 100 }).notNull().default("general"),
  expenseDate: varchar("expense_date", { length: 20 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  approvedById: integer("approved_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  receiptRef: varchar("receipt_ref", { length: 255 }),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gstInvoiceRelations = relations(gstInvoicesTable, ({ one, many }) => ({
  workOrder: one(workOrdersTable, {
    fields: [gstInvoicesTable.workOrderId],
    references: [workOrdersTable.id],
  }),
  createdBy: one(usersTable, {
    fields: [gstInvoicesTable.createdById],
    references: [usersTable.id],
  }),
  lineItems: many(invoiceLineItemsTable),
  payments: many(invoicePaymentsTable),
}));

export const invoiceLineItemRelations = relations(invoiceLineItemsTable, ({ one }) => ({
  invoice: one(gstInvoicesTable, {
    fields: [invoiceLineItemsTable.invoiceId],
    references: [gstInvoicesTable.id],
  }),
}));

export const invoicePaymentRelations = relations(invoicePaymentsTable, ({ one }) => ({
  invoice: one(gstInvoicesTable, {
    fields: [invoicePaymentsTable.invoiceId],
    references: [gstInvoicesTable.id],
  }),
}));

export const supplierBillRelations = relations(supplierBillsTable, ({ one }) => ({
  purchaseOrder: one(purchaseOrdersTable, {
    fields: [supplierBillsTable.purchaseOrderId],
    references: [purchaseOrdersTable.id],
  }),
  createdBy: one(usersTable, {
    fields: [supplierBillsTable.createdById],
    references: [usersTable.id],
  }),
}));

export const expenseRelations = relations(expensesTable, ({ one }) => ({
  workOrder: one(workOrdersTable, {
    fields: [expensesTable.workOrderId],
    references: [workOrdersTable.id],
  }),
  createdBy: one(usersTable, {
    fields: [expensesTable.createdById],
    references: [usersTable.id],
  }),
  approvedBy: one(usersTable, {
    fields: [expensesTable.approvedById],
    references: [usersTable.id],
  }),
}));
