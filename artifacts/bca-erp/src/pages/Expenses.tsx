import React, { useState } from "react";
import {
  useGetExpenses,
  useCreateExpense,
  useApproveExpense,
  useRejectExpense,
  useDeleteExpense,
  useGetWorkOrders,
  type Expense,
  type WorkOrder,
  getGetExpensesQueryKey,
  getGetWorkOrdersQueryKey,
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
import { Plus, CheckCircle, XCircle, Trash2 } from "lucide-react";

const CATEGORIES = ["general", "travel", "meals", "utilities", "office", "marketing", "maintenance", "other"];

function fmt(n: string | number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n));
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };
  return (
    <Badge className={`text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ─── Create Expense Modal ──────────────────────────────────────────────────────

function CreateExpenseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: workOrders = [] } = useGetWorkOrders(undefined, {
    query: { enabled: open, queryKey: getGetWorkOrdersQueryKey() },
  });
  const [form, setForm] = useState({
    name: "", amount: "", category: "general",
    expenseDate: new Date().toISOString().slice(0, 10), notes: "", receiptRef: "",
    workOrderId: "", gstRate: "0",
  });

  const mutation = useCreateExpense({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
        toast({ title: "Expense added" });
        onClose();
        setForm({ name: "", amount: "", category: "general", expenseDate: new Date().toISOString().slice(0, 10), notes: "", receiptRef: "", workOrderId: "", gstRate: "0" });
      },
      onError: () => toast({ title: "Failed to add expense", variant: "destructive" }),
    },
  });

  function submit() {
    if (!form.name || !form.amount) { toast({ title: "Name and amount are required", variant: "destructive" }); return; }
    mutation.mutate({
      data: {
        name: form.name,
        amount: parseFloat(form.amount),
        workOrderId: form.workOrderId ? Number(form.workOrderId) : undefined,
        category: form.category,
        expenseDate: form.expenseDate,
        gstRate: parseFloat(form.gstRate) || 0,
        notes: form.notes || undefined,
        receiptRef: form.receiptRef || undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Description *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Office supplies" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount (₹) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Work Order Number</Label>
            <Select value={form.workOrderId || "none"} onValueChange={(v) => setForm({ ...form, workOrderId: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Select Work Order" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(workOrders as WorkOrder[]).map((wo) => (
                  <SelectItem key={wo.id} value={String(wo.id)}>
                    {wo.woNumber} - {wo.customerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>GST (%)</Label>
            <Input type="number" min="0" max="100" step="0.01" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Receipt Reference</Label>
            <Input value={form.receiptRef} onChange={(e) => setForm({ ...form, receiptRef: e.target.value })} placeholder="Receipt / bill number" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>Add Expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: expenses = [], isLoading } = useGetExpenses(statusFilter ? { status: statusFilter } : {});

  const approveMutation = useApproveExpense({
    mutation: {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() }); toast({ title: "Expense approved" }); },
      onError: () => toast({ title: "Failed to approve expense", variant: "destructive" }),
    },
  });

  const rejectMutation = useRejectExpense({
    mutation: {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() }); toast({ title: "Expense rejected" }); },
      onError: () => toast({ title: "Failed to reject expense", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteExpense({
    mutation: {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetExpensesQueryKey() }); toast({ title: "Expense deleted" }); },
      onError: () => toast({ title: "Failed to delete expense", variant: "destructive" }),
    },
  });

  const filtered = (expenses as Expense[]).filter((e) => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (monthFilter !== "all" && e.expenseDate.slice(5, 7) !== monthFilter) return false;
    if (yearFilter && !e.expenseDate.startsWith(yearFilter)) return false;
    const amount = parseFloat(e.amount ?? "0");
    if (minAmount && amount < Number(minAmount)) return false;
    if (maxAmount && amount > Number(maxAmount)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [e.name, e.category, e.receiptRef, e.notes, e.status, e.workOrderNumber, e.woNumber]
      .some((value) => String(value ?? "").toLowerCase().includes(q));
  });

  const totalApproved = filtered.filter((e) => e.status === "approved").reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);
  const totalPending = filtered.filter((e) => e.status === "pending").reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm">Miscellaneous business expenses with approval workflow</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Expense
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending Approval</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-600">₹{fmt(totalPending)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Approved</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">₹{fmt(totalApproved)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total ({filtered.length} entries)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">₹{fmt(filtered.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0))}</p></CardContent>
        </Card>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
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
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Category</Label>
          <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Search</Label>
          <Input className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="WO, receipt, GST, status" />
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

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Work Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">No expenses found</TableCell></TableRow>
              ) : (
                filtered.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{expense.name}</div>
                      {expense.notes && <div className="text-xs text-muted-foreground">{expense.notes}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{expense.category}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{expense.workOrderNumber ?? expense.woNumber ?? "-"}</TableCell>
                    <TableCell>{fmtDate(expense.expenseDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{expense.receiptRef ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium">Rs. {fmt(expense.gstAmount)}</div>
                      <div className="text-xs text-muted-foreground">{fmt(expense.gstRate)}%</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">₹{fmt(expense.amount)}</TableCell>
                    <TableCell>{statusBadge(expense.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {expense.status === "pending" && (
                          <>
                            <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700" onClick={() => approveMutation.mutate({ id: expense.id })}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => rejectMutation.mutate({ id: expense.id })}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {expense.status !== "approved" && (
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => deleteMutation.mutate({ id: expense.id })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateExpenseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
