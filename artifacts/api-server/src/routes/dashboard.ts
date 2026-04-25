import { Router } from "express";
import {
  db,
  usersTable,
  leadsTable,
  proposalsTable,
  workOrdersTable,
  supplierBillsTable,
  gstInvoicesTable,
  inventoryItemsTable,
  stockTransactionsTable,
} from "@workspace/db";
import { eq, count, sql, and, lte } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const FINANCE_ROLES = ["accounts", "cfo", "director", "admin"] as const;
const MANAGER_ROLES = ["manager", "director", "admin", "cfo"] as const;

const dashboardRouter = Router();

dashboardRouter.get("/dashboard/summary", requireAuth, async (_req, res) => {
  const [total] = await db.select({ count: count() }).from(usersTable);
  const [active] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  const [totalLeadsRow] = await db.select({ count: count() }).from(leadsTable);

  const wonProposals = await db
    .select({ total: sql<string>`coalesce(sum(total::numeric), 0)` })
    .from(proposalsTable)
    .where(eq(proposalsTable.status, "won"));

  const monthlyRevenue = parseFloat(wonProposals[0]?.total ?? "0");

  const [openWORow] = await db
    .select({ count: count() })
    .from(workOrdersTable)
    .where(sql`${workOrdersTable.status} NOT IN ('delivered', 'cancelled')`);

  const [pendingApprovalsRow] = await db
    .select({ count: count() })
    .from(proposalsTable)
    .where(eq(proposalsTable.status, "draft"));

  const lowStockItems = await db.execute<{ cnt: string }>(sql`
    SELECT count(*) as cnt FROM inventory_items i
    WHERE i.is_active = true
      AND i.reorder_level::numeric > 0
      AND (
        SELECT COALESCE(SUM(CASE WHEN st.type = 'in' THEN st.qty::numeric ELSE -st.qty::numeric END), 0)
        FROM stock_transactions st WHERE st.item_id = i.id
      ) < i.reorder_level::numeric
  `);
  const lowStockCount = parseInt((lowStockItems.rows[0] as { cnt: string })?.cnt ?? "0", 10);

  res.json({
    totalUsers: total?.count ?? 0,
    activeUsers: active?.count ?? 0,
    totalLeads: totalLeadsRow?.count ?? 0,
    openWorkOrders: openWORow?.count ?? 0,
    pendingApprovals: pendingApprovalsRow?.count ?? 0,
    lowStockItems: lowStockCount,
    monthlyRevenue,
    openServiceOrders: 0,
  });
});

dashboardRouter.get("/dashboard/employee-performance", requireAuth, requireRole(...MANAGER_ROLES), async (_req, res) => {
  const salesRaw = await db.execute<{ dept: string; proposals: string; won: string }>(sql`
    SELECT
      u.department as dept,
      COUNT(DISTINCT p.id)::text as proposals,
      COUNT(DISTINCT CASE WHEN p.status = 'won' THEN p.id END)::text as won
    FROM users u
    LEFT JOIN proposals p ON p.salesperson_id = u.id
    WHERE u.is_active = true AND u.department IN ('sales')
    GROUP BY u.department
  `);

  const installationRaw = await db.execute<{ name: string; executions: string }>(sql`
    SELECT u.name, COUNT(DISTINCT wo.id)::text as executions
    FROM users u
    LEFT JOIN work_orders wo ON wo.created_by_id = u.id AND wo.status = 'delivered'
    WHERE u.is_active = true AND u.department IN ('project_execution', 'production')
    GROUP BY u.id, u.name
    ORDER BY COUNT(DISTINCT wo.id) DESC
    LIMIT 10
  `);

  const serviceRaw = await db.execute<{ name: string; attended: string }>(sql`
    SELECT u.name, COUNT(DISTINCT wo.id)::text as attended
    FROM users u
    LEFT JOIN work_orders wo ON wo.status = 'delivered'
      AND wo.created_at >= NOW() - INTERVAL '90 days'
    WHERE u.is_active = true AND u.department = 'service'
    GROUP BY u.id, u.name
    ORDER BY COUNT(DISTINCT wo.id) DESC
    LIMIT 10
  `);

  res.json({
    sales: salesRaw.rows,
    installation: installationRaw.rows,
    service: serviceRaw.rows,
  });
});

dashboardRouter.get("/dashboard/creditors-debtors", requireAuth, requireRole(...FINANCE_ROLES), async (_req, res) => {
  const debtorsRaw = await db.execute<{ total_outstanding: string; overdue: string }>(sql`
    SELECT
      COALESCE(SUM(total::numeric - paid_amount::numeric), 0)::text as total_outstanding,
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE::text AND status != 'paid' THEN total::numeric - paid_amount::numeric ELSE 0 END), 0)::text as overdue
    FROM gst_invoices
    WHERE status != 'cancelled'
  `);

  const creditorsRaw = await db.execute<{ total_outstanding: string; overdue: string }>(sql`
    SELECT
      COALESCE(SUM(total::numeric - paid_amount::numeric), 0)::text as total_outstanding,
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE::text AND status NOT IN ('paid') THEN total::numeric - paid_amount::numeric ELSE 0 END), 0)::text as overdue
    FROM supplier_bills
    WHERE status NOT IN ('paid')
  `);

  const debtors = debtorsRaw.rows[0] as { total_outstanding: string; overdue: string } | undefined;
  const creditors = creditorsRaw.rows[0] as { total_outstanding: string; overdue: string } | undefined;

  res.json({
    debtors: {
      totalOutstanding: parseFloat(debtors?.total_outstanding ?? "0"),
      overdue: parseFloat(debtors?.overdue ?? "0"),
    },
    creditors: {
      totalOutstanding: parseFloat(creditors?.total_outstanding ?? "0"),
      overdue: parseFloat(creditors?.overdue ?? "0"),
    },
  });
});

dashboardRouter.get("/dashboard/gst-itc", requireAuth, requireRole(...FINANCE_ROLES), async (_req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${year}-${month}`;

  const itcRaw = await db.execute<{ cgst: string; sgst: string; igst: string }>(sql`
    SELECT
      COALESCE(SUM(cgst_amount::numeric), 0)::text as cgst,
      COALESCE(SUM(sgst_amount::numeric), 0)::text as sgst,
      COALESCE(SUM(igst_amount::numeric), 0)::text as igst
    FROM supplier_bills
    WHERE bill_date LIKE ${prefix + "%"}
  `);

  const outputRaw = await db.execute<{ cgst: string; sgst: string; igst: string }>(sql`
    SELECT
      COALESCE(SUM(cgst_amount::numeric), 0)::text as cgst,
      COALESCE(SUM(sgst_amount::numeric), 0)::text as sgst,
      COALESCE(SUM(igst_amount::numeric), 0)::text as igst
    FROM gst_invoices
    WHERE invoice_date LIKE ${prefix + "%"} AND status != 'cancelled'
  `);

  const itc = itcRaw.rows[0] as { cgst: string; sgst: string; igst: string } | undefined;
  const output = outputRaw.rows[0] as { cgst: string; sgst: string; igst: string } | undefined;

  const inputCgst = parseFloat(itc?.cgst ?? "0");
  const inputSgst = parseFloat(itc?.sgst ?? "0");
  const inputIgst = parseFloat(itc?.igst ?? "0");
  const outputCgst = parseFloat(output?.cgst ?? "0");
  const outputSgst = parseFloat(output?.sgst ?? "0");
  const outputIgst = parseFloat(output?.igst ?? "0");

  res.json({
    month: `${year}-${month}`,
    inputITC: { cgst: inputCgst, sgst: inputSgst, igst: inputIgst, total: inputCgst + inputSgst + inputIgst },
    outputGST: { cgst: outputCgst, sgst: outputSgst, igst: outputIgst, total: outputCgst + outputSgst + outputIgst },
    netPayable: (outputCgst + outputSgst + outputIgst) - (inputCgst + inputSgst + inputIgst),
  });
});

export default dashboardRouter;
