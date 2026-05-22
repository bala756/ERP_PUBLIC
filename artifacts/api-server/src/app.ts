import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const app: Express = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable must be set in production");
  }
  logger.warn("SESSION_SECRET is not set — using insecure default (development only)");
}

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "sessions",
      createTableIfMissing: true,
    }),
    name: "bca_erp_sid",
    secret: sessionSecret ?? "bca-erp-dev-secret-not-for-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  }),
);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(distDir, "../../bca-erp/dist/public");
  const indexHtml = path.join(frontendDir, "index.html");

  if (existsSync(indexHtml)) {
    app.use(express.static(frontendDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  } else {
    logger.warn({ frontendDir }, "Frontend build directory not found; serving API only");
  }
}

export default app;
