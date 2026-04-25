import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Department = typeof departmentsTable.$inferSelect;
export type InsertDepartment = typeof departmentsTable.$inferInsert;

export const DEPARTMENT_SEEDS = [
  { code: "director", name: "Director's Office" },
  { code: "sales", name: "Sales" },
  { code: "purchase", name: "Purchase" },
  { code: "accounts", name: "Accounts & Finance" },
  { code: "project_execution", name: "Project Execution" },
  { code: "production", name: "Production" },
  { code: "service", name: "Service" },
  { code: "general", name: "General" },
] as const;
