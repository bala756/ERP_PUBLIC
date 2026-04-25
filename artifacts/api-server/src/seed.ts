import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  departmentsTable,
  DEPARTMENT_SEEDS,
  type Role,
  type DepartmentCode,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

const DEFAULT_PASSWORD = "bca@2024";

const seedUsers = [
  {
    name: "Bala",
    email: "bala@bcaentertainment.com",
    role: "director",
    department: "director",
    designation: "Director",
  },
  {
    name: "Bhuva",
    email: "bhuva@bcaentertainment.com",
    role: "sales",
    department: "sales",
    designation: "Sales Executive",
  },
  {
    name: "Srinivasan",
    email: "srinivasan@bcaentertainment.com",
    role: "sales",
    department: "sales",
    designation: "Sales Executive",
  },
  {
    name: "Babu",
    email: "babu@bcaentertainment.com",
    role: "accounts",
    department: "accounts",
    designation: "Accounts Manager",
  },
  {
    name: "Yogi",
    email: "yogi@bcaentertainment.com",
    role: "stores",
    department: "purchase",
    designation: "Stores / Inventory Manager",
  },
  {
    name: "Manoj",
    email: "manoj@bcaentertainment.com",
    role: "purchase",
    department: "purchase",
    designation: "Purchase Executive",
  },
  {
    name: "Prabha",
    email: "prabha@bcaentertainment.com",
    role: "manager",
    department: "project_execution",
    designation: "Project Engineer - Head",
  },
  {
    name: "Sathya",
    email: "sathya@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Mechanical Engineer",
  },
  {
    name: "Prabha Reddy",
    email: "prabha.reddy@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Mechanical Engineer",
  },
  {
    name: "Sathish",
    email: "sathish@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Mechanical Engineer",
  },
  {
    name: "Suresh",
    email: "suresh@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Mechanical Engineer",
  },
  {
    name: "Bharath",
    email: "bharath@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Electrical Engineer",
  },
  {
    name: "Sarath",
    email: "sarath@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Electrical Engineer",
  },
  {
    name: "Sudip",
    email: "sudip@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Helper",
  },
  {
    name: "Binay",
    email: "binay@bcaentertainment.com",
    role: "production",
    department: "project_execution",
    designation: "Helper",
  },
  {
    name: "Boopesh",
    email: "boopesh@bcaentertainment.com",
    role: "production",
    department: "production",
    designation: "Welder",
  },
  {
    name: "Santosh",
    email: "santosh@bcaentertainment.com",
    role: "production",
    department: "production",
    designation: "Welder",
  },
  {
    name: "Mohan",
    email: "mohan@bcaentertainment.com",
    role: "production",
    department: "production",
    designation: "Welder",
  },
  {
    name: "Sanjay",
    email: "sanjay@bcaentertainment.com",
    role: "production",
    department: "production",
    designation: "Welder",
  },
  {
    name: "Anthony",
    email: "anthony@bcaentertainment.com",
    role: "production",
    department: "production",
    designation: "Electrical Panel Works",
  },
  {
    name: "Ajay Babu",
    email: "ajaybabu@bcaentertainment.com",
    role: "service",
    department: "service",
    designation: "Service Technician",
  },
  {
    name: "Sugumar",
    email: "sugumar@bcaentertainment.com",
    role: "service",
    department: "service",
    designation: "Service Technician",
  },
  {
    name: "Babu CFO",
    email: "cfo@bcaentertainment.com",
    role: "cfo",
    department: "accounts",
    designation: "Chief Financial Officer",
  },
  {
    name: "Admin",
    email: "admin@bcaentertainment.com",
    role: "admin",
    department: "general",
    designation: "System Administrator",
  },
];

async function seed() {
  logger.info("Starting database seed...");

  // Seed departments first
  const departmentMap: Record<string, number> = {};
  for (const dept of DEPARTMENT_SEEDS) {
    const existing = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.code, dept.code))
      .limit(1);

    if (existing.length > 0) {
      departmentMap[dept.code] = existing[0].id;
      logger.info({ code: dept.code }, "Department already exists, skipping");
    } else {
      const [created] = await db
        .insert(departmentsTable)
        .values(dept)
        .returning();
      departmentMap[dept.code] = created.id;
      logger.info({ code: dept.code }, "Created department");
    }
  }

  // Seed users
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  for (const user of seedUsers) {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, user.email))
      .limit(1);

    if (existing.length > 0) {
      // Update departmentId if not set
      if (!existing[0].departmentId) {
        await db
          .update(usersTable)
          .set({ departmentId: departmentMap[user.department] })
          .where(eq(usersTable.id, existing[0].id));
      }
      logger.info({ email: user.email }, "User already exists, skipping");
      continue;
    }

    await db.insert(usersTable).values({
      ...user,
      role: user.role as Role,
      department: user.department as DepartmentCode,
      departmentId: departmentMap[user.department],
      passwordHash,
      isActive: true,
    });
    logger.info({ email: user.email }, "Created user");
  }

  logger.info("Seed complete. All users created with default password.");
}

seed().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
