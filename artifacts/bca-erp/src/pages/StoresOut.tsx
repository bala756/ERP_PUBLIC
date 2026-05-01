import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStockMovements,
  useCreateStockOut,
  useGetInventoryItems,
  useGetWorkOrders,
  getGetStockMovementsQueryKey,
  CreateStockOutBodySourceType,
  type CreateStockOutBody,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpCircle, Plus, Lock } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const SOURCE_LABELS: Record<string, string> = {
  workOrderIssue: "Work Order Issue",
  subcontractIssue: "Subcontract Issue",
  manual: "Manual",
};

export default function StoresOut() {
  const [open, setOpen] = useState(false);
  const { data: rows = [], isLoading } = useGetStockMovements({ movementType: "out" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowUpCircle className="h-6 w-6 text-red-600" />
            Stores Out
          </h1>
          <p className="text-sm text-muted-foreground">
            Issues against Work Orders. Once an invoice is generated for a WO, manual issues are locked.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-issue-stock">
          <Plus className="mr-2 h-4 w-4" />
          Issue to WO
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead>Work Order</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No stores-out records yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} data-testid={`row-stockout-${r.id}`}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.itemName ?? `#${r.itemId}`}</div>
                      {r.itemCode && <div className="text-xs font-mono text-muted-foreground">{r.itemCode}</div>}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">−{r.qty}</TableCell>
                    <TableCell className="text-right">₹{r.unitCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-semibold">₹{r.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="font-mono text-xs">{r.workOrderNumber ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</Badge>
                      {r.isFinalDispatch && (
                        <Badge className="ml-2 bg-blue-600 hover:bg-blue-600" data-testid={`badge-final-dispatch-${r.id}`}>
                          Final Dispatch
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.createdByName ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {open && <ManualStockOutDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function ManualStockOutDialog({ onClose }: { onClose: () => void }) {
  const { data: items = [] } = useGetInventoryItems();
  const { data: wos = [] } = useGetWorkOrders();
  const { toast } = useToast();
  const qc = useQueryClient();
  const create = useCreateStockOut();
  const [form, setForm] = useState<CreateStockOutBody>({
    itemId: 0,
    qty: 0,
    workOrderId: 0,
    sourceType: CreateStockOutBodySourceType.workOrderIssue,
    notes: "",
  });

  const selectedItem = useMemo(
    () => items.find((i) => i.id === form.itemId),
    [items, form.itemId],
  );
  const openWos = useMemo(
    () => wos.filter((w) => w.status === "inProgress" || w.status === "draft" || w.status === "pendingApproval"),
    [wos],
  );

  // Pull movements for the selected WO to detect a final-dispatch lock.
  const woMovementsParams = { workOrderId: form.workOrderId };
  const { data: woMovements = [] } = useGetStockMovements(
    woMovementsParams,
    {
      query: {
        enabled: form.workOrderId > 0,
        queryKey: getGetStockMovementsQueryKey(woMovementsParams),
      },
    },
  );
  const dispatchLocked = woMovements.some((m) => m.isFinalDispatch);

  const submit = async () => {
    if (!form.itemId || form.qty <= 0) {
      toast({ title: "Invalid entry", description: "Pick item and qty.", variant: "destructive" });
      return;
    }
    if (!form.workOrderId) {
      toast({ title: "Pick a Work Order", variant: "destructive" });
      return;
    }
    if (dispatchLocked) {
      toast({
        title: "Dispatch locked",
        description: "This WO has a final dispatch (invoice). Manual stores-out is blocked.",
        variant: "destructive",
      });
      return;
    }
    if (selectedItem && form.qty > selectedItem.stockBalance) {
      toast({ title: "Insufficient stock", description: `Only ${selectedItem.stockBalance} ${selectedItem.unit} available.`, variant: "destructive" });
      return;
    }
    await create.mutateAsync(
      { data: form },
      {
        onSuccess: () => {
          toast({ title: "Stock issued" });
          qc.invalidateQueries();
          onClose();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Failed";
          toast({ title: "Failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Issue Stock to Work Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Work Order</Label>
            <Select
              value={form.workOrderId ? String(form.workOrderId) : ""}
              onValueChange={(v) => setForm({ ...form, workOrderId: Number(v) })}
            >
              <SelectTrigger data-testid="select-stockout-wo"><SelectValue placeholder="Pick a WO…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {openWos.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.woNumber} — {w.customerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dispatchLocked && (
              <div className="text-xs text-destructive mt-1 flex items-center gap-1" data-testid="text-dispatch-locked">
                <Lock className="h-3 w-3" />
                Final dispatch already issued for this WO — stores-out is locked.
              </div>
            )}
          </div>
          <div>
            <Label>Item</Label>
            <Select value={form.itemId ? String(form.itemId) : ""} onValueChange={(v) => setForm({ ...form, itemId: Number(v) })}>
              <SelectTrigger data-testid="select-stockout-item"><SelectValue placeholder="Pick an item…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {items.filter((i) => i.stockBalance > 0).map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.itemCode ? `${i.itemCode} — ` : ""}{i.name} ({i.stockBalance} {i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedItem && (
              <div className="text-xs text-muted-foreground mt-1">
                Available: <span className="font-semibold">{selectedItem.stockBalance} {selectedItem.unit}</span>
              </div>
            )}
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min="0" step="0.01" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} data-testid="input-stockout-qty" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={create.isPending || dispatchLocked}
            data-testid="button-stockout-submit"
          >
            Issue Stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
