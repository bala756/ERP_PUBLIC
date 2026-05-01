# BCA Entertainment Works ERP

## Overview

BCA Entertainment Works ERP is a full-stack Enterprise Resource Planning system designed to streamline business operations. It provides comprehensive modules for managing leads, proposals, order processing, inventory, human resources, and finance. The system aims to enhance efficiency, automate workflows, and provide critical insights across various departments, from sales and manufacturing to accounting and administration.

## User Preferences

I prefer concise and accurate responses. Please focus on providing direct solutions and explanations without excessive verbosity. When suggesting code changes, provide the exact code snippets and explain their purpose clearly. For architectural decisions or significant changes, please ask for confirmation before proceeding. I prefer an iterative development approach, where features are built and reviewed incrementally.

## System Architecture

The ERP is built as a pnpm monorepo leveraging a modern full-stack JavaScript/TypeScript ecosystem.

**Frontend:**
-   **Technology:** React 18 with Vite, styled using TailwindCSS.
-   **UI/UX:** Component-based design, focusing on a clean and intuitive user interface. Key pages include Inventory Catalogue, BOM Builder, Employee Directory, Attendance, Leave Management, GST Invoices, Supplier Bills, Expenses, and Payroll Summary.
-   **API Interaction:** Uses Orval for API codegen, generating `react-query` hooks and Zod schemas from an OpenAPI specification for type-safe and efficient data fetching.

**Backend:**
-   **Technology:** Express 5 REST API running on Node.js 24.
-   **Database Integration:** PostgreSQL accessed via Drizzle ORM for type-safe database interactions.
-   **Authentication:** Cookie-based session management using `express-session` and `connect-pg-simple`, with password hashing via `bcryptjs`.
-   **Validation:** Schema validation implemented using Zod.
-   **Core Modules:**
    -   **CRM:** Manages leads and proposals with status funnels.
    -   **Order Processing:** Handles work orders, purchase orders, subcontracting, and delivery tracking. Supports dual workflows for imported and manufacturing items.
    -   **Inventory & BOM:** Manages inventory items, stock transactions, and Bill of Materials for finished goods. Includes low-stock alerts and ledger tracking.
    -   **HR:** Employee directory, attendance management, leave requests, and payroll summaries.
    -   **Finance:** GST invoicing, supplier bill management, expense tracking, and financial reporting (AR/AP ageing, GST summary).
    -   **End-to-End Pipeline (Task #3):** Stitches Lead → Proposal → WO → Release → Purchase Request (BOM-exploded with on-hand subtraction; branches: manufactured/raw/imported) → POs/Import Jobs → Stores In (with landed cost) → Stores Out (cost-stamped per WO) → Subcontract Jobs (sent-out / received with finished item costing) → GST Invoice from Stores → per-WO Profit & Loss. New tables: `purchase_requests`, `purchase_request_items`, `stock_movements`, `subcontract_jobs`, `subcontract_job_items`. New routes: `purchaseRequests.ts`, `stockMovements.ts`, `subcontractJobs.ts`, plus `release` / `generate-invoice-from-stores` / `pnl` endpoints in `orders.ts`. New pages: PurchaseRequests, StoresIn, StoresOut, SubcontractJobs, JobProfitability; WorkOrderDetail gains a Pipeline Action Bar and a per-WO P&L card. `stock_movements` is the source of truth for on-hand and moving-average cost; legacy `stock_transactions` is mirrored only for the legacy ledger UI (never summed alongside `stock_movements` to avoid double-counting).
-   **Authorization:** Role-based access control implemented across all API endpoints, supporting various roles like `admin`, `director`, `cfo`, `manager`, `accounts`, `purchase`, `sales`, `stores`, `production`, `service`, `staff`.
-   **Schema Design:** Database schema includes tables for users, departments, CRM entities (leads, proposals), order processing (work orders, purchase orders, delivery, subcontracting), inventory (items, transactions, BOM), HR (employees, attendance, leave, payroll), and finance (GST invoices, supplier bills, expenses).
-   **Numbering:** Utilizes database sequences for generating sequential IDs for proposals, work orders, and purchase orders.

**System Design Choices:**
-   **Monorepo:** pnpm workspaces facilitate managing multiple packages (API server, frontend, shared libraries) within a single repository.
-   **TypeScript:** End-to-end type safety across frontend, backend, and database layers.
-   **API Specification:** OpenAPI specification drives API contract, enabling automated client code generation.
-   **Modular Design:** Modules are designed to be relatively independent, supporting phased development and easier maintenance.
-   **Product Master:** Centralized product information includes default sale/purchase prices, descriptions, images, and BOM linkages, used consistently across proposals and purchase orders.
-   **Settings Management:** Application settings for proposal print templates (logo, T&C) are stored and manageable via dedicated API and UI.

## External Dependencies

-   **Database:** PostgreSQL
-   **ORM:** Drizzle ORM
-   **Authentication:** `express-session`, `connect-pg-simple`, `bcryptjs`
-   **Validation:** Zod (`zod/v4`), `drizzle-zod`
-   **API Codegen:** Orval
-   **UI Styling:** TailwindCSS
-   **Frontend Build Tool:** Vite
-   **Backend Build Tool:** esbuild (for ESM bundle)