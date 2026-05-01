import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { leadsTable } from "./leads";

export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "created",
  "statusChanged",
  "assignmentChanged",
  "followup",
  "noteAdded",
  "indiaMartSync",
  "fieldEdited",
]);

export type LeadActivityType =
  (typeof leadActivityTypeEnum.enumValues)[number];

export const leadActivitiesTable = pgTable(
  "lead_activities",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    type: leadActivityTypeEnum("type").notNull(),
    actorUserId: integer("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    leadIdx: index("lead_activities_lead_idx").on(t.leadId),
    createdIdx: index("lead_activities_created_idx").on(t.createdAt),
  }),
);

export const leadActivitiesRelations = relations(
  leadActivitiesTable,
  ({ one }) => ({
    lead: one(leadsTable, {
      fields: [leadActivitiesTable.leadId],
      references: [leadsTable.id],
    }),
    actor: one(usersTable, {
      fields: [leadActivitiesTable.actorUserId],
      references: [usersTable.id],
    }),
  }),
);

export type LeadActivity = typeof leadActivitiesTable.$inferSelect;
export type InsertLeadActivity = typeof leadActivitiesTable.$inferInsert;

export const leadRoutingRulesTable = pgTable(
  "lead_routing_rules",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    salespersonId: integer("salesperson_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    states: jsonb("states").notNull().default([]),
    productKeywords: jsonb("product_keywords").notNull().default([]),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    salesIdx: index("lead_routing_rules_sales_idx").on(t.salespersonId),
    priorityIdx: index("lead_routing_rules_priority_idx").on(t.priority),
  }),
);

export const leadRoutingRulesRelations = relations(
  leadRoutingRulesTable,
  ({ one }) => ({
    salesperson: one(usersTable, {
      fields: [leadRoutingRulesTable.salespersonId],
      references: [usersTable.id],
    }),
  }),
);

export type LeadRoutingRule = typeof leadRoutingRulesTable.$inferSelect;
export type InsertLeadRoutingRule = typeof leadRoutingRulesTable.$inferInsert;

export const integrationSettingsTable = pgTable("integration_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: integer("updated_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
});

export type IntegrationSetting = typeof integrationSettingsTable.$inferSelect;
export type InsertIntegrationSetting =
  typeof integrationSettingsTable.$inferInsert;
