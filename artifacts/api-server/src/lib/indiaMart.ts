import {
  db,
  integrationSettingsTable,
  leadActivitiesTable,
  leadsTable,
  type Lead,
} from "@workspace/db";
import { and, desc, eq, or, gte } from "drizzle-orm";
import { logger } from "./logger";
import { autoAssignLead } from "./leadRouting";
import { logLeadActivity } from "./leadActivities";

const INDIA_MART_KEY = "indiaMart";

const INDIA_MART_ENDPOINT =
  "https://mapi.indiamart.com/wservce/crm/crmListing/v2/";

export interface IndiaMartSettings {
  enabled: boolean;
  intervalMinutes: number;
  hasKey: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "failure" | null;
  lastSyncMessage: string | null;
  lastSyncCount: number | null;
  totalImported: number;
  dedupeWindowDays: number;
}

const DEFAULT_SETTINGS: IndiaMartSettings = {
  enabled: false,
  intervalMinutes: 60,
  hasKey: false,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncMessage: null,
  lastSyncCount: null,
  totalImported: 0,
  dedupeWindowDays: 60,
};

interface InternalSettings extends IndiaMartSettings {
  apiKey: string | null;
}

interface StoredSettings {
  enabled?: boolean;
  intervalMinutes?: number;
  lastSyncAt?: string | null;
  lastSyncStatus?: "success" | "failure" | null;
  lastSyncMessage?: string | null;
  lastSyncCount?: number | null;
  totalImported?: number;
  dedupeWindowDays?: number;
}

function getApiKeyFromEnv(): string | null {
  const k = process.env.INDIAMART_API_KEY;
  return k && k.trim() !== "" ? k.trim() : null;
}

async function loadInternalSettings(): Promise<InternalSettings> {
  const [row] = await db
    .select()
    .from(integrationSettingsTable)
    .where(eq(integrationSettingsTable.key, INDIA_MART_KEY));
  const value = (row?.value as StoredSettings | null) ?? {};
  const apiKey = getApiKeyFromEnv();
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    apiKey,
    hasKey: Boolean(apiKey),
  };
}

export async function getIndiaMartSettings(): Promise<IndiaMartSettings> {
  const s = await loadInternalSettings();
  return {
    enabled: s.enabled,
    intervalMinutes: s.intervalMinutes,
    hasKey: s.hasKey,
    lastSyncAt: s.lastSyncAt,
    lastSyncStatus: s.lastSyncStatus,
    lastSyncMessage: s.lastSyncMessage,
    lastSyncCount: s.lastSyncCount,
    totalImported: s.totalImported,
    dedupeWindowDays: s.dedupeWindowDays,
  };
}

export interface UpdateIndiaMartSettings {
  enabled?: boolean;
  intervalMinutes?: number;
  dedupeWindowDays?: number;
}

export async function updateIndiaMartSettings(
  patch: UpdateIndiaMartSettings,
  actorUserId: number,
): Promise<IndiaMartSettings> {
  const current = await loadInternalSettings();
  const next: InternalSettings = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    intervalMinutes: patch.intervalMinutes ?? current.intervalMinutes,
    dedupeWindowDays: patch.dedupeWindowDays ?? current.dedupeWindowDays,
  };

  const stored: StoredSettings = {
    enabled: next.enabled,
    intervalMinutes: next.intervalMinutes,
    lastSyncAt: next.lastSyncAt,
    lastSyncStatus: next.lastSyncStatus,
    lastSyncMessage: next.lastSyncMessage,
    lastSyncCount: next.lastSyncCount,
    totalImported: next.totalImported,
    dedupeWindowDays: next.dedupeWindowDays,
  };

  await db
    .insert(integrationSettingsTable)
    .values({
      key: INDIA_MART_KEY,
      value: stored,
      updatedBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: integrationSettingsTable.key,
      set: { value: stored, updatedBy: actorUserId },
    });

  return {
    enabled: next.enabled,
    intervalMinutes: next.intervalMinutes,
    hasKey: next.hasKey,
    lastSyncAt: next.lastSyncAt,
    lastSyncStatus: next.lastSyncStatus,
    lastSyncMessage: next.lastSyncMessage,
    lastSyncCount: next.lastSyncCount,
    totalImported: next.totalImported,
    dedupeWindowDays: next.dedupeWindowDays,
  };
}

async function recordSyncResult(
  result: {
    status: "success" | "failure";
    message: string;
    importedCount: number;
  },
): Promise<void> {
  const current = await loadInternalSettings();
  const stored: StoredSettings = {
    enabled: current.enabled,
    intervalMinutes: current.intervalMinutes,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: result.status,
    lastSyncMessage: result.message,
    lastSyncCount: result.importedCount,
    totalImported: current.totalImported + result.importedCount,
    dedupeWindowDays: current.dedupeWindowDays,
  };
  await db
    .insert(integrationSettingsTable)
    .values({
      key: INDIA_MART_KEY,
      value: stored,
    })
    .onConflictDoUpdate({
      target: integrationSettingsTable.key,
      set: { value: stored },
    });
}

interface IndiaMartLeadRaw {
  UNIQUE_QUERY_ID?: string;
  QUERY_TIME?: string;
  SENDER_NAME?: string;
  SENDER_MOBILE?: string;
  SENDER_EMAIL?: string;
  SENDER_COMPANY?: string;
  SENDER_ADDRESS?: string;
  SENDER_CITY?: string;
  SENDER_STATE?: string;
  SENDER_PINCODE?: string;
  QUERY_PRODUCT_NAME?: string;
  QUERY_MESSAGE?: string;
  SUBJECT?: string;
}

interface IndiaMartResponse {
  CODE?: number;
  STATUS?: string;
  MESSAGE?: string;
  TOTAL_RECORDS?: number;
  RESPONSE?: IndiaMartLeadRaw[];
}

function buildEndpointUrl(apiKey: string, dedupeWindowDays: number): string {
  const end = new Date();
  const start = new Date(
    end.getTime() - Math.max(1, dedupeWindowDays) * 24 * 60 * 60 * 1000,
  );
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day}%20${hh}:${mm}:${ss}`;
  };
  return `${INDIA_MART_ENDPOINT}?glusr_crm_key=${encodeURIComponent(apiKey)}&start_time=${fmt(start)}&end_time=${fmt(end)}`;
}

async function findExistingLead(
  phone: string | null,
  email: string | null,
  uniqueQueryId: string | null,
  dedupeWindowDays: number,
): Promise<Lead | null> {
  const cutoff = new Date(
    Date.now() - Math.max(1, dedupeWindowDays) * 24 * 60 * 60 * 1000,
  );

  // 1) Strongest dedupe: previously imported with same UNIQUE_QUERY_ID
  if (uniqueQueryId) {
    const recent = await db
      .select()
      .from(leadActivitiesTable)
      .where(eq(leadActivitiesTable.type, "created"))
      .orderBy(desc(leadActivitiesTable.createdAt))
      .limit(2000);
    const hit = recent.find(
      (a) => (a.payload as { uniqueQueryId?: string } | null)?.uniqueQueryId === uniqueQueryId,
    );
    if (hit) {
      const [lead] = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.id, hit.leadId));
      if (lead) return lead;
    }
  }

  const conds = [];
  if (phone) conds.push(eq(leadsTable.phone, phone));
  if (email) conds.push(eq(leadsTable.email, email));
  if (conds.length === 0) return null;
  const [row] = await db
    .select()
    .from(leadsTable)
    .where(and(or(...conds), gte(leadsTable.createdAt, cutoff)))
    .limit(1);
  return row ?? null;
}

export interface SyncResult {
  status: "success" | "failure";
  message: string;
  fetched: number;
  imported: number;
  skipped: number;
  errors: number;
}

let syncInFlight: Promise<SyncResult> | null = null;

export async function syncIndiaMartLeads(
  actorUserId: number | null,
): Promise<SyncResult> {
  if (syncInFlight) {
    logger.info("IndiaMart sync requested while another is in-flight; reusing");
    return syncInFlight;
  }
  syncInFlight = doSyncIndiaMartLeads(actorUserId).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSyncIndiaMartLeads(
  actorUserId: number | null,
): Promise<SyncResult> {
  const settings = await loadInternalSettings();
  if (!settings.apiKey) {
    const r: SyncResult = {
      status: "failure",
      message: "IndiaMart API key not configured",
      fetched: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
    };
    await recordSyncResult({
      status: "failure",
      message: r.message,
      importedCount: 0,
    });
    return r;
  }

  const url = buildEndpointUrl(settings.apiKey, settings.dedupeWindowDays);

  let raw: IndiaMartResponse;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    raw = (await res.json()) as IndiaMartResponse;
  } catch (err) {
    const msg = `IndiaMart API call failed: ${(err as Error).message}`;
    logger.error({ err }, msg);
    await recordSyncResult({
      status: "failure",
      message: msg,
      importedCount: 0,
    });
    return {
      status: "failure",
      message: msg,
      fetched: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
    };
  }

  const records = raw.RESPONSE ?? [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of records) {
    try {
      const phone = r.SENDER_MOBILE?.toString().trim() || null;
      const email = r.SENDER_EMAIL?.toString().trim().toLowerCase() || null;
      const existing = await findExistingLead(
        phone,
        email,
        r.UNIQUE_QUERY_ID ?? null,
        settings.dedupeWindowDays,
      );
      if (existing) {
        skipped += 1;
        continue;
      }

      const productInterest = [r.QUERY_PRODUCT_NAME, r.SUBJECT]
        .filter(Boolean)
        .join(" - ");

      const leadData = {
        customerName: r.SENDER_NAME?.trim() || "IndiaMart Lead",
        company: r.SENDER_COMPANY?.trim() || null,
        phone,
        email,
        billingAddress: r.SENDER_ADDRESS?.trim() || null,
        state: r.SENDER_STATE?.trim() || null,
        city: r.SENDER_CITY?.trim() || null,
        productInterest: productInterest || null,
        notes: r.QUERY_MESSAGE?.trim() || null,
        source: "indiaMart" as const,
      };

      const match = await autoAssignLead({
        state: leadData.state,
        productInterest: leadData.productInterest,
        billingAddress: leadData.billingAddress,
        notes: leadData.notes,
      });

      const [inserted] = await db
        .insert(leadsTable)
        .values({
          ...leadData,
          assignedToId: match?.salespersonId ?? null,
        })
        .returning();

      await logLeadActivity({
        leadId: inserted.id,
        type: "created",
        actorUserId: null,
        payload: {
          source: "indiaMart",
          uniqueQueryId: r.UNIQUE_QUERY_ID,
          queryTime: r.QUERY_TIME,
        },
      });

      await logLeadActivity({
        leadId: inserted.id,
        type: "indiaMartSync",
        actorUserId: null,
        payload: {
          uniqueQueryId: r.UNIQUE_QUERY_ID,
          queryTime: r.QUERY_TIME,
          productName: r.QUERY_PRODUCT_NAME,
          batchActor: actorUserId,
        },
      });

      if (match) {
        await logLeadActivity({
          leadId: inserted.id,
          type: "assignmentChanged",
          actorUserId: null,
          payload: {
            auto: true,
            ruleId: match.ruleId,
            ruleName: match.ruleName,
            salespersonId: match.salespersonId,
            matchedState: match.matchedState,
            matchedKeyword: match.matchedKeyword,
          },
        });
      }

      imported += 1;
    } catch (err) {
      logger.error({ err }, "Failed to import IndiaMart lead");
      errors += 1;
    }
  }

  const message = `Fetched ${records.length}, imported ${imported}, skipped ${skipped}, errors ${errors}`;
  await recordSyncResult({
    status: errors > 0 && imported === 0 ? "failure" : "success",
    message,
    importedCount: imported,
  });

  logger.info(
    { fetched: records.length, imported, skipped, errors, actorUserId },
    "IndiaMart sync completed",
  );

  return {
    status: errors > 0 && imported === 0 ? "failure" : "success",
    message,
    fetched: records.length,
    imported,
    skipped,
    errors,
  };
}

let pollerHandle: NodeJS.Timeout | null = null;
let lastIntervalMs = 0;

export function startIndiaMartPoller(): void {
  const tick = async () => {
    try {
      const settings = await loadInternalSettings();
      const desiredMs = Math.max(5, settings.intervalMinutes) * 60 * 1000;
      if (desiredMs !== lastIntervalMs) {
        lastIntervalMs = desiredMs;
        if (pollerHandle) clearInterval(pollerHandle);
        pollerHandle = setInterval(tick, desiredMs);
        logger.info(
          { intervalMinutes: settings.intervalMinutes },
          "IndiaMart poller interval updated",
        );
      }
      if (!settings.enabled || !settings.apiKey) return;
      const lastTs = settings.lastSyncAt
        ? new Date(settings.lastSyncAt).getTime()
        : 0;
      if (Date.now() - lastTs < desiredMs - 1000) return;
      logger.info("Running scheduled IndiaMart sync");
      await syncIndiaMartLeads(null);
    } catch (err) {
      logger.error({ err }, "IndiaMart poller tick failed");
    }
  };

  // Quick first tick after 30 s to register interval.
  setTimeout(tick, 30 * 1000);
  pollerHandle = setInterval(tick, 5 * 60 * 1000);
  lastIntervalMs = 5 * 60 * 1000;
  logger.info("IndiaMart poller started (5 min initial cadence)");
}
