import React, { useState } from "react";
import {
  useGetLeaveRequests,
  useCreateLeaveRequest,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useGetEmployees,
  useGetEmployee,
  getGetLeaveRequestsQueryKey,
  type LeaveRequest,
  type CreateLeaveRequestBody,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarDays, Plus, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const APPROVE_ROLES = ["manager", "director", "admin"];
const LEAVE_TYPES = ["casual", "sick", "earned"] as const;
const LEAVE_LABELS: Record<string, string> = { casual: "Casual Leave", sick: "Sick Leave", earned: "Earned Leave" };

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function diffDays(from: string, to: string) {
  const d1 = new Date(from), d2 = new Date(to);
  return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

// ─── Leave Requests List ───────────────────────────────────────────────────────
function LeaveRequestsList({ pendingOnly }: { pendingOnly: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canApprove = APPROVE_ROLES.includes(user?.role ?? "");

  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [statusFilter, setStatusFilter] = useState(pendingOnly ? "pending" : "all");

  const { data: requests = [], isLoading } = useGetLeaveRequests(
    { status: statusFilter === "all" ? undefined : statusFilter as "pending" | "approved" | "rejected" },
  );

  const approve = useApproveLeaveRequest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetLeaveRequestsQueryKey() });
        toast({ title: "Leave approved" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  const reject = useRejectLeaveRequest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetLeaveRequestsQueryKey() });
        setRejectingId(null);
        setRejectionNote("");
        toast({ title: "Leave rejected" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  return (
    <div className="space-y-4">
      {!pendingOnly && (
        <div className="flex gap-2">
          {["all", "pending", "approved", "rejected"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-center">Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                {canApprove && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow><TableCell colSpan={canApprove ? 8 : 7} className="text-center text-muted-foreground py-8">No leave requests</TableCell></TableRow>
              ) : (
                requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.employeeName ?? `ID:${req.employeeId}`}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{LEAVE_LABELS[req.leaveType] ?? req.leaveType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{req.fromDate}</TableCell>
                    <TableCell className="text-sm">{req.toDate}</TableCell>
                    <TableCell className="text-center font-medium">{diffDays(req.fromDate, req.toDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-40 truncate">{req.reason ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[req.status] ?? ""}`}>
                        {req.status}
                      </span>
                    </TableCell>
                    {canApprove && (
                      <TableCell>
                        {req.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => approve.mutate({ id: req.id })}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() => setRejectingId(req.id)}>
                              <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                        {req.status === "rejected" && req.rejectionNote && (
                          <span className="text-xs text-muted-foreground">Note: {req.rejectionNote}</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={rejectingId !== null} onOpenChange={(v) => !v && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Reason for rejection (optional)</Label>
            <Textarea value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={() => {
              if (rejectingId !== null) reject.mutate({ id: rejectingId, data: { rejectionNote: rejectionNote || undefined } });
            }}>
              {reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Submit Leave Request ──────────────────────────────────────────────────────
function SubmitLeaveTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: employees = [] } = useGetEmployees({ isActive: true });

  const [form, setForm] = useState({
    employeeId: "",
    leaveType: "casual" as "casual" | "sick" | "earned",
    fromDate: "",
    toDate: "",
    reason: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const createLeave = useCreateLeaveRequest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetLeaveRequestsQueryKey() });
        setForm({ employeeId: "", leaveType: "casual", fromDate: "", toDate: "", reason: "" });
        toast({ title: "Leave request submitted" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  const { data: empDetail } = useGetEmployee(
    form.employeeId ? parseInt(form.employeeId, 10) : 0,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.fromDate || !form.toDate) {
      toast({ variant: "destructive", title: "Fill all required fields" });
      return;
    }
    const payload: CreateLeaveRequestBody = {
      employeeId: parseInt(form.employeeId, 10),
      leaveType: form.leaveType,
      fromDate: form.fromDate,
      toDate: form.toDate,
      reason: form.reason || undefined,
    };
    createLeave.mutate({ data: payload });
  };

  const days = form.fromDate && form.toDate ? diffDays(form.fromDate, form.toDate) : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      <div className="space-y-1">
        <Label>Employee *</Label>
        <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
          <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name} ({e.employeeCode})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {empDetail && empDetail.leaveBalances && empDetail.leaveBalances.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {empDetail.leaveBalances.map((b) => (
            <Card key={b.id} className="flex-1 min-w-28">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground">{LEAVE_LABELS[b.leaveType]}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-lg font-bold">{b.remainingDays}<span className="text-xs text-muted-foreground font-normal"> / {b.totalDays}</span></p>
                <p className="text-xs text-muted-foreground">days remaining</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <Label>Leave Type *</Label>
        <Select value={form.leaveType} onValueChange={(v) => set("leaveType", v as "casual" | "sick" | "earned")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{LEAVE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>From Date *</Label>
          <Input type="date" value={form.fromDate} onChange={(e) => set("fromDate", e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>To Date *</Label>
          <Input type="date" value={form.toDate} min={form.fromDate} onChange={(e) => set("toDate", e.target.value)} required />
        </div>
      </div>

      {days > 0 && (
        <p className="text-sm text-muted-foreground">{days} day{days > 1 ? "s" : ""} requested</p>
      )}

      <div className="space-y-1">
        <Label>Reason</Label>
        <Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={3} placeholder="Brief reason for leave…" />
      </div>

      <Button type="submit" disabled={createLeave.isPending}>
        {createLeave.isPending ? "Submitting…" : "Submit Leave Request"}
      </Button>
    </form>
  );
}

export default function LeaveManagement() {
  const { data: pendingRequests = [] } = useGetLeaveRequests({ status: "pending" });
  const pendingCount = pendingRequests.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="h-6 w-6" />Leave Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Submit and approve leave requests</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-orange-500 text-white text-sm px-3 py-1">{pendingCount} pending approval</Badge>
        )}
      </div>

      <Tabs defaultValue={pendingCount > 0 ? "pending" : "submit"}>
        <TabsList>
          <TabsTrigger value="pending">
            Pending Approvals {pendingCount > 0 && <span className="ml-1 text-xs bg-orange-500 text-white rounded-full px-1.5">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="all">All Requests</TabsTrigger>
          <TabsTrigger value="submit"><Plus className="h-4 w-4 mr-1" />Submit Request</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4"><LeaveRequestsList pendingOnly={true} /></TabsContent>
        <TabsContent value="all" className="mt-4"><LeaveRequestsList pendingOnly={false} /></TabsContent>
        <TabsContent value="submit" className="mt-4"><SubmitLeaveTab /></TabsContent>
      </Tabs>
    </div>
  );
}
