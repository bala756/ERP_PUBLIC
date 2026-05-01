import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  GetAppSettingsResponse as AppSettings,
  UpdateAppSettingsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ADMIN_ROLES = ["admin"] as const;
const SETTINGS_ID = 1;

function scrubHtml(input: string | null | undefined): string | null {
  if (input == null) return null;
  let out = String(input);
  out = out.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  out = out.replace(/<\s*iframe[\s\S]*?<\s*\/\s*iframe\s*>/gi, "");
  out = out.replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/javascript\s*:/gi, "");
  return out;
}

function serialize(row: typeof appSettingsTable.$inferSelect) {
  return AppSettings.parse({
    id: row.id,
    companyName: row.companyName,
    companyAddress: row.companyAddress ?? null,
    companyGstin: row.companyGstin ?? null,
    companyPhone: row.companyPhone ?? null,
    companyEmail: row.companyEmail ?? null,
    companyWebsite: row.companyWebsite ?? null,
    companyLogoUrl: row.companyLogoUrl ?? null,
    proposalFooterNotes: row.proposalFooterNotes ?? null,
    proposalTermsAndConditions: row.proposalTermsAndConditions ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function getOrCreate() {
  const [existing] = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.id, SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(appSettingsTable)
    .values({ id: SETTINGS_ID, companyName: "BCA Entertainment Works" })
    .returning();
  return created;
}

router.get("/app-settings", requireAuth, async (_req, res) => {
  const row = await getOrCreate();
  res.json(serialize(row));
});

router.put(
  "/app-settings",
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const parsed = UpdateAppSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid request body", details: parsed.error.issues });
      return;
    }

    await getOrCreate();

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (data.companyName !== undefined) updateData.companyName = data.companyName;
    if (data.companyAddress !== undefined)
      updateData.companyAddress = data.companyAddress;
    if (data.companyGstin !== undefined)
      updateData.companyGstin = data.companyGstin;
    if (data.companyPhone !== undefined)
      updateData.companyPhone = data.companyPhone;
    if (data.companyEmail !== undefined)
      updateData.companyEmail = data.companyEmail;
    if (data.companyWebsite !== undefined)
      updateData.companyWebsite = data.companyWebsite;
    if (data.companyLogoUrl !== undefined)
      updateData.companyLogoUrl = data.companyLogoUrl;
    if (data.proposalFooterNotes !== undefined)
      updateData.proposalFooterNotes = data.proposalFooterNotes;
    if (data.proposalTermsAndConditions !== undefined)
      updateData.proposalTermsAndConditions = scrubHtml(data.proposalTermsAndConditions);

    const [updated] = await db
      .update(appSettingsTable)
      .set(updateData)
      .where(eq(appSettingsTable.id, SETTINGS_ID))
      .returning();

    req.log.info({ updatedFields: Object.keys(updateData) }, "App settings updated");
    res.json(serialize(updated));
  },
);

export default router;
