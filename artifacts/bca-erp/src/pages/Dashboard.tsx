import React from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetLeadFunnelStats,
  useGetDashboardEmployeePerformance,
  useGetDashboardCreditorsDebtors,
  useGetDashboardGstItc,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users, Users2, FileText, Briefcase, ShoppingCart, Package,
  Layers, Clock, Banknote, FileSpreadsheet, Wrench, CheckSquare,
  TrendingUp, ArrowDownCircle, ArrowUpCircle, Receipt,
  type LucideIcon,
} from "lucide-react";

const MODULES = [
  { title: "Leads", url: "/leads", icon: Users2, roles: ["sales", "manager", "director", "admin"] },
  { title: "Proposals", url: "/proposals", icon: FileText, roles: ["sales", "manager", "director", "admin"] },
  { title: "Work Orders", url: "/work-orders", icon: Briefcase, roles: ["purchase", "manager", "director", "admin", "production"] },
  { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart, roles: ["purchase", "manager", "director", "admin"] },
  { title: "Inventory", url: "/inventory", icon: Package, roles: ["stores", "manager", "director", "admin"] },
  { title: "BOM", url: "/bom", icon: Layers, roles: ["stores", "manager", "director", "admin", "production"] },
  { title: "Attendance", url: "/attendance", icon: Clock, roles: ["manager", "director", "admin", "accounts"] },
  { title: "Payroll", url: "/payroll", icon: Banknote, roles: ["manager", "director", "admin", "accounts"] },
  { title: "GST Invoices", url: "/gst-invoices", icon: FileSpreadsheet, roles: ["accounts", "cfo", "director", "admin"] },
  { title: "Service Orders", url: "/service-orders", icon: Wrench, roles: ["service", "manager", "director", "admin"] },
  { title: "Approvals", url: "/approvals", icon: CheckSquare, roles: ["manager", "cfo", "director", "admin", "accounts", "purchase"] },
  { title: "Users", url: "/users", icon: Users, roles: ["admin", "director"] },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useGetDashboardSummary();
  const allowedModules = MODULES.filter(m => user && m.roles.includes(user.role));
  const displayName = user?.name?.trim() || user?.email || "User";

  const showFinance = user && ["accounts", "cfo", "director", "admin"].includes(user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {displayName}. Here is your overview.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[60px]" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        summary && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Monthly Revenue" value={formatCurrency(summary.monthlyRevenue)} icon={Banknote} testId="stat-revenue" />
            <StatCard title="Total Leads" value={summary.totalLeads} icon={Users2} testId="stat-leads" />
            <StatCard title="Open Work Orders" value={summary.openWorkOrders} icon={Briefcase} testId="stat-work-orders" />
            <StatCard title="Open Service Orders" value={summary.openServiceOrders} icon={Wrench} testId="stat-service-orders" />
            <StatCard title="Pending Approvals" value={summary.pendingApprovals} icon={CheckSquare} testId="stat-approvals" />
            <StatCard title="Low Stock Items" value={summary.lowStockItems} icon={Package} testId="stat-low-stock" />
            <StatCard title="Total Users" value={summary.totalUsers} icon={Users} testId="stat-total-users" />
            <StatCard title="Active Users" value={summary.activeUsers} icon={Users} testId="stat-active-users" />
          </div>
        )
      )}

      <SalesFunnelWidget />

      {showFinance && (
        <>
          <CreditorsDebtorsWidget />
          <GstItcWidget />
        </>
      )}

      <EmployeePerformanceWidget />

      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {allowedModules.map((module) => (
            <Link key={module.url} href={module.url} className="block group" data-testid={`link-module-${module.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <Card className="h-full hover:border-primary/50 transition-colors group-hover:shadow-md cursor-pointer">
                <CardContent className="flex flex-col items-center justify-center p-6 space-y-3">
                  <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
                    <module.icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="font-medium text-sm text-center">{module.title}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, testId }: { title: string; value: string | number; icon: LucideIcon; testId: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={testId}>{value}</div>
      </CardContent>
    </Card>
  );
}

const FUNNEL_COLORS: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-indigo-500",
  proposalSent: "bg-violet-500",
  negotiating: "bg-amber-500",
  won: "bg-green-500",
  lost: "bg-red-400",
  onHold: "bg-gray-400",
};

const FUNNEL_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  proposalSent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  onHold: "On Hold",
};

function SalesFunnelWidget() {
  const { data: stats, isLoading } = useGetLeadFunnelStats();
  const rows = Array.isArray(stats) ? stats : [];
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Sales Funnel</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex gap-2 h-8">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 h-full rounded" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No leads yet. Create your first lead to see the funnel.
          </p>
        ) : (
          <>
            <div className="flex gap-1 h-8 rounded overflow-hidden mb-3">
              {rows.map((row) => {
                if (row.count === 0) return null;
                const pct = Math.max((row.count / total) * 100, 2);
                return (
                  <div
                    key={row.status}
                    className={`${FUNNEL_COLORS[row.status] ?? "bg-gray-400"} rounded transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${FUNNEL_LABELS[row.status] ?? row.status}: ${row.count}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {rows.map((row) => (
                <div key={row.status} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-sm ${FUNNEL_COLORS[row.status] ?? "bg-gray-400"}`} />
                  <span className="text-muted-foreground">{FUNNEL_LABELS[row.status] ?? row.status}</span>
                  <Badge variant="secondary" className="text-xs h-4 px-1">{row.count}</Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CreditorsDebtorsWidget() {
  const { data, isLoading } = useGetDashboardCreditorsDebtors();

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Creditors &amp; Debtors</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Debtors (AR)</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(data?.debtors.totalOutstanding ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Overdue: <span className="text-red-500 font-medium">{formatCurrency(data?.debtors.overdue ?? 0)}</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Creditors (AP)</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <Skeleton className="h-8 w-[120px]" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(data?.creditors.totalOutstanding ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Overdue: <span className="text-red-500 font-medium">{formatCurrency(data?.creditors.overdue ?? 0)}</span>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GstItcWidget() {
  const { data, isLoading } = useGetDashboardGstItc();

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">GST Summary — {data?.month ?? "This Month"}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Input Tax Credit (ITC)</CardTitle>
            <Receipt className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? <Skeleton className="h-8 w-[100px]" /> : (
              <>
                <div className="text-2xl font-bold text-blue-600">{formatCurrency(data?.inputITC.total ?? 0)}</div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>CGST: {formatCurrency(data?.inputITC.cgst ?? 0)}</div>
                  <div>SGST: {formatCurrency(data?.inputITC.sgst ?? 0)}</div>
                  <div>IGST: {formatCurrency(data?.inputITC.igst ?? 0)}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Output GST</CardTitle>
            <Receipt className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? <Skeleton className="h-8 w-[100px]" /> : (
              <>
                <div className="text-2xl font-bold text-orange-600">{formatCurrency(data?.outputGST.total ?? 0)}</div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>CGST: {formatCurrency(data?.outputGST.cgst ?? 0)}</div>
                  <div>SGST: {formatCurrency(data?.outputGST.sgst ?? 0)}</div>
                  <div>IGST: {formatCurrency(data?.outputGST.igst ?? 0)}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className={data && data.netPayable > 0 ? "border-red-200" : "border-green-200"}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net GST Payable</CardTitle>
            <Receipt className={`h-4 w-4 ${data && data.netPayable > 0 ? "text-red-500" : "text-green-500"}`} />
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? <Skeleton className="h-8 w-[100px]" /> : (
              <>
                <div className={`text-2xl font-bold ${data && data.netPayable > 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(Math.abs(data?.netPayable ?? 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data && data.netPayable > 0 ? "Payable to government" : "Credit available"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmployeePerformanceWidget() {
  const { data, isLoading } = useGetDashboardEmployeePerformance();

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Employee Performance</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Marketing / Sales</CardTitle>
            <p className="text-xs text-muted-foreground">Proposals submitted &amp; won</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-20 w-full" /> : (
              (data?.sales?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No data</p>
              ) : (
                <div className="space-y-2">
                  {(data?.sales ?? []).map((row, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{row.dept}</span>
                      <div className="flex gap-3">
                        <span>{row.proposals} proposals</span>
                        <span className="text-green-600 font-medium">{row.won} won</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Installation Team</CardTitle>
            <p className="text-xs text-muted-foreground">Work orders executed</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-20 w-full" /> : (
              (data?.installation?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No executions recorded</p>
              ) : (
                <div className="space-y-2">
                  {(data?.installation ?? []).map((row, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{row.name}</span>
                      <Badge variant="secondary">{row.executions} executions</Badge>
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Service Department</CardTitle>
            <p className="text-xs text-muted-foreground">Services attended</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-20 w-full" /> : (
              (data?.service?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No service staff found</p>
              ) : (
                <div className="space-y-2">
                  {(data?.service ?? []).map((row, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{row.name}</span>
                      <Badge variant="outline">{row.attended} attended</Badge>
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
