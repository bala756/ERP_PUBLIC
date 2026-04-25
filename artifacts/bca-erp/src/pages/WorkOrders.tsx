import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetWorkOrders,
  useCreateWorkOrder,
  getGetWorkOrdersQueryKey,
  type WorkOrder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Briefcase, Eye } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  inProgress: "default",
  pendingApproval: "outline",
  delivered: "secondary",
  cancelled: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  inProgress: "In Progress",
  pendingApproval: "Pending Approval",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={(STATUS_COLORS[status] ?? "outline") as "default" | "secondary" | "outline" | "destructive"}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default function WorkOrders() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    company: "",
    notes: "",
  });

  const { data: allWOs, isLoading } = useGetWorkOrders();

  const workOrders = (allWOs ?? []).filter(
    (wo) => statusFilter === "all" || wo.status === statusFilter,
  );

  const createWO = useCreateWorkOrder({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetWorkOrdersQueryKey() });
        setShowCreate(false);
        setForm({ customerName: "", company: "", notes: "" });
        toast({ title: "Work order created" });
      },
      onError: () => toast({ title: "Failed to create work order", variant: "destructive" }),
    },
  });

  const canCreate = user && ["sales", "manager", "director", "admin"].includes(user.role);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName.trim()) return;
    createWO.mutate({
      data: {
        customerName: form.customerName.trim(),
        company: form.company.trim() || undefined,
        notes: form.notes.trim() || undefined,
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6" />
            Work Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track production and imported item orders
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Work Order
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="inProgress">In Progress</SelectItem>
            <SelectItem value="pendingApproval">Pending Approval</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {workOrders.length} work order{workOrders.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>WO Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : workOrders.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No work orders found
                  </TableCell>
                </TableRow>
              )
              : workOrders.map((wo) => (
                <TableRow
                  key={wo.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/work-orders/${wo.id}`)}
                >
                  <TableCell className="font-mono font-medium">{wo.woNumber}</TableCell>
                  <TableCell className="font-medium">{wo.customerName}</TableCell>
                  <TableCell className="text-muted-foreground">{wo.company ?? "—"}</TableCell>
                  <TableCell>{(wo as any).itemCount ?? wo.items?.length ?? 0}</TableCell>
                  <TableCell>₹{wo.total.toLocaleString()}</TableCell>
                  <TableCell><StatusBadge status={wo.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(wo.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/work-orders/${wo.id}`); }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Work Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1">
              <Label>Customer Name *</Label>
              <Input
                value={form.customerName}
                onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-1">
              <Label>Company</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!form.customerName.trim() || createWO.isPending}>
                {createWO.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
