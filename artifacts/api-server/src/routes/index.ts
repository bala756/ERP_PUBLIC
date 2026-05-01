import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import departmentsRouter from "./departments";
import leadsRouter from "./leads";
import dashboardRouter from "./dashboard";
import ordersRouter from "./orders";
import inventoryRouter from "./inventory";
import employeesRouter from "./employees";
import financeRouter from "./finance";
import importsRouter from "./imports";
import leadRoutingRouter from "./leadRouting";
import storageRouter from "./storage";
import appSettingsRouter from "./appSettings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(departmentsRouter);
router.use(leadsRouter);
router.use(dashboardRouter);
router.use(ordersRouter);
router.use(inventoryRouter);
router.use(employeesRouter);
router.use(financeRouter);
router.use(importsRouter);
router.use(leadRoutingRouter);
router.use(storageRouter);
router.use(appSettingsRouter);

export default router;
