import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStockMovements,
  useCreateStockIn,
  useGetInventoryItems,
  CreateStockInBodySourceType,
  type CreateStockInBody,
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
import { ArrowDownCircle, Plus } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const SOURCE_LABELS: Record<string, string> = {
  purchaseOrder: "Purchase Order",
  importJob: "Import Job",
  subcontractIn: "Subcontract Receipt",
  production: "Production",
  manual: "Manual",
  openingBalance: "Opening Balance",
};

export default function StoresIn() {
  const [open, setOpen] = useState(false);
  const { data: rows = [], isLoading } = useGetStockMovements({ movementType: "in" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowDownCircle className="h-6 w-6 text-green-700" />
            Stores In
          </h1>
          <p className="text-sm text-muted-foreground">
            Cost-stamped goods receipts (auto from POs/imports/subcontract or manual)
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-manual-stock-in">
          <Plus className="mr-2 h-4 w-4" />
          Manual Entry
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
                <TableHead>Source</TableHead>
                <TableHead>Reference</TableHead>
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
                    No stores-in records yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} data-testid={`row-stockin-${r.id}`}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.itemName ?? `#${r.itemId}`}</div>
                      {r.itemCode && <div className="text-xs font-mono text-muted-foreground">{r.itemCode}</div>}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-700">+{r.qty}</TableCell>
                    <TableCell className="text-right">₹{r.unitCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-semibold">₹{r.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.sourceNumber ? <span className="font-mono text-xs">{r.sourceNumber}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{r.createdByName ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {open && <ManualStockInDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function ManualStockInDialog({ onClose }: { onClose: () => void }) {
  const { data: items = [] } = useGetInventoryItems();
  const { toast } = useToast();
  const qc = useQueryClient();
  const create = useCreateStockIn();
  const [form, setForm] = useState<CreateStockInBody>({
    itemId: 0,
    qty: 0,
    unitCost: 0,
    sourceType: CreateStockInBodySourceType.manual,
    notes: "",
  });

  const submit = async () => {
    if (!form.itemId || form.qty <= 0 || form.unitCost < 0) {
      toast({ title: "Invalid entry", description: "Pick an item, enter qty and unit cost.", variant: "destructive" });
      return;
    }
    await create.mutateAsync(
      { data: form },
      {
        onSuccess: () => {
          toast({ title: "Stock In recorded" });
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
        <DialogHeader>
          <DialogTitle>Manual Stock In</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Item</Label>
            <Select value={form.itemId ? String(form.itemId) : ""} onValueChange={(v) => setForm({ ...form, itemId: Number(v) })}>
              <SelectTrigger data-testid="select-stockin-item"><SelectValue placeholder="Pick an item…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {items.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.itemCode ? `${i.itemCode} — ` : ""}{i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input type="number" min="0" step="0.01" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} data-testid="input-stockin-qty" />
            </div>
            <div>
              <Label>Unit Cost (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} data-testid="input-stockin-cost" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="button-stockin-submit">
            Record Stock In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
