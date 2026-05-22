import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { inventoryItemsTable } from "./inventory";
import { purchaseOrdersTable } from "./orders";

export const importJobStatusEnum = pgEnum("import_job_status", [
  "draft",
  "inTransit",
  "arrived",
  "cleared",
  "received",
  "closed",
  "cancelled",
]);

export const allocationMethodEnum = pgEnum("import_allocation_method", [
  "cbm",
  "value",
  "quantity",
  "weight",
  "equal",
  "manual",
]);

export const importJobsTable = pgTable("import_jobs", {
  id: serial("id").primaryKey(),
  jobNumber: varchar("job_number", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  vendorName: varchar("vendor_name", { length: 255 }).notNull(),
  vendorCountry: varchar("vendor_country", { length: 100 }).default("China"),
  currency: varchar("currency", { length: 10 }).notNull().default("USD"),
  exchangeRate: numeric("exchange_rate", { precision: 12, scale: 4 })
    .notNull()
    .default("83.0000"),
  purchaseRequestId: integer("purchase_request_id"),
  purchaseOrderId: integer("purchase_order_id").references(
    () => purchaseOrdersTable.id,
    { onDelete: "set null" },
  ),
  supplierInvoiceNumber: varchar("supplier_invoice_number", { length: 100 }),
  supplierInvoiceDate: varchar("supplier_invoice_date", { length: 20 }),
  supplierInvoiceAmount: numeric("supplier_invoice_amount", {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default("0"),
  containerCbm: numeric("container_cbm", { precision: 14, scale: 4 })
    .notNull()
    .default("0"),
  containerNumber: varchar("container_number", { length: 50 }),
  blNumber: varchar("bl_number", { length: 100 }),
  vesselName: varchar("vessel_name", { length: 100 }),
  etd: varchar("etd", { length: 20 }),
  eta: varchar("eta", { length: 20 }),
  arrivalDate: varchar("arrival_date", { length: 20 }),
  status: importJobStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const importJobItemsTable = pgTable("import_job_items", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id")
    .notNull()
    .references(() => importJobsTable.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id").references(
    () => inventoryItemsTable.id,
    { onDelete: "set null" },
  ),
  description: varchar("description", { length: 500 }).notNull(),
  hsnCode: varchar("hsn_code", { length: 20 }),
  qty: numeric("qty", { precision: 14, scale: 4 }).notNull().default("0"),
  unit: varchar("unit", { length: 50 }).notNull().default("pcs"),
  unitPriceForeign: numeric("unit_price_foreign", {
    precision: 14,
    scale: 4,
  })
    .notNull()
    .default("0"),
  exchangeRate: numeric("exchange_rate", { precision: 12, scale: 4 })
    .notNull()
    .default("83.0000"),
  unitCbm: numeric("unit_cbm", { precision: 14, scale: 6 })
    .notNull()
    .default("0"),
  unitGrossWeight: numeric("unit_gross_weight", {
    precision: 14,
    scale: 4,
  })
    .notNull()
    .default("0"),
  dutyPercent: numeric("duty_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("0"),
  swsPercent: numeric("sws_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("10"),
  igstPercent: numeric("igst_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("18"),
  exwCostInr: numeric("exw_cost_inr", { precision: 16, scale: 2 })
    .notNull()
    .default("0"),
  freightShareInr: numeric("freight_share_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  insuranceShareInr: numeric("insurance_share_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  assessableValueInr: numeric("assessable_value_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  customsDutyInr: numeric("customs_duty_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  swsAmountInr: numeric("sws_amount_inr", { precision: 16, scale: 2 })
    .notNull()
    .default("0"),
  localChargesShareInr: numeric("local_charges_share_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  otherChargesShareInr: numeric("other_charges_share_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  landedCostInr: numeric("landed_cost_inr", { precision: 16, scale: 2 })
    .notNull()
    .default("0"),
  perUnitLandedCostInr: numeric("per_unit_landed_cost_inr", {
    precision: 16,
    scale: 4,
  })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const importExpenseTypeEnum = pgEnum("import_expense_type", [
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
]);

export const importExpensesTable = pgTable("import_expenses", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id")
    .notNull()
    .references(() => importJobsTable.id, { onDelete: "cascade" }),
  expenseType: importExpenseTypeEnum("expense_type").notNull(),
  vendorName: varchar("vendor_name", { length: 255 }).notNull(),
  billNumber: varchar("bill_number", { length: 100 }),
  billDate: varchar("bill_date", { length: 20 }),
  currency: varchar("currency", { length: 10 }).notNull().default("INR"),
  amountForeign: numeric("amount_foreign", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  exchangeRate: numeric("exchange_rate", { precision: 12, scale: 4 })
    .notNull()
    .default("1.0000"),
  amountInr: numeric("amount_inr", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  gstAmount: numeric("gst_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  allocationMethod: allocationMethodEnum("allocation_method")
    .notNull()
    .default("cbm"),
  isAllocatable: boolean("is_allocatable").notNull().default(true),
  paymentStatus: varchar("payment_status", { length: 20 })
    .notNull()
    .default("unpaid"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const importCostAllocationsTable = pgTable("import_cost_allocations", {
  id: serial("id").primaryKey(),
  importJobId: integer("import_job_id")
    .notNull()
    .references(() => importJobsTable.id, { onDelete: "cascade" }),
  importExpenseId: integer("import_expense_id")
    .notNull()
    .references(() => importExpensesTable.id, { onDelete: "cascade" }),
  importJobItemId: integer("import_job_item_id")
    .notNull()
    .references(() => importJobItemsTable.id, { onDelete: "cascade" }),
  allocatedAmountInr: numeric("allocated_amount_inr", {
    precision: 16,
    scale: 2,
  })
    .notNull()
    .default("0"),
  basis: varchar("basis", { length: 30 }),
  basisValue: numeric("basis_value", { precision: 16, scale: 4 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const importJobsRelations = relations(
  importJobsTable,
  ({ one, many }) => ({
    purchaseOrder: one(purchaseOrdersTable, {
      fields: [importJobsTable.purchaseOrderId],
      references: [purchaseOrdersTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [importJobsTable.createdById],
      references: [usersTable.id],
    }),
    items: many(importJobItemsTable),
    expenses: many(importExpensesTable),
    allocations: many(importCostAllocationsTable),
  }),
);

export const importJobItemsRelations = relations(
  importJobItemsTable,
  ({ one, many }) => ({
    importJob: one(importJobsTable, {
      fields: [importJobItemsTable.importJobId],
      references: [importJobsTable.id],
    }),
    inventoryItem: one(inventoryItemsTable, {
      fields: [importJobItemsTable.inventoryItemId],
      references: [inventoryItemsTable.id],
    }),
    allocations: many(importCostAllocationsTable),
  }),
);

export const importExpensesRelations = relations(
  importExpensesTable,
  ({ one, many }) => ({
    importJob: one(importJobsTable, {
      fields: [importExpensesTable.importJobId],
      references: [importJobsTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [importExpensesTable.createdById],
      references: [usersTable.id],
    }),
    allocations: many(importCostAllocationsTable),
  }),
);

export const importCostAllocationsRelations = relations(
  importCostAllocationsTable,
  ({ one }) => ({
    importJob: one(importJobsTable, {
      fields: [importCostAllocationsTable.importJobId],
      references: [importJobsTable.id],
    }),
    expense: one(importExpensesTable, {
      fields: [importCostAllocationsTable.importExpenseId],
      references: [importExpensesTable.id],
    }),
    item: one(importJobItemsTable, {
      fields: [importCostAllocationsTable.importJobItemId],
      references: [importJobItemsTable.id],
    }),
  }),
);

export type ImportJob = typeof importJobsTable.$inferSelect;
export type ImportJobItem = typeof importJobItemsTable.$inferSelect;
export type ImportExpense = typeof importExpensesTable.$inferSelect;
export type ImportCostAllocation =
  typeof importCostAllocationsTable.$inferSelect;
