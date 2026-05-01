import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetWorkOrderPnlSummary,
  type WorkOrderPnlRow,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, ExternalLink, Search } from "lucide-react";

export default function JobProfitability() {
  const [, navigate] = useLocation();
  const { data: rows = [], isLoading } = useGetWorkOrderPnlSummary();
  const [q, setQ] = useState("");

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenueInvoiced;
        acc.cost += r.totalCost;
        acc.margin += r.margin;
        return acc;
      },
      { revenue: 0, cost: 0, margin: 0 },
    );
  }, [rows]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const t = q.toLowerCase();
    return rows.filter(
      (r) => r.workOrderNumber.toLowerCase().includes(t) || r.customerName.toLowerCase().includes(t),
    );
  }, [rows, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          Job Profitability
        </h1>
        <p className="text-sm text-muted-foreground">
          Per-Work-Order P&L: revenue vs cost-stamped stores-out, subcontract, imports, and direct expenses
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Revenue (Invoiced)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-green-700">₹{totals.revenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Cost</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-red-600">₹{totals.cost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total Margin</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${totals.margin >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            ₹{totals.margin.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Filter by WO # or customer…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-pnl-search" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Revenue (Inv.)</TableHead>
                <TableHead className="text-right">Stores Cost</TableHead>
                <TableHead className="text-right">Subcontract</TableHead>
                <TableHead className="text-right">Imports</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                    No work orders to report.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r: WorkOrderPnlRow) => (
                  <TableRow key={r.workOrderId} data-testid={`row-pnl-${r.workOrderId}`}>
                    <TableCell className="font-mono text-xs">{r.workOrderNumber}</TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{r.status}</Badge></TableCell>
                    <TableCell className="text-right text-green-700">₹{r.revenueInvoiced.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">₹{r.costStoresOut.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">₹{r.costSubcontract.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">₹{r.costImportExpenses.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-right">₹{r.directExpenses.toLocaleString("en-IN")}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.margin >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      ₹{r.margin.toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${r.marginPercent >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {r.marginPercent.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/work-orders/${r.workOrderId}`)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
