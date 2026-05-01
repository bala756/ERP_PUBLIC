import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const leadSourceEnum = pgEnum("lead_source", [
  "indiaMart",
  "website",
  "referral",
  "direct",
  "other",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "proposalSent",
  "negotiating",
  "won",
  "lost",
  "onHold",
]);

export type LeadSource = (typeof leadSourceEnum.enumValues)[number];
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email"),
  gstNumber: text("gst_number"),
  billingAddress: text("billing_address"),
  deliveryAddress: text("delivery_address"),
  state: text("state"),
  city: text("city"),
  source: leadSourceEnum("source").notNull().default("other"),
  productInterest: text("product_interest"),
  notes: text("notes"),
  lastFollowupNote: text("last_followup_note"),
  lastFollowupAt: timestamp("last_followup_at", { withTimezone: true }),
  status: leadStatusEnum("status").notNull().default("new"),
  assignedToId: integer("assigned_to_id").references(() => usersTable.id, {
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

export const leadsRelations = relations(leadsTable, ({ one, many }) => ({
  assignedTo: one(usersTable, {
    fields: [leadsTable.assignedToId],
    references: [usersTable.id],
  }),
  proposals: many(proposalsTable),
}));

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "sent",
  "won",
  "onHold",
  "lost",
]);

export type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number];

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  proposalNumber: text("proposal_number").notNull().unique(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  salespersonId: integer("salesperson_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  lineItems: jsonb("line_items").notNull().default([]),
  discountPercent: text("discount_percent").notNull().default("0"),
  gstRate: text("gst_rate").notNull().default("18"),
  subtotal: text("subtotal").notNull().default("0"),
  discountAmount: text("discount_amount").notNull().default("0"),
  gstAmount: text("gst_amount").notNull().default("0"),
  total: text("total").notNull().default("0"),
  status: proposalStatusEnum("status").notNull().default("draft"),
  validUntil: text("valid_until"),
  notes: text("notes"),
  onHoldAt: timestamp("on_hold_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const proposalsRelations = relations(proposalsTable, ({ one }) => ({
  lead: one(leadsTable, {
    fields: [proposalsTable.leadId],
    references: [leadsTable.id],
  }),
  salesperson: one(usersTable, {
    fields: [proposalsTable.salespersonId],
    references: [usersTable.id],
  }),
}));

export const insertProposalSchema = createInsertSchema(proposalsTable).omit({
  id: true,
  proposalNumber: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposalsTable.$inferSelect;
