import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetProposals,
  useCreateProposal,
  useUpdateProposal,
  useDeleteProposal,
  useMarkProposalWon,
  useGetLeads,
  useGetUsers,
  getGetProposalsQueryKey,
  getGetLeadsQueryKey,
  type GetProposalsQueryResult,
  type GetLeadsQueryResult,
  type GetUsersQueryResult,
  type ProposalLineItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  CheckCircle,
  PauseCircle,
  XCircle,
  Bell,
  Trash,
  Printer,
  Package,
} from "lucide-react";
import { ProductPicker, type PickedProduct } from "@/components/ProductPicker";
import { objectPathToUrl } from "@/lib/uploadFile";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

type Proposal = GetProposalsQueryResult[number];

const PROPOSAL_STATUSES = ["draft", "sent", "won", "onHold", "lost"] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  won: "Won",
  onHold: "On Hold",
  lost: "Lost",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  sent: "secondary",
  won: "default",
  onHold: "secondary",
  lost: "destructive",
};

const formatINR = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v);

export default function Proposals() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [salespersonFilter, setSalespersonFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [preselectedLeadId, setPreselectedLeadId] = useState<string>("");
  const [editProposal, setEditProposal] = useState<Proposal | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const leadId = params.get("leadId");
    if (leadId) {
      setPreselectedLeadId(leadId);
      setCreateOpen(true);
      setLocation("/proposals", { replace: true });
    }
  }, [location]);

  const { data: proposals, isLoading } = useGetProposals({
    status: statusFilter !== "all" ? statusFilter : undefined,
    salespersonId: salespersonFilter !== "all" ? parseInt(salespersonFilter, 10) : undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  });

  const { data: leads } = useGetLeads();
  const { data: users } = useGetUsers();

  const updateMutation = useUpdateProposal();
  const deleteMutation = useDeleteProposal();
  const wonMutation = useMarkProposalWon();

  const canWrite = user && ["sales", "manager", "director", "admin"].includes(user.role);
  const canApproveDiscount = user && ["manager", "director", "admin", "cfo"].includes(user.role);

  const handleStatusChange = (proposal: Proposal, status: string) => {
    if (status === "won") {
      wonMutation.mutate(
        { id: proposal.id },
        {
          onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: getGetProposalsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
            const wo = data.workOrder as { woId?: number; woNumber?: string; message?: string };
            toast({
              title: "Proposal Won!",
              description: wo.message ?? "Work order created.",
            });
            if (wo.woId) {
              setTimeout(() => setLocation(`/work-orders/${wo.woId}`), 800);
            }
          },
          onError: () =>
            toast({ variant: "destructive", title: "Failed to mark proposal won" }),
        },
      );
      return;
    }
    updateMutation.mutate(
      { id: proposal.id, data: { status: status as Proposal["status"] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProposalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
          toast({ title: `Proposal marked as ${STATUS_LABELS[status]}` });
        },
        onError: () =>
          toast({ variant: "destructive", title: "Failed to update proposal" }),
      },
    );
  };

  const handleDelete = (proposal: Proposal) => {
    if (!confirm(`Delete proposal ${proposal.proposalNumber}? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id: proposal.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProposalsQueryKey() });
          toast({ title: "Proposal deleted" });
        },
        onError: () =>
          toast({ variant: "destructive", title: "Failed to delete proposal" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer proposals and quotations
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)} data-testid="button-new-proposal">
            <Plus className="h-4 w-4 mr-2" />
            New Proposal
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-proposal-status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PROPOSAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-proposal-salesperson">
            <SelectValue placeholder="Filter by salesperson" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Salespersons</SelectItem>
            {(users ?? []).map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">From</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-[150px]"
            data-testid="input-proposal-from"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">To</Label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-[150px]"
            data-testid="input-proposal-to"
          />
        </div>
        {(statusFilter !== "all" || salespersonFilter !== "all" || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("all");
              setSalespersonFilter("all");
              setFromDate("");
              setToDate("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proposal #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valid Until</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !proposals?.length ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground"
                >
                  No proposals found.{" "}
                  {canWrite && "Create your first proposal to get started."}
                </TableCell>
              </TableRow>
            ) : (
              proposals.map((proposal) => (
                <TableRow
                  key={proposal.id}
                  data-testid={`proposal-row-${proposal.id}`}
                >
                  <TableCell className="font-mono font-medium">
                    {proposal.proposalNumber}
                    {proposal.onHoldReminderDue && (
                      <Bell className="inline-block ml-2 h-3.5 w-3.5 text-amber-500" aria-label="Reminder due" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{proposal.customerName ?? "—"}</div>
                    {proposal.company && (
                      <div className="text-xs text-muted-foreground">
                        {proposal.company}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{proposal.salespersonName ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatINR(proposal.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[proposal.status] ?? "secondary"}>
                      {STATUS_LABELS[proposal.status] ?? proposal.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {proposal.validUntil
                      ? new Date(proposal.validUntil).toLocaleDateString("en-IN")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {new Date(proposal.createdAt).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <ProposalActions
                      proposal={proposal}
                      canWrite={!!canWrite}
                      onEdit={() => setEditProposal(proposal)}
                      onDelete={() => handleDelete(proposal)}
                      onStatusChange={(s) => handleStatusChange(proposal, s)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateProposalDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setPreselectedLeadId("");
        }}
        leads={leads ?? []}
        users={users ?? []}
        canApproveDiscount={!!canApproveDiscount}
        preselectedLeadId={preselectedLeadId}
      />

      {editProposal && (
        <EditProposalDialog
          proposal={editProposal}
          leads={leads ?? []}
          users={users ?? []}
          onClose={() => setEditProposal(null)}
          canApproveDiscount={!!canApproveDiscount}
        />
      )}
    </div>
  );
}

function ProposalActions({
  proposal,
  canWrite,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  proposal: Proposal;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid={`proposal-actions-${proposal.id}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a
            href={`/proposals/${proposal.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center cursor-pointer"
            data-testid={`proposal-print-${proposal.id}`}
          >
            <Printer className="h-4 w-4 mr-2" />
            View / Print
          </a>
        </DropdownMenuItem>
        {canWrite && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        )}
        {proposal.status !== "won" && canWrite && (
          <DropdownMenuItem onClick={() => onStatusChange("won")}>
            <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
            Mark Won
          </DropdownMenuItem>
        )}
        {proposal.status !== "onHold" && canWrite && (
          <DropdownMenuItem onClick={() => onStatusChange("onHold")}>
            <PauseCircle className="h-4 w-4 mr-2 text-amber-500" />
            Put On Hold
          </DropdownMenuItem>
        )}
        {proposal.status !== "lost" && canWrite && (
          <DropdownMenuItem onClick={() => onStatusChange("lost")}>
            <XCircle className="h-4 w-4 mr-2 text-destructive" />
            Mark Lost
          </DropdownMenuItem>
        )}
        {canWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface LineItemRow {
  productId: number;
  productCode: string;
  productImageUrl: string | null;
  hsnCode: string | null;
  unit: string;
  description: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

function LineItemsEditor({
  value,
  onChange,
}: {
  value: LineItemRow[];
  onChange: (items: LineItemRow[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const removeRow = (i: number) =>
    onChange(value.filter((_, idx) => idx !== i));

  const updateRow = (
    i: number,
    field: "description" | "qty" | "unitPrice" | "gstRate",
    v: string,
  ) => {
    const rows = [...value];
    if (field === "description") rows[i] = { ...rows[i], [field]: v };
    else rows[i] = { ...rows[i], [field]: parseFloat(v) || 0 };
    onChange(rows);
  };

  const handlePick = (p: PickedProduct) => {
    onChange([
      ...value,
      {
        productId: p.productId,
        productCode: p.productCode,
        productImageUrl: p.productImageUrl,
        hsnCode: p.hsnCode,
        unit: p.unit,
        description: p.description,
        qty: 1,
        unitPrice: p.unitPrice,
        gstRate: p.gstRate,
      },
    ]);
  };

  const subtotal = value.reduce((s, li) => s + li.qty * li.unitPrice, 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[44px_1fr_70px_100px_70px_32px] gap-1 text-xs font-medium text-muted-foreground px-1">
        <span>Img</span>
        <span>Product / Description</span>
        <span>Qty</span>
        <span>Unit Price</span>
        <span>GST%</span>
        <span />
      </div>
      {value.length === 0 && (
        <div className="text-xs text-muted-foreground italic px-1 py-2">
          No products selected. Click below to pick from the Product Master.
        </div>
      )}
      {value.map((item, i) => (
        <div
          key={`${item.productId}-${i}`}
          className="grid grid-cols-[44px_1fr_70px_100px_70px_32px] gap-1 items-start"
        >
          <div className="h-9 w-9 rounded bg-muted overflow-hidden flex items-center justify-center mt-1">
            {item.productImageUrl ? (
              <img
                src={objectPathToUrl(item.productImageUrl)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Package className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-mono">
              {item.productCode}
              {item.hsnCode ? ` • HSN ${item.hsnCode}` : ""}
              {item.unit ? ` • ${item.unit}` : ""}
            </div>
            <Textarea
              value={item.description}
              onChange={(e) => updateRow(i, "description", e.target.value)}
              placeholder="Description"
              rows={2}
              className="text-sm"
              data-testid={`textarea-line-description-${i}`}
            />
          </div>
          <Input
            type="number"
            value={item.qty}
            min={0}
            step={0.01}
            onChange={(e) => updateRow(i, "qty", e.target.value)}
            className="h-9 text-sm"
            data-testid={`input-line-qty-${i}`}
          />
          <Input
            type="number"
            value={item.unitPrice}
            min={0}
            step={0.01}
            onChange={(e) => updateRow(i, "unitPrice", e.target.value)}
            className="h-9 text-sm"
            data-testid={`input-line-unitprice-${i}`}
          />
          <Input
            type="number"
            value={item.gstRate}
            min={0}
            max={100}
            onChange={(e) => updateRow(i, "gstRate", e.target.value)}
            className="h-9 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-8"
            onClick={() => removeRow(i)}
          >
            <Trash className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={() => setPickerOpen(true)}
        data-testid="button-add-product"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add Product
      </Button>
      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        mode="sale"
      />
      <div className="text-right text-sm text-muted-foreground">
        Subtotal: {formatINR(subtotal)}
      </div>
    </div>
  );
}

function TotalsPreview({
  lineItems,
  discountPercent,
  packingChargesPercent,
  gstRate,
}: {
  lineItems: LineItemRow[];
  discountPercent: number;
  packingChargesPercent: number;
  gstRate: number;
}) {
  const subtotal = lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const packingChargesAmount = (subtotal * packingChargesPercent) / 100;
  const taxable = subtotal - discountAmount + packingChargesAmount;
  const gstAmount = (taxable * gstRate) / 100;
  const total = taxable + gstAmount;

  return (
    <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span>{formatINR(subtotal)}</span>
      </div>
      {discountPercent > 0 && (
        <div className="flex justify-between text-amber-600">
          <span>Discount ({discountPercent}%)</span>
          <span>- {formatINR(discountAmount)}</span>
        </div>
      )}
      {packingChargesPercent > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            Packing Charges ({packingChargesPercent}%)
          </span>
          <span>+ {formatINR(packingChargesAmount)}</span>
        </div>
      )}
      <div className="flex justify-between text-muted-foreground">
        <span>GST ({gstRate}%)</span>
        <span>+ {formatINR(gstAmount)}</span>
      </div>
      <div className="flex justify-between font-bold text-base border-t pt-1">
        <span>Total</span>
        <span>{formatINR(total)}</span>
      </div>
    </div>
  );
}

const DISCOUNT_LIMIT_NO_APPROVAL = 5;

function CreateProposalDialog({
  open,
  onOpenChange,
  leads,
  users,
  canApproveDiscount,
  preselectedLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: GetLeadsQueryResult;
  users: GetUsersQueryResult;
  canApproveDiscount: boolean;
  preselectedLeadId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateProposal();

  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [leadId, setLeadId] = useState<string>(preselectedLeadId ?? "");
  const [salespersonId, setSalespersonId] = useState<string>("");
  const [salespersonTouched, setSalespersonTouched] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [packingChargesPercent, setPackingChargesPercent] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [validUntil, setValidUntil] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");

  React.useEffect(() => {
    if (open && preselectedLeadId) setLeadId(preselectedLeadId);
  }, [open, preselectedLeadId]);

  // Auto-fill salesperson from selected lead's assignedToId, until user overrides
  React.useEffect(() => {
    if (!leadId || salespersonTouched) return;
    const lead = leads.find((l) => l.id === parseInt(leadId, 10));
    if (lead?.assignedToId) {
      setSalespersonId(String(lead.assignedToId));
    }
  }, [leadId, leads, salespersonTouched]);

  const reset = () => {
    setLineItems([]);
    setLeadId("");
    setSalespersonId("");
    setSalespersonTouched(false);
    setDiscountPercent(0);
    setPackingChargesPercent(0);
    setGstRate(18);
    setValidUntil("");
    setNotes("");
    setStatus("draft");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId) {
      toast({ variant: "destructive", title: "Please select a lead" });
      return;
    }
    const validRows = lineItems.filter(
      (li) => li.productId > 0 && li.description.trim() && li.qty > 0,
    );
    if (validRows.length === 0) {
      toast({
        variant: "destructive",
        title: "Add at least one product line item",
      });
      return;
    }

    createMutation.mutate(
      {
        data: {
          leadId: parseInt(leadId, 10),
          salespersonId: salespersonId ? parseInt(salespersonId, 10) : undefined,
          lineItems: validRows,
          discountPercent,
          packingChargesPercent,
          gstRate,
          validUntil: validUntil || undefined,
          notes: notes || undefined,
          status: status as Proposal["status"],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProposalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
          toast({ title: "Proposal created successfully" });
          onOpenChange(false);
          reset();
        },
        onError: () =>
          toast({ variant: "destructive", title: "Failed to create proposal" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Proposal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lead-select">Lead *</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger id="lead-select" data-testid="select-proposal-lead">
                  <SelectValue placeholder="Select lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id.toString()}>
                      {l.customerName}
                      {l.company ? ` (${l.company})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sales-select">Salesperson</Label>
              <Select
                value={salespersonId}
                onValueChange={(v) => {
                  setSalespersonTouched(true);
                  setSalespersonId(v);
                }}
              >
                <SelectTrigger id="sales-select" data-testid="select-create-salesperson">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) =>
                      ["sales", "manager", "director", "admin"].includes(u.role),
                    )
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="block mb-2">Line Items</Label>
            <LineItemsEditor value={lineItems} onChange={setLineItems} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="discount">
                Discount %{" "}
                {!canApproveDiscount && (
                  <span className="text-xs text-muted-foreground">
                    (max {DISCOUNT_LIMIT_NO_APPROVAL}%)
                  </span>
                )}
              </Label>
              <Input
                id="discount"
                type="number"
                min={0}
                max={canApproveDiscount ? 100 : DISCOUNT_LIMIT_NO_APPROVAL}
                value={discountPercent}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  const cap = canApproveDiscount ? 100 : DISCOUNT_LIMIT_NO_APPROVAL;
                  setDiscountPercent(Math.min(val, cap));
                }}
                data-testid="input-discount"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="packing">Packing Charges %</Label>
              <Input
                id="packing"
                type="number"
                min={0}
                max={100}
                value={packingChargesPercent}
                onChange={(e) =>
                  setPackingChargesPercent(parseFloat(e.target.value) || 0)
                }
                data-testid="input-packing"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gst-rate">GST Rate %</Label>
              <Input
                id="gst-rate"
                type="number"
                min={0}
                max={100}
                value={gstRate}
                onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
                data-testid="input-gst-rate"
              />
            </div>
          </div>

          <TotalsPreview
            lineItems={lineItems}
            discountPercent={discountPercent}
            packingChargesPercent={packingChargesPercent}
            gstRate={gstRate}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="valid-until">Valid Until</Label>
              <Input
                id="valid-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proposal-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="proposal-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proposal-notes">Notes</Label>
            <Textarea
              id="proposal-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit-proposal"
            >
              {createMutation.isPending ? "Creating..." : "Create Proposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProposalDialog({
  proposal,
  leads,
  users,
  onClose,
  canApproveDiscount,
}: {
  proposal: Proposal;
  leads: GetLeadsQueryResult;
  users: GetUsersQueryResult;
  onClose: () => void;
  canApproveDiscount: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateProposal();

  const [lineItems, setLineItems] = useState<LineItemRow[]>(
    (proposal.lineItems as Array<Partial<LineItemRow> & { description: string; qty: number; unitPrice: number }>).map(
      (li) => ({
        productId: li.productId ?? 0,
        productCode: li.productCode ?? "",
        productImageUrl: li.productImageUrl ?? null,
        hsnCode: li.hsnCode ?? null,
        unit: li.unit ?? "",
        description: li.description,
        qty: li.qty,
        unitPrice: li.unitPrice,
        gstRate: li.gstRate ?? 18,
      }),
    ),
  );
  const [discountPercent, setDiscountPercent] = useState<number>(
    proposal.discountPercent,
  );
  const [packingChargesPercent, setPackingChargesPercent] = useState<number>(
    (proposal as { packingChargesPercent?: number }).packingChargesPercent ?? 0,
  );
  const [gstRate, setGstRate] = useState<number>(proposal.gstRate);
  const [validUntil, setValidUntil] = useState<string>(proposal.validUntil ?? "");
  const [notes, setNotes] = useState<string>(proposal.notes ?? "");
  const [salespersonId, setSalespersonId] = useState<string>(
    proposal.salespersonId?.toString() ?? "",
  );
  const [status, setStatus] = useState<string>(proposal.status);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = lineItems.filter(
      (li) => li.productId > 0 && li.description.trim() && li.qty > 0,
    );
    if (validRows.length === 0) {
      toast({
        variant: "destructive",
        title: "Add at least one product line item",
      });
      return;
    }
    updateMutation.mutate(
      {
        id: proposal.id,
        data: {
          salespersonId: salespersonId ? parseInt(salespersonId, 10) : undefined,
          lineItems: validRows,
          discountPercent,
          packingChargesPercent,
          gstRate,
          validUntil: validUntil || undefined,
          notes: notes || undefined,
          status: status as Proposal["status"],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProposalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
          toast({ title: "Proposal updated" });
          onClose();
        },
        onError: () =>
          toast({ variant: "destructive", title: "Failed to update proposal" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Proposal — {proposal.proposalNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Input
                value={proposal.customerName ?? ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-sales-select">Salesperson</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger id="edit-sales-select">
                  <SelectValue placeholder="Select salesperson" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) =>
                      ["sales", "manager", "director", "admin"].includes(u.role),
                    )
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="block mb-2">Line Items</Label>
            <LineItemsEditor value={lineItems} onChange={setLineItems} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>
                Discount %{" "}
                {!canApproveDiscount && (
                  <span className="text-xs text-muted-foreground">
                    (max {DISCOUNT_LIMIT_NO_APPROVAL}%)
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min={0}
                max={canApproveDiscount ? 100 : DISCOUNT_LIMIT_NO_APPROVAL}
                value={discountPercent}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  const cap = canApproveDiscount ? 100 : DISCOUNT_LIMIT_NO_APPROVAL;
                  setDiscountPercent(Math.min(val, cap));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Packing Charges %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={packingChargesPercent}
                onChange={(e) =>
                  setPackingChargesPercent(parseFloat(e.target.value) || 0)
                }
                data-testid="input-edit-packing"
              />
            </div>
            <div className="space-y-1.5">
              <Label>GST Rate %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={gstRate}
                onChange={(e) => setGstRate(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <TotalsPreview
            lineItems={lineItems}
            discountPercent={discountPercent}
            packingChargesPercent={packingChargesPercent}
            gstRate={gstRate}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valid Until</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPOSAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
