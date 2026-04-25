# BCA Entertainment Works ERP

## Overview

Full-stack ERP system for BCA Entertainment Works. pnpm monorepo with React + Vite frontend, Express 5 backend, PostgreSQL database.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 18 + Vite, TailwindCSS
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Cookie-based sessions (express-session + connect-pg-simple), bcryptjs
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → react-query hooks + Zod schemas)
- **Build**: esbuild (ESM bundle)

## Artifact Ports

- **API Server**: port 8080 (accessible via /api proxy)
- **BCA ERP Frontend**: port 24260 (accessible at /)

## Packages

- `artifacts/api-server` — Express 5 REST API
- `artifacts/bca-erp` — React + Vite frontend
- `lib/db` — Drizzle ORM + schema + DB client
- `lib/api-spec` — OpenAPI spec + Orval codegen config
- `lib/api-zod` — Generated Zod schemas from OpenAPI

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run seed` — seed the database with initial users

## Database Schema

### Core
- `users` — all system users (id, name, email, password_hash, role, department, phone, designation, date_of_joining, is_active, created_at, updated_at)
- `departments` — department codes/names
- `sessions` — express-session store (managed by connect-pg-simple)

### CRM
- `leads` — customer leads with status funnel (new → contacted → proposalSent → negotiating → won/lost/onHold)
- `proposals` — quotation proposals with jsonb line items, discount %, GST, sequence PROP-YY-NNNN

### Order Processing
- `work_orders` — created from won proposals; WO-YY-NNNN, links to proposal, customer info, status
- `work_order_items` — line items per WO; tracks workflow_type (imported/manufacturing) and current_step
- `purchase_orders` — POs linked to WO items; PO-YY-NNNN, supplier, quoted vs PO amount, approval flow, CFO gate
- `po_line_items` — line items per PO with GST rates
- `subcontract_records` — manufacturing subcontract/vendor details per WO item
- `delivery_records` — delivery tracking (expected/dispatch dates, transporter, tracking); invoice generation

### Inventory (Task #4)
- `inventory_items` — SKU catalogue (itemCode, name, category: rawMaterial/wip/finishedGoods, unit, hsnCode, gstRate, reorderLevel, isActive); stock balance computed via stock_transactions SUM
- `stock_transactions` — ledger of stock IN/OUT movements (itemId, type, qty, rate, referenceType: po/workOrder/manual, referenceId, referenceNumber, notes, createdById)
- `bom_templates` — Bill of Materials header (finishedItemId FK, name, description, isActive)
- `bom_line_items` — BOM component rows (bomId, rawMaterialItemId, qty, unit, notes)

### HR (Task #5)
- `employees` — employee directory (employeeCode, name, designation, department, dateOfJoining, phone, email, employmentType: fullTime/contract/partTime, basicSalary, hra, otherAllowances, workingDaysPerMonth, isActive, userId FK optional)
- `attendance_records` — daily attendance (employeeId, date, status: present/absent/halfDay/late/onLeave, notes); unique per employee+date
- `leave_requests` — leave applications (employeeId, leaveType: casual/sick/earned, fromDate, toDate, reason, status: pending/approved/rejected, approvedById, rejectionNote)
- `leave_balances` — leave quota per employee+year (casual, sick, earned days; used days tracked)

### DB Sequences
- `proposal_seq` — proposal numbering
- `work_order_seq` — work order numbering
- `po_seq` — purchase order numbering

## User Roles

`admin`, `director`, `cfo`, `manager`, `accounts`, `purchase`, `sales`, `stores`, `production`, `service`, `staff`

## Departments

`director`, `sales`, `purchase`, `accounts`, `project_execution`, `production`, `service`, `general`

## Default Users (seeded)

All seeded users use password: `bca@2024`

- `admin@bcaentertainment.com` — Admin (admin role)
- `bala@bcaentertainment.com` — Bala (director)
- `bhuva@bcaentertainment.com` — Bhuva (sales)
- `srinivasan@bcaentertainment.com` — Srinivasan (sales)
- `babu@bcaentertainment.com` — Babu (accounts)
- `yogi@bcaentertainment.com` — Yogi (stores)
- `manoj@bcaentertainment.com` — Manoj (purchase)
- `prabha@bcaentertainment.com` — Prabha (project execution manager)
- + 15 more team members (welders, engineers, service technicians, etc.)

## API Endpoints (Task #1)

### Auth
- `POST /api/auth/login` — login with email/password
- `POST /api/auth/logout` — destroy session
- `GET /api/auth/me` — get current user (requires auth)
- `POST /api/auth/change-password` — change password (requires auth)

### Users
- `GET /api/users` — list users (requires auth; filter by department/role/isActive)
- `POST /api/users` — create user (admin/director only)
- `GET /api/users/:id` — get user (requires auth)
- `PATCH /api/users/:id` — update user (admin/director only)
- `PATCH /api/users/:id/deactivate` — deactivate user (admin/director only)

### Dashboard
- `GET /api/dashboard/summary` — summary stats (requires auth)

## API Endpoints (Task #3 — Order Processing)

### Work Orders
- `GET /api/work-orders?status=` — list work orders (all roles)
- `POST /api/work-orders` — create work order (sales/manager/admin/director)
- `GET /api/work-orders/:id` — detail with items, POs, subcontracts, delivery
- `PATCH /api/work-orders/:id` — update status/notes
- `PATCH /api/work-orders/:id/items/:itemId` — set workflow_type, advance step, add prod note
- `POST /api/work-orders/:id/subcontract` — add subcontract record (manufacturing)
- `POST /api/work-orders/:id/delivery` — upsert delivery record
- `POST /api/work-orders/:id/invoice` — generate GST invoice (Stock OUT trigger stub)
- `POST /api/work-orders/:id/items/:itemId/finished-goods` — mark finished goods IN (manufacturing)

### Purchase Orders
- `GET /api/purchase-orders?workOrderId=&status=` — list POs
- `POST /api/purchase-orders` — create PO (purchase/manager/director/admin/cfo)
- `GET /api/purchase-orders/pending-my-approval` — POs pending the current user's approval
- `GET /api/purchase-orders/:id` — get PO detail with line items
- `PATCH /api/purchase-orders/:id` — update PO
- `POST /api/purchase-orders/:id/approve` — approve PO (manager/director/admin/cfo; CFO-only if price diff >5%)
- `POST /api/purchase-orders/:id/reject` — reject with note
- `POST /api/purchase-orders/:id/receive` — mark goods received (Stock IN trigger stub)

### Won Proposals → Auto Work Order
- `POST /api/proposals/:id/won` — marks proposal Won AND auto-creates work order (WO-YY-NNNN); navigates user to WO

## API Endpoints (Task #4 — Inventory & BOM)

### Inventory Items
- `GET /api/inventory/items?category=&search=&lowStock=` — list items with stock balance (stores/manager/director/admin/cfo/purchase/accounts/production)
- `POST /api/inventory/items` — create item (manager/director/admin)
- `GET /api/inventory/items/:id` — get item with balance
- `PATCH /api/inventory/items/:id` — update item (manager/director/admin)
- `GET /api/inventory/items/:id/ledger` — full stock ledger with running balance
- `GET /api/inventory/low-stock` — items below reorder level
- `GET /api/inventory/dashboard` — summary (totalSkus, lowStockCount, recentTransactions)

### Stock Transactions
- `POST /api/inventory/transactions` — record single stock IN or OUT
- `POST /api/inventory/transactions/bulk` — record multiple items in/out at once

### BOM (Bill of Materials)
- `GET /api/bom` — list all BOMs with line items
- `POST /api/bom` — create BOM (stores/manager/director/admin/cfo)
- `GET /api/bom/:id` — get BOM with line items
- `PATCH /api/bom/:id` — update BOM; if lineItems provided, replaces all (delete+insert)
- `DELETE /api/bom/:id` — delete BOM and all line items (manager/director/admin)

### Frontend Pages (Task #4)
- `/inventory` — Inventory catalogue (Inventory.tsx): search/filter, low-stock alerts, Stock IN/OUT dialogs, ledger nav
- `/inventory/:id/ledger` — Stock ledger (InventoryLedger.tsx): running balance, IN/OUT history
- `/bom` — BOM builder (BOM.tsx): expandable rows with component sub-tables, create/edit/delete BOMs

## API Endpoints (Task #5 — Employee & HR)

### Employees
- `GET /api/employees?isActive=&department=&search=` — list employees with grossSalary computed
- `POST /api/employees` — create employee (manager/director/admin/accounts/cfo)
- `GET /api/employees/:id` — get employee detail with leave balances
- `PATCH /api/employees/:id` — update employee (manager/director/admin/accounts/cfo)
- `PATCH /api/employees/:id/deactivate` — deactivate employee
- `PUT /api/employees/:id/leave-balances` — set leave quota for a year

### Attendance
- `GET /api/attendance?date=&employeeId=` — list attendance records for a date
- `POST /api/attendance` — mark single attendance (upserts)
- `POST /api/attendance/bulk` — mark attendance for multiple employees at once
- `GET /api/attendance/summary?month=&year=` — monthly attendance summary with net pay estimate

### Leave Requests
- `GET /api/leave-requests?status=&employeeId=` — list leave requests
- `POST /api/leave-requests` — submit leave request
- `POST /api/leave-requests/:id/approve` — approve request (manager/director/admin)
- `POST /api/leave-requests/:id/reject` — reject with note (manager/director/admin)

### Payroll
- `GET /api/payroll?month=&year=` — monthly payroll records with net pay computation

### Frontend Pages (Task #5)
- `/employees` — Employee Directory (EmployeeDirectory.tsx): CRUD with salary breakdown
- `/attendance` — Attendance (AttendancePage.tsx): daily marking (bulk upsert) + monthly summary table
- `/leave-requests` — Leave Management (LeaveManagement.tsx): pending approvals + submit request + all requests
- `/payroll` — Payroll Summary (PayrollPage.tsx): monthly net pay table + CSV export

## Finance Module (Task #6) — GST Invoicing & Accounts

### DB Schema (`lib/db/src/schema/finance.ts`)
- `gst_invoices` — tax invoices with CGST/SGST/IGST, sequential invoice number BCA/INV/{FY}/{0001}
- `invoice_line_items` — line items per invoice with GST rate + computed amounts
- `invoice_payments` — payment records per invoice (supports partial payments)
- `supplier_bills` — AP bills from suppliers with GST input credit
- `expenses` — miscellaneous expenses with approve/reject workflow

### API Routes (`artifacts/api-server/src/routes/finance.ts`)
- `GET/POST /api/gst-invoices` — list with filters (status/month/year/search), create with line item calculation
- `GET /api/gst-invoices/:id` — detail with line items + payments
- `PATCH /api/gst-invoices/:id` — update notes/due date
- `POST /api/gst-invoices/:id/payments` — record payment (updates status to partial/paid)
- `GET /api/gst-invoices/report/ar-ageing` — AR ageing buckets (current/30/60/90+)
- `GET /api/gst-summary?year=&month=` — monthly output GST, input ITC, net liability
- `GET/POST /api/supplier-bills` — list/create supplier bills
- `GET /api/supplier-bills/:id` — bill detail
- `POST /api/supplier-bills/:id/pay` — record payment against bill
- `GET /api/supplier-bills/report/ap-ageing` — AP ageing buckets
- `GET/POST /api/expenses` — list/create expenses
- `PATCH /api/expenses/:id/approve` — approve expense
- `PATCH /api/expenses/:id/reject` — reject expense
- `DELETE /api/expenses/:id` — delete non-approved expense

### Frontend Pages (Task #6)
- `/gst-invoices` — GST Invoices (GSTInvoices.tsx): list + filters, create with dynamic line items + GST calc, record payment, invoice print/detail modal
- `/supplier-bills` — Supplier Bills (SupplierBills.tsx): bills list + create, AP ageing report tab
- `/expenses` — Expenses (Expenses.tsx): list with approve/reject icons, category filter, create modal
- `/gst-summary` — Finance Reports (GSTSummary.tsx): GST monthly summary (output/input/net), AR ageing tab

### Finance Roles
- `FINANCE_ROLES = ["accounts", "cfo", "director", "admin"]` — full access
- GST calculation: intrastate → CGST+SGST (half rate each); interstate → IGST only

## ERP Modules Planned

1. Lead & Proposal Management
2. Order Processing (Imported & Manufacturing dual workflow)
3. Inventory / BOM (Bill of Materials)
4. Employee & Attendance
5. GST Finance
6. Service Department
7. Access Management
8. Approvals / Dashboard

## Session Config

- Cookie name: `bca_erp_sid`
- Max age: 30 days
- HttpOnly, SameSite=Lax
- Session store: PostgreSQL (`sessions` table)
