import { pgTable, text, json, timestamp } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
});

export type Session = typeof sessionsTable.$inferSelect;
