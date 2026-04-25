import React from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetItemLedger,
  type StockLedger,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InventoryLedger() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id, 10);

  const { data, isLoading, isError } = useGetItemLedger(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-7 w-52" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Package className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Item not found or failed to load.</p>
        <Button variant="outline" onClick={() => navigate("/inventory")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Inventory
        </Button>
      </div>
    );
  }

  const { item, ledger } = data as StockLedger;

  const totalIn = ledger.filter((t) => t.type === "in").reduce((sum, t) => sum + t.qty, 0);
  const totalOut = ledger.filter((t) => t.type === "out").reduce((sum, t) => sum + t.qty, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Stock Ledger — {item.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{item.itemCode}</p>
        </div>
        {item.isLowStock && (
          <Badge variant="destructive" className="ml-2 bg-orange-600">Low Stock</Badge>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${item.isLowStock ? "text-orange-600" : "text-green-700"}`}>
              {item.stockBalance} {item.unit}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowDownCircle className="h-4 w-4 text-green-600" /> Total IN
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{totalIn.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <ArrowUpCircle className="h-4 w-4 text-red-500" /> Total OUT
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{totalOut.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reorder Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{item.reorderLevel} {item.unit}</div>
          </CardContent>
        </Card>
      </div>

      {/* Ledger table */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate (₹)</TableHead>
              <TableHead className="text-right">Running Balance</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  No transactions yet.
                </TableCell>
              </TableRow>
            ) : (
              [...ledger].reverse().map((entry, i) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground text-sm">{ledger.length - i}</TableCell>
                  <TableCell>
                    {entry.type === "in" ? (
                      <span className="flex items-center gap-1 text-green-700 font-semibold">
                        <ArrowDownCircle className="h-4 w-4" /> IN
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600 font-semibold">
                        <ArrowUpCircle className="h-4 w-4" /> OUT
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${entry.type === "in" ? "text-green-700" : "text-red-600"}`}>
                    {entry.type === "in" ? "+" : "-"}{entry.qty.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">₹{entry.rate.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">{entry.runningBalance.toFixed(2)}</TableCell>
                  <TableCell className="text-sm">
                    {entry.referenceNumber ? (
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{entry.referenceNumber}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                    {entry.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{entry.createdByName ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(entry.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
