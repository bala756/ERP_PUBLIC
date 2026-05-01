import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  numeric,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { proposalsTable } from "./leads";

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "draft",
  "inProgress",
  "pendingApproval",
  "delivered",
  "cancelled",
]);

export const workflowTypeEnum = pgEnum("workflow_type", [
  "imported",
  "manufacturing",
]);

export const workOrderItemStepEnum = pgEnum("wo_item_step", [
  "pending",
  "productionRequest",
  "poCreated",
  "poApproved",
  "rawMaterialIn",
  "inProduction",
  "finishedGoodsIn",
  "stockIn",
  "dispatched",
  "delivered",
  "invoiced",
]);

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "pendingApproval",
  "approved",
  "received",
  "cancelled",
]);

export const poTypeEnum = pgEnum("po_type", ["imported", "rawMaterial"]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "scheduled",
  "dispatched",
  "delivered",
]);

export const workOrdersTable = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  woNumber: text("wo_number").notNull().unique(),
  proposalId: integer("proposal_id").references(() => proposalsTable.id, {
    onDelete: "set null",
  }),
  customerName: text("customer_name").notNull(),
  company: text("company"),
  customerGstin: varchar("customer_gstin", { length: 32 }),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  contactPhone: varchar("contact_phone", { length: 32 }),
  contactEmail: varchar("contact_email", { length: 128 }),
  dispatchDate: text("dispatch_date"),
  warrantyPeriodMonths: integer("warranty_period_months"),
  total: text("total").notNull().default("0"),
  status: workOrderStatusEnum("status").notNull().default("draft"),
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

export const workOrderServiceEntriesTable = pgTable(
  "work_order_service_entries",
  {
    id: serial("id").primaryKey(),
    workOrderId: integer("work_order_id")
      .notNull()
      .references(() => workOrdersTable.id, { onDelete: "cascade" }),
    entryDate: text("entry_date").notNull(),
    technicianName: text("technician_name").notNull(),
    description: text("description").notNull(),
    createdById: integer("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const workOrderItemsTable = pgTable("work_order_items", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  productCode: varchar("product_code", { length: 64 }),
  productImageUrl: text("product_image_url"),
  hsnCode: varchar("hsn_code", { length: 16 }),
  unit: varchar("unit", { length: 16 }),
  description: text("description").notNull(),
  qty: text("qty").notNull().default("1"),
  unitPrice: text("unit_price").notNull().default("0"),
  workflowType: workflowTypeEnum("workflow_type"),
  currentStep: workOrderItemStepEnum("current_step")
    .notNull()
    .default("pending"),
  productionRequestNote: text("production_request_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  workOrderItemId: integer("work_order_item_id").references(
    () => workOrderItemsTable.id,
    { onDelete: "set null" },
  ),
  supplierName: text("supplier_name").notNull(),
  supplierContact: text("supplier_contact"),
  type: poTypeEnum("type").notNull().default("imported"),
  quotedAmount: text("quoted_amount").notNull().default("0"),
  poAmount: text("po_amount").notNull().default("0"),
  status: poStatusEnum("status").notNull().default("draft"),
  requiresCfoApproval: boolean("requires_cfo_approval")
    .notNull()
    .default(false),
  approvedById: integer("approved_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionNote: text("rejection_note"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
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

export const poLineItemsTable = pgTable("po_line_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id")
    .notNull()
    .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  productCode: text("product_code"),
  productImageUrl: text("product_image_url"),
  hsnCode: varchar("hsn_code", { length: 20 }),
  unit: varchar("unit", { length: 20 }),
  description: text("description").notNull(),
  qty: text("qty").notNull().default("1"),
  unitPrice: text("unit_price").notNull().default("0"),
  gstRate: text("gst_rate").notNull().default("18"),
});

export const subcontractRecordsTable = pgTable("subcontract_records", {
  id: serial("id").primaryKey(),
  workOrderItemId: integer("work_order_item_id")
    .notNull()
    .references(() => workOrderItemsTable.id, { onDelete: "cascade" }),
  vendorName: text("vendor_name").notNull(),
  vendorContact: text("vendor_contact"),
  cost: text("cost").notNull().default("0"),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const deliveryRecordsTable = pgTable("delivery_records", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id")
    .notNull()
    .references(() => workOrdersTable.id, { onDelete: "cascade" }),
  expectedDate: text("expected_date"),
  actualDispatchDate: text("actual_dispatch_date"),
  transporter: text("transporter"),
  trackingNumber: text("tracking_number"),
  status: deliveryStatusEnum("status").notNull().default("scheduled"),
  invoiceGenerated: boolean("invoice_generated").notNull().default(false),
  invoiceNumber: text("invoice_number"),
  invoiceGeneratedAt: timestamp("invoice_generated_at", {
    withTimezone: true,
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const workOrdersRelations = relations(
  workOrdersTable,
  ({ one, many }) => ({
    proposal: one(proposalsTable, {
      fields: [workOrdersTable.proposalId],
      references: [proposalsTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [workOrdersTable.createdById],
      references: [usersTable.id],
    }),
    items: many(workOrderItemsTable),
    purchaseOrders: many(purchaseOrdersTable),
    deliveries: many(deliveryRecordsTable),
    serviceEntries: many(workOrderServiceEntriesTable),
  }),
);

export const workOrderServiceEntriesRelations = relations(
  workOrderServiceEntriesTable,
  ({ one }) => ({
    workOrder: one(workOrdersTable, {
      fields: [workOrderServiceEntriesTable.workOrderId],
      references: [workOrdersTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [workOrderServiceEntriesTable.createdById],
      references: [usersTable.id],
    }),
  }),
);

export const workOrderItemsRelations = relations(
  workOrderItemsTable,
  ({ one, many }) => ({
    workOrder: one(workOrdersTable, {
      fields: [workOrderItemsTable.workOrderId],
      references: [workOrdersTable.id],
    }),
    purchaseOrders: many(purchaseOrdersTable),
    subcontracts: many(subcontractRecordsTable),
  }),
);

export const purchaseOrdersRelations = relations(
  purchaseOrdersTable,
  ({ one, many }) => ({
    workOrder: one(workOrdersTable, {
      fields: [purchaseOrdersTable.workOrderId],
      references: [workOrdersTable.id],
    }),
    workOrderItem: one(workOrderItemsTable, {
      fields: [purchaseOrdersTable.workOrderItemId],
      references: [workOrderItemsTable.id],
    }),
    approvedBy: one(usersTable, {
      fields: [purchaseOrdersTable.approvedById],
      references: [usersTable.id],
    }),
    createdBy: one(usersTable, {
      fields: [purchaseOrdersTable.createdById],
      references: [usersTable.id],
    }),
    lineItems: many(poLineItemsTable),
  }),
);

export const poLineItemsRelations = relations(poLineItemsTable, ({ one }) => ({
  purchaseOrder: one(purchaseOrdersTable, {
    fields: [poLineItemsTable.purchaseOrderId],
    references: [purchaseOrdersTable.id],
  }),
}));

export const subcontractRelations = relations(
  subcontractRecordsTable,
  ({ one }) => ({
    workOrderItem: one(workOrderItemsTable, {
      fields: [subcontractRecordsTable.workOrderItemId],
      references: [workOrderItemsTable.id],
    }),
  }),
);

export const deliveryRelations = relations(
  deliveryRecordsTable,
  ({ one }) => ({
    workOrder: one(workOrdersTable, {
      fields: [deliveryRecordsTable.workOrderId],
      references: [workOrdersTable.id],
    }),
  }),
);

export type WorkOrder = typeof workOrdersTable.$inferSelect;
export type WorkOrderServiceEntry = typeof workOrderServiceEntriesTable.$inferSelect;
export type WorkOrderItem = typeof workOrderItemsTable.$inferSelect;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PoLineItem = typeof poLineItemsTable.$inferSelect;
export type SubcontractRecord = typeof subcontractRecordsTable.$inferSelect;
export type DeliveryRecord = typeof deliveryRecordsTable.$inferSelect;
