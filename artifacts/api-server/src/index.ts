import app from "./app";
import { logger } from "./lib/logger";
import { db, proposalsTable, workOrdersTable, purchaseOrdersTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { startIndiaMartPoller } from "./lib/indiaMart";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureSequences() {
  try {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS proposal_seq START 1`);
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS work_order_seq START 1`);
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS po_seq START 1`);
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS import_job_seq START 1`);
    logger.info("Ensured numbering sequences exist");
  } catch (err) {
    logger.error({ err }, "Failed to ensure numbering sequences");
  }
}

async function initProposalSequence() {
  try {
    const { sql } = await import("drizzle-orm");
    const result = await db.execute<{ max_seq: number }>(
      sql`SELECT COALESCE(MAX(CAST(split_part(proposal_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM proposals`,
    );
    const maxSeq = (result.rows[0] as { max_seq: number }).max_seq ?? 0;
    if (maxSeq > 0) {
      await db.execute(sql`SELECT setval('proposal_seq', ${maxSeq}, true)`);
      logger.info({ maxSeq }, "Initialized proposal_seq to max issued proposal number");
    }
  } catch (err) {
    logger.error({ err }, "Failed to initialize proposal sequence");
  }
}

async function initOrderSequences() {
  try {
    const { sql } = await import("drizzle-orm");
    const woResult = await db.execute<{ max_seq: number }>(
      sql`SELECT COALESCE(MAX(CAST(split_part(wo_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM work_orders`,
    );
    const woMax = (woResult.rows[0] as { max_seq: number }).max_seq ?? 0;
    if (woMax > 0) {
      await db.execute(sql`SELECT setval('work_order_seq', ${woMax}, true)`);
      logger.info({ maxSeq: woMax }, "Initialized work_order_seq to max issued WO number");
    }
    const poResult = await db.execute<{ max_seq: number }>(
      sql`SELECT COALESCE(MAX(CAST(split_part(po_number, '-', 3) AS INTEGER)), 0) AS max_seq FROM purchase_orders`,
    );
    const poMax = (poResult.rows[0] as { max_seq: number }).max_seq ?? 0;
    if (poMax > 0) {
      await db.execute(sql`SELECT setval('po_seq', ${poMax}, true)`);
      logger.info({ maxSeq: poMax }, "Initialized po_seq to max issued PO number");
    }
  } catch (err) {
    logger.error({ err }, "Failed to initialize order sequences");
  }
}

async function cleanupLostProposals() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  try {
    const deleted = await db
      .delete(proposalsTable)
      .where(
        and(
          eq(proposalsTable.status, "lost"),
          lt(proposalsTable.lostAt, cutoff),
        ),
      )
      .returning({ id: proposalsTable.id });
    if (deleted.length > 0) {
      logger.info(
        { count: deleted.length },
        "Auto-cleanup: removed lost proposals older than 90 days",
      );
    }
  } catch (err) {
    logger.error({ err }, "Auto-cleanup of lost proposals failed");
  }
}

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  await ensureSequences();
  initProposalSequence();
  initOrderSequences();
  cleanupLostProposals();
  setInterval(cleanupLostProposals, CLEANUP_INTERVAL_MS);
  logger.info(
    { intervalHours: 24 },
    "Scheduled lost-proposal auto-cleanup every 24 h",
  );

  startIndiaMartPoller();
});
