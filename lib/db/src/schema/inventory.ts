import {
  pgTable,
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

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  itemCode: varchar("item_code", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("rawMaterial"),
  unit: varchar("unit", { length: 50 }).notNull().default("pcs"),
  hsnCode: varchar("hsn_code", { length: 20 }),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  reorderLevel: numeric("reorder_level", { precision: 10, scale: 2 }).notNull().default("0"),
  description: text("description"),
  longDescription: text("long_description"),
  imageUrl: text("image_url"),
  defaultSalePrice: numeric("default_sale_price", { precision: 14, scale: 2 }).notNull().default("0"),
  defaultPurchasePrice: numeric("default_purchase_price", { precision: 14, scale: 2 }).notNull().default("0"),
  bomTemplateId: integer("bom_template_id"),
  lengthM: numeric("length_m", { precision: 10, scale: 4 }).notNull().default("0"),
  widthM: numeric("width_m", { precision: 10, scale: 4 }).notNull().default("0"),
  heightM: numeric("height_m", { precision: 10, scale: 4 }).notNull().default("0"),
  unitCbm: numeric("unit_cbm", { precision: 14, scale: 6 }).notNull().default("0"),
  grossWeightKg: numeric("gross_weight_kg", { precision: 12, scale: 4 }).notNull().default("0"),
  netWeightKg: numeric("net_weight_kg", { precision: 12, scale: 4 }).notNull().default("0"),
  dutyPercent: numeric("duty_percent", { precision: 6, scale: 3 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const stockTransactionsTable = pgTable("stock_transactions", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id),
  type: varchar("type", { length: 10 }).notNull(),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  referenceNumber: varchar("reference_number", { length: 100 }),
  poNumber: varchar("po_number", { length: 100 }),
  supplierBillNumber: varchar("supplier_bill_number", { length: 100 }),
  dcNumber: varchar("dc_number", { length: 100 }),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bomTemplatesTable = pgTable("bom_templates", {
  id: serial("id").primaryKey(),
  finishedItemId: integer("finished_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bomLineItemsTable = pgTable("bom_line_items", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id")
    .notNull()
    .references(() => bomTemplatesTable.id),
  rawMaterialItemId: integer("raw_material_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }),
  notes: text("notes"),
});

export const inventoryItemRelations = relations(inventoryItemsTable, ({ many }) => ({
  stockTransactions: many(stockTransactionsTable),
  bomTemplates: many(bomTemplatesTable),
}));

export const stockTransactionRelations = relations(stockTransactionsTable, ({ one }) => ({
  item: one(inventoryItemsTable, {
    fields: [stockTransactionsTable.itemId],
    references: [inventoryItemsTable.id],
  }),
  createdBy: one(usersTable, {
    fields: [stockTransactionsTable.createdById],
    references: [usersTable.id],
  }),
}));

export const bomTemplateRelations = relations(bomTemplatesTable, ({ one, many }) => ({
  finishedItem: one(inventoryItemsTable, {
    fields: [bomTemplatesTable.finishedItemId],
    references: [inventoryItemsTable.id],
  }),
  lineItems: many(bomLineItemsTable),
}));

export const bomLineItemRelations = relations(bomLineItemsTable, ({ one }) => ({
  bom: one(bomTemplatesTable, {
    fields: [bomLineItemsTable.bomId],
    references: [bomTemplatesTable.id],
  }),
  rawMaterial: one(inventoryItemsTable, {
    fields: [bomLineItemsTable.rawMaterialItemId],
    references: [inventoryItemsTable.id],
  }),
}));
