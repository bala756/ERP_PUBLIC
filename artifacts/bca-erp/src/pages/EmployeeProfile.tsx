import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetEmployee,
  useGetLeaveBalances,
  useGetLeaveRequests,
  useGetAttendanceSummary,
  useSetLeaveBalance,
  type Employee,
  type LeaveRequest,
  type AttendanceSummary,
  type LeaveBalance,
  type SetLeaveBalanceBody,
  getGetLeaveBalancesQueryKey,
  getGetAttendanceSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, User, Briefcase, Calendar, Phone, Mail,
  DollarSign, ClipboardList, CheckCircle, XCircle, Clock, Pencil, Save, X,
} from "lucide-react";

const SALARY_ROLES = ["director", "admin", "accounts", "cfo"] as const;
const ATTENDANCE_MARK_ROLES = ["manager", "director", "admin", "accounts", "cfo"] as const;

function canSeeSalary(role: string) {
  return (SALARY_ROLES as readonly string[]).includes(role);
}

function canViewAttendanceSummary(role: string) {
  return (ATTENDANCE_MARK_ROLES as readonly string[]).includes(role);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n));
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    approved: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    rejected: "bg-red-100 text-red-800",
  };
  return (
    <Badge className={map[status] ?? "bg-gray-100 text-gray-800"}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function attendanceBadge(status: string | null | undefined) {
  if (!status) return <Badge className="bg-gray-100 text-gray-500">—</Badge>;
  const map: Record<string, string> = {
    present: "bg-green-100 text-green-800",
    absent: "bg-red-100 text-red-800",
    halfDay: "bg-yellow-100 text-yellow-800",
    leave: "bg-blue-100 text-blue-800",
    holiday: "bg-purple-100 text-purple-800",
  };
  const labels: Record<string, string> = {
    present: "Present",
    absent: "Absent",
    halfDay: "Half Day",
    leave: "Leave",
    holiday: "Holiday",
  };
  return (
    <Badge className={map[status] ?? "bg-gray-100 text-gray-500"}>
      {labels[status] ?? status}
    </Badge>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}

const LEAVE_TYPES = ["casual", "sick", "earned"] as const;
const LEAVE_LABELS: Record<string, string> = { casual: "Casual Leave", sick: "Sick Leave", earned: "Earned Leave" };

export default function EmployeeProfile() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = parseInt(params.id, 10);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [editingBalance, setEditingBalance] = useState<{ leaveType: string; totalDays: string } | null>(null);

  const { data: employee, isLoading: empLoading, isError: empError, error: empRawError } = useGetEmployee(id);
  const { data: leaveRequests = [], isLoading: leaveLoading } = useGetLeaveRequests({ employeeId: id });
  const canViewAttSummary = canViewAttendanceSummary(user?.role ?? "");
  const attParams = { year: String(year), month: String(month) };
  const { data: attendanceSummaryAll = [], isLoading: attLoading } = useGetAttendanceSummary(
    attParams,
    { query: { enabled: canViewAttSummary, queryKey: getGetAttendanceSummaryQueryKey(attParams) } },
  );
  const { data: leaveBalances = [], isLoading: balanceLoading } = useGetLeaveBalances(id);

  const setBalanceMutation = useSetLeaveBalance({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetLeaveBalancesQueryKey(id) });
        setEditingBalance(null);
        toast({ title: "Leave balance updated" });
      },
      onError: () => toast({ title: "Failed to update leave balance", variant: "destructive" }),
    },
  });

  const attendanceSummary = (attendanceSummaryAll as AttendanceSummary[]).find(
    (s) => s.employeeId === id,
  ) ?? null;

  const showSalary = canSeeSalary(user?.role ?? "");

  if (empLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48 md:col-span-2" />
        </div>
      </div>
    );
  }

  // Distinguish 403 (access denied) from 404 (not found)
  if (empError || !employee) {
    const status = (empRawError as { status?: number } | null)?.status;
    const isForbidden = status === 403;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/employees")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-destructive font-medium">
              {isForbidden ? "You don't have permission to view this employee's profile." : "Employee not found."}
            </p>
            {isForbidden && (
              <p className="text-sm text-muted-foreground mt-1">
                Contact your HR administrator if you need access.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const emp = employee as Employee;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/employees")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Employees
        </Button>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold">{emp.name}</h1>
        <Badge variant={emp.isActive ? "default" : "secondary"}>
          {emp.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Identity card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center py-2">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary mb-2">
                {emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <p className="font-semibold">{emp.name}</p>
              <p className="text-xs text-muted-foreground">{emp.employeeCode}</p>
            </div>
            <div className="space-y-3">
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Designation" value={emp.designation} />
              <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Department" value={emp.department} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Joined" value={formatDate(emp.dateOfJoining)} />
              <InfoRow icon={<ClipboardList className="h-4 w-4" />} label="Type" value={
                emp.employmentType === "fullTime" ? "Full-Time" :
                emp.employmentType === "contract" ? "Contract" : "Part-Time"
              } />
            </div>
          </CardContent>
        </Card>

        {/* Contact & Salary (gated) */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Contact &amp; Compensation
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showSalary ? (
              <>
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={emp.phone ?? "—"} />
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={emp.email ?? "—"} />
                <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Basic Salary" value={formatCurrency(emp.basicSalary)} />
                <InfoRow icon={<DollarSign className="h-4 w-4" />} label="HRA" value={formatCurrency(emp.hra)} />
                <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Other Allowances" value={formatCurrency(emp.otherAllowances)} />
                <InfoRow icon={<DollarSign className="h-4 w-4" />} label="Gross Salary" value={formatCurrency(emp.grossSalary)} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground col-span-2">
                Contact and compensation details are restricted to HR.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attendance summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Attendance — {now.toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : attendanceSummary ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: <CheckCircle className="h-4 w-4 text-green-600" />, label: "Present", value: attendanceSummary.present },
                { icon: <XCircle className="h-4 w-4 text-red-500" />, label: "Absent", value: attendanceSummary.absent },
                { icon: <Clock className="h-4 w-4 text-yellow-500" />, label: "Half Days", value: attendanceSummary.halfDay },
                { icon: <Calendar className="h-4 w-4 text-blue-500" />, label: "On Leave", value: attendanceSummary.onLeave },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                  {s.icon}
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance data for this month.</p>
          )}
        </CardContent>
      </Card>

      {/* Leave balances */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Leave Balances ({year})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {balanceLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Total Days</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  {showSalary && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {LEAVE_TYPES.map((lt) => {
                  const bal = (leaveBalances as LeaveBalance[]).find((b) => b.leaveType === lt);
                  const isEditing = editingBalance?.leaveType === lt;
                  return (
                    <TableRow key={lt}>
                      <TableCell>{LEAVE_LABELS[lt]}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <Input
                            type="number"
                            min={0}
                            className="h-7 w-20 text-right inline-flex"
                            value={editingBalance?.totalDays ?? ""}
                            onChange={(e) => setEditingBalance((prev) => prev ? { ...prev, totalDays: e.target.value } : prev)}
                          />
                        ) : (
                          bal?.totalDays ?? <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{bal?.usedDays ?? 0}</TableCell>
                      <TableCell className="text-right font-medium">
                        {bal ? Math.max(0, bal.totalDays - bal.usedDays) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {showSalary && (
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => {
                                  const days = parseInt(editingBalance?.totalDays ?? "", 10);
                                  if (!isNaN(days) && days >= 0) {
                                    setBalanceMutation.mutate({ id, data: { leaveType: lt, year, totalDays: days } as SetLeaveBalanceBody });
                                  }
                                }}>
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingBalance(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingBalance({ leaveType: lt, totalDays: String(bal?.totalDays ?? 0) })}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Leave requests */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Leave History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaveLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : leaveRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave requests found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(leaveRequests as LeaveRequest[]).slice(0, 10).map((lr) => (
                  <TableRow key={lr.id}>
                    <TableCell className="capitalize">{lr.leaveType}</TableCell>
                    <TableCell>{formatDate(lr.fromDate)}</TableCell>
                    <TableCell>{formatDate(lr.toDate)}</TableCell>
                    <TableCell className="max-w-xs truncate">{lr.reason ?? "—"}</TableCell>
                    <TableCell>{statusBadge(lr.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
