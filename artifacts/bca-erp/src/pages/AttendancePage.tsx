import React, { useState } from "react";
import {
  useGetEmployees,
  useGetAttendanceRecords,
  useMarkAttendance,
  useMarkBulkAttendance,
  useGetAttendanceSummary,
  getGetAttendanceRecordsQueryKey,
  getGetAttendanceSummaryQueryKey,
  type Employee,
  type AttendanceSummary,
  type AttendanceRecord,
  type MarkAttendanceBody,
  type BulkAttendanceBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Clock, CheckSquare, BarChart2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const HR_MANAGE_ROLES = ["manager", "director", "admin", "accounts", "cfo"];
const SALARY_ROLES = ["director", "admin", "accounts", "cfo"];

const STATUS_OPTIONS = [
  { value: "present", label: "Present", color: "bg-green-100 text-green-800" },
  { value: "absent", label: "Absent", color: "bg-red-100 text-red-800" },
  { value: "halfDay", label: "Half Day", color: "bg-yellow-100 text-yellow-800" },
  { value: "late", label: "Late", color: "bg-orange-100 text-orange-800" },
  { value: "onLeave", label: "On Leave", color: "bg-blue-100 text-blue-800" },
] as const;

type AttendanceStatus = "present" | "absent" | "halfDay" | "late" | "onLeave";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthYear() {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1).padStart(2, "0"),
    year: String(now.getFullYear()),
  };
}

function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${opt?.color ?? "bg-gray-100 text-gray-800"}`}>
      {opt?.label ?? status}
    </span>
  );
}

// ─── Daily Marking Tab ─────────────────────────────────────────────────────────
function DailyMarkingTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [deptFilter, setDeptFilter] = useState("all");

  const { data: employees = [], isLoading: loadingEmps } = useGetEmployees(
    { isActive: true },
  );

  const { data: existingRecords } = useGetAttendanceRecords(
    { date },
  );

  const [statusMap, setStatusMap] = useState<Record<number, AttendanceStatus>>({});

  React.useEffect(() => {
    if (!existingRecords) return;
    const map: Record<number, AttendanceStatus> = {};
    for (const r of existingRecords) {
      map[r.employeeId] = r.status as AttendanceStatus;
    }
    setStatusMap(map);
  }, [existingRecords]);

  const markBulk = useMarkBulkAttendance({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetAttendanceRecordsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAttendanceSummaryQueryKey() });
        toast({ title: "Attendance saved" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  const filteredEmps = employees.filter(
    (e) => deptFilter === "all" || e.department === deptFilter,
  );

  const DEPARTMENTS = [...new Set(employees.map((e) => e.department).filter(Boolean))] as string[];

  const handleSave = () => {
    const records = filteredEmps
      .filter((e) => statusMap[e.id])
      .map((e) => ({ employeeId: e.id, status: statusMap[e.id]! }));

    if (records.length === 0) {
      toast({ variant: "destructive", title: "No attendance data to save" });
      return;
    }

    const payload: BulkAttendanceBody = { date, records };
    markBulk.mutate({ data: payload });
  };

  const markAll = (status: AttendanceStatus) => {
    const map: Record<number, AttendanceStatus> = { ...statusMap };
    for (const e of filteredEmps) map[e.id] = status;
    setStatusMap(map);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1">
          <Label>Department</Label>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => markAll("present")}>All Present</Button>
          <Button variant="outline" size="sm" onClick={() => markAll("absent")}>All Absent</Button>
          <Button size="sm" onClick={handleSave} disabled={markBulk.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {markBulk.isPending ? "Saving…" : "Save Attendance"}
          </Button>
        </div>
      </div>

      {loadingEmps ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmps.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No employees</TableCell></TableRow>
              ) : (
                filteredEmps.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-mono text-xs">{emp.employeeCode}</TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.department ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={statusMap[emp.id] ?? ""}
                        onValueChange={(v) => setStatusMap((p) => ({ ...p, [emp.id]: v as AttendanceStatus }))}
                      >
                        <SelectTrigger className="w-36 h-8">
                          <SelectValue placeholder="Mark status">
                            {statusMap[emp.id] ? <StatusBadge status={statusMap[emp.id]!} /> : "Mark status"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <StatusBadge status={s.value} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Summary Tab ───────────────────────────────────────────────────────
function MonthlySummaryTab() {
  const { user } = useAuth();
  const { month: m, year: y } = currentMonthYear();
  const [month, setMonth] = useState(m);
  const [year, setYear] = useState(y);

  const showSalary = SALARY_ROLES.includes(user?.role as typeof SALARY_ROLES[number]);

  const { data: summary = [], isLoading } = useGetAttendanceSummary(
    { month, year },
  );

  const totalPresent = summary.reduce((s, r) => s + r.present, 0);
  const totalAbsent = summary.reduce((s, r) => s + r.absent, 0);
  const totalNetPay = summary.reduce((s, r) => s + (r.netPay ?? 0), 0);

  const colSpan = showSalary ? 10 : 8;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => {
                const v = String(i + 1).padStart(2, "0");
                const label = new Date(2000, i, 1).toLocaleString("en-IN", { month: "long" });
                return <SelectItem key={v} value={v}>{label}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-24" type="number" />
        </div>
      </div>

      <div className={`grid gap-4 ${showSalary ? "grid-cols-3" : "grid-cols-2"}`}>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Present Days</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{totalPresent}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Absent Days</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{totalAbsent}</p></CardContent>
        </Card>
        {showSalary && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Pay (Est.)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{totalNetPay.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></CardContent>
          </Card>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead className="text-center">P</TableHead>
                <TableHead className="text-center">A</TableHead>
                <TableHead className="text-center">HD</TableHead>
                <TableHead className="text-center">L</TableHead>
                <TableHead className="text-center">OL</TableHead>
                <TableHead className="text-center">Eff. Days</TableHead>
                {showSalary && <TableHead className="text-right">Gross</TableHead>}
                {showSalary && <TableHead className="text-right">Net Pay</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.length === 0 ? (
                <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">No data for this period</TableCell></TableRow>
              ) : (
                summary.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell>
                      <div className="font-medium text-sm">{row.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.department ?? "—"}</TableCell>
                    <TableCell className="text-center text-green-600 font-medium">{row.present}</TableCell>
                    <TableCell className="text-center text-red-600 font-medium">{row.absent}</TableCell>
                    <TableCell className="text-center text-yellow-600 font-medium">{row.halfDay}</TableCell>
                    <TableCell className="text-center text-orange-600 font-medium">{row.late}</TableCell>
                    <TableCell className="text-center text-blue-600 font-medium">{row.onLeave}</TableCell>
                    <TableCell className="text-center font-medium">{row.effectiveDays.toFixed(1)}</TableCell>
                    {showSalary && <TableCell className="text-right text-sm">₹{(row.grossSalary ?? 0).toLocaleString("en-IN")}</TableCell>}
                    {showSalary && <TableCell className="text-right font-semibold">₹{(row.netPay ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">P = Present, A = Absent, HD = Half Day, L = Late, OL = On Leave</p>
    </div>
  );
}

// ─── Employee Calendar Tab ─────────────────────────────────────────────────────
const CALENDAR_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  present:  { bg: "bg-green-500",  text: "text-white", label: "P" },
  absent:   { bg: "bg-red-500",    text: "text-white", label: "A" },
  halfDay:  { bg: "bg-yellow-400", text: "text-white", label: "HD" },
  late:     { bg: "bg-orange-400", text: "text-white", label: "L" },
  onLeave:  { bg: "bg-blue-400",   text: "text-white", label: "OL" },
};

function EmployeeCalendarTab() {
  const { user } = useAuth();
  const { month: m, year: y } = currentMonthYear();
  const [month, setMonth] = useState(m);
  const [year, setYear] = useState(y);
  const [selectedEmpId, setSelectedEmpId] = useState("");

  const userIsHR = HR_MANAGE_ROLES.includes(user?.role ?? "");
  const { data: employees = [] } = useGetEmployees({ isActive: true });

  // For HR users, require an employee selection before fetching
  const shouldFetch = !userIsHR || !!selectedEmpId;
  const { data: records = [] } = useGetAttendanceRecords(
    shouldFetch
      ? { employeeId: selectedEmpId ? parseInt(selectedEmpId, 10) : undefined, month, year }
      : { month: "00", year: "0000" }, // unreachable dummy — hook not actually called
  );

  const recordsByDate = React.useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    for (const r of records) { map[r.date] = r; }
    return map;
  }, [records]);

  // Build calendar grid for the selected month/year
  const calendarDays = React.useMemo(() => {
    const numDays = new Date(parseInt(year), parseInt(month), 0).getDate();
    const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1).getDay(); // 0=Sun
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= numDays; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month, year]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end flex-wrap">
        {userIsHR && (
          <div className="space-y-1">
            <Label>Employee</Label>
            <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.employeeCode} — {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => {
                const v = String(i + 1).padStart(2, "0");
                return <SelectItem key={v} value={v}>{new Date(2000, i, 1).toLocaleString("en-IN", { month: "long" })}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-24" type="number" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap text-xs">
        {Object.entries(CALENDAR_STATUS_STYLES).map(([key, s]) => (
          <span key={key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${s.bg} ${s.text}`}>
            {s.label} — {key === "halfDay" ? "Half Day" : key === "onLeave" ? "On Leave" : key.charAt(0).toUpperCase() + key.slice(1)}
          </span>
        ))}
      </div>

      {/* Prompt for HR users to select an employee */}
      {userIsHR && !selectedEmpId && (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
          Select an employee above to view their monthly attendance calendar.
        </div>
      )}

      {/* Calendar grid — only shown when employee selected (or for non-HR own view) */}
      {(!userIsHR || selectedEmpId) && <div className="rounded-md border overflow-hidden">
        <div className="grid grid-cols-7 bg-muted">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y border-t">
          {calendarDays.map((day, i) => {
            if (!day) return <div key={i} className="h-14 bg-muted/20" />;
            const dateStr = `${year}-${month.padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const rec = recordsByDate[dateStr];
            const style = rec ? CALENDAR_STATUS_STYLES[rec.status] : null;
            const isWeekend = [0, 6].includes(new Date(dateStr).getDay());
            return (
              <div
                key={i}
                className={`h-14 p-1 flex flex-col items-end ${isWeekend ? "bg-slate-50" : "bg-white"}`}
              >
                <span className={`text-xs font-medium ${isWeekend ? "text-muted-foreground" : "text-foreground"}`}>{day}</span>
                {style && (
                  <span className={`mt-auto text-xs font-bold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>}

      {(!userIsHR || selectedEmpId) && records.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {records.filter((r) => r.status === "present").length} present &nbsp;·&nbsp;
          {records.filter((r) => r.status === "absent").length} absent &nbsp;·&nbsp;
          {records.filter((r) => r.status === "halfDay").length} half day &nbsp;·&nbsp;
          {records.filter((r) => r.status === "late").length} late &nbsp;·&nbsp;
          {records.filter((r) => r.status === "onLeave").length} on leave
        </p>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const { user } = useAuth();
  const isHRUser = HR_MANAGE_ROLES.includes(user?.role ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="h-6 w-6" />Attendance</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Mark daily attendance and view monthly summaries</p>
      </div>

      <Tabs defaultValue={isHRUser ? "daily" : "calendar"}>
        <TabsList>
          {isHRUser && <TabsTrigger value="daily"><CheckSquare className="h-4 w-4 mr-1" />Daily Marking</TabsTrigger>}
          <TabsTrigger value="calendar"><BarChart2 className="h-4 w-4 mr-1" />Attendance Calendar</TabsTrigger>
          {isHRUser && <TabsTrigger value="summary"><BarChart2 className="h-4 w-4 mr-1" />Monthly Summary</TabsTrigger>}
        </TabsList>
        {isHRUser && <TabsContent value="daily" className="mt-4"><DailyMarkingTab /></TabsContent>}
        <TabsContent value="calendar" className="mt-4"><EmployeeCalendarTab /></TabsContent>
        {isHRUser && <TabsContent value="summary" className="mt-4"><MonthlySummaryTab /></TabsContent>}
      </Tabs>
    </div>
  );
}
