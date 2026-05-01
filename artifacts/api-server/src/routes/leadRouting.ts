import { Router } from "express";
import { z } from "zod";
import {
  db,
  leadActivitiesTable,
  leadRoutingRulesTable,
  leadsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { logLeadActivity } from "../lib/leadActivities";
import {
  getIndiaMartSettings,
  syncIndiaMartLeads,
  updateIndiaMartSettings,
} from "../lib/indiaMart";

const router = Router();

const ADMIN_ROLES = ["admin", "director", "cfo"] as const;
const VIEW_ROLES = [
  "sales",
  "manager",
  "director",
  "admin",
  "cfo",
] as const;
const SALES_ROLES = ["sales", "manager", "director", "admin", "cfo"] as const;

// ---------- Lead Activities ----------

router.get(
  "/leads/:id/activities",
  requireRole(...VIEW_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const rows = await db
      .select({
        activity: leadActivitiesTable,
        actor: { id: usersTable.id, name: usersTable.name },
      })
      .from(leadActivitiesTable)
      .leftJoin(
        usersTable,
        eq(leadActivitiesTable.actorUserId, usersTable.id),
      )
      .where(eq(leadActivitiesTable.leadId, id))
      .orderBy(desc(leadActivitiesTable.createdAt));
    res.json(
      rows.map((r) => ({
        id: r.activity.id,
        leadId: r.activity.leadId,
        type: r.activity.type,
        actorUserId: r.activity.actorUserId,
        actorName: r.actor?.name ?? null,
        payload: r.activity.payload ?? {},
        createdAt: r.activity.createdAt.toISOString(),
      })),
    );
  },
);

const followupSchema = z.object({
  note: z.string().min(1),
  nextFollowupAt: z.string().datetime().optional(),
});

router.post(
  "/leads/:id/followup",
  requireRole(...SALES_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = followupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(eq(leadsTable.id, id));
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    await db
      .update(leadsTable)
      .set({
        lastFollowupNote: parsed.data.note,
        lastFollowupAt: new Date(),
      })
      .where(eq(leadsTable.id, id));

    await logLeadActivity({
      leadId: id,
      type: "followup",
      actorUserId: req.session.userId,
      payload: {
        note: parsed.data.note,
        nextFollowupAt: parsed.data.nextFollowupAt ?? null,
      },
    });

    res.status(201).json({ success: true });
  },
);

// ---------- Lead Routing Rules ----------

const ruleStringArray = z.array(z.string().min(1)).default([]);

const createRuleSchema = z.object({
  name: z.string().min(1),
  salespersonId: z.number().int(),
  states: ruleStringArray,
  productKeywords: ruleStringArray,
  priority: z.number().int().min(0).default(100),
  isActive: z.boolean().default(true),
});

const updateRuleSchema = createRuleSchema.partial();

router.get(
  "/lead-routing-rules",
  requireRole(...ADMIN_ROLES),
  async (_req, res) => {
    const rows = await db
      .select({
        rule: leadRoutingRulesTable,
        salesperson: { id: usersTable.id, name: usersTable.name },
      })
      .from(leadRoutingRulesTable)
      .leftJoin(
        usersTable,
        eq(leadRoutingRulesTable.salespersonId, usersTable.id),
      )
      .orderBy(
        asc(leadRoutingRulesTable.priority),
        asc(leadRoutingRulesTable.id),
      );

    res.json(
      rows.map((r) => ({
        id: r.rule.id,
        name: r.rule.name,
        salespersonId: r.rule.salespersonId,
        salespersonName: r.salesperson?.name ?? null,
        states: r.rule.states ?? [],
        productKeywords: r.rule.productKeywords ?? [],
        priority: r.rule.priority,
        isActive: r.rule.isActive,
        createdAt: r.rule.createdAt.toISOString(),
        updatedAt: r.rule.updatedAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/lead-routing-rules",
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const parsed = createRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.salespersonId));
    if (!user) {
      res.status(400).json({ error: "Salesperson not found" });
      return;
    }
    const [rule] = await db
      .insert(leadRoutingRulesTable)
      .values({
        name: parsed.data.name,
        salespersonId: parsed.data.salespersonId,
        states: parsed.data.states,
        productKeywords: parsed.data.productKeywords,
        priority: parsed.data.priority,
        isActive: parsed.data.isActive,
      })
      .returning();
    req.log.info(
      {
        audit: "leadRoutingRule.created",
        actorUserId: req.session.userId,
        ruleId: rule.id,
        rule,
      },
      "Lead routing rule created",
    );
    res.status(201).json(rule);
  },
);

router.patch(
  "/lead-routing-rules/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = updateRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const [before] = await db
      .select()
      .from(leadRoutingRulesTable)
      .where(eq(leadRoutingRulesTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    const [updated] = await db
      .update(leadRoutingRulesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(leadRoutingRulesTable.id, id))
      .returning();
    req.log.info(
      {
        audit: "leadRoutingRule.updated",
        actorUserId: req.session.userId,
        ruleId: id,
        before,
        after: updated,
        changes: parsed.data,
      },
      "Lead routing rule updated",
    );
    res.json(updated);
  },
);

router.delete(
  "/lead-routing-rules/:id",
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [before] = await db
      .select()
      .from(leadRoutingRulesTable)
      .where(eq(leadRoutingRulesTable.id, id));
    const [deleted] = await db
      .delete(leadRoutingRulesTable)
      .where(eq(leadRoutingRulesTable.id, id))
      .returning({ id: leadRoutingRulesTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    req.log.info(
      {
        audit: "leadRoutingRule.deleted",
        actorUserId: req.session.userId,
        ruleId: id,
        before,
      },
      "Lead routing rule deleted",
    );
    res.json({ success: true });
  },
);

// ---------- Integration Settings (IndiaMart) ----------

const updateIndiaMartSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  dedupeWindowDays: z.number().int().min(1).max(365).optional(),
});

router.get(
  "/integration-settings/indiamart",
  requireRole(...ADMIN_ROLES),
  async (_req, res) => {
    const settings = await getIndiaMartSettings();
    res.json(settings);
  },
);

router.put(
  "/integration-settings/indiamart",
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const parsed = updateIndiaMartSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const updated = await updateIndiaMartSettings(
      parsed.data,
      req.session.userId!,
    );
    req.log.info(
      {
        audit: "integrationSettings.indiamart.updated",
        actorUserId: req.session.userId,
        changes: parsed.data,
      },
      "IndiaMart settings updated",
    );
    res.json(updated);
  },
);

router.post(
  "/integration-settings/indiamart/sync",
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    const result = await syncIndiaMartLeads(req.session.userId ?? null);
    req.log.info(
      {
        audit: "integrationSettings.indiamart.syncManual",
        actorUserId: req.session.userId,
        result,
      },
      "IndiaMart manual sync triggered",
    );
    if (result.status === "failure") {
      res.status(502).json(result);
      return;
    }
    res.json(result);
  },
);

// helper for /leads consumers — list of active salespeople for assignment dropdowns
router.get(
  "/lead-routing/salespeople",
  requireRole(...VIEW_ROLES),
  async (_req, res) => {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
        ),
      )
      .orderBy(asc(usersTable.name));
    const salesEligible = rows.filter((u) =>
      ["sales", "manager", "director", "admin"].includes(u.role),
    );
    res.json(salesEligible);
  },
);

export default router;
