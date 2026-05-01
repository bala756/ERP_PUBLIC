import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { workOrdersTable, workOrderItemsTable, purchaseOrdersTable } from "./orders";
import { inventoryItemsTable } from "./inventory";
import { importJobsTable } from "./imports";

// ─── Purchase Requests ─────────────────────────────────────────────────────────

export const prStatusEnum = pgEnum("pr_status", [
  "proposed",
  "approved",
  "rejected",
  "cancelled",
]);

export const prBranchEnum = pgEnum("pr_branch", [
  "manufactured",
  "raw",
  "imported",
]);

export const prItemStatusEnum = pgEnum("pr_item_status", [
  "pending",
  "issuedFromStock",
  "convertedToPo",
  "convertedToImport",
  "cancelled",
]);

export const purchaseRequestsTable = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  prNumber: text("pr_number").notNull().unique(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  status: prStatusEnum("status").notNull().default("proposed"),
  notes: text("notes"),
  approvedById: integer("approved_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
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

export const purchaseRequestItemsTable = pgTable("purchase_request_items", {
  id: serial("id").primaryKey(),
  purchaseRequestId: integer("purchase_request_id")
    .notNull()
    .references(() => purchaseRequestsTable.id, { onDelete: "cascade" }),
  workOrderItemId: integer("work_order_item_id").references(
    () => workOrderItemsTable.id,
    { onDelete: "set null" },
  ),
  productId: integer("product_id").references(() => inventoryItemsTable.id, {
    onDelete: "set null",
  }),
  branch: prBranchEnum("branch").notNull(),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 20 }),
  requiredQty: numeric("required_qty", { precision: 14, scale: 4 })
    .notNull()
    .default("0"),
  onHandQty: numeric("on_hand_qty", { precision: 14, scale: 4 })
    .notNull()
    .default("0"),
  shortfallQty: numeric("shortfall_qty", { precision: 14, scale: 4 })
    .notNull()
    .default("0"),
  estimatedUnitCost: numeric("estimated_unit_cost", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  status: prItemStatusEnum("status").notNull().default("pending"),
  purchaseOrderId: integer("purchase_order_id").references(
    () => purchaseOrdersTable.id,
    { onDelete: "set null" },
  ),
  importJobId: integer("import_job_id").references(() => importJobsTable.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
});

// ─── Formal Stock Movements (cost-stamped) ────────────────────────────────────

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "in",
  "out",
]);

export const stockMovementSourceEnum = pgEnum("stock_movement_source", [
  "purchaseOrder",
  "importJob",
  "subcontractIn",
  "production",
  "manual",
  "workOrderIssue",
  "subcontractIssue",
  "openingBalance",
]);

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id),
  movementType: stockMovementTypeEnum("movement_type").notNull(),
  qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  totalCost: numeric("total_cost", { precision: 16, scale: 2 })
    .notNull()
    .default("0"),
  sourceType: stockMovementSourceEnum("source_type").notNull(),
  sourceId: integer("source_id"),
  sourceNumber: varchar("source_number", { length: 100 }),
  workOrderId: integer("work_order_id").references(() => workOrdersTable.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Subcontract Jobs ──────────────────────────────────────────────────────────

export const subcontractJobStatusEnum = pgEnum("subcontract_job_status", [
  "sentOut",
  "received",
  "cancelled",
]);

export const subcontractJobsTable = pgTable("subcontract_jobs", {
  id: serial("id").primaryKey(),
  jobNumber: text("job_number").notNull().unique(),
  workOrderId: integer("work_order_id").references(() => workOrdersTable.id, {
    onDelete: "set null",
  }),
  vendorName: text("vendor_name").notNull(),
  vendorContact: text("vendor_contact"),
  status: subcontractJobStatusEnum("status").notNull().default("sentOut"),
  totalVendorCost: numeric("total_vendor_cost", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  notes: text("notes"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
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

export const subcontractJobItemsTable = pgTable("subcontract_job_items", {
  id: serial("id").primaryKey(),
  subcontractJobId: integer("subcontract_job_id")
    .notNull()
    .references(() => subcontractJobsTable.id, { onDelete: "cascade" }),
  rawItemId: integer("raw_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id),
  sentQty: numeric("sent_qty", { precision: 14, scale: 4 }).notNull(),
  sentUnitCost: numeric("sent_unit_cost", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  finishedItemId: integer("finished_item_id").references(
    () => inventoryItemsTable.id,
  ),
  receivedQty: numeric("received_qty", { precision: 14, scale: 4 })
    .notNull()
    .default("0"),
  scrapQty: numeric("scrap_qty", { precision: 14, scale: 4 })
    .notNull()
    .default("0"),
  vendorChargePerUnit: numeric("vendor_charge_per_unit", {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default("0"),
  computedUnitCost: numeric("computed_unit_cost", {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default("0"),
  notes: text("notes"),
});

// ─── Relations ─────────────────────────────────────────────────────────────────

export const purchaseRequestsRelations = relations(
  purchaseRequestsTable,
  ({ one, many }) => ({
    workOrder: one(workOrdersTable, {
      fields: [purchaseRequestsTable.workOrderId],
      references: [workOrdersTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [purchaseRequestsTable.createdById],
      references: [usersTable.id],
    }),
    approvedBy: one(usersTable, {
      fields: [purchaseRequestsTable.approvedById],
      references: [usersTable.id],
    }),
    items: many(purchaseRequestItemsTable),
  }),
);

export const purchaseRequestItemsRelations = relations(
  purchaseRequestItemsTable,
  ({ one }) => ({
    purchaseRequest: one(purchaseRequestsTable, {
      fields: [purchaseRequestItemsTable.purchaseRequestId],
      references: [purchaseRequestsTable.id],
    }),
    workOrderItem: one(workOrderItemsTable, {
      fields: [purchaseRequestItemsTable.workOrderItemId],
      references: [workOrderItemsTable.id],
    }),
    product: one(inventoryItemsTable, {
      fields: [purchaseRequestItemsTable.productId],
      references: [inventoryItemsTable.id],
    }),
    purchaseOrder: one(purchaseOrdersTable, {
      fields: [purchaseRequestItemsTable.purchaseOrderId],
      references: [purchaseOrdersTable.id],
    }),
    importJob: one(importJobsTable, {
      fields: [purchaseRequestItemsTable.importJobId],
      references: [importJobsTable.id],
    }),
  }),
);

export const stockMovementsRelations = relations(
  stockMovementsTable,
  ({ one }) => ({
    item: one(inventoryItemsTable, {
      fields: [stockMovementsTable.itemId],
      references: [inventoryItemsTable.id],
    }),
    workOrder: one(workOrdersTable, {
      fields: [stockMovementsTable.workOrderId],
      references: [workOrdersTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [stockMovementsTable.createdById],
      references: [usersTable.id],
    }),
  }),
);

export const subcontractJobsRelations = relations(
  subcontractJobsTable,
  ({ one, many }) => ({
    workOrder: one(workOrdersTable, {
      fields: [subcontractJobsTable.workOrderId],
      references: [workOrdersTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [subcontractJobsTable.createdById],
      references: [usersTable.id],
    }),
    items: many(subcontractJobItemsTable),
  }),
);

export const subcontractJobItemsRelations = relations(
  subcontractJobItemsTable,
  ({ one }) => ({
    job: one(subcontractJobsTable, {
      fields: [subcontractJobItemsTable.subcontractJobId],
      references: [subcontractJobsTable.id],
    }),
    rawItem: one(inventoryItemsTable, {
      fields: [subcontractJobItemsTable.rawItemId],
      references: [inventoryItemsTable.id],
    }),
    finishedItem: one(inventoryItemsTable, {
      fields: [subcontractJobItemsTable.finishedItemId],
      references: [inventoryItemsTable.id],
    }),
  }),
);

export type PurchaseRequest = typeof purchaseRequestsTable.$inferSelect;
export type PurchaseRequestItem =
  typeof purchaseRequestItemsTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
export type SubcontractJob = typeof subcontractJobsTable.$inferSelect;
export type SubcontractJobItem = typeof subcontractJobItemsTable.$inferSelect;
