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
    -   **PR Price Visibility (Task #16):** On Purchase Requests, `estimatedUnitCost` (per line) and `totalEstimatedValue` (header/list) are price-gated. `PRICE_VIEW_ROLES = {manager, director, admin, cfo, accounts}` is enforced both server-side (`canViewPrices` in `purchaseRequests.ts` strips both fields to `null` in GET list/detail/release responses; PATCH silently strips `estimatedUnitCost` from `items[]`/`addItems[]` for callers outside this set, closing a write-side hole) and client-side (`PurchaseRequests.tsx` mirrors the set via `useAuth().user.role` to hide the Est. Value column/card and the Est. Unit Cost column/input/add-form field, and omits cost from PATCH payloads). The OpenAPI types for both fields are now `nullable: true` and not `required`. "Raised By" is shown as a prominent column on the list (with "Raised On") and as its own summary card (lg/semibold name + date) on the detail dialog so all roles can see who raised the PR.
    -   **Receipts Hardening (Task #19):** Three receipt-side policies are now enforced. (1) **Stores In must be tied to a PO.** The legacy `POST /api/stock-movements/in` requires `purchaseOrderId`; the preferred entry point is `POST /api/stock-movements/from-po` which takes a PO id + per-line `receivedQty` and writes one IN row per line, computing `shortageQty = max(0, orderedQty − receivedQty)` and tagging `isShort=true` when shortage > 0. The Stores In page exposes a "Receive from PO" dialog with editable receipt lines and a per-row "Short" badge; the ledger now shows the linked PO and a Short badge. (2) **Subcontract jobs must have a `workOrderId`.** `subcontract_jobs.work_order_id` is NOT NULL with cascade; the create schema requires it and the API verifies the WO exists. UI removes the "(none)" option and the WO field is marked required. (3) **Stores Out: WO is mandatory, and final dispatch is auto-tagged.** `POST /api/stock-movements/out` requires `workOrderId`. `generate-invoice-from-stores` tags every existing OUT row for that WO with `isFinalDispatch=true` and inserts a zero-qty marker row (sourceType=manual, sourceNumber=invoiceNumber) so on-hand and COGS are unaffected. After that point any new manual `/stock-movements/out` for the same WO returns 409. The Stores Out dialog uses `useGetStockMovements` per WO to detect the lock and disables submission with a "Final dispatch already issued" warning; the ledger shows a Final Dispatch badge on tagged rows. New `stock_movements` columns: `purchase_order_id`, `is_short`, `shortage_qty`, `is_final_dispatch`. Backfill: 3 orphan subcontract jobs (ids 4, 8, 9) were attached to WO 1 with status='cancelled' before applying the NOT NULL constraint.
    -   **Work Order Enrichments (Task #15):** `work_orders` carries customer details (GSTIN, billing/shipping address, contact phone/email), `dispatchDate`, and `warrantyPeriodMonths`. New `work_order_service_entries` table powers an after-sales service log on WorkOrderDetail with full add/edit/delete CRUD. Project Value vs Expense card surfaces forward-looking commitment: `projectExpense = costStoresOut + costSubcontractInFlight (status='sentOut') + costImportsInFlight + directExpenses`, where `costImportsInFlight` per import-job uses `GREATEST(SUM(import_job_items.landed_cost_inr), supplier_invoice × FX)` so allocated landed cost (incl. freight/duty/clearance) is preferred and supplier invoice acts as a floor before allocation. Received/closed/cancelled imports are excluded (already capitalized into Stores Out via landed-cost stock movements). PR line authoring lives exclusively on the Purchase Request detail page; WorkOrderDetail does not author PR lines. WO Release navigates to `/purchase-requests?prId=<id>` and the PR list page auto-opens that PR's detail dialog.
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