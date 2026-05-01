import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetStockMovements,
  useCreateStockInFromPo,
  useGetPurchaseOrders,
  useGetPurchaseOrder,
  getGetPurchaseOrderQueryKey,
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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, Plus, AlertTriangle } from "lucide-react";

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
            Goods receipts — every entry is tied to an approved Purchase Order, with shortage detection.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-receive-from-po">
          <Plus className="mr-2 h-4 w-4" />
          Receive from PO
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
                <TableHead>PO</TableHead>
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
                    <TableCell className="text-right font-semibold text-green-700">
                      +{r.qty}
                      {r.isShort && (
                        <Badge variant="destructive" className="ml-2" data-testid={`badge-short-${r.id}`}>
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Short {r.shortageQty}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">₹{r.unitCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-semibold">₹{r.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-sm">
                      {r.purchaseOrderNumber ? (
                        <span className="font-mono text-xs">{r.purchaseOrderNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.createdByName ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {open && <ReceiveFromPoDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

type LineForm = { lineId: number; description: string; orderedQty: number; receivedQty: number; unitCost: number; productId: number | null };

function ReceiveFromPoDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const create = useCreateStockInFromPo();

  // Pull POs that are eligible for receipt (approved, not yet fully received).
  const { data: approvedPos = [] } = useGetPurchaseOrders({ status: "approved" });
  const { data: receivedPos = [] } = useGetPurchaseOrders({ status: "received" });
  const eligiblePos = useMemo(
    () => [...approvedPos, ...receivedPos],
    [approvedPos, receivedPos],
  );

  const [poId, setPoId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);

  const { data: poDetail } = useGetPurchaseOrder(poId ?? 0, {
    query: { enabled: !!poId, queryKey: getGetPurchaseOrderQueryKey(poId ?? 0) },
  });

  // When PO loads, initialise lines (default: receive full ordered qty).
  React.useEffect(() => {
    if (poDetail?.lineItems) {
      setLines(
        poDetail.lineItems
          .filter((li) => li.productId != null)
          .map((li) => ({
            lineId: li.id,
            description: li.description,
            productId: li.productId ?? null,
            orderedQty: parseFloat(String(li.qty)),
            receivedQty: parseFloat(String(li.qty)),
            unitCost: parseFloat(String(li.unitPrice)),
          })),
      );
    } else {
      setLines([]);
    }
  }, [poDetail?.id]);

  const updateLine = (idx: number, patch: Partial<LineForm>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const submit = async () => {
    if (!poId) {
      toast({ title: "Pick a PO", variant: "destructive" });
      return;
    }
    const payloadLines = lines
      .filter((l) => l.receivedQty > 0 || l.receivedQty < l.orderedQty)
      .map((l) => ({
        purchaseOrderLineId: l.lineId,
        receivedQty: l.receivedQty,
        unitCost: l.unitCost,
      }));
    if (payloadLines.length === 0) {
      toast({ title: "Nothing to receive", description: "Enter received qty for at least one line.", variant: "destructive" });
      return;
    }
    await create.mutateAsync(
      { data: { purchaseOrderId: poId, lines: payloadLines, notes: notes || undefined } },
      {
        onSuccess: (r) => {
          toast({
            title: "Stores In recorded",
            description: `${r.movementsCreated} line(s) posted${r.shortLines > 0 ? `, ${r.shortLines} short` : ""}.`,
          });
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receive Goods from PO</DialogTitle>
          <DialogDescription>
            Pick an approved PO, enter actual received qty per line. Shortages (received &lt; ordered) are tagged automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Purchase Order</Label>
            <Select value={poId ? String(poId) : ""} onValueChange={(v) => setPoId(Number(v))}>
              <SelectTrigger data-testid="select-receive-po">
                <SelectValue placeholder={eligiblePos.length === 0 ? "No approved POs available" : "Pick a PO…"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {eligiblePos.map((po) => (
                  <SelectItem key={po.id} value={String(po.id)}>
                    {po.poNumber} — {po.supplierName} ({po.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {lines.length > 0 && (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right w-32">Received</TableHead>
                    <TableHead className="text-right w-32">Unit Cost (₹)</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => {
                    const shortageQty = Math.max(0, l.orderedQty - l.receivedQty);
                    const isShort = shortageQty > 0.0001;
                    return (
                      <TableRow key={l.lineId} data-testid={`row-receive-line-${l.lineId}`}>
                        <TableCell className="text-sm">{l.description}</TableCell>
                        <TableCell className="text-right text-sm">{l.orderedQty}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.receivedQty}
                            onChange={(e) => updateLine(i, { receivedQty: Number(e.target.value) })}
                            className="text-right"
                            data-testid={`input-receive-qty-${l.lineId}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unitCost}
                            onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })}
                            className="text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {isShort ? (
                            <Badge variant="destructive">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Short {shortageQty}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">OK</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {poId && lines.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This PO has no line items linked to inventory products — nothing to receive.
            </p>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={create.isPending || !poId || lines.length === 0}
            data-testid="button-receive-submit"
          >
            Record Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
