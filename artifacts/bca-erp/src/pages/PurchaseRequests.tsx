import React, { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPurchaseRequests,
  useGetPurchaseRequest,
  useApprovePurchaseRequest,
  useRejectPurchaseRequest,
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
  Factory, Package, Ship,
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

export default function PurchaseRequests() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: rows = [], isLoading } = useGetPurchaseRequests(
    statusFilter === "all" ? undefined : { status: statusFilter as PurchaseRequest["status"] },
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
        <div className="flex items-center gap-2">
          <Label className="text-sm">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-pr-status">
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
                <TableHead className="text-right">Est. Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
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
                      <TableCell className="text-right">
                        ₹{(pr.totalEstimatedValue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={v.cls}>{v.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(pr.createdAt)}
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
  const { data: pr, isLoading } = useGetPurchaseRequest(id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [vendors, setVendors] = useState<Record<number, string>>({});
  const approve = useApprovePurchaseRequest();
  const reject = useRejectPurchaseRequest();

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
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Items</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{pr.items.length}</CardContent></Card>
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Est. Value</CardTitle></CardHeader><CardContent className="text-2xl font-bold">₹{(pr.totalEstimatedValue ?? 0).toLocaleString("en-IN")}</CardContent></Card>
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Created By</CardTitle></CardHeader><CardContent className="text-sm">{pr.createdByName ?? "—"}<div className="text-xs text-muted-foreground">{formatDate(pr.createdAt)}</div></CardContent></Card>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                  <TableHead>Vendor (for PO)</TableHead>
                  <TableHead>Status</TableHead>
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
                    <TableCell className={`text-right font-semibold ${it.shortfallQty > 0 ? "text-orange-600" : "text-green-700"}`}>
                      {it.shortfallQty}
                    </TableCell>
                    <TableCell className="text-right">₹{it.estimatedUnitCost.toLocaleString("en-IN")}</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {pr?.status === "proposed" && (
            <>
              <Button
                variant="outline"
                onClick={onReject}
                disabled={reject.isPending}
                data-testid="button-reject-pr"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button
                onClick={onApprove}
                disabled={approve.isPending}
                data-testid="button-approve-pr"
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
