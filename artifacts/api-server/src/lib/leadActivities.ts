import {
  db,
  leadActivitiesTable,
  type LeadActivityType,
} from "@workspace/db";

export interface LogActivityParams {
  leadId: number;
  type: LeadActivityType;
  actorUserId?: number | null;
  payload?: Record<string, unknown>;
}

export async function logLeadActivity(
  params: LogActivityParams,
): Promise<void> {
  const { leadId, type, actorUserId, payload } = params;
  await db.insert(leadActivitiesTable).values({
    leadId,
    type,
    actorUserId: actorUserId ?? null,
    payload: (payload ?? {}) as unknown as object,
  });
}

export function diffLead(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    if (before[f] !== after[f]) {
      diff[f] = { from: before[f], to: after[f] };
    }
  }
  return diff;
}
