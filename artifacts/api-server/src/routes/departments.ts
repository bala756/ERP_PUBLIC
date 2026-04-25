import { Router } from "express";
import { db, departmentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const departmentsRouter = Router();

departmentsRouter.get("/departments", requireAuth, async (_req, res) => {
  const departments = await db.select().from(departmentsTable);
  res.json(
    departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      createdAt: d.createdAt.toISOString(),
    })),
  );
});

export default departmentsRouter;
