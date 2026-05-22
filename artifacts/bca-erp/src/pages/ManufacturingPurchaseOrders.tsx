import React, { useMemo, useState } from "react";
import {
  useGetPurchaseOrders,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useReceivePurchaseOrder,
  useDirectorApprovePurchaseOrder,
  useDirectorRejectPurchaseOrder,
  useGetPurchaseRequests,
  useGetPurchaseRequest,
  useCreatePurchaseOrder,
  useGetInventoryItems,
  getGetPurchaseOrdersQueryKey,
  getGetPurchaseRequestsQueryKey,
  getGetPurchaseRequestQueryKey,
  type PurchaseOrder,
  type PurchaseRequestItem,
  type InventoryItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Factory, CheckCircle, XCircle, PackageCheck, AlertTriangle, ShieldAlert, Printer, ClipboardList, Plus } from "lucide-react";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  pendingApproval: "outline",
  pendingDirectorApproval: "outline",
  approved: "default",
  received: "secondary",
  cancelled: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pendingApproval: "Pending Approval",
  pendingDirectorApproval: "Pending Approval",
  approved: "Approved",
  received: "Received",
  cancelled: "Rejected",
};

const APPROVE_ROLES = ["manager", "director", "admin", "cfo"];
const DIRECTOR_ROLES = ["director", "admin"];
const RECEIVE_ROLES = ["stores", "manager", "director", "admin"];
// Roles that can raise a PO (matches server-side PO_CREATE_ROLES). Anyone else
// will see the "Create PO from PR" button hidden.
const CREATE_PO_ROLES = ["purchase", "manager", "director", "admin", "cfo"];

export default function ManufacturingPurchaseOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [rejectTarget, setRejectTarget] = useState<{ id: number; isDirector: boolean } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [createFromPrOpen, setCreateFromPrOpen] = useState(false);

  const { data: allPOs = [], isLoading } = useGetPurchaseOrders();

  const pos = allPOs
    .filter((po) => po.type === "rawMaterial")
    .filter((po) => statusFilter === "all" || po.status === statusFilter);

  const canApprove = user && APPROVE_ROLES.includes(user.role);
  const canDirectorApprove = user && DIRECTOR_ROLES.includes(user.role);
  const canReceive = user && RECEIVE_ROLES.includes(user.role);
  const canCreatePO = !!user && CREATE_PO_ROLES.includes(user.role);
  const isCFO = user && ["cfo", "director", "admin"].includes(user.role);

  const pendingDirectorCount = allPOs.filter(
    (po) => po.type === "rawMaterial" && po.status === "pendingDirectorApproval",
  ).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetPurchaseOrdersQueryKey() });

  const approvePO = useApprovePurchaseOrder({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "PO approved" }); },
      onError: (err: Error) => toast({ title: err.message ?? "Failed to approve PO", variant: "destructive" }),
    },
  });

  const rejectPO = useRejectPurchaseOrder({
    mutation: {
      onSuccess: () => { invalidate(); setRejectTarget(null); setRejectNote(""); toast({ title: "PO rejected" }); },
      onError: () => toast({ title: "Failed to reject PO", variant: "destructive" }),
    },
  });

  const directorApprovePO = useDirectorApprovePurchaseOrder({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "PO approved by director" }); },
      onError: (err: Error) => toast({ title: err.message ?? "Failed to approve PO", variant: "destructive" }),
    },
  });

  const directorRejectPO = useDirectorRejectPurchaseOrder({
    mutation: {
      onSuccess: () => { invalidate(); setRejectTarget(null); setRejectNote(""); toast({ title: "PO rejected by director" }); },
      onError: () => toast({ title: "Failed to reject PO", variant: "destructive" }),
    },
  });

  const receivePO = useReceivePurchaseOrder({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Goods received — Stock IN recorded" }); },
      onError: () => toast({ title: "Failed to mark received", variant: "destructive" }),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Factory className="h-6 w-6" />
            Manufacturing Purchase Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Raw material procurement for production
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingDirectorCount > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {pendingDirectorCount} awaiting director approval
            </Badge>
          )}
          {canCreatePO && (
            <Button
              onClick={() => setCreateFromPrOpen(true)}
              data-testid="button-create-po-from-pr"
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Create PO from PR
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pendingApproval">Pending Approval</SelectItem>
            <SelectItem value="pendingDirectorApproval">Pending Director</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {pos.length} order{pos.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead>PO Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved By</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : pos.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    No manufacturing purchase orders found
                  </TableCell>
                </TableRow>
              )
              : pos.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/purchase-orders/${po.id}/print`} className="hover:underline text-blue-700">
                      {po.poNumber}
                    </Link>
                    {po.warrantyText && (
                      <div className="text-xs text-muted-foreground mt-0.5">Warranty: {po.warrantyText}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{po.supplierName}</div>
                    {po.supplierContact && (
                      <div className="text-xs text-muted-foreground">{po.supplierContact}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {po.supplierGstin ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {po.paymentTerms ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {po.deliveryDate ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>₹{po.poAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={STATUS_COLORS[po.status] ?? "outline"}>
                        {STATUS_LABELS[po.status] ?? po.status}
                      </Badge>
                      {po.requiresDirectorApproval && po.status !== "approved" && po.status !== "received" && po.status !== "cancelled" && (
                        <span className="flex items-center gap-1 text-amber-600 text-xs">
                          <ShieldAlert className="h-3 w-3" />
                          Director req.
                        </span>
                      )}
                      {po.requiresCfoApproval && (
                        <span className="flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          CFO req.
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {po.approvedByName ?? <span className="text-muted-foreground">—</span>}
                    {po.approvedAt && (
                      <div className="text-xs text-muted-foreground">
                        {new Date(po.approvedAt).toLocaleDateString()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(po.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {po.status === "pendingDirectorApproval" && canDirectorApprove && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => directorApprovePO.mutate({ id: po.id })}
                            disabled={directorApprovePO.isPending}
                            title="Director Approve"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectTarget({ id: po.id, isDirector: true })}
                            title="Director Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {po.status === "pendingApproval" && canApprove && (
                        (!po.requiresCfoApproval || isCFO) ? (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => approvePO.mutate({ id: po.id })}
                              disabled={approvePO.isPending}
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setRejectTarget({ id: po.id, isDirector: false })}
                              title="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            CFO only
                          </span>
                        )
                      )}
                      {po.status === "approved" && canReceive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => receivePO.mutate({ id: po.id })}
                          disabled={receivePO.isPending}
                          title="Mark Received"
                        >
                          <PackageCheck className="h-4 w-4 mr-1" />
                          Receive
                        </Button>
                      )}
                      {po.rejectionNote && (
                        <span className="text-xs text-destructive ml-1" title={po.rejectionNote}>
                          Rejected
                        </span>
                      )}
                      <Link href={`/purchase-orders/${po.id}/print`}>
                        <Button size="sm" variant="ghost" title="Print PO">
                          <Printer className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNote(""); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejectTarget?.isDirector ? "Director Reject Purchase Order" : "Reject Purchase Order"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection</Label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectNote(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={rejectPO.isPending || directorRejectPO.isPending}
              onClick={() => {
                if (rejectTarget !== null) {
                  if (rejectTarget.isDirector) {
                    directorRejectPO.mutate({ id: rejectTarget.id, data: { rejectionNote: rejectNote } });
                  } else {
                    rejectPO.mutate({ id: rejectTarget.id, data: { rejectionNote: rejectNote } });
                  }
                }
              }}
            >
              {(rejectPO.isPending || directorRejectPO.isPending) ? "Rejecting..." : "Reject PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatePoFromPrDialog
        open={createFromPrOpen}
        onClose={() => setCreateFromPrOpen(false)}
        onCreated={() => {
          setCreateFromPrOpen(false);
          invalidate();
          // Also bust the PR caches so the PR list/detail (visible in
          // /purchase-requests and the eligibility dropdown) reflect the
          // newly converted items immediately.
          qc.invalidateQueries({ queryKey: getGetPurchaseRequestsQueryKey() });
          qc.invalidateQueries({ queryKey: ["/api/purchase-requests"] });
          toast({ title: "Purchase order created from PR" });
        }}
      />
    </div>
  );
}

// ─── CreatePoFromPrDialog ────────────────────────────────────────────────────
// Two-step dialog used by buyers to raise a PO directly from an approved PR.
// Step 1: pick an approved PR that still has pending raw/manufactured items.
// Step 2: review/edit pre-populated line items and supplier details, then save.
// On save we send `purchaseRequestItemIds` so the server flips those PR items
// to `convertedToPo` and stamps the new PO id on them — no manual re-entry.

type LineDraft = {
  prItemId: number;
  selected: boolean;
  productId: number | null;
  productCode: string;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  stockBalance: number;
  branch: "raw" | "manufactured" | "imported";
};

function CreatePoFromPrDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { data: inventoryItems = [] } = useGetInventoryItems();
  const [selectedPrId, setSelectedPrId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  // Reset everything when the dialog reopens so a stale PR draft never leaks
  // into a new session.
  React.useEffect(() => {
    if (!open) {
      setSelectedPrId(null);
      setSupplierName("");
      setSupplierContact("");
      setSupplierGstin("");
      setPaymentTerms("");
      setDeliveryDate("");
      setNotes("");
      setLines([]);
    }
  }, [open]);

  // Load the list of all PRs and narrow client-side to those that are
  // 'approved' AND still have at least one pending raw/manufactured item left
  // to procure. A PR with everything already converted/issued is hidden.
  const { data: allPRs = [], isLoading: loadingPRs } = useGetPurchaseRequests(
    undefined,
    { query: { enabled: open, queryKey: getGetPurchaseRequestsQueryKey() } },
  );
  const eligiblePRs = useMemo(
    () => allPRs.filter((pr) => pr.status === "approved"),
    [allPRs],
  );

  // Pull the selected PR's full detail (items) so we can pre-populate lines.
  const { data: prDetail, isLoading: loadingDetail } = useGetPurchaseRequest(
    selectedPrId ?? 0,
    {
      query: {
        enabled: open && !!selectedPrId,
        queryKey: getGetPurchaseRequestQueryKey(selectedPrId ?? 0),
      },
    },
  );

  // When the PR detail arrives, seed the line draft state with the PR's
  // pending raw/manufactured items pre-selected. Imported items can't go on a
  // raw-material PO and are excluded.
  React.useEffect(() => {
    if (!prDetail) return;
    const masterByProductId = new Map(
      (inventoryItems as InventoryItem[]).map((item) => [
        item.id,
        item,
      ]),
    );
    const seeded: LineDraft[] = prDetail.items
      .filter(
        (it: PurchaseRequestItem) =>
          it.status === "pending" &&
          (it.branch === "raw" || it.branch === "manufactured"),
      )
      .map((it: PurchaseRequestItem) => ({
        prItemId: it.id,
        selected: true,
        productId: it.productId ?? null,
        productCode: it.productCode ?? "",
        description: it.description,
        unit: it.unit ?? "nos",
        qty: it.shortfallQty,
        unitPrice:
          it.productId
            ? ((masterByProductId.get(it.productId)?.defaultPurchasePrice ?? 0) || it.estimatedUnitCost || 0)
            : (it.estimatedUnitCost ?? 0),
        stockBalance: it.productId
          ? (masterByProductId.get(it.productId)?.stockBalance ?? it.onHandQty ?? 0)
          : (it.onHandQty ?? 0),
        branch: it.branch as LineDraft["branch"],
      }));
    setLines(seeded);
  }, [prDetail, inventoryItems]);

  const createPO = useCreatePurchaseOrder({
    mutation: {
      onSuccess: () => onCreated(),
      onError: (err: Error) =>
        toast({
          title: err.message ?? "Failed to create PO",
          variant: "destructive",
        }),
    },
  });

  const selectedLines = lines.filter((l) => l.selected);
  const subtotal = selectedLines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0),
    0,
  );

  const canSubmit =
    !!prDetail &&
    !!supplierName.trim() &&
    selectedLines.length > 0 &&
    selectedLines.every(
      (l) => !!l.productId && Number(l.qty) > 0 && Number(l.unitPrice) >= 0,
    );

  const handleSubmit = () => {
    if (!prDetail || !canSubmit) return;
    createPO.mutate({
      data: {
        workOrderId: prDetail.workOrderId,
        type: "rawMaterial",
        supplierName: supplierName.trim(),
        supplierContact: supplierContact.trim() || undefined,
        supplierGstin: supplierGstin.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        deliveryDate: deliveryDate || undefined,
        notes: notes.trim() || undefined,
        poAmount: subtotal,
        quotedAmount: subtotal,
        lineItems: selectedLines.map((l) => ({
          productId: l.productId ?? undefined,
          productCode: l.productCode || undefined,
          description: l.description,
          unit: l.unit,
          qty: Number(l.qty),
          unitPrice: Number(l.unitPrice),
        })),
        purchaseRequestItemIds: selectedLines.map((l) => l.prItemId),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Create Purchase Order from Purchase Request
          </DialogTitle>
          <DialogDescription>
            Pick an approved PR. Its pending raw / manufactured items will be
            pre-filled below. On save, the linked PR items will be marked as
            converted to this PO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Approved Purchase Request</Label>
            <Select
              value={selectedPrId ? String(selectedPrId) : ""}
              onValueChange={(v) => setSelectedPrId(Number(v))}
            >
              <SelectTrigger data-testid="select-source-pr">
                <SelectValue placeholder={loadingPRs ? "Loading..." : "Select an approved PR"} />
              </SelectTrigger>
              <SelectContent>
                {eligiblePRs.length === 0 && !loadingPRs && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No approved purchase requests available.
                  </div>
                )}
                {eligiblePRs.map((pr) => (
                  <SelectItem key={pr.id} value={String(pr.id)}>
                    {pr.prNumber} — {pr.woNumber ?? `WO #${pr.workOrderId}`}
                    {pr.customerName ? ` (${pr.customerName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPrId && loadingDetail && (
            <Skeleton className="h-32 w-full" />
          )}

          {prDetail && !loadingDetail && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Supplier Name *</Label>
                  <Input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. Acme Suppliers Pvt Ltd"
                    data-testid="input-supplier-name"
                  />
                </div>
                <div>
                  <Label>Supplier Contact</Label>
                  <Input
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    placeholder="Phone / email"
                  />
                </div>
                <div>
                  <Label>Supplier GSTIN</Label>
                  <Input
                    value={supplierGstin}
                    onChange={(e) => setSupplierGstin(e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <Input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="e.g. 50% advance, 50% on delivery"
                  />
                </div>
                <div>
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Line items from {prDetail.prNumber}</Label>
                  <span className="text-xs text-muted-foreground">
                    Imported items are excluded — they go through Import Jobs.
                  </span>
                </div>
                {lines.length === 0 ? (
                  <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                    No pending raw/manufactured items left on this PR.
                  </div>
                ) : (
                  <div className="rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-24">Unit</TableHead>
                          <TableHead className="w-28 text-right">In Stock</TableHead>
                          <TableHead className="w-28 text-right">Qty</TableHead>
                          <TableHead className="w-32 text-right">Unit Price</TableHead>
                          <TableHead className="w-32 text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((l, idx) => (
                          <TableRow key={l.prItemId} data-testid={`row-pr-line-${l.prItemId}`}>
                            <TableCell>
                              <Checkbox
                                checked={l.selected}
                                onCheckedChange={(v) => {
                                  const next = [...lines];
                                  next[idx] = { ...next[idx]!, selected: !!v };
                                  setLines(next);
                                }}
                                data-testid={`checkbox-line-${l.prItemId}`}
                              />
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="font-medium">{l.description}</div>
                              {l.productCode && (
                                <div className="text-xs text-muted-foreground">{l.productCode}</div>
                              )}
                              {!l.productId && (
                                <div className="text-xs text-destructive">
                                  No product master — cannot include in PO
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{l.unit}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {l.stockBalance}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="any"
                                min={0}
                                value={l.qty}
                                onChange={(e) => {
                                  const next = [...lines];
                                  next[idx] = { ...next[idx]!, qty: Number(e.target.value) };
                                  setLines(next);
                                }}
                                disabled={!l.selected}
                                className="text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="any"
                                min={0}
                                value={l.unitPrice}
                                onChange={(e) => {
                                  const next = [...lines];
                                  next[idx] = { ...next[idx]!, unitPrice: Number(e.target.value) };
                                  setLines(next);
                                }}
                                disabled={!l.selected}
                                className="text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="mt-2 text-right text-sm">
                  Subtotal: <span className="font-semibold tabular-nums">{subtotal.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || createPO.isPending}
            data-testid="button-submit-po-from-pr"
          >
            {createPO.isPending ? "Creating..." : "Create Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
