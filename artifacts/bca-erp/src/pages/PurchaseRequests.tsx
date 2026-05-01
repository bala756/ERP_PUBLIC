import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetPurchaseRequests,
  useGetPurchaseRequest,
  useApprovePurchaseRequest,
  useRejectPurchaseRequest,
  useUpdatePurchaseRequest,
  PurchaseRequestItemBranch,
  type PurchaseRequest,
  type PurchaseRequestItem,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, ExternalLink, CheckCircle2, XCircle,
  Factory, Package, Ship, Trash2, Plus,
} from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_VARIANTS: Record<string, { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "bg-blue-100 text-blue-700 border-blue-300" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700 border-green-300" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-300" },
  cancelled: { label: "Cancelled", cls: "bg-gray-200 text-gray-700 border-gray-300" },
};

const BRANCH_ICONS: Record<string, React.ReactNode> = {
  manufactured: <Factory className="h-3.5 w-3.5" />,
  raw: <Package className="h-3.5 w-3.5" />,
  imported: <Ship className="h-3.5 w-3.5" />,
};
const BRANCH_LABELS: Record<string, string> = {
  manufactured: "Manufactured",
  raw: "Raw Material",
  imported: "Imported",
};

// Mirror of the server-side PRICE_VIEW_ROLES set. Used purely for client
// rendering as defence-in-depth — the server still strips price fields
// (estimatedUnitCost, totalEstimatedValue) for any role outside this set.
const PRICE_VIEW_ROLES = new Set(["manager", "director", "admin", "cfo", "accounts"]);
function canViewPrices(role: string | undefined | null): boolean {
  return !!role && PRICE_VIEW_ROLES.has(role);
}

export default function PurchaseRequests() {
  const { user } = useAuth();
  const showPrices = canViewPrices(user?.role);
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [woFilter, setWoFilter] = useState<string>("");
  const [openId, setOpenId] = useState<number | null>(null);

  // Deep-link support: ?prId=<id> auto-opens that PR's detail dialog.
  // Used by WO Release flow to navigate straight to the resulting PR.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const prIdStr = sp.get("prId");
    if (prIdStr) {
      const prId = parseInt(prIdStr, 10);
      if (Number.isFinite(prId) && prId > 0) setOpenId(prId);
    }
  }, []);

  const params: { status?: PurchaseRequest["status"]; branch?: string; workOrderId?: number } = {};
  if (statusFilter !== "all") params.status = statusFilter as PurchaseRequest["status"];
  if (branchFilter !== "all") params.branch = branchFilter;
  const woNum = Number(woFilter);
  if (woFilter && Number.isFinite(woNum) && woNum > 0) params.workOrderId = woNum;

  const { data: rows = [], isLoading } = useGetPurchaseRequests(
    Object.keys(params).length ? params : undefined,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Purchase Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            BOM-exploded shortfalls from released Work Orders
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm">WO #:</Label>
          <Input
            type="number"
            min="1"
            value={woFilter}
            onChange={(e) => setWoFilter(e.target.value)}
            placeholder="e.g. 12"
            className="h-9 w-28"
            data-testid="input-pr-wo-filter"
          />
          <Label className="text-sm">Branch:</Label>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-40" data-testid="select-pr-branch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              <SelectItem value="manufactured">Manufactured</SelectItem>
              <SelectItem value="raw">Raw Material</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-sm">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-pr-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="proposed">Proposed</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR #</TableHead>
                <TableHead>Work Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Items</TableHead>
                {showPrices && <TableHead className="text-right">Est. Value</TableHead>}
                <TableHead>Raised By</TableHead>
                <TableHead>Raised On</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={showPrices ? 9 : 8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showPrices ? 9 : 8} className="text-center text-muted-foreground py-12">
                    No purchase requests yet. Release a Work Order to generate one.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((pr) => {
                  const v = STATUS_VARIANTS[pr.status] ?? STATUS_VARIANTS.proposed;
                  return (
                    <TableRow key={pr.id} data-testid={`row-pr-${pr.id}`}>
                      <TableCell className="font-mono">{pr.prNumber}</TableCell>
                      <TableCell>
                        {pr.workOrderId ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 font-mono text-xs"
                            onClick={() => navigate(`/work-orders/${pr.workOrderId}`)}
                          >
                            {pr.woNumber}
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </Button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{pr.customerName ?? "—"}</TableCell>
                      <TableCell className="text-right">{pr.itemCount ?? 0}</TableCell>
                      {showPrices && (
                        <TableCell className="text-right" data-testid={`cell-pr-est-value-${pr.id}`}>
                          ₹{(pr.totalEstimatedValue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </TableCell>
                      )}
                      <TableCell
                        className="font-medium"
                        data-testid={`cell-pr-raised-by-${pr.id}`}
                      >
                        {pr.createdByName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(pr.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={v.cls}>{v.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setOpenId(pr.id)}
                          data-testid={`button-view-pr-${pr.id}`}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {openId !== null && (
        <PurchaseRequestDetail id={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function PurchaseRequestDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { user } = useAuth();
  const showPrices = canViewPrices(user?.role);
  const { data: pr, isLoading } = useGetPurchaseRequest(id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [vendors, setVendors] = useState<Record<number, string>>({});
  const [edits, setEdits] = useState<
    Record<number, { qty?: string; cost?: string }>
  >({});
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState<{
    branch: PurchaseRequestItemBranch;
    description: string;
    unit: string;
    shortfallQty: string;
    estimatedUnitCost: string;
  }>({
    branch: PurchaseRequestItemBranch.raw,
    description: "",
    unit: "pcs",
    shortfallQty: "1",
    estimatedUnitCost: "0",
  });
  const approve = useApprovePurchaseRequest();
  const reject = useRejectPurchaseRequest();
  const update = useUpdatePurchaseRequest();

  // Build PATCH payload. For raiser-only roles (showPrices=false) we never
  // include estimatedUnitCost so we cannot accidentally overwrite hidden
  // server-side costs to 0. Server also defends against this, but client
  // omission keeps the wire payload honest.
  const dirtyItems = pr
    ? pr.items
        .filter((it: PurchaseRequestItem) => {
          const e = edits[it.id];
          if (!e) return false;
          const currentCost = it.estimatedUnitCost ?? 0;
          const q = e.qty !== undefined ? parseFloat(e.qty) : it.shortfallQty;
          const qtyChanged = !isNaN(q) && q !== it.shortfallQty;
          if (!showPrices) return qtyChanged;
          const c = e.cost !== undefined ? parseFloat(e.cost) : currentCost;
          const costChanged = !isNaN(c) && c !== currentCost;
          return qtyChanged || costChanged;
        })
        .map((it: PurchaseRequestItem) => {
          const e = edits[it.id];
          const currentCost = it.estimatedUnitCost ?? 0;
          const base: { id: number; shortfallQty: number; estimatedUnitCost?: number } = {
            id: it.id,
            shortfallQty:
              e?.qty !== undefined ? parseFloat(e.qty) : it.shortfallQty,
          };
          if (showPrices) {
            base.estimatedUnitCost =
              e?.cost !== undefined ? parseFloat(e.cost) : currentCost;
          }
          return base;
        })
    : [];

  const onRemoveItem = async (itemId: number) => {
    if (!window.confirm("Remove this line item from the PR?")) return;
    await update.mutateAsync(
      { id, data: { removeItemIds: [itemId] } },
      {
        onSuccess: () => {
          toast({ title: "Item removed" });
          qc.invalidateQueries();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Remove failed";
          toast({ title: "Failed to remove", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onAddItem = async () => {
    const qty = parseFloat(newItem.shortfallQty);
    const cost = parseFloat(newItem.estimatedUnitCost);
    if (!newItem.description.trim() || !Number.isFinite(qty) || qty <= 0) {
      toast({ title: "Description and positive quantity are required", variant: "destructive" });
      return;
    }
    const addItem: {
      branch: PurchaseRequestItemBranch;
      description: string;
      unit: string;
      shortfallQty: number;
      estimatedUnitCost?: number;
    } = {
      branch: newItem.branch,
      description: newItem.description.trim(),
      unit: newItem.unit || "pcs",
      shortfallQty: qty,
    };
    // Only include cost when this role is allowed to see/set prices.
    // Server also strips this for raiser-only roles as defence in depth.
    if (showPrices) {
      addItem.estimatedUnitCost = Number.isFinite(cost) ? cost : 0;
    }
    await update.mutateAsync(
      {
        id,
        data: { addItems: [addItem] },
      },
      {
        onSuccess: () => {
          toast({ title: "Line item added" });
          qc.invalidateQueries();
          setAddOpen(false);
          setNewItem({
            branch: PurchaseRequestItemBranch.raw,
            description: "",
            unit: "pcs",
            shortfallQty: "1",
            estimatedUnitCost: "0",
          });
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Add failed";
          toast({ title: "Failed to add", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onSaveEdits = async () => {
    if (dirtyItems.length === 0) return;
    await update.mutateAsync(
      { id, data: { items: dirtyItems } },
      {
        onSuccess: () => {
          toast({ title: "PR updated", description: "Quantities/costs saved." });
          setEdits({});
          qc.invalidateQueries();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Update failed";
          toast({ title: "Failed to save", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onApprove = async () => {
    if (!pr) return;
    await approve.mutateAsync(
      { id, data: { vendorByItemId: vendors } },
      {
        onSuccess: () => {
          toast({ title: "PR approved", description: "POs / import jobs have been created." });
          qc.invalidateQueries();
          onClose();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Approval failed";
          toast({ title: "Failed to approve", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const onReject = async () => {
    await reject.mutateAsync(
      { id, data: { reason: "Rejected from UI" } },
      {
        onSuccess: () => {
          toast({ title: "PR cancelled" });
          qc.invalidateQueries();
          onClose();
        },
      },
    );
  };

  const v = pr ? STATUS_VARIANTS[pr.status] ?? STATUS_VARIANTS.proposed : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {pr ? (
              <>
                <span className="font-mono">{pr.prNumber}</span>
                {v && <Badge variant="outline" className={v.cls}>{v.label}</Badge>}
              </>
            ) : "Loading…"}
          </DialogTitle>
          <DialogDescription>
            {pr ? `For ${pr.woNumber ?? "—"} · ${pr.customerName ?? ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !pr ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className={`grid ${showPrices ? "grid-cols-3" : "grid-cols-2"} gap-3 mb-4`}>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Items</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{pr.items.length}</CardContent>
              </Card>
              {showPrices && (
                <Card data-testid="card-pr-est-value">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-xs text-muted-foreground">Est. Value</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    ₹{(pr.totalEstimatedValue ?? 0).toLocaleString("en-IN")}
                  </CardContent>
                </Card>
              )}
              <Card data-testid="card-pr-raised-by">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs text-muted-foreground">Raised By</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-semibold">{pr.createdByName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">on {formatDate(pr.createdAt)}</div>
                </CardContent>
              </Card>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Shortfall (editable)</TableHead>
                  {showPrices && <TableHead className="text-right">Est. Unit Cost (editable)</TableHead>}
                  <TableHead>Vendor (for PO)</TableHead>
                  <TableHead>Status</TableHead>
                  {pr.status === "proposed" && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pr.items.map((it: PurchaseRequestItem) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {BRANCH_ICONS[it.branch]}
                        {BRANCH_LABELS[it.branch]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{it.description}</div>
                      {it.productCode && <div className="text-xs font-mono text-muted-foreground">{it.productCode}</div>}
                    </TableCell>
                    <TableCell className="text-right">{it.requiredQty}</TableCell>
                    <TableCell className="text-right">{it.onHandQty}</TableCell>
                    <TableCell className="text-right">
                      {pr.status === "proposed" ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-8 w-24 text-right ml-auto"
                          value={edits[it.id]?.qty ?? String(it.shortfallQty)}
                          onChange={(e) =>
                            setEdits({
                              ...edits,
                              [it.id]: { ...edits[it.id], qty: e.target.value },
                            })
                          }
                          data-testid={`input-qty-${it.id}`}
                        />
                      ) : (
                        <span className={`font-semibold ${it.shortfallQty > 0 ? "text-orange-600" : "text-green-700"}`}>
                          {it.shortfallQty}
                        </span>
                      )}
                    </TableCell>
                    {showPrices && (
                      <TableCell className="text-right" data-testid={`cell-pr-item-cost-${it.id}`}>
                        {pr.status === "proposed" ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 w-28 text-right ml-auto"
                            value={edits[it.id]?.cost ?? String(it.estimatedUnitCost ?? 0)}
                            onChange={(e) =>
                              setEdits({
                                ...edits,
                                [it.id]: { ...edits[it.id], cost: e.target.value },
                              })
                            }
                            data-testid={`input-cost-${it.id}`}
                          />
                        ) : (
                          <>₹{(it.estimatedUnitCost ?? 0).toLocaleString("en-IN")}</>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {pr.status === "proposed" && it.branch !== PurchaseRequestItemBranch.manufactured && it.shortfallQty > 0 ? (
                        <Input
                          className="h-8 w-40"
                          placeholder="Vendor name"
                          value={vendors[it.id] ?? ""}
                          onChange={(e) => setVendors({ ...vendors, [it.id]: e.target.value })}
                          data-testid={`input-vendor-${it.id}`}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {it.purchaseOrderNumber ?? it.importJobNumber ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{it.status}</Badge>
                    </TableCell>
                    {pr.status === "proposed" && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onRemoveItem(it.id)}
                          disabled={update.isPending || approve.isPending || reject.isPending}
                          title="Remove line item"
                          data-testid={`button-remove-item-${it.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {pr.status === "proposed" && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  disabled={update.isPending || approve.isPending || reject.isPending}
                  data-testid="button-add-pr-item"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Line Item
                </Button>
              </div>
            )}
          </>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Line Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Branch</Label>
                <Select
                  value={newItem.branch}
                  onValueChange={(v) => setNewItem({ ...newItem, branch: v as PurchaseRequestItemBranch })}
                >
                  <SelectTrigger data-testid="select-add-branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PurchaseRequestItemBranch.manufactured}>Manufactured (in-house)</SelectItem>
                    <SelectItem value={PurchaseRequestItemBranch.raw}>Raw (local PO)</SelectItem>
                    <SelectItem value={PurchaseRequestItemBranch.imported}>Imported</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="e.g. Stainless steel sheet 2mm"
                  data-testid="input-add-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    placeholder="pcs"
                    data-testid="input-add-unit"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItem.shortfallQty}
                    onChange={(e) => setNewItem({ ...newItem, shortfallQty: e.target.value })}
                    data-testid="input-add-qty"
                  />
                </div>
              </div>
              {showPrices && (
                <div className="space-y-1">
                  <Label className="text-xs">Estimated Unit Cost (₹)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItem.estimatedUnitCost}
                    onChange={(e) => setNewItem({ ...newItem, estimatedUnitCost: e.target.value })}
                    data-testid="input-add-cost"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                onClick={onAddItem}
                disabled={update.isPending}
                data-testid="button-confirm-add-item"
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {pr?.status === "proposed" && (
            <>
              <Button
                variant="outline"
                onClick={onSaveEdits}
                disabled={update.isPending || approve.isPending || reject.isPending || dirtyItems.length === 0}
                data-testid="button-save-pr-edits"
              >
                Save Edits{dirtyItems.length > 0 ? ` (${dirtyItems.length})` : ""}
              </Button>
              <Button
                variant="outline"
                onClick={onReject}
                disabled={reject.isPending || update.isPending || approve.isPending}
                data-testid="button-reject-pr"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button
                onClick={onApprove}
                disabled={approve.isPending || update.isPending || reject.isPending || dirtyItems.length > 0}
                data-testid="button-approve-pr"
                title={dirtyItems.length > 0 ? "Save edits before approving" : ""}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve & Create POs / Import Jobs
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
