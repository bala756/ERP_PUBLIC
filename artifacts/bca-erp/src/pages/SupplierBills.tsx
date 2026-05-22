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
import { Plus, CreditCard, Trash2 } from "lucide-react";

const FINANCE_ROLES = ["accounts", "cfo", "director", "admin"];

type BillItemForm = {
  description: string;
  qty: string;
  unitPrice: string;
};

function emptyBillItem(): BillItemForm {
  return { description: "", qty: "1", unitPrice: "" };
}

function fmt(n: string | number | null | undefined) {
  if (n == null || n === "") return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n));
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "-";
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

function lineAmount(item: BillItemForm) {
  return (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0);
}

function splitGst(gstAmount: number, type: "intrastate" | "interstate") {
  if (type === "interstate") return { cgstAmount: 0, sgstAmount: 0, igstAmount: gstAmount };
  const half = gstAmount / 2;
  return { cgstAmount: half, sgstAmount: half, igstAmount: 0 };
}

function CreateBillModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: purchaseOrders = [] } = useGetPurchaseOrders(undefined, {
    query: { enabled: open, queryKey: getGetPurchaseOrdersQueryKey() },
  });
  const approvedPos = (purchaseOrders as PurchaseOrder[]).filter((po) =>
    ["approved", "received"].includes(po.status),
  );

  const [form, setForm] = useState({
    billNumber: "",
    supplierName: "",
    supplierGstin: "",
    referencePoNumber: "",
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    gstRate: "18",
    notes: "",
    transactionType: "intrastate" as "intrastate" | "interstate",
    purchaseOrderId: null as number | null,
    itemDetails: [emptyBillItem()] as BillItemForm[],
  });

  const subtotal = form.itemDetails.reduce((sum, item) => sum + lineAmount(item), 0);
  const gstRate = parseFloat(form.gstRate) || 0;
  const gstAmount = subtotal * (gstRate / 100);
  const total = subtotal + gstAmount;
  const { cgstAmount, sgstAmount, igstAmount } = splitGst(gstAmount, form.transactionType);

  function resetForm() {
    setForm({
      billNumber: "",
      supplierName: "",
      supplierGstin: "",
      referencePoNumber: "",
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      gstRate: "18",
      notes: "",
      transactionType: "intrastate",
      purchaseOrderId: null,
      itemDetails: [emptyBillItem()],
    });
  }

  function updateItem(index: number, patch: Partial<BillItemForm>) {
    setForm((prev) => ({
      ...prev,
      itemDetails: prev.itemDetails.map((item, i) => i === index ? { ...item, ...patch } : item),
    }));
  }

  function addItem() {
    setForm((prev) => ({ ...prev, itemDetails: [...prev.itemDetails, emptyBillItem()] }));
  }

  function removeItem(index: number) {
    setForm((prev) => ({
      ...prev,
      itemDetails: prev.itemDetails.length === 1
        ? [emptyBillItem()]
        : prev.itemDetails.filter((_, i) => i !== index),
    }));
  }

  function handlePoSelect(poId: string) {
    if (poId === "__none__") {
      setForm((prev) => ({ ...prev, purchaseOrderId: null }));
      return;
    }
    const po = approvedPos.find((p) => String(p.id) === poId);
    if (!po) return;
    const itemDetails = po.lineItems.length > 0
      ? po.lineItems.map((item) => ({
          description: item.description,
          qty: String(item.qty ?? 1),
          unitPrice: String(item.unitPrice ?? 0),
        }))
      : [{ description: po.poNumber, qty: "1", unitPrice: String(po.poAmount) }];

    setForm((prev) => ({
      ...prev,
      purchaseOrderId: po.id,
      referencePoNumber: po.poNumber,
      supplierName: po.supplierName,
      supplierGstin: po.supplierGstin ?? prev.supplierGstin,
      itemDetails,
    }));
  }

  const mutation = useCreateSupplierBill({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetSupplierBillsQueryKey() });
        toast({ title: "Supplier bill created" });
        onClose();
        resetForm();
      },
      onError: () => toast({ title: "Failed to create bill", variant: "destructive" }),
    },
  });

  function submit() {
    if (!form.billNumber || !form.supplierName || !form.billDate) {
      toast({ title: "Bill number, supplier name and date required", variant: "destructive" });
      return;
    }

    const itemDetails = form.itemDetails
      .filter((item) => item.description.trim())
      .map((item) => {
        const qty = parseFloat(item.qty) || 0;
        const unitPrice = parseFloat(item.unitPrice) || 0;
        return {
          description: item.description.trim(),
          qty,
          unitPrice,
          amount: Number((qty * unitPrice).toFixed(2)),
        };
      });

    if (itemDetails.length === 0 || itemDetails.some((item) => item.qty <= 0)) {
      toast({ title: "Add at least one item with description and quantity", variant: "destructive" });
      return;
    }

    mutation.mutate({
      data: {
        billNumber: form.billNumber,
        supplierName: form.supplierName,
        supplierGstin: form.supplierGstin || undefined,
        purchaseOrderId: form.purchaseOrderId ?? undefined,
        referencePoNumber: form.referencePoNumber || undefined,
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        itemDetails,
        gstRate,
        transactionType: form.transactionType,
        notes: form.notes || undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                <option value="__none__">None (manual entry)</option>
                {approvedPos.map((po) => (
                  <option key={po.id} value={String(po.id)}>
                    {po.poNumber} - {po.supplierName} (Rs. {Number(po.poAmount).toLocaleString("en-IN")})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Reference PO Number</Label>
            <Input value={form.referencePoNumber} onChange={(e) => setForm({ ...form, referencePoNumber: e.target.value })} placeholder="PO-26-0001" />
          </div>
          <div className="space-y-1">
            <Label>Bill Number *</Label>
            <Input value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} placeholder="SUPP-INV-001" />
          </div>
          <div className="space-y-1">
            <Label>Supplier Name *</Label>
            <Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
          </div>
          <div className="space-y-1">
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
          <div className="space-y-1">
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
            <Label>GST (%)</Label>
            <Input type="number" min="0" max="100" step="0.01" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} />
          </div>

          <div className="space-y-2 col-span-2">
            <div className="flex items-center justify-between">
              <Label>Item Details</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-28">Qty</TableHead>
                    <TableHead className="w-36">Rate</TableHead>
                    <TableHead className="w-36 text-right">Amount</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.itemDetails.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Item / service description" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min="0" step="0.01" value={item.qty} onChange={(e) => updateItem(index, { qty: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} />
                      </TableCell>
                      <TableCell className="text-right">Rs. {fmt(lineAmount(item))}</TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="col-span-2 rounded bg-muted px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>Rs. {fmt(subtotal)}</span></div>
            <div className="flex justify-between"><span>GST Amount ({fmt(gstRate)}%)</span><span>Rs. {fmt(gstAmount)}</span></div>
            {form.transactionType === "intrastate" ? (
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>CGST Rs. {fmt(cgstAmount)}</span>
                <span>SGST Rs. {fmt(sgstAmount)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>IGST</span>
                <span>Rs. {fmt(igstAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>Rs. {fmt(total)}</span></div>
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
            <Label>Amount (Rs.)</Label>
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

function BillsListTab({ canManage }: { canManage: boolean }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [payBillId, setPayBillId] = useState<number | null>(null);

  const { data: bills = [], isLoading } = useGetSupplierBills(statusFilter ? { status: statusFilter } : {});
  const filteredBills = (bills as SupplierBill[]).filter((bill) => {
    if (monthFilter !== "all" && bill.billDate.slice(5, 7) !== monthFilter) return false;
    if (yearFilter && !bill.billDate.startsWith(yearFilter)) return false;
    const total = parseFloat(bill.total ?? "0");
    if (minAmount && total < Number(minAmount)) return false;
    if (maxAmount && total > Number(maxAmount)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      bill.billNumber,
      bill.supplierName,
      bill.supplierGstin,
      bill.referencePoNumber,
      bill.status,
      bill.total,
    ].some((value) => String(value ?? "").toLowerCase().includes(q));
  });

  const totalOutstanding = filteredBills.reduce(
    (s, b) => s + parseFloat(b.total ?? "0") - parseFloat(b.paidAmount ?? "0"),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end justify-between">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="space-y-1">
            <Label>Month</Label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {Array.from({ length: 12 }).map((_, i) => {
                  const value = String(i + 1).padStart(2, "0");
                  return <SelectItem key={value} value={value}>{new Date(2026, i, 1).toLocaleString("en-IN", { month: "long" })}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Year</Label>
            <Input className="w-28" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} placeholder="2026" />
          </div>
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
          <div className="space-y-1">
            <Label>Search</Label>
            <Input className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Supplier, bill, PO, GST" />
          </div>
          <div className="space-y-1">
            <Label>Min Amount</Label>
            <Input className="w-32" type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label>Max Amount</Label>
            <Input className="w-32" type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="0" />
          </div>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Add Bill</Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Bills</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{filteredBills.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">Rs. {fmt(totalOutstanding)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Value</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">Rs. {fmt(filteredBills.reduce((s, b) => s + parseFloat(b.total ?? "0"), 0))}</p></CardContent>
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
                <TableHead>Ref PO</TableHead>
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
              {filteredBills.length === 0 ? (
                <TableRow><TableCell colSpan={canManage ? 11 : 10} className="text-center text-muted-foreground py-10">No bills found</TableCell></TableRow>
              ) : (
                filteredBills.map((bill) => {
                  const balance = parseFloat(bill.total ?? "0") - parseFloat(bill.paidAmount ?? "0");
                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono text-sm">{bill.billNumber}</TableCell>
                      <TableCell>{bill.supplierName}</TableCell>
                      <TableCell className="font-mono text-xs">{bill.referencePoNumber ?? "-"}</TableCell>
                      <TableCell>{fmtDate(bill.billDate)}</TableCell>
                      <TableCell>{fmtDate(bill.dueDate)}</TableCell>
                      <TableCell className="text-right">Rs. {fmt(bill.subtotal)}</TableCell>
                      <TableCell className="text-right">Rs. {fmt(bill.gstAmount)}</TableCell>
                      <TableCell className="text-right font-medium">Rs. {fmt(bill.total)}</TableCell>
                      <TableCell className={`text-right font-semibold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>Rs. {fmt(balance)}</TableCell>
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
            <CardContent><p className={`text-xl font-bold ${cls}`}>Rs. {fmt(value)}</p></CardContent>
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
                  <TableCell className="text-right">Rs. {fmt(row.total)}</TableCell>
                  <TableCell className="text-right text-green-600">Rs. {fmt(row.paidAmount)}</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">Rs. {fmt(row.outstanding)}</TableCell>
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

export default function SupplierBills() {
  const { user } = useAuth();
  const canManage = FINANCE_ROLES.includes(user?.role ?? "");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Bills</h1>
        <p className="text-muted-foreground text-sm">Accounts payable bills from suppliers linked to purchase orders</p>
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
