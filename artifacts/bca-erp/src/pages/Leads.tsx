import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetLeads,
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useGetUsers,
  getGetLeadsQueryKey,
  type GetLeadsQueryResult,
  type GetUsersQueryResult,
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
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  FileText,
  RefreshCw,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

type Lead = GetLeadsQueryResult[number];

const LEAD_STATUSES = [
  "new",
  "contacted",
  "proposalSent",
  "negotiating",
  "won",
  "lost",
  "onHold",
] as const;

const LEAD_SOURCES = [
  "indiaMart",
  "website",
  "referral",
  "direct",
  "other",
] as const;

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  proposalSent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  onHold: "On Hold",
};

const SOURCE_LABELS: Record<string, string> = {
  indiaMart: "IndiaMART",
  website: "Website",
  referral: "Referral",
  direct: "Direct",
  other: "Other",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  new: "default",
  contacted: "secondary",
  proposalSent: "secondary",
  negotiating: "secondary",
  won: "default",
  lost: "destructive",
  onHold: "outline",
};

const createLeadSchema = z.object({
  customerName: z.string().min(1, "Customer name required"),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  gstNumber: z.string().optional(),
  billingAddress: z.string().optional(),
  deliveryAddress: z.string().optional(),
  source: z.enum(["indiaMart", "website", "referral", "direct", "other"]),
  productInterest: z.string().optional(),
  notes: z.string().optional(),
  lastFollowupNote: z.string().optional(),
  assignedToId: z.number().optional(),
});

type CreateLeadForm = z.infer<typeof createLeadSchema>;

export default function Leads() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: leads, isLoading } = useGetLeads({
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: debouncedSearch || undefined,
    assignedToId: assignedToFilter !== "all" ? parseInt(assignedToFilter, 10) : undefined,
  });

  const { data: users } = useGetUsers();

  const deleteMutation = useDeleteLead();

  const canWrite = user && ["sales", "manager", "director", "admin"].includes(user.role);

  const handleDelete = (lead: Lead) => {
    if (!confirm(`Delete lead for ${lead.customerName}? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id: lead.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
          toast({ title: "Lead deleted" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to delete lead" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">Manage your sales pipeline</p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)} data-testid="button-new-lead">
            <Plus className="h-4 w-4 mr-2" />
            New Lead
          </Button>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-lead-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-lead-status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-lead-assigned">
            <SelectValue placeholder="Filter by assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            {filterSalesUsers(users ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Product Interest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
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
            ) : !leads?.length ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground"
                >
                  No leads found. {canWrite && "Create your first lead to get started."}
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id} data-testid={`lead-row-${lead.id}`}>
                  <TableCell className="font-medium">{lead.customerName}</TableCell>
                  <TableCell>{lead.company ?? "—"}</TableCell>
                  <TableCell>{SOURCE_LABELS[lead.source] ?? lead.source}</TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {lead.productInterest ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[lead.status] ?? "secondary"}>
                      {STATUS_LABELS[lead.status] ?? lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.assignedToName ?? "—"}</TableCell>
                  <TableCell>
                    {new Date(lead.createdAt).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <LeadActions
                      lead={lead}
                      canWrite={!!canWrite}
                      onEdit={() => setEditLead(lead)}
                      onDelete={() => handleDelete(lead)}
                      onCreateProposal={() =>
                        setLocation(`/proposals?leadId=${lead.id}`)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users ?? []}
      />

      {editLead && (
        <EditLeadDialog
          lead={editLead}
          users={users ?? []}
          onClose={() => setEditLead(null)}
        />
      )}
    </div>
  );
}

function LeadActions({
  lead,
  canWrite,
  onEdit,
  onDelete,
  onCreateProposal,
}: {
  lead: Lead;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCreateProposal: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`lead-actions-${lead.id}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {canWrite && (
          <DropdownMenuItem onClick={onCreateProposal}>
            <FileText className="h-4 w-4 mr-2" />
            Create Proposal
          </DropdownMenuItem>
        )}
        {canWrite && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Lead
          </DropdownMenuItem>
        )}
        {canWrite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateLeadDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: GetUsersQueryResult;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateLead();

  const form = useForm<CreateLeadForm>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      source: "other",
      customerName: "",
    },
  });

  const onSubmit = (data: CreateLeadForm) => {
    const payload = {
      ...data,
      email: data.email || undefined,
      company: data.company || undefined,
      phone: data.phone || undefined,
      gstNumber: data.gstNumber || undefined,
      billingAddress: data.billingAddress || undefined,
      deliveryAddress: data.deliveryAddress || undefined,
      productInterest: data.productInterest || undefined,
      notes: data.notes || undefined,
      lastFollowupNote: data.lastFollowupNote || undefined,
    };
    createMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
          toast({ title: "Lead created successfully" });
          onOpenChange(false);
          form.reset();
        },
        onError: () =>
          toast({ variant: "destructive", title: "Failed to create lead" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-lead-customer" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC Corp" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 99999 99999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-lead-source">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SOURCE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filterSalesUsers(users).map((u) => (
                            <SelectItem key={u.id} value={u.id.toString()}>
                              {u.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="productInterest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Interest</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Stage Lighting, Audio System" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gstNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Number</FormLabel>
                    <FormControl>
                      <Input placeholder="22AAAAA0000A1Z5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Billing address..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Delivery address (if different)..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Additional notes..." rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastFollowupNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Follow-up Note</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What happened in the last follow-up call / meeting..." rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit-lead"
              >
                {createMutation.isPending ? "Creating..." : "Create Lead"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type SalesUser = { id: number; name: string; role: string };

function filterSalesUsers(users: GetUsersQueryResult): SalesUser[] {
  return users.filter((u) =>
    ["sales", "manager", "director", "admin"].includes(u.role),
  );
}

function EditLeadDialog({
  lead,
  users,
  onClose,
}: {
  lead: Lead;
  users: GetUsersQueryResult;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateLead();
  const [leadStatus, setLeadStatus] = useState<string>(lead.status);

  const form = useForm<CreateLeadForm>({
    defaultValues: {
      customerName: lead.customerName,
      company: lead.company ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      gstNumber: lead.gstNumber ?? "",
      billingAddress: lead.billingAddress ?? "",
      deliveryAddress: lead.deliveryAddress ?? "",
      source: (lead.source as (typeof LEAD_SOURCES)[number]) ?? "other",
      productInterest: lead.productInterest ?? "",
      notes: lead.notes ?? "",
      lastFollowupNote: "",
      assignedToId: lead.assignedToId ?? undefined,
    },
  });

  const onSubmit = (data: CreateLeadForm) => {
    updateMutation.mutate(
      {
        id: lead.id,
        data: {
          ...data,
          email: data.email || undefined,
          status: leadStatus as (typeof LEAD_STATUSES)[number],
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
          toast({ title: "Lead updated" });
          onClose();
        },
        onError: () =>
          toast({ variant: "destructive", title: "Failed to update lead" }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lead — {lead.customerName}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SOURCE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={setLeadStatus} value={leadStatus}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
              <FormField
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v, 10))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filterSalesUsers(users).map((u) => (
                            <SelectItem key={u.id} value={u.id.toString()}>
                              {u.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="gstNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GST Number</FormLabel>
                    <FormControl>
                      <Input placeholder="22AAAAA0000A1Z5" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="productInterest"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Interest</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billingAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastFollowupNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Follow-up Note <span className="text-xs text-muted-foreground font-normal">(records latest contact)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Summary of the latest call / visit..." rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            {lead.lastFollowupAt && (
              <p className="text-xs text-muted-foreground">
                Last follow-up: {new Date(lead.lastFollowupAt).toLocaleString("en-IN")} — {lead.lastFollowupNote}
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
