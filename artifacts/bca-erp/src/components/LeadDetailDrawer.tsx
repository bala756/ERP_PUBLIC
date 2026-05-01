import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetLeadsQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity,
  ArrowRight,
  CircleUser,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export interface LeadActivityRow {
  id: number;
  leadId: number;
  type:
    | "created"
    | "statusChanged"
    | "assignmentChanged"
    | "followup"
    | "noteAdded"
    | "indiaMartSync"
    | "fieldEdited";
  actorUserId: number | null;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LeadSummary {
  id: number;
  customerName: string;
  company: string | null;
  status: string;
  assignedToId: number | null;
  assignedToName: string | null;
  state?: string | null;
  city?: string | null;
  productInterest?: string | null;
  source: string;
  lastFollowupNote: string | null;
  lastFollowupAt: string | null;
}

interface SalespersonOption {
  id: number;
  name: string;
  role: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  proposalSent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  onHold: "On Hold",
};

const ACTIVITY_ICON: Record<string, React.ReactNode> = {
  created: <Sparkles className="h-4 w-4 text-blue-600" />,
  statusChanged: <ArrowRight className="h-4 w-4 text-amber-600" />,
  assignmentChanged: <CircleUser className="h-4 w-4 text-purple-600" />,
  followup: <RefreshCw className="h-4 w-4 text-green-600" />,
  noteAdded: <PencilLine className="h-4 w-4 text-slate-600" />,
  indiaMartSync: <Plus className="h-4 w-4 text-orange-600" />,
  fieldEdited: <PencilLine className="h-4 w-4 text-slate-600" />,
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

function describeActivity(a: LeadActivityRow): string {
  switch (a.type) {
    case "created":
      return `Lead created (source: ${
        (a.payload.source as string) ?? "unknown"
      })`;
    case "statusChanged":
      return `Status changed: ${STATUS_LABELS[a.payload.from as string] ?? a.payload.from} → ${STATUS_LABELS[a.payload.to as string] ?? a.payload.to}`;
    case "assignmentChanged":
      if (a.payload.auto) {
        return `Auto-assigned by rule "${a.payload.ruleName}" (matched ${a.payload.matchedState ?? "—"} / ${a.payload.matchedKeyword ?? "—"})`;
      }
      return `Reassigned to user #${a.payload.to ?? a.payload.salespersonId}`;
    case "followup":
      return `Follow-up: ${(a.payload.note as string) ?? ""}`;
    case "fieldEdited": {
      const changes = (a.payload.changes ?? {}) as Record<string, unknown>;
      const fields = Object.keys(changes);
      return `Edited ${fields.join(", ")}`;
    }
    case "indiaMartSync":
      return `Imported from IndiaMart`;
    case "noteAdded":
      return `Note added`;
    default:
      return a.type;
  }
}

export interface LeadDetailDrawerProps {
  lead: LeadSummary | null;
  onClose: () => void;
}

export function LeadDetailDrawer({ lead, onClose }: LeadDetailDrawerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const open = lead !== null;

  const { data: activities, isLoading } = useQuery({
    queryKey: ["lead-activities", lead?.id],
    queryFn: () =>
      customFetch<LeadActivityRow[]>(`/api/leads/${lead!.id}/activities`),
    enabled: open,
  });

  const { data: salespeople } = useQuery({
    queryKey: ["lead-routing-salespeople"],
    queryFn: () =>
      customFetch<SalespersonOption[]>(`/api/lead-routing/salespeople`),
    enabled: open,
  });

  const reassignMutation = useMutation({
    mutationFn: (assignedToId: number | null) =>
      customFetch<unknown>(`/api/leads/${lead!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId }),
      }),
    onSuccess: () => {
      toast({ title: "Lead reassigned" });
      queryClient.invalidateQueries({ queryKey: ["lead-activities", lead?.id] });
      queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
    },
    onError: (err: unknown) => {
      const e = err as { error?: string } | null;
      toast({
        variant: "destructive",
        title: "Failed to reassign",
        description: e?.error ?? "Permission denied or invalid request",
      });
    },
  });

  const canReassign =
    user !== null && ["admin", "director", "cfo"].includes(user.role);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {lead.customerName}
                <Badge variant="outline">
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </Badge>
              </SheetTitle>
              <SheetDescription>
                {lead.company ?? "—"}{" "}
                {lead.state ? `· ${lead.state}` : ""}{" "}
                {lead.city ? `· ${lead.city}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Product Interest</Label>
                <p className="mt-1">{lead.productInterest || "—"}</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Assigned To</Label>
                {canReassign ? (
                  <Select
                    value={lead.assignedToId ? lead.assignedToId.toString() : "none"}
                    onValueChange={(v) =>
                      reassignMutation.mutate(v === "none" ? null : parseInt(v, 10))
                    }
                    disabled={reassignMutation.isPending}
                  >
                    <SelectTrigger data-testid="select-reassign">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(salespeople ?? []).map((sp) => (
                        <SelectItem key={sp.id} value={sp.id.toString()}>
                          {sp.name} ({sp.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p>{lead.assignedToName ?? "Unassigned"}</p>
                )}
              </div>

              {lead.lastFollowupNote && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground">Last Follow-up</Label>
                    <p className="mt-1">
                      {lead.lastFollowupNote}{" "}
                      <span className="text-muted-foreground">
                        ({lead.lastFollowupAt ? relativeTime(lead.lastFollowupAt) : ""})
                      </span>
                    </p>
                  </div>
                </>
              )}

              <Separator />

              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Activity Timeline
                </Label>
                <div className="mt-3 space-y-3">
                  {isLoading ? (
                    <>
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </>
                  ) : (activities ?? []).length === 0 ? (
                    <p className="text-muted-foreground text-sm">No activities yet.</p>
                  ) : (
                    (activities ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 border-l-2 border-muted pl-3 pb-3"
                      >
                        <div className="mt-0.5">
                          {ACTIVITY_ICON[a.type] ?? (
                            <Activity className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{describeActivity(a)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.actorName ?? "system"} · {relativeTime(a.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
