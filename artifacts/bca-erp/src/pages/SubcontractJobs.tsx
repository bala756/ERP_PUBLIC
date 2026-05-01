import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSubcontractJobs,
  useGetSubcontractJob,
  useReceiveSubcontractJob,
  useCreateSubcontractJob,
  useGetInventoryItems,
  useGetWorkOrders,
  type SubcontractJobItem,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wrench, CheckCircle2, Plus, Trash2 } from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_VARIANTS: Record<string, string> = {
  sentOut: "bg-amber-100 text-amber-700 border-amber-300",
  received: "bg-emerald-100 text-emerald-700 border-emerald-300",
  cancelled: "bg-gray-200 text-gray-700 border-gray-300",
};

export default function SubcontractJobs() {
  const { data: rows = [], isLoading } = useGetSubcontractJobs();
  const [openId, setOpenId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            Subcontract Jobs
          </h1>
          <p className="text-sm text-muted-foreground">
            Raw goods sent to vendors for processing — received as finished goods with computed unit cost
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-new-subcontract">
          <Plus className="mr-2 h-4 w-4" />
          New Job (Send Out)
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>WO</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Vendor Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    No subcontract jobs yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((j) => (
                  <TableRow key={j.id} data-testid={`row-subcontract-${j.id}`}>
                    <TableCell className="font-mono">{j.jobNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{j.workOrderNumber ?? "—"}</TableCell>
                    <TableCell>{j.vendorName}</TableCell>
                    <TableCell className="text-right">{j.itemCount}</TableCell>
                    <TableCell className="text-right">₹{j.totalVendorCost.toLocaleString("en-IN")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_VARIANTS[j.status] ?? ""}>
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(j.sentAt)}</TableCell>
                    <TableCell className="text-sm">{j.receivedAt ? formatDate(j.receivedAt) : "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setOpenId(j.id)} data-testid={`button-view-subcontract-${j.id}`}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {openId !== null && <SubcontractDetail id={openId} onClose={() => setOpenId(null)} />}
      {createOpen && <CreateSubcontractDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CreateSubcontractDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const create = useCreateSubcontractJob();
  const { data: items = [] } = useGetInventoryItems();
  const { data: workOrders = [] } = useGetWorkOrders();

  const rawItems = items.filter((i) => i.category === "rawMaterial");
  const fgItems = items.filter((i) => i.category !== "rawMaterial");

  const [vendorName, setVendorName] = useState("");
  const [vendorContact, setVendorContact] = useState("");
  const [workOrderId, setWorkOrderId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<
    Array<{
      rawItemId: string;
      sentQty: string;
      finishedItemId: string;
      vendorChargePerUnit: string;
    }>
  >([{ rawItemId: "", sentQty: "1", finishedItemId: "", vendorChargePerUnit: "0" }]);

  const addLine = () =>
    setLines([...lines, { rawItemId: "", sentQty: "1", finishedItemId: "", vendorChargePerUnit: "0" }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<(typeof lines)[number]>) =>
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const isValid =
    vendorName.trim().length > 0 &&
    Number(workOrderId) > 0 &&
    lines.length > 0 &&
    lines.every(
      (l) => Number(l.rawItemId) > 0 && Number(l.sentQty) > 0 && Number(l.vendorChargePerUnit) >= 0,
    );

  const handleCreate = async () => {
    if (!workOrderId) {
      toast({ title: "Pick a Work Order", description: "Subcontract jobs must be tied to a WO.", variant: "destructive" });
      return;
    }
    const body = {
      vendorName: vendorName.trim(),
      vendorContact: vendorContact.trim() || null,
      workOrderId: Number(workOrderId),
      notes: notes.trim() || null,
      items: lines.map((l) => ({
        rawItemId: Number(l.rawItemId),
        sentQty: Number(l.sentQty),
        finishedItemId: l.finishedItemId ? Number(l.finishedItemId) : null,
        vendorChargePerUnit: Number(l.vendorChargePerUnit),
      })),
    };
    await create.mutateAsync(
      { data: body },
      {
        onSuccess: () => {
          toast({ title: "Subcontract job created", description: "Raw goods sent out to vendor." });
          qc.invalidateQueries();
          onClose();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Failed";
          toast({ title: "Failed to create job", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Subcontract Job — Send Out</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Vendor Name *</Label>
            <Input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="ABC Fabrications"
              data-testid="input-sc-vendor-name"
            />
          </div>
          <div>
            <Label>Vendor Contact</Label>
            <Input
              value={vendorContact}
              onChange={(e) => setVendorContact(e.target.value)}
              placeholder="Phone / email"
              data-testid="input-sc-vendor-contact"
            />
          </div>
          <div>
            <Label>Linked Work Order *</Label>
            <Select value={workOrderId} onValueChange={setWorkOrderId}>
              <SelectTrigger data-testid="select-sc-wo">
                <SelectValue placeholder="Pick a WO…" />
              </SelectTrigger>
              <SelectContent>
                {workOrders.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.woNumber} — {w.customerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Required — vendor cost lands against this WO's P&amp;L.
            </p>
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              data-testid="input-sc-notes"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Items to send</h3>
            <Button size="sm" variant="outline" onClick={addLine} data-testid="button-sc-add-line">
              <Plus className="mr-1 h-3 w-3" /> Add line
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Raw Item *</TableHead>
                <TableHead className="w-24 text-right">Qty *</TableHead>
                <TableHead>Finished Item</TableHead>
                <TableHead className="w-28 text-right">Vendor ₹/unit *</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select
                      value={l.rawItemId}
                      onValueChange={(v) => updateLine(idx, { rawItemId: v })}
                    >
                      <SelectTrigger data-testid={`select-sc-raw-${idx}`}>
                        <SelectValue placeholder="Select raw…" />
                      </SelectTrigger>
                      <SelectContent>
                        {rawItems.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.itemCode} — {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 w-20 text-right"
                      value={l.sentQty}
                      onChange={(e) => updateLine(idx, { sentQty: e.target.value })}
                      data-testid={`input-sc-qty-${idx}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={l.finishedItemId || "_same"}
                      onValueChange={(v) => updateLine(idx, { finishedItemId: v === "_same" ? "" : v })}
                    >
                      <SelectTrigger data-testid={`select-sc-fg-${idx}`}>
                        <SelectValue placeholder="(same as raw)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_same">(same as raw)</SelectItem>
                        {fgItems.map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>
                            {f.itemCode} — {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-8 w-24 text-right"
                      value={l.vendorChargePerUnit}
                      onChange={(e) => updateLine(idx, { vendorChargePerUnit: e.target.value })}
                      data-testid={`input-sc-charge-${idx}`}
                    />
                  </TableCell>
                  <TableCell>
                    {lines.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeLine(idx)}
                        data-testid={`button-sc-remove-${idx}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid || create.isPending}
            data-testid="button-sc-create"
          >
            <Wrench className="mr-2 h-4 w-4" />
            Create & Send Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubcontractDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: job, isLoading } = useGetSubcontractJob(id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const receive = useReceiveSubcontractJob();
  const [edits, setEdits] = useState<Record<number, { receivedQty: number; scrapQty: number; vendorChargePerUnit: number }>>({});

  const handleReceive = async () => {
    if (!job) return;
    const items = job.items.map((it) => {
      const e = edits[it.id] ?? { receivedQty: it.sentQty, scrapQty: 0, vendorChargePerUnit: it.vendorChargePerUnit };
      return {
        id: it.id,
        receivedQty: e.receivedQty,
        scrapQty: e.scrapQty,
        vendorChargePerUnit: e.vendorChargePerUnit,
      };
    });
    await receive.mutateAsync(
      { id, data: { items } },
      {
        onSuccess: () => {
          toast({ title: "Subcontract job received", description: "Finished goods posted to stores." });
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {job ? (
              <>
                <span className="font-mono">{job.jobNumber}</span>
                <Badge variant="outline" className={STATUS_VARIANTS[job.status] ?? ""}>{job.status}</Badge>
                <span className="text-sm font-normal text-muted-foreground">→ {job.vendorName}</span>
              </>
            ) : "Loading…"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !job ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Raw Item</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Sent Cost</TableHead>
                <TableHead>Finished Item</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Scrap</TableHead>
                <TableHead className="text-right">Vendor ₹/unit</TableHead>
                <TableHead className="text-right">Computed Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.items.map((it: SubcontractJobItem) => {
                const e = edits[it.id] ?? { receivedQty: it.sentQty, scrapQty: 0, vendorChargePerUnit: it.vendorChargePerUnit };
                const editable = job.status === "sentOut";
                return (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium">{it.rawItemName ?? `#${it.rawItemId}`}</div>
                      {it.rawItemCode && <div className="text-xs font-mono text-muted-foreground">{it.rawItemCode}</div>}
                    </TableCell>
                    <TableCell className="text-right">{it.sentQty}</TableCell>
                    <TableCell className="text-right">₹{it.sentUnitCost.toLocaleString("en-IN")}</TableCell>
                    <TableCell>{it.finishedItemName ?? <span className="text-muted-foreground italic">same as raw</span>}</TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input type="number" min="0" step="0.01" className="h-8 w-20 text-right"
                          value={e.receivedQty}
                          onChange={(ev) => setEdits({ ...edits, [it.id]: { ...e, receivedQty: Number(ev.target.value) } })}
                          data-testid={`input-received-${it.id}`}
                        />
                      ) : it.receivedQty}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input type="number" min="0" step="0.01" className="h-8 w-20 text-right"
                          value={e.scrapQty}
                          onChange={(ev) => setEdits({ ...edits, [it.id]: { ...e, scrapQty: Number(ev.target.value) } })}
                          data-testid={`input-scrap-${it.id}`}
                        />
                      ) : it.scrapQty}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input type="number" min="0" step="0.01" className="h-8 w-24 text-right"
                          value={e.vendorChargePerUnit}
                          onChange={(ev) => setEdits({ ...edits, [it.id]: { ...e, vendorChargePerUnit: Number(ev.target.value) } })}
                          data-testid={`input-charge-${it.id}`}
                        />
                      ) : `₹${it.vendorChargePerUnit.toLocaleString("en-IN")}`}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ₹{it.computedUnitCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {job?.status === "sentOut" && (
            <Button onClick={handleReceive} disabled={receive.isPending} data-testid="button-receive-subcontract">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark Received & Post to Stores
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
