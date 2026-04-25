import React, { useState } from "react";
import {
  useGetSupplierBills,
  useCreateSupplierBill,
  usePaySupplierBill,
  useGetApAgeing,
  useGetPurchaseOrders,
  type SupplierBill,
  type PurchaseOrder,
  getGetSupplierBillsQueryKey,
  getGetPurchaseOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CreditCard } from "lucide-react";

const FINANCE_ROLES = ["accounts", "cfo", "director", "admin"];

function fmt(n: string | number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n));
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ageBadge(days: number) {
  if (days <= 0) return <Badge className="bg-green-100 text-green-800 text-xs">Current</Badge>;
  if (days <= 30) return <Badge className="bg-yellow-100 text-yellow-800 text-xs">{days}d</Badge>;
  if (days <= 60) return <Badge className="bg-orange-100 text-orange-800 text-xs">{days}d</Badge>;
  return <Badge className="bg-red-100 text-red-800 text-xs">{days}d</Badge>;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
  };
  return (
    <Badge className={`text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ─── Create Bill Modal ─────────────────────────────────────────────────────────

function CreateBillModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: purchaseOrders = [] } = useGetPurchaseOrders(undefined, { query: { enabled: open, queryKey: getGetPurchaseOrdersQueryKey() } });
  const approvedPos = (purchaseOrders as PurchaseOrder[]).filter((po) => ["approved", "received"].includes(po.status));
  const [form, setForm] = useState({
    billNumber: "", supplierName: "", supplierGstin: "",
    billDate: new Date().toISOString().slice(0, 10), dueDate: "",
    subtotal: "", gstAmount: "", total: "", notes: "",
    transactionType: "intrastate" as "intrastate" | "interstate",
    purchaseOrderId: null as number | null,
  });

  function handlePoSelect(poId: string) {
    if (poId === "__none__") {
      setForm((prev) => ({ ...prev, purchaseOrderId: null }));
      return;
    }
    const po = approvedPos.find((p) => String(p.id) === poId);
    if (!po) return;
    setForm((prev) => ({
      ...prev,
      purchaseOrderId: po.id,
      supplierName: po.supplierName,
      subtotal: String(po.poAmount),
      total: (po.poAmount + (parseFloat(prev.gstAmount) || 0)).toFixed(2),
    }));
  }

  const mutation = useCreateSupplierBill({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetSupplierBillsQueryKey() });
        toast({ title: "Supplier bill created" });
        onClose();
        setForm({ billNumber: "", supplierName: "", supplierGstin: "", billDate: new Date().toISOString().slice(0, 10), dueDate: "", subtotal: "", gstAmount: "", total: "", notes: "", transactionType: "intrastate", purchaseOrderId: null });
      },
      onError: () => toast({ title: "Failed to create bill", variant: "destructive" }),
    },
  });

  function handleSubtotalChange(val: string) {
    const s = parseFloat(val) || 0;
    const g = parseFloat(form.gstAmount) || 0;
    setForm({ ...form, subtotal: val, total: (s + g).toFixed(2) });
  }

  function handleGstChange(val: string) {
    const s = parseFloat(form.subtotal) || 0;
    const g = parseFloat(val) || 0;
    setForm({ ...form, gstAmount: val, total: (s + g).toFixed(2) });
  }

  function deriveSplitGst(gstAmount: number, type: "intrastate" | "interstate") {
    if (type === "interstate") {
      return { cgstAmount: 0, sgstAmount: 0, igstAmount: gstAmount };
    }
    const half = gstAmount / 2;
    return { cgstAmount: half, sgstAmount: half, igstAmount: 0 };
  }

  function submit() {
    if (!form.billNumber || !form.supplierName || !form.billDate) {
      toast({ title: "Bill number, supplier name and date required", variant: "destructive" }); return;
    }
    const gstAmt = parseFloat(form.gstAmount) || 0;
    const { cgstAmount, sgstAmount, igstAmount } = deriveSplitGst(gstAmt, form.transactionType);
    mutation.mutate({
      data: {
        billNumber: form.billNumber,
        supplierName: form.supplierName,
        supplierGstin: form.supplierGstin || undefined,
        purchaseOrderId: form.purchaseOrderId ?? undefined,
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        subtotal: parseFloat(form.subtotal) || 0,
        gstAmount: gstAmt,
        cgstAmount,
        sgstAmount,
        igstAmount,
        transactionType: form.transactionType,
        total: parseFloat(form.total) || 0,
        notes: form.notes || undefined,
      },
    });
  }

  const gstAmt = parseFloat(form.gstAmount) || 0;
  const { cgstAmount, sgstAmount, igstAmount } = deriveSplitGst(gstAmt, form.transactionType);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Supplier Bill</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {approvedPos.length > 0 && (
            <div className="space-y-1 col-span-2">
              <Label>Link to Purchase Order</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.purchaseOrderId !== null ? String(form.purchaseOrderId) : "__none__"}
                onChange={(e) => handlePoSelect(e.target.value)}
              >
                <option value="__none__">— None (manual entry) —</option>
                {approvedPos.map((po) => (
                  <option key={po.id} value={String(po.id)}>
                    {po.poNumber} — {po.supplierName} (₹{Number(po.poAmount).toLocaleString("en-IN")})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Bill Number *</Label>
            <Input value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} placeholder="SUPP-INV-001" />
          </div>
          <div className="space-y-1">
            <Label>Supplier Name *</Label>
            <Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Supplier GSTIN</Label>
            <Input value={form.supplierGstin} onChange={(e) => setForm({ ...form, supplierGstin: e.target.value })} placeholder="27AAAAA0000A1Z5" />
          </div>
          <div className="space-y-1">
            <Label>Bill Date *</Label>
            <Input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Transaction Type</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={form.transactionType}
              onChange={(e) => setForm({ ...form, transactionType: e.target.value as "intrastate" | "interstate" })}
            >
              <option value="intrastate">Intrastate (CGST + SGST)</option>
              <option value="interstate">Interstate (IGST)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Subtotal (₹)</Label>
            <Input type="number" value={form.subtotal} onChange={(e) => handleSubtotalChange(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>GST Amount (₹)</Label>
            <Input type="number" value={form.gstAmount} onChange={(e) => handleGstChange(e.target.value)} />
          </div>
          {gstAmt > 0 && (
            <div className="col-span-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              {form.transactionType === "intrastate" ? (
                <>
                  <div>CGST: ₹{cgstAmount.toFixed(2)} &nbsp;|&nbsp; SGST: ₹{sgstAmount.toFixed(2)}</div>
                </>
              ) : (
                <div>IGST: ₹{igstAmount.toFixed(2)}</div>
              )}
            </div>
          )}
          <div className="space-y-1 col-span-2">
            <Label>Total (₹)</Label>
            <Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>Add Bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pay Bill Modal ────────────────────────────────────────────────────────────

function PayBillModal({ billId, open, onClose }: { billId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ amount: "", paymentDate: new Date().toISOString().slice(0, 10) });

  const mutation = usePaySupplierBill({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetSupplierBillsQueryKey() });
        toast({ title: "Payment recorded" });
        onClose();
      },
      onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Payment Date</Label>
            <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Amount (₹)</Label>
            <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate({ id: billId, data: { amount: parseFloat(form.amount), paymentDate: form.paymentDate } })} disabled={mutation.isPending}>Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bills List Tab ────────────────────────────────────────────────────────────

function BillsListTab({ canManage }: { canManage: boolean }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [payBillId, setPayBillId] = useState<number | null>(null);

  const { data: bills = [], isLoading } = useGetSupplierBills(statusFilter ? { status: statusFilter } : {});

  const totalOutstanding = (bills as SupplierBill[]).reduce(
    (s, b) => s + parseFloat(b.total ?? "0") - parseFloat(b.paidAmount ?? "0"),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end justify-between">
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Bill</Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Bills</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{(bills as SupplierBill[]).length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">₹{fmt(totalOutstanding)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Value</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">₹{fmt((bills as SupplierBill[]).reduce((s, b) => s + parseFloat(b.total ?? "0"), 0))}</p></CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No.</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bills as SupplierBill[]).length === 0 ? (
                <TableRow><TableCell colSpan={canManage ? 10 : 9} className="text-center text-muted-foreground py-10">No bills found</TableCell></TableRow>
              ) : (
                (bills as SupplierBill[]).map((bill) => {
                  const balance = parseFloat(bill.total ?? "0") - parseFloat(bill.paidAmount ?? "0");
                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono text-sm">{bill.billNumber}</TableCell>
                      <TableCell>{bill.supplierName}</TableCell>
                      <TableCell>{fmtDate(bill.billDate)}</TableCell>
                      <TableCell>{fmtDate(bill.dueDate)}</TableCell>
                      <TableCell className="text-right">₹{fmt(bill.subtotal)}</TableCell>
                      <TableCell className="text-right">₹{fmt(bill.gstAmount)}</TableCell>
                      <TableCell className="text-right font-medium">₹{fmt(bill.total)}</TableCell>
                      <TableCell className={`text-right font-semibold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>₹{fmt(balance)}</TableCell>
                      <TableCell>{statusBadge(bill.status)}</TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {bill.status !== "paid" && (
                            <Button variant="ghost" size="sm" onClick={() => setPayBillId(bill.id)}>
                              <CreditCard className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateBillModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {payBillId !== null && (
        <PayBillModal billId={payBillId} open={payBillId !== null} onClose={() => setPayBillId(null)} />
      )}
    </div>
  );
}

// ─── AP Ageing Tab ─────────────────────────────────────────────────────────────

function ApAgeingTab() {
  const { data: ageing, isLoading } = useGetApAgeing();

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>;
  if (!ageing) return null;

  const { rows, summary } = ageing;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Current (not due)", value: summary.current, cls: "text-green-600" },
          { label: "1-30 days", value: summary.days30, cls: "text-yellow-600" },
          { label: "31-60 days", value: summary.days60, cls: "text-orange-600" },
          { label: "90+ days", value: summary.days90plus, cls: "text-red-600" },
        ].map(({ label, value, cls }) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className={`text-xl font-bold ${cls}`}>₹{fmt(value)}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill No.</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Bill Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No outstanding bills</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.billId}>
                  <TableCell className="font-mono text-sm">{row.billNumber}</TableCell>
                  <TableCell>{row.supplierName}</TableCell>
                  <TableCell>{fmtDate(row.billDate)}</TableCell>
                  <TableCell>{fmtDate(row.dueDate)}</TableCell>
                  <TableCell className="text-right">₹{fmt(row.total)}</TableCell>
                  <TableCell className="text-right text-green-600">₹{fmt(row.paidAmount)}</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">₹{fmt(row.outstanding)}</TableCell>
                  <TableCell>{ageBadge(row.daysOverdue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SupplierBills() {
  const { user } = useAuth();
  const canManage = FINANCE_ROLES.includes(user?.role ?? "");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Bills</h1>
        <p className="text-muted-foreground text-sm">Accounts payable — bills from suppliers linked to purchase orders</p>
      </div>

      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="ageing">AP Ageing</TabsTrigger>
        </TabsList>
        <TabsContent value="bills"><BillsListTab canManage={canManage} /></TabsContent>
        <TabsContent value="ageing"><ApAgeingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
