import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetPurchaseRequests,
  useGetPurchaseRequest,
  useRejectPurchaseRequest,
  useApprovePurchaseRequest,
  useUpdatePurchaseRequest,
  useGetWorkOrders,
  getGetPurchaseRequestsQueryKey,
  customFetch,
  PurchaseRequestItemBranch,
  type PurchaseRequest,
  type PurchaseRequestDetail,
  type PurchaseRequestItem,
  type WorkOrder,
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
  ClipboardList, ExternalLink, XCircle, Trash2, Plus, Factory, Package, Ship,
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
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [woFilter, setWoFilter] = useState<string>("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [requestItems, setRequestItems] = useState([{ description: "", qty: "1" }]);
  const [creating, setCreating] = useState(false);
  const [loadingBomItems, setLoadingBomItems] = useState(false);

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

  const params: { status?: PurchaseRequest["status"]; workOrderId?: number } = {};
  if (statusFilter !== "all") params.status = statusFilter as PurchaseRequest["status"];
  const woNum = Number(woFilter);
  if (woFilter && Number.isFinite(woNum) && woNum > 0) params.workOrderId = woNum;

  const { data: rows = [], isLoading } = useGetPurchaseRequests(
    Object.keys(params).length ? params : undefined,
  );
  const { data: workOrders = [], isLoading: workOrdersLoading } = useGetWorkOrders();
  const availableWorkOrders = workOrders.filter(
    (wo: WorkOrder) => wo.status !== "delivered" && wo.status !== "cancelled",
  );

  async function fetchBomItems() {
    if (!selectedWorkOrderId) return;
    setLoadingBomItems(true);
    try {
      const items = await customFetch<Array<{ description: string; qty: number; unit?: string | null }>>(
        `/api/work-orders/${selectedWorkOrderId}/bom-items`,
      );
      if (items.length === 0) {
        toast({ title: "No BOM items found for this Work Order" });
        return;
      }
      setRequestItems(items.map((item) => ({ description: item.description, qty: String(item.qty) })));
      toast({ title: "BOM items loaded into purchase request" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to fetch BOM items",
        variant: "destructive",
      });
    } finally {
      setLoadingBomItems(false);
    }
  }

  async function handleCreatePurchaseRequest(e: React.FormEvent) {
    e.preventDefault();
    const workOrderId = Number(selectedWorkOrderId);
    if (!Number.isFinite(workOrderId) || workOrderId <= 0) {
      toast({ title: "Choose a Work Order number", variant: "destructive" });
      return;
    }
    const items = requestItems
      .map((item) => ({
        description: item.description.trim(),
        qty: Number(item.qty),
      }))
      .filter((item) => item.description && Number.isFinite(item.qty) && item.qty > 0);
    if (items.length === 0 || items.length !== requestItems.length) {
      toast({ title: "Enter item name and positive quantity for each line", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const pr = await customFetch<PurchaseRequestDetail>("/api/purchase-requests", {
        method: "POST",
        body: JSON.stringify({ workOrderId, items }),
        responseType: "json",
      });
      qc.invalidateQueries({ queryKey: getGetPurchaseRequestsQueryKey() });
      setCreateOpen(false);
      setSelectedWorkOrderId("");
      setRequestItems([{ description: "", qty: "1" }]);
      setOpenId(pr.id);
      toast({ title: `Purchase Request ${pr.prNumber} created` });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to create purchase request",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Purchase Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Material requests for commissioning and manufacturing work orders
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-purchase-request"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Purchase Request
          </Button>
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
                <TableHead className="w-16">S.no</TableHead>
                <TableHead>Items name</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Work order number</TableHead>
                <TableHead>Raised By</TableHead>
                <TableHead>Raised on date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No purchase requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((pr, index) => {
                  const v = STATUS_VARIANTS[pr.status] ?? STATUS_VARIANTS.proposed;
                  const items = (
                    pr as PurchaseRequest & {
                      itemSummaries?: { description: string; qty: number; unit?: string | null }[];
                    }
                  ).itemSummaries ?? [];
                  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
                  return (
                    <TableRow key={pr.id} data-testid={`row-pr-${pr.id}`}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        {items.length > 0 ? (
                          <div className="space-y-1">
                            {items.slice(0, 3).map((item, itemIndex) => (
                              <div key={`${pr.id}-${itemIndex}`} className="text-sm">
                                {item.description}
                              </div>
                            ))}
                            {items.length > 3 && (
                              <div className="text-xs text-muted-foreground">
                                +{items.length - 3} more
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No items</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {totalQty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </TableCell>
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

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setSelectedWorkOrderId("");
          setRequestItems([{ description: "", qty: "1" }]);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Purchase Request</DialogTitle>
            <DialogDescription>
              Choose the Work Order number, then enter only the item names and quantities required.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreatePurchaseRequest} className="space-y-4">
            <div className="space-y-2">
              <Label>Work Order number *</Label>
              <Select
                value={selectedWorkOrderId}
                onValueChange={setSelectedWorkOrderId}
                disabled={workOrdersLoading || creating}
              >
                <SelectTrigger data-testid="select-pr-work-order">
                  <SelectValue placeholder={workOrdersLoading ? "Loading work orders..." : "Choose Work Order"} />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkOrders.map((wo: WorkOrder) => (
                    <SelectItem key={wo.id} value={String(wo.id)}>
                      {wo.woNumber} - {wo.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!workOrdersLoading && availableWorkOrders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active Work Orders are available.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchBomItems}
                disabled={!selectedWorkOrderId || loadingBomItems || creating}
              >
                {loadingBomItems ? "Fetching BOM..." : "Fetch BOM Items"}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_120px_36px] gap-2 text-xs font-medium text-muted-foreground">
                <span>Item name *</span>
                <span>Qty *</span>
                <span />
              </div>
              {requestItems.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
                  <Input
                    value={item.description}
                    onChange={(e) => {
                      const next = [...requestItems];
                      next[index] = { ...next[index], description: e.target.value };
                      setRequestItems(next);
                    }}
                    placeholder="Item name"
                    data-testid={`input-new-pr-item-${index}`}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.qty}
                    onChange={(e) => {
                      const next = [...requestItems];
                      next[index] = { ...next[index], qty: e.target.value };
                      setRequestItems(next);
                    }}
                    data-testid={`input-new-pr-qty-${index}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    disabled={requestItems.length === 1 || creating}
                    onClick={() => setRequestItems(requestItems.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRequestItems([...requestItems, { description: "", qty: "1" }])}
                disabled={creating}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedWorkOrderId || creating}
                data-testid="button-create-purchase-request"
              >
                {creating ? "Creating..." : "Create Purchase Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseRequestDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const showPrices = false;
  const { user } = useAuth();
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
  const reject = useRejectPurchaseRequest();
  const approve = useApprovePurchaseRequest();
  const update = useUpdatePurchaseRequest();
  const canApprove = !!user && ["manager", "director", "admin", "cfo"].includes(user.role);

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
          return qtyChanged;
        })
        .map((it: PurchaseRequestItem) => {
          const e = edits[it.id];
          const currentCost = it.estimatedUnitCost ?? 0;
          const base: { id: number; shortfallQty: number; estimatedUnitCost?: number } = {
            id: it.id,
            shortfallQty:
              e?.qty !== undefined ? parseFloat(e.qty) : it.shortfallQty,
          };
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
          toast({ title: "PR updated", description: "Quantities saved." });
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

  const onApprove = async () => {
    await approve.mutateAsync(
      { id, data: {} },
      {
        onSuccess: () => {
          toast({ title: "PR approved" });
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
            <div className="grid grid-cols-2 gap-3 mb-4">
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
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  {pr.status === "proposed" && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pr.items.map((it: PurchaseRequestItem) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium">{it.description}</div>
                    </TableCell>
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
                          disabled={update.isPending || reject.isPending}
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
                  disabled={update.isPending || reject.isPending}
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
              {canApprove && (
                <Button
                  onClick={onApprove}
                  disabled={approve.isPending || update.isPending || reject.isPending}
                  data-testid="button-approve-pr"
                >
                  Approve
                </Button>
              )}
              <Button
                variant="outline"
                onClick={onSaveEdits}
                disabled={update.isPending || reject.isPending || approve.isPending || dirtyItems.length === 0}
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
