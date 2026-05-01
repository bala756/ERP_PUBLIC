import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("BCA Entertainment Works"),
  companyAddress: text("company_address"),
  companyGstin: text("company_gstin"),
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  companyWebsite: text("company_website"),
  companyLogoUrl: text("company_logo_url"),
  proposalFooterNotes: text("proposal_footer_notes"),
  proposalTermsAndConditions: text("proposal_terms_and_conditions"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
