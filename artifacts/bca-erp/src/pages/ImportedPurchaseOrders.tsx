import React, { useState } from "react";
import {
  useGetPurchaseOrders,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useDirectorApprovePurchaseOrder,
  useDirectorRejectPurchaseOrder,
  useReceivePurchaseOrder,
  getGetPurchaseOrdersQueryKey,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Ship, CheckCircle, XCircle, PackageCheck, AlertTriangle, ShieldAlert, Printer } from "lucide-react";
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
  pendingDirectorApproval: "Pending Director",
  approved: "Approved",
  received: "Received",
  cancelled: "Cancelled",
};

const APPROVE_ROLES = ["manager", "director", "admin", "cfo"];
const DIRECTOR_ROLES = ["director", "admin"];
const RECEIVE_ROLES = ["stores", "manager", "director", "admin"];

export default function ImportedPurchaseOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [rejectTarget, setRejectTarget] = useState<{ id: number; isDirector: boolean } | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: allPOs = [], isLoading } = useGetPurchaseOrders();

  const pos = allPOs
    .filter((po) => po.type === "imported")
    .filter((po) => statusFilter === "all" || po.status === statusFilter);

  const canApprove = user && APPROVE_ROLES.includes(user.role);
  const canDirectorApprove = user && DIRECTOR_ROLES.includes(user.role);
  const canReceive = user && RECEIVE_ROLES.includes(user.role);
  const isCFO = user && ["cfo", "director", "admin"].includes(user.role);

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
            <Ship className="h-6 w-6" />
            Imported Purchase Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Direct import and ready-goods procurement
          </p>
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
              <TableHead>Quoted</TableHead>
              <TableHead>PO Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>CFO Req.</TableHead>
              <TableHead>Approved By</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : pos.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    No imported purchase orders found
                  </TableCell>
                </TableRow>
              )
              : pos.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/purchase-orders/${po.id}/print`} className="hover:underline text-blue-700">
                      {po.poNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{po.supplierName}</div>
                    {po.supplierContact && (
                      <div className="text-xs text-muted-foreground">{po.supplierContact}</div>
                    )}
                  </TableCell>
                  <TableCell>₹{po.quotedAmount.toLocaleString()}</TableCell>
                  <TableCell>₹{po.poAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[po.status] ?? "outline"}>
                      {STATUS_LABELS[po.status] ?? po.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {po.requiresCfoApproval ? (
                      <span className="flex items-center gap-1 text-amber-600 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">No</span>
                    )}
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
                      {po.status === "pendingDirectorApproval" && !canDirectorApprove && (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          Director only
                        </span>
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

      <Dialog open={rejectTarget !== null} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNote(""); } }}>
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
    </div>
  );
}
