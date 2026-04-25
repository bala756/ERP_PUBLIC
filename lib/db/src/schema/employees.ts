import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: varchar("employee_code", { length: 20 }).notNull().unique(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  designation: varchar("designation", { length: 255 }),
  department: varchar("department", { length: 100 }),
  dateOfJoining: varchar("date_of_joining", { length: 20 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  employmentType: varchar("employment_type", { length: 20 }).notNull().default("fullTime"),
  basicSalary: numeric("basic_salary", { precision: 12, scale: 2 }).notNull().default("0"),
  hra: numeric("hra", { precision: 12, scale: 2 }).notNull().default("0"),
  otherAllowances: numeric("other_allowances", { precision: 12, scale: 2 }).notNull().default("0"),
  workingDaysPerMonth: integer("working_days_per_month").notNull().default(26),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("present"),
  notes: text("notes"),
  markedById: integer("marked_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leaveRequestsTable = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveType: varchar("leave_type", { length: 20 }).notNull(),
  fromDate: varchar("from_date", { length: 10 }).notNull(),
  toDate: varchar("to_date", { length: 10 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  approvedById: integer("approved_by_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at"),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leaveBalancesTable = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  leaveType: varchar("leave_type", { length: 20 }).notNull(),
  year: integer("year").notNull(),
  totalDays: integer("total_days").notNull().default(0),
  usedDays: integer("used_days").notNull().default(0),
});

export const employeeRelations = relations(employeesTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [employeesTable.userId],
    references: [usersTable.id],
  }),
  attendanceRecords: many(attendanceRecordsTable),
  leaveRequests: many(leaveRequestsTable),
  leaveBalances: many(leaveBalancesTable),
}));

export const attendanceRecordRelations = relations(attendanceRecordsTable, ({ one }) => ({
  employee: one(employeesTable, {
    fields: [attendanceRecordsTable.employeeId],
    references: [employeesTable.id],
  }),
  markedBy: one(usersTable, {
    fields: [attendanceRecordsTable.markedById],
    references: [usersTable.id],
  }),
}));

export const leaveRequestRelations = relations(leaveRequestsTable, ({ one }) => ({
  employee: one(employeesTable, {
    fields: [leaveRequestsTable.employeeId],
    references: [employeesTable.id],
  }),
  approvedBy: one(usersTable, {
    fields: [leaveRequestsTable.approvedById],
    references: [usersTable.id],
  }),
}));

export const leaveBalanceRelations = relations(leaveBalancesTable, ({ one }) => ({
  employee: one(employeesTable, {
    fields: [leaveBalancesTable.employeeId],
    references: [employeesTable.id],
  }),
}));
