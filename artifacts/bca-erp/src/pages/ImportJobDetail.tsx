import React, { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useGetInventoryItems,
  useReceiveImportJobToStores,
  type InventoryItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Receipt,
  Package as PackageIcon,
  Calculator,
  Ship,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const WRITE_ROLES = ["purchase", "manager", "director", "admin", "cfo"];

type ImportJobItem = {
  id: number;
  importJobId: number;
  inventoryItemId: number | null;
  inventoryItemCode: string | null;
  inventoryItemName: string | null;
  description: string;
  hsnCode: string | null;
  qty: string;
  unit: string;
  unitPriceForeign: string;
  unitCbm: string;
  unitGrossWeight: string;
  dutyPercent: string;
  swsPercent: string;
  igstPercent: string;
  exwCostInr: string;
  freightShareInr: string;
  insuranceShareInr: string;
  assessableValueInr: string;
  customsDutyInr: string;
  swsAmountInr: string;
  localChargesShareInr: string;
  otherChargesShareInr: string;
  landedCostInr: string;
  perUnitLandedCostInr: string;
};

type ImportExpense = {
  id: number;
  importJobId: number;
  expenseType: string;
  vendorName: string;
  billNumber: string | null;
  billDate: string | null;
  currency: string;
  amountForeign: string;
  exchangeRate: string;
  amountInr: string;
  gstAmount: string;
  allocationMethod: string;
  isAllocatable: boolean;
  paymentStatus: string;
  notes: string | null;
};

type ImportJobDetail = {
  id: number;
  jobNumber: string;
  title: string;
  vendorName: string;
  vendorCountry: string | null;
  currency: string;
  exchangeRate: string;
  status: string;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string | null;
  supplierInvoiceAmount: string;
  containerNumber: string | null;
  blNumber: string | null;
  vesselName: string | null;
  etd: string | null;
  eta: string | null;
  arrivalDate: string | null;
  notes: string | null;
  createdByName: string | null;
  purchaseOrder: { id: number; poNumber: string; supplierName: string } | null;
  items: ImportJobItem[];
  expenses: ImportExpense[];
};

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  oceanFreight: "Ocean Freight",
  airFreight: "Air Freight",
  customsDuty: "Customs Duty (BCD)",
  swsCess: "SWS / Cess",
  igst: "IGST (Creditable)",
  chaCharges: "CHA Charges",
  insurance: "Insurance",
  localTransport: "Local Transport",
  portCharges: "Port Charges",
  documentation: "Documentation",
  exWorks: "Ex-Works Charges",
  handling: "Handling",
  other: "Other",
};

const ALLOCATION_LABELS: Record<string, string> = {
  cbm: "CBM (Volume)",
  value: "Value",
  quantity: "Quantity",
  weight: "Weight",
  equal: "Equal Split",
  manual: "Manual",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  inTransit: "In Transit",
  arrived: "Arrived",
  cleared: "Cleared",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  inTransit: "bg-blue-100 text-blue-800",
  arrived: "bg-yellow-100 text-yellow-800",
  cleared: "bg-purple-100 text-purple-800",
  received: "bg-green-100 text-green-800",
  closed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

function fmtInr(n: number | string | null | undefined, frac = 0): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(v)) return "₹0";
  return v.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: frac,
    minimumFractionDigits: frac,
  });
}

function num(n: string | number | null | undefined): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  return Number.isFinite(v) ? v : 0;
}

export default function ImportJobDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const canWrite = user && WRITE_ROLES.includes(user.role);

  const [itemDialog, setItemDialog] = useState<{
    open: boolean;
    edit: ImportJobItem | null;
  }>({ open: false, edit: null });
  const [expenseDialog, setExpenseDialog] = useState<{
    open: boolean;
    edit: ImportExpense | null;
  }>({ open: false, edit: null });

  const { data: job, isLoading } = useQuery({
    queryKey: ["import-job", id],
    queryFn: () => customFetch<ImportJobDetail>(`/api/import-jobs/${id}`),
    enabled: !!id,
  });

  const { data: inventoryItems } = useGetInventoryItems();

  const recalc = useMutation({
    mutationFn: () =>
      customFetch(`/api/import-jobs/${id}/recalculate`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Recalculated", description: "Landed cost updated" });
      qc.invalidateQueries({ queryKey: ["import-job", id] });
    },
    onError: (e: Error) =>
      toast({
        title: "Recalc failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      customFetch(`/api/import-jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      qc.invalidateQueries({ queryKey: ["import-job", id] });
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
    },
  });

  const receiveToStores = useReceiveImportJobToStores({
    mutation: {
      onSuccess: () => {
        toast({ title: "Received & posted to Stores", description: "Landed cost stamped per item" });
        qc.invalidateQueries();
      },
      onError: (e: Error) =>
        toast({ title: "Receive failed", description: e.message, variant: "destructive" }),
    },
  });

  const deleteJob = useMutation({
    mutationFn: () =>
      customFetch(`/api/import-jobs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Import job deleted" });
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
      setLocation("/imports");
    },
  });

  const saveItem = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (itemDialog.edit) {
        return customFetch(
          `/api/import-jobs/${id}/items/${itemDialog.edit.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
      }
      return customFetch(`/api/import-jobs/${id}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: itemDialog.edit ? "Item updated" : "Item added" });
      setItemDialog({ open: false, edit: null });
      qc.invalidateQueries({ queryKey: ["import-job", id] });
    },
    onError: (e: Error) =>
      toast({
        title: "Save failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: number) =>
      customFetch(`/api/import-jobs/${id}/items/${itemId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({ title: "Item removed" });
      qc.invalidateQueries({ queryKey: ["import-job", id] });
    },
  });

  const saveExpense = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      if (expenseDialog.edit) {
        return customFetch(
          `/api/import-jobs/${id}/expenses/${expenseDialog.edit.id}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
      }
      return customFetch(`/api/import-jobs/${id}/expenses`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({
        title: expenseDialog.edit ? "Expense updated" : "Expense added",
      });
      setExpenseDialog({ open: false, edit: null });
      qc.invalidateQueries({ queryKey: ["import-job", id] });
    },
    onError: (e: Error) =>
      toast({
        title: "Save failed",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteExpense = useMutation({
    mutationFn: (expenseId: number) =>
      customFetch(`/api/import-jobs/${id}/expenses/${expenseId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({ title: "Expense removed" });
      qc.invalidateQueries({ queryKey: ["import-job", id] });
    },
  });

  if (isLoading || !job) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalCbm = job.items.reduce(
    (s, it) => s + num(it.qty) * num(it.unitCbm),
    0,
  );
  const totalQty = job.items.reduce((s, it) => s + num(it.qty), 0);
  const totalExwInr = job.items.reduce((s, it) => s + num(it.exwCostInr), 0);
  const totalLanded = job.items.reduce((s, it) => s + num(it.landedCostInr), 0);
  const totalExpenses = job.expenses.reduce(
    (s, e) => s + num(e.amountInr),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/imports">
            <Button variant="ghost" size="sm" className="mb-2 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Import Jobs
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Ship className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">{job.jobNumber}</h1>
            <Badge className={STATUS_COLORS[job.status] ?? "bg-gray-100"}>
              {STATUS_LABELS[job.status] ?? job.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{job.title}</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <>
              <Select
                value={job.status}
                onValueChange={(v) => updateStatus.mutate(v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => recalc.mutate()}
                disabled={recalc.isPending}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${recalc.isPending ? "animate-spin" : ""}`}
                />
                Recalculate
              </Button>
              {job.status !== "received" && (
                <Button
                  variant="default"
                  onClick={() => receiveToStores.mutate({ id: Number(id) })}
                  disabled={receiveToStores.isPending}
                  data-testid="button-receive-import"
                >
                  Mark Received → Post to Stores
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm(`Delete import job ${job.jobNumber}?`))
                    deleteJob.mutate();
                }}
                disabled={deleteJob.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryCard label="Vendor" value={job.vendorName} sub={job.vendorCountry} />
        <SummaryCard
          label={`FX (${job.currency} → INR)`}
          value={num(job.exchangeRate).toFixed(4)}
        />
        <SummaryCard label="Total Items" value={String(job.items.length)} sub={`${totalQty} units`} />
        <SummaryCard label="Total CBM" value={totalCbm.toFixed(3)} />
        <SummaryCard label="Total Expenses" value={fmtInr(totalExpenses)} />
        <SummaryCard
          label="Total Landed Cost"
          value={fmtInr(totalLanded)}
          highlight
        />
      </div>

      {/* Shipment details card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Container" value={job.containerNumber} />
            <Field label="BL #" value={job.blNumber} />
            <Field label="Vessel" value={job.vesselName} />
            <Field label="ETD / ETA" value={`${job.etd ?? "—"} → ${job.eta ?? "—"}`} />
            <Field label="Supplier Invoice" value={job.supplierInvoiceNumber} />
            <Field label="Invoice Date" value={job.supplierInvoiceDate} />
            <Field
              label="Invoice Amount"
              value={`${num(job.supplierInvoiceAmount).toLocaleString("en-IN")} ${job.currency}`}
            />
            <Field
              label="Linked PO"
              value={job.purchaseOrder ? job.purchaseOrder.poNumber : "—"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageIcon className="h-4 w-4" /> Items in Shipment
          </CardTitle>
          {canWrite && (
            <Button
              size="sm"
              onClick={() => setItemDialog({ open: true, edit: null })}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">
                    Unit Price ({job.currency})
                  </TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead className="text-right">Duty %</TableHead>
                  <TableHead className="text-right">EXW (INR)</TableHead>
                  <TableHead className="text-right">Freight</TableHead>
                  <TableHead className="text-right">BCD</TableHead>
                  <TableHead className="text-right">SWS</TableHead>
                  <TableHead className="text-right">Local</TableHead>
                  <TableHead className="text-right">Landed Cost</TableHead>
                  <TableHead className="text-right">Per Unit</TableHead>
                  {canWrite && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canWrite ? 13 : 12}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No items added yet. Add items from supplier invoice to
                      compute landed cost.
                    </TableCell>
                  </TableRow>
                ) : (
                  job.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-medium">{it.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.inventoryItemCode || "—"}
                          {it.hsnCode && ` • HSN ${it.hsnCode}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {num(it.qty)} {it.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(it.unitPriceForeign).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(it.unitCbm).toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right">
                        {num(it.dutyPercent).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtInr(it.exwCostInr)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtInr(it.freightShareInr)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtInr(it.customsDutyInr)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtInr(it.swsAmountInr)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtInr(it.localChargesShareInr)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtInr(it.landedCostInr)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-blue-700">
                        {fmtInr(it.perUnitLandedCostInr, 2)}
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setItemDialog({ open: true, edit: it })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Delete ${it.description}?`))
                                  deleteItem.mutate(it.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" /> Expense Bills (Multi-Vendor)
          </CardTitle>
          {canWrite && (
            <Button
              size="sm"
              onClick={() => setExpenseDialog({ open: true, edit: null })}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Vendor / Bill</TableHead>
                <TableHead>Allocation Basis</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Amount (INR)</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.expenses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 7 : 6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No expense bills yet. Add CHA, freight, customs, and other
                    bills to allocate landed cost.
                  </TableCell>
                </TableRow>
              ) : (
                job.expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {EXPENSE_TYPE_LABELS[e.expenseType] ?? e.expenseType}
                      </div>
                      {!e.isAllocatable && (
                        <Badge variant="outline" className="text-xs mt-1">
                          Not allocated
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{e.vendorName}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.billNumber || "—"} {e.billDate && `• ${e.billDate}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ALLOCATION_LABELS[e.allocationMethod] ??
                          e.allocationMethod}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {num(e.amountForeign).toLocaleString("en-IN")}{" "}
                      <span className="text-xs text-muted-foreground">
                        {e.currency}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtInr(e.amountInr)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          e.paymentStatus === "paid" ? "default" : "outline"
                        }
                      >
                        {e.paymentStatus}
                      </Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setExpenseDialog({ open: true, edit: e })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete this expense?`))
                                deleteExpense.mutate(e.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
            {job.expenses.length > 0 && (
              <tfoot>
                <TableRow className="border-t-2">
                  <TableCell colSpan={4} className="font-medium">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {fmtInr(totalExpenses)}
                  </TableCell>
                  <TableCell colSpan={canWrite ? 2 : 1}></TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* Landed cost summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" /> Landed Cost Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">EXW (Ex-Works)</span>
                <span className="font-medium">{fmtInr(totalExwInr)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Freight</span>
                <span className="font-medium">
                  {fmtInr(
                    job.items.reduce(
                      (s, it) => s + num(it.freightShareInr),
                      0,
                    ),
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Insurance</span>
                <span className="font-medium">
                  {fmtInr(
                    job.items.reduce(
                      (s, it) => s + num(it.insuranceShareInr),
                      0,
                    ),
                  )}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customs Duty (BCD)</span>
                <span className="font-medium">
                  {fmtInr(
                    job.items.reduce(
                      (s, it) => s + num(it.customsDutyInr),
                      0,
                    ),
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SWS / Cess</span>
                <span className="font-medium">
                  {fmtInr(
                    job.items.reduce((s, it) => s + num(it.swsAmountInr), 0),
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Local Charges</span>
                <span className="font-medium">
                  {fmtInr(
                    job.items.reduce(
                      (s, it) => s + num(it.localChargesShareInr),
                      0,
                    ),
                  )}
                </span>
              </div>
            </div>
            <div className="space-y-2 border-l pl-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Other</span>
                <span className="font-medium">
                  {fmtInr(
                    job.items.reduce(
                      (s, it) => s + num(it.otherChargesShareInr),
                      0,
                    ),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-base pt-3 border-t">
                <span className="font-bold">Total Landed Cost</span>
                <span className="font-bold text-blue-700">
                  {fmtInr(totalLanded)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>vs. Supplier Invoice</span>
                <span>
                  {fmtInr(
                    num(job.supplierInvoiceAmount) * num(job.exchangeRate),
                  )}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ItemDialog
        open={itemDialog.open}
        edit={itemDialog.edit}
        currency={job.currency}
        inventoryItems={(inventoryItems as InventoryItem[] | undefined) ?? []}
        isSaving={saveItem.isPending}
        onClose={() => setItemDialog({ open: false, edit: null })}
        onSubmit={(d) => saveItem.mutate(d)}
      />
      <ExpenseDialog
        open={expenseDialog.open}
        edit={expenseDialog.edit}
        jobCurrency={job.currency}
        jobExchangeRate={num(job.exchangeRate)}
        isSaving={saveExpense.isPending}
        onClose={() => setExpenseDialog({ open: false, edit: null })}
        onSubmit={(d) => saveExpense.mutate(d)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string | null;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-blue-300 bg-blue-50" : ""}>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div
          className={`text-base font-semibold ${highlight ? "text-blue-700" : ""}`}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value || "—"}</div>
    </div>
  );
}

function ItemDialog({
  open,
  edit,
  currency,
  inventoryItems,
  isSaving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  edit: ImportJobItem | null;
  currency: string;
  inventoryItems: InventoryItem[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (d: Record<string, unknown>) => void;
}) {
  const [inventoryItemId, setInventoryItemId] = useState<string>(
    edit?.inventoryItemId ? String(edit.inventoryItemId) : "",
  );
  const [description, setDescription] = useState(edit?.description ?? "");
  const [hsnCode, setHsnCode] = useState(edit?.hsnCode ?? "");
  const [qty, setQty] = useState(edit?.qty ?? "1");
  const [unit, setUnit] = useState(edit?.unit ?? "pcs");
  const [unitPriceForeign, setUnitPriceForeign] = useState(
    edit?.unitPriceForeign ?? "0",
  );
  const [unitCbm, setUnitCbm] = useState(edit?.unitCbm ?? "0");
  const [unitGrossWeight, setUnitGrossWeight] = useState(
    edit?.unitGrossWeight ?? "0",
  );
  const [dutyPercent, setDutyPercent] = useState(edit?.dutyPercent ?? "0");
  const [swsPercent, setSwsPercent] = useState(edit?.swsPercent ?? "10");

  React.useEffect(() => {
    if (open && edit) {
      setInventoryItemId(
        edit.inventoryItemId ? String(edit.inventoryItemId) : "",
      );
      setDescription(edit.description);
      setHsnCode(edit.hsnCode ?? "");
      setQty(edit.qty);
      setUnit(edit.unit);
      setUnitPriceForeign(edit.unitPriceForeign);
      setUnitCbm(edit.unitCbm);
      setUnitGrossWeight(edit.unitGrossWeight);
      setDutyPercent(edit.dutyPercent);
      setSwsPercent(edit.swsPercent);
    } else if (open) {
      setInventoryItemId("");
      setDescription("");
      setHsnCode("");
      setQty("1");
      setUnit("pcs");
      setUnitPriceForeign("0");
      setUnitCbm("0");
      setUnitGrossWeight("0");
      setDutyPercent("0");
      setSwsPercent("10");
    }
  }, [open, edit]);

  const onSelectItem = (val: string) => {
    setInventoryItemId(val);
    if (val && val !== "none") {
      const it = inventoryItems.find((i) => String(i.id) === val) as
        | (InventoryItem & {
            unitCbm?: number;
            grossWeightKg?: number;
            dutyPercent?: number;
          })
        | undefined;
      if (it) {
        if (!description) setDescription(it.name);
        if (!hsnCode) setHsnCode(it.hsnCode ?? "");
        setUnit(it.unit);
        if (it.unitCbm) setUnitCbm(String(it.unitCbm));
        if (it.grossWeightKg) setUnitGrossWeight(String(it.grossWeightKg));
        if (it.dutyPercent) setDutyPercent(String(it.dutyPercent));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Link Inventory Item (optional)</Label>
            <Select value={inventoryItemId || "none"} onValueChange={onSelectItem}>
              <SelectTrigger>
                <SelectValue placeholder="Select inventory item to auto-fill CBM, weight, duty..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Manual entry —</SelectItem>
                {inventoryItems.map((it) => (
                  <SelectItem key={it.id} value={String(it.id)}>
                    {it.itemCode ? `[${it.itemCode}] ` : ""}{it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Description *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Slot Machine Cabinet Model SM-X3"
            />
          </div>
          <div>
            <Label>HSN Code</Label>
            <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
          </div>
          <div>
            <Label>Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div>
            <Label>Quantity *</Label>
            <Input
              type="number"
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit Price ({currency}) *</Label>
            <Input
              type="number"
              step="0.0001"
              value={unitPriceForeign}
              onChange={(e) => setUnitPriceForeign(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit CBM (m³)</Label>
            <Input
              type="number"
              step="0.000001"
              value={unitCbm}
              onChange={(e) => setUnitCbm(e.target.value)}
            />
          </div>
          <div>
            <Label>Unit Gross Weight (kg)</Label>
            <Input
              type="number"
              step="0.001"
              value={unitGrossWeight}
              onChange={(e) => setUnitGrossWeight(e.target.value)}
            />
          </div>
          <div>
            <Label>Duty % (BCD)</Label>
            <Input
              type="number"
              step="0.01"
              value={dutyPercent}
              onChange={(e) => setDutyPercent(e.target.value)}
            />
          </div>
          <div>
            <Label>SWS / Cess %</Label>
            <Input
              type="number"
              step="0.01"
              value={swsPercent}
              onChange={(e) => setSwsPercent(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={isSaving || !description.trim() || !qty}
            onClick={() =>
              onSubmit({
                inventoryItemId:
                  inventoryItemId && inventoryItemId !== "none"
                    ? Number(inventoryItemId)
                    : null,
                description,
                hsnCode: hsnCode || null,
                qty: parseFloat(qty) || 0,
                unit,
                unitPriceForeign: parseFloat(unitPriceForeign) || 0,
                unitCbm: parseFloat(unitCbm) || 0,
                unitGrossWeight: parseFloat(unitGrossWeight) || 0,
                dutyPercent: parseFloat(dutyPercent) || 0,
                swsPercent: parseFloat(swsPercent) || 0,
              })
            }
          >
            {isSaving ? "Saving..." : edit ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({
  open,
  edit,
  jobCurrency,
  jobExchangeRate,
  isSaving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  edit: ImportExpense | null;
  jobCurrency: string;
  jobExchangeRate: number;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (d: Record<string, unknown>) => void;
}) {
  const [expenseType, setExpenseType] = useState<string>(
    edit?.expenseType ?? "oceanFreight",
  );
  const [vendorName, setVendorName] = useState(edit?.vendorName ?? "");
  const [billNumber, setBillNumber] = useState(edit?.billNumber ?? "");
  const [billDate, setBillDate] = useState(edit?.billDate ?? "");
  const [currency, setCurrency] = useState(edit?.currency ?? "INR");
  const [amountForeign, setAmountForeign] = useState(
    edit?.amountForeign ?? "0",
  );
  const [exchangeRate, setExchangeRate] = useState(
    edit?.exchangeRate ?? "1",
  );
  const [gstAmount, setGstAmount] = useState(edit?.gstAmount ?? "0");
  const [allocationMethod, setAllocationMethod] = useState(
    edit?.allocationMethod ?? "cbm",
  );
  const [isAllocatable, setIsAllocatable] = useState(edit?.isAllocatable ?? true);
  const [paymentStatus, setPaymentStatus] = useState(
    edit?.paymentStatus ?? "unpaid",
  );
  const [notes, setNotes] = useState(edit?.notes ?? "");

  React.useEffect(() => {
    if (open && edit) {
      setExpenseType(edit.expenseType);
      setVendorName(edit.vendorName);
      setBillNumber(edit.billNumber ?? "");
      setBillDate(edit.billDate ?? "");
      setCurrency(edit.currency);
      setAmountForeign(edit.amountForeign);
      setExchangeRate(edit.exchangeRate);
      setGstAmount(edit.gstAmount);
      setAllocationMethod(edit.allocationMethod);
      setIsAllocatable(edit.isAllocatable);
      setPaymentStatus(edit.paymentStatus);
      setNotes(edit.notes ?? "");
    } else if (open) {
      setExpenseType("oceanFreight");
      setVendorName("");
      setBillNumber("");
      setBillDate("");
      setCurrency("INR");
      setAmountForeign("0");
      setExchangeRate("1");
      setGstAmount("0");
      setAllocationMethod("cbm");
      setIsAllocatable(true);
      setPaymentStatus("unpaid");
      setNotes("");
    }
  }, [open, edit]);

  React.useEffect(() => {
    // Auto-set sensible defaults when changing type
    if (
      expenseType === "customsDuty" ||
      expenseType === "swsCess" ||
      expenseType === "igst" ||
      expenseType === "insurance"
    ) {
      setAllocationMethod((m) => (m === "cbm" ? "value" : m));
    }
  }, [expenseType]);

  React.useEffect(() => {
    // Default exchange rate when currency switches
    if (currency === "INR") setExchangeRate("1");
    else if (currency === jobCurrency) setExchangeRate(String(jobExchangeRate));
  }, [currency, jobCurrency, jobExchangeRate]);

  const amountInr = (parseFloat(amountForeign) || 0) * (parseFloat(exchangeRate) || 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Edit Expense Bill" : "Add Expense Bill"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Expense Type *</Label>
            <Select value={expenseType} onValueChange={setExpenseType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Allocation Basis *</Label>
            <Select
              value={allocationMethod}
              onValueChange={setAllocationMethod}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ALLOCATION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Vendor *</Label>
            <Input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Maersk Line, Mumbai Customs House Agent"
            />
          </div>
          <div>
            <Label>Bill Number</Label>
            <Input
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
            />
          </div>
          <div>
            <Label>Bill Date</Label>
            <Input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="CNY">CNY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount ({currency}) *</Label>
            <Input
              type="number"
              step="0.01"
              value={amountForeign}
              onChange={(e) => setAmountForeign(e.target.value)}
            />
          </div>
          <div>
            <Label>Exchange Rate</Label>
            <Input
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              disabled={currency === "INR"}
            />
          </div>
          <div>
            <Label>Amount (INR) — auto</Label>
            <Input value={amountInr.toFixed(2)} readOnly className="bg-muted" />
          </div>
          <div>
            <Label>GST Amount (Creditable)</Label>
            <Input
              type="number"
              step="0.01"
              value={gstAmount}
              onChange={(e) => setGstAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>Payment Status</Label>
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partially Paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isAllocatable}
                onChange={(e) => setIsAllocatable(e.target.checked)}
              />
              Allocate to items (uncheck for IGST or non-landed costs)
            </label>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={isSaving || !vendorName.trim() || !amountForeign}
            onClick={() =>
              onSubmit({
                expenseType,
                vendorName,
                billNumber: billNumber || null,
                billDate: billDate || null,
                currency,
                amountForeign: parseFloat(amountForeign) || 0,
                exchangeRate: parseFloat(exchangeRate) || 1,
                gstAmount: parseFloat(gstAmount) || 0,
                allocationMethod,
                isAllocatable,
                paymentStatus,
                notes: notes || null,
              })
            }
          >
            {isSaving ? "Saving..." : edit ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
