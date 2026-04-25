import React, { useState } from "react";
import {
  useGetGstInvoices,
  useCreateGstInvoice,
  useRecordInvoicePayment,
  useGetGstInvoice,
  useGetWorkOrders,
  getGetGstInvoiceQueryKey,
  getGetWorkOrdersQueryKey,
  type GstInvoice,
  type GstInvoiceDetail,
  type WorkOrder,
  type CreateGstInvoiceBody,
  type CreateInvoiceLineItemBody,
  getGetGstInvoicesQueryKey,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Eye, IndianRupee, Printer, CreditCard, Trash2, Briefcase, X } from "lucide-react";

const FINANCE_ROLES = ["accounts", "cfo", "director", "admin"];

function canManage(role: string) {
  return FINANCE_ROLES.includes(role);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    unpaid: "bg-red-100 text-red-800",
    partial: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return (
    <Badge className={`text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function fmt(n: string | number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n));
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Invoice Detail/Print View ─────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, open, onClose }: { invoiceId: number; open: boolean; onClose: () => void }) {
  const { data: invoice } = useGetGstInvoice(invoiceId, { query: { enabled: open, queryKey: getGetGstInvoiceQueryKey(invoiceId) } });

  if (!invoice) return null;
  const inv = invoice as GstInvoiceDetail;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Invoice: {inv.invoiceNumber}</span>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex justify-between">
            <div>
              <p className="font-bold text-lg">BCA Entertainment Works</p>
              {inv.bcaGstin && <p className="text-muted-foreground">GSTIN: {inv.bcaGstin}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold">Tax Invoice</p>
              <p>No: <span className="font-mono">{inv.invoiceNumber}</span></p>
              <p>Date: {fmtDate(inv.invoiceDate)}</p>
              {inv.dueDate && <p className="text-muted-foreground">Due: {fmtDate(inv.dueDate)}</p>}
            </div>
          </div>

          <div className="border rounded p-3 bg-muted/30">
            <p className="font-semibold">Bill To:</p>
            <p>{inv.customerName}</p>
            {inv.customerAddress && <p className="text-muted-foreground">{inv.customerAddress}</p>}
            {inv.customerGstin && <p>GSTIN: {inv.customerGstin}</p>}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">GST%</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lineItems?.map((li, i) => (
                <TableRow key={li.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{li.description}</TableCell>
                  <TableCell>{li.hsnCode ?? "—"}</TableCell>
                  <TableCell className="text-right">{li.qty}</TableCell>
                  <TableCell className="text-right">₹{fmt(li.unitPrice)}</TableCell>
                  <TableCell className="text-right">₹{fmt(li.taxableValue)}</TableCell>
                  <TableCell className="text-right">{li.gstRate}%</TableCell>
                  <TableCell className="text-right">₹{fmt(li.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{fmt(inv.subtotal)}</span></div>
              {parseFloat(inv.cgstAmount ?? "0") > 0 && (
                <div className="flex justify-between"><span>CGST</span><span>₹{fmt(inv.cgstAmount)}</span></div>
              )}
              {parseFloat(inv.sgstAmount ?? "0") > 0 && (
                <div className="flex justify-between"><span>SGST</span><span>₹{fmt(inv.sgstAmount)}</span></div>
              )}
              {parseFloat(inv.igstAmount ?? "0") > 0 && (
                <div className="flex justify-between"><span>IGST</span><span>₹{fmt(inv.igstAmount)}</span></div>
              )}
              {parseFloat(inv.roundOff ?? "0") !== 0 && (
                <div className="flex justify-between text-muted-foreground"><span>Round Off</span><span>₹{fmt(inv.roundOff)}</span></div>
              )}
              <div className="flex justify-between font-bold border-t pt-1 text-base">
                <span>Total</span><span>₹{fmt(inv.total)}</span>
              </div>
              <div className="flex justify-between text-green-600"><span>Paid</span><span>₹{fmt(inv.paidAmount)}</span></div>
              <div className="flex justify-between font-semibold text-red-600 border-t pt-1">
                <span>Balance Due</span>
                <span>₹{fmt(parseFloat(inv.total ?? "0") - parseFloat(inv.paidAmount ?? "0"))}</span>
              </div>
            </div>
          </div>

          {inv.payments && inv.payments.length > 0 && (
            <div>
              <p className="font-semibold mb-2">Payment History</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{fmtDate(p.paymentDate)}</TableCell>
                      <TableCell className="capitalize">{p.paymentMode}</TableCell>
                      <TableCell>{p.reference ?? "—"}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">₹{fmt(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {inv.notes && <p className="text-muted-foreground text-xs border-t pt-2">Notes: {inv.notes}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Payment Modal ──────────────────────────────────────────────────────

function RecordPaymentModal({ invoiceId, open, onClose }: { invoiceId: number; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ paymentDate: new Date().toISOString().slice(0, 10), amount: "", paymentMode: "bank", reference: "", notes: "" });

  const mutation = useRecordInvoicePayment({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetGstInvoicesQueryKey() });
        toast({ title: "Payment recorded" });
        onClose();
      },
      onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
    },
  });

  function submit() {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    mutation.mutate({ id: invoiceId, data: { paymentDate: form.paymentDate, amount, paymentMode: form.paymentMode, reference: form.reference || undefined, notes: form.notes || undefined } });
  }

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
          <div className="space-y-1">
            <Label>Payment Mode</Label>
            <Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["cash", "bank", "cheque", "upi", "neft", "rtgs"].map((m) => (
                  <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reference / Cheque No.</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Invoice Modal ──────────────────────────────────────────────────────

type LineItemDraft = { description: string; hsnCode: string; qty: string; unitPrice: string; gstRate: string };
const emptyLine = (): LineItemDraft => ({ description: "", hsnCode: "", qty: "1", unitPrice: "0", gstRate: "18" });

function WoPickerDialog({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (wo: WorkOrder) => void }) {
  const { data: workOrders = [] } = useGetWorkOrders(undefined, { query: { enabled: open, queryKey: getGetWorkOrdersQueryKey() } });
  const active = workOrders.filter((wo) => !["cancelled"].includes(wo.status));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" /> Select Work Order
          </DialogTitle>
        </DialogHeader>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No open work orders found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WO #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((wo) => (
                <TableRow key={wo.id}>
                  <TableCell className="font-mono text-sm">{wo.woNumber}</TableCell>
                  <TableCell>{wo.customerName}{wo.company ? ` — ${wo.company}` : ""}</TableCell>
                  <TableCell className="capitalize">{wo.status.replace(/([A-Z])/g, " $1").trim()}</TableCell>
                  <TableCell className="text-right">₹{fmt(wo.total)}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => { onSelect(wo); onClose(); }}>Select</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateInvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showWoPicker, setShowWoPicker] = useState(false);
  const [loadedWo, setLoadedWo] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "", customerAddress: "", customerGstin: "", bcaGstin: "",
    invoiceDate: new Date().toISOString().slice(0, 10), dueDate: "",
    transactionType: "intrastate", notes: "",
    workOrderId: null as number | null,
  });
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()]);

  function loadFromWo(wo: WorkOrder) {
    setLoadedWo(wo.woNumber);
    setForm((prev) => ({
      ...prev,
      customerName: wo.customerName,
      customerAddress: "",
      workOrderId: wo.id,
    }));
    const woLines = (wo.items ?? []).map((item) => ({
      description: item.description ?? "",
      hsnCode: "",
      qty: String(item.qty ?? 1),
      unitPrice: String(item.unitPrice ?? 0),
      gstRate: "18",
    }));
    setLines(woLines.length > 0 ? woLines : [emptyLine()]);
  }

  React.useEffect(() => {
    if (!open) {
      setLoadedWo(null);
      setForm({ customerName: "", customerAddress: "", customerGstin: "", bcaGstin: "", invoiceDate: new Date().toISOString().slice(0, 10), dueDate: "", transactionType: "intrastate", notes: "", workOrderId: null });
      setLines([emptyLine()]);
    }
  }, [open]);

  const mutation = useCreateGstInvoice({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetGstInvoicesQueryKey() });
        toast({ title: "Invoice created" });
        onClose();
      },
      onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
    },
  });

  function updateLine(i: number, field: keyof LineItemDraft, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function submit() {
    if (!form.customerName) { toast({ title: "Customer name required", variant: "destructive" }); return; }
    const lineItems: CreateInvoiceLineItemBody[] = lines.map((l) => ({
      description: l.description,
      hsnCode: l.hsnCode || undefined,
      qty: parseFloat(l.qty) || 1,
      unitPrice: parseFloat(l.unitPrice) || 0,
      gstRate: parseFloat(l.gstRate) || 18,
    }));
    if (lineItems.some((l) => !l.description)) { toast({ title: "All line items need a description", variant: "destructive" }); return; }

    const body: CreateGstInvoiceBody = {
      customerName: form.customerName,
      invoiceDate: form.invoiceDate,
      transactionType: form.transactionType,
      dueDate: form.dueDate || undefined,
      customerAddress: form.customerAddress || undefined,
      customerGstin: form.customerGstin || undefined,
      bcaGstin: form.bcaGstin || undefined,
      notes: form.notes || undefined,
      workOrderId: form.workOrderId ?? undefined,
      lineItems,
    };
    mutation.mutate({ data: body });
  }

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const gstTotal = lines.reduce((s, l) => {
    const tv = (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0);
    return s + (tv * (parseFloat(l.gstRate) || 18)) / 100;
  }, 0);

  return (
    <>
      <WoPickerDialog open={showWoPicker} onClose={() => setShowWoPicker(false)} onSelect={loadFromWo} />
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Create GST Invoice</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowWoPicker(true)}
                data-testid="button-load-from-wo"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Load from Work Order
              </Button>
            </DialogTitle>
          </DialogHeader>
          {loadedWo && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <Briefcase className="h-4 w-4 shrink-0" />
              <span>Loaded from Work Order <strong>{loadedWo}</strong> — review and adjust the details below.</span>
              <Button variant="ghost" size="sm" className="ml-auto h-6 px-1 text-blue-600" onClick={() => setLoadedWo(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Customer Name *</Label>
                <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Invoice Date *</Label>
              <Input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Customer Address</Label>
              <Textarea rows={2} value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Customer GSTIN</Label>
              <Input value={form.customerGstin} onChange={(e) => setForm({ ...form, customerGstin: e.target.value })} placeholder="22AAAAA0000A1Z5" />
            </div>
            <div className="space-y-1">
              <Label>BCA GSTIN</Label>
              <Input value={form.bcaGstin} onChange={(e) => setForm({ ...form, bcaGstin: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Transaction Type</Label>
              <Select value={form.transactionType} onValueChange={(v) => setForm({ ...form, transactionType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intrastate">Intrastate (CGST+SGST)</SelectItem>
                  <SelectItem value="interstate">Interstate (IGST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="h-3 w-3 mr-1" /> Add Row
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24">HSN</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead className="w-28">Rate (₹)</TableHead>
                    <TableHead className="w-20">GST%</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => {
                    const lineTotal = (parseFloat(line.qty) || 0) * (parseFloat(line.unitPrice) || 0) * (1 + (parseFloat(line.gstRate) || 18) / 100);
                    return (
                      <TableRow key={i}>
                        <TableCell><Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} className="min-w-32" /></TableCell>
                        <TableCell><Input value={line.hsnCode} onChange={(e) => updateLine(i, "hsnCode", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" value={line.qty} onChange={(e) => updateLine(i, "qty", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, "unitPrice", e.target.value)} /></TableCell>
                        <TableCell><Input type="number" value={line.gstRate} onChange={(e) => updateLine(i, "gstRate", e.target.value)} /></TableCell>
                        <TableCell className="text-right font-medium">₹{fmt(lineTotal)}</TableCell>
                        <TableCell>
                          {lines.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end mt-2 gap-6 text-sm">
              <span>Subtotal: ₹{fmt(subtotal)}</span>
              <span>GST: ₹{fmt(gstTotal)}</span>
              <span className="font-bold">Total: ₹{fmt(subtotal + gstTotal)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>Create Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GSTInvoices() {
  const { user } = useAuth();
  const canCreate = canManage(user?.role ?? "");

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [payId, setPayId] = useState<number | null>(null);

  const params = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search ? { search } : {}),
    ...(monthFilter ? { month: monthFilter } : {}),
    ...(yearFilter ? { year: yearFilter } : {}),
  };

  const { data: invoices = [], isLoading } = useGetGstInvoices(params as Record<string, string>);

  const totalOutstanding = (invoices as GstInvoice[]).reduce(
    (s, inv) => s + parseFloat(inv.total ?? "0") - parseFloat(inv.paidAmount ?? "0"),
    0
  );
  const totalPaid = (invoices as GstInvoice[]).reduce((s, inv) => s + parseFloat(inv.paidAmount ?? "0"), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GST Invoices</h1>
          <p className="text-muted-foreground text-sm">Sales invoices with GST breakdown</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Invoiced</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">₹{fmt((invoices as GstInvoice[]).reduce((s, i) => s + parseFloat(i.total ?? "0"), 0))}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">₹{fmt(totalOutstanding)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Received</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">₹{fmt(totalPaid)}</p></CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={monthFilter || "all"} onValueChange={(v) => setMonthFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All months" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {Array.from({ length: 12 }, (_, i) => {
                const v = String(i + 1).padStart(2, "0");
                return <SelectItem key={v} value={v}>{new Date(2000, i, 1).toLocaleString("en-IN", { month: "long" })}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <Input value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-24" type="number" />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer or invoice no." className="w-52" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices as GstInvoice[]).length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No invoices found</TableCell></TableRow>
              ) : (
                (invoices as GstInvoice[]).map((inv) => {
                  const balance = parseFloat(inv.total ?? "0") - parseFloat(inv.paidAmount ?? "0");
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                      <TableCell>{fmtDate(inv.invoiceDate)}</TableCell>
                      <TableCell>{inv.customerName}</TableCell>
                      <TableCell className="text-right font-medium">₹{fmt(inv.total)}</TableCell>
                      <TableCell className="text-right text-green-600">₹{fmt(inv.paidAmount)}</TableCell>
                      <TableCell className={`text-right font-semibold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        ₹{fmt(balance)}
                      </TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setDetailId(inv.id)}><Eye className="h-4 w-4" /></Button>
                          {canCreate && inv.status !== "paid" && (
                            <Button variant="ghost" size="sm" onClick={() => setPayId(inv.id)}><CreditCard className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {detailId !== null && (
        <InvoiceDetailModal invoiceId={detailId} open={detailId !== null} onClose={() => setDetailId(null)} />
      )}
      {payId !== null && (
        <RecordPaymentModal invoiceId={payId} open={payId !== null} onClose={() => setPayId(null)} />
      )}
    </div>
  );
}
