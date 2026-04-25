import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { departmentsTable } from "./departments";

export const roleEnum = pgEnum("role", [
  "admin",
  "director",
  "cfo",
  "manager",
  "accounts",
  "purchase",
  "sales",
  "stores",
  "production",
  "service",
  "staff",
]);

export const departmentCodeEnum = pgEnum("department", [
  "director",
  "sales",
  "purchase",
  "accounts",
  "project_execution",
  "production",
  "service",
  "general",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type DepartmentCode = (typeof departmentCodeEnum.enumValues)[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("staff"),
  department: departmentCodeEnum("department").notNull().default("general"),
  departmentId: integer("department_id").references(() => departmentsTable.id, {
    onDelete: "set null",
  }),
  phone: text("phone"),
  designation: text("designation"),
  dateOfJoining: text("date_of_joining"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(usersTable, ({ one }) => ({
  departmentRecord: one(departmentsTable, {
    fields: [usersTable.departmentId],
    references: [departmentsTable.id],
  }),
}));

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
