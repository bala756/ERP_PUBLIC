import { db, leadRoutingRulesTable, usersTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { logger } from "./logger";

export interface LeadInputForRouting {
  state?: string | null;
  productInterest?: string | null;
  billingAddress?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
}

export interface RuleMatch {
  ruleId: number;
  ruleName: string;
  salespersonId: number;
  matchedState: string | null;
  matchedKeyword: string | null;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function extractStateCandidates(lead: LeadInputForRouting): string[] {
  const out = new Set<string>();
  if (lead.state) out.add(normalize(lead.state));
  const haystacks = [
    lead.billingAddress,
    lead.deliveryAddress,
    lead.notes,
  ].filter(Boolean) as string[];
  for (const h of haystacks) {
    out.add(normalize(h));
  }
  return Array.from(out);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryMatch(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (haystack === needle) return true;
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:$|[^a-z0-9])`, "i");
  return re.test(haystack);
}

function stateMatches(stateText: string, ruleStates: string[]): string | null {
  if (ruleStates.length === 0) return null;
  for (const s of ruleStates) {
    const ns = normalize(s);
    if (!ns) continue;
    if (wordBoundaryMatch(stateText, ns)) return s;
  }
  return null;
}

function keywordMatches(
  productInterest: string,
  notes: string,
  keywords: string[],
): string | null {
  if (keywords.length === 0) return null;
  const haystack = `${productInterest} ${notes}`;
  for (const k of keywords) {
    const nk = normalize(k);
    if (!nk) continue;
    if (wordBoundaryMatch(haystack, nk)) return k;
  }
  return null;
}

export async function findMatchingRule(
  lead: LeadInputForRouting,
): Promise<RuleMatch | null> {
  const rules = await db
    .select({
      rule: leadRoutingRulesTable,
      user: { id: usersTable.id, isActive: usersTable.isActive },
    })
    .from(leadRoutingRulesTable)
    .innerJoin(
      usersTable,
      eq(leadRoutingRulesTable.salespersonId, usersTable.id),
    )
    .where(eq(leadRoutingRulesTable.isActive, true))
    .orderBy(asc(leadRoutingRulesTable.priority));

  const productInterest = normalize(lead.productInterest);
  const notes = normalize(lead.notes);
  const stateCandidates = extractStateCandidates(lead);

  for (const { rule, user } of rules) {
    if (!user.isActive) continue;
    const ruleStates = Array.isArray(rule.states)
      ? (rule.states as string[])
      : [];
    const ruleKeywords = Array.isArray(rule.productKeywords)
      ? (rule.productKeywords as string[])
      : [];

    let matchedState: string | null = null;
    if (ruleStates.length > 0) {
      for (const cand of stateCandidates) {
        const m = stateMatches(cand, ruleStates);
        if (m) {
          matchedState = m;
          break;
        }
      }
      if (!matchedState) continue;
    }

    let matchedKeyword: string | null = null;
    if (ruleKeywords.length > 0) {
      matchedKeyword = keywordMatches(productInterest, notes, ruleKeywords);
      if (!matchedKeyword) continue;
    }

    if (ruleStates.length === 0 && ruleKeywords.length === 0) continue;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      salespersonId: rule.salespersonId,
      matchedState,
      matchedKeyword,
    };
  }

  return null;
}

export async function autoAssignLead(
  lead: LeadInputForRouting,
): Promise<RuleMatch | null> {
  try {
    return await findMatchingRule(lead);
  } catch (err) {
    logger.error({ err }, "Auto-assign lookup failed");
    return null;
  }
}
