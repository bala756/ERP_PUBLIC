import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeactivateEmployee,
  useSetLeaveBalance,
  getGetEmployeesQueryKey,
  getGetEmployeeQueryKey,
  type Employee,
  type CreateEmployeeBody,
  type UpdateEmployeeBody,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Users, Plus, Search, UserX, Pencil, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Salary management: can see salaries, phone/email, create/update/deactivate employees
const SALARY_ROLES = ["director", "admin", "accounts", "cfo"];
// All HR-adjacent roles: can view the full employee directory with actions
const HR_ROLES = ["manager", "director", "admin", "accounts", "cfo"];

const DEPARTMENTS = [
  "director", "sales", "purchase", "accounts",
  "project_execution", "production", "service", "general",
];
const DEPT_LABELS: Record<string, string> = {
  director: "Director's Office",
  sales: "Sales",
  purchase: "Purchase",
  accounts: "Accounts & Finance",
  project_execution: "Project Execution",
  production: "Production",
  service: "Service",
  general: "General",
};

const EMP_TYPES = ["fullTime", "contract", "partTime"] as const;
const EMP_TYPE_LABELS: Record<string, string> = {
  fullTime: "Full-Time",
  contract: "Contract",
  partTime: "Part-Time",
};

type FormData = {
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  phone: string;
  email: string;
  employmentType: "fullTime" | "contract" | "partTime";
  basicSalary: string;
  hra: string;
  otherAllowances: string;
  workingDaysPerMonth: string;
};

const EMPTY_FORM: FormData = {
  employeeCode: "",
  name: "",
  designation: "",
  department: "",
  dateOfJoining: "",
  phone: "",
  email: "",
  employmentType: "fullTime",
  basicSalary: "0",
  hra: "0",
  otherAllowances: "0",
  workingDaysPerMonth: "26",
};

function employeeToForm(e: Employee): FormData {
  return {
    employeeCode: e.employeeCode,
    name: e.name,
    designation: e.designation ?? "",
    department: e.department ?? "",
    dateOfJoining: e.dateOfJoining ?? "",
    phone: e.phone ?? "",
    email: e.email ?? "",
    employmentType: (e.employmentType as "fullTime" | "contract" | "partTime") ?? "fullTime",
    basicSalary: String(e.basicSalary ?? 0),
    hra: String(e.hra ?? 0),
    otherAllowances: String(e.otherAllowances ?? 0),
    workingDaysPerMonth: String(e.workingDaysPerMonth ?? 26),
  };
}

function EmployeeFormDialog({
  open,
  onClose,
  onSave,
  initial,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateEmployeeBody | UpdateEmployeeBody) => void;
  initial?: Employee;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial ? employeeToForm(initial) : EMPTY_FORM);

  // Reset form whenever the dialog opens or the selected employee changes
  React.useEffect(() => {
    if (open) {
      setForm(initial ? employeeToForm(initial) : EMPTY_FORM);
    }
  }, [open, initial?.id]);

  const set = (k: keyof FormData, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateEmployeeBody = {
      employeeCode: form.employeeCode,
      name: form.name,
      designation: form.designation || undefined,
      department: form.department || undefined,
      dateOfJoining: form.dateOfJoining || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      employmentType: form.employmentType,
      basicSalary: parseFloat(form.basicSalary) || 0,
      hra: parseFloat(form.hra) || 0,
      otherAllowances: parseFloat(form.otherAllowances) || 0,
      workingDaysPerMonth: parseInt(form.workingDaysPerMonth, 10) || 26,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Employee" : "Add Employee"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Employee Code *</Label>
              <Input value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} required placeholder="EMP-001" />
            </div>
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => set("designation", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={form.department} onValueChange={(v) => set("department", v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>{DEPT_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date of Joining</Label>
              <Input type="date" value={form.dateOfJoining} onChange={(e) => set("dateOfJoining", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Employment Type</Label>
              <Select value={form.employmentType} onValueChange={(v) => set("employmentType", v as "fullTime" | "contract" | "partTime")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMP_TYPES.map((t) => <SelectItem key={t} value={t}>{EMP_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">Salary Structure (Monthly)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Basic Salary (₹)</Label>
                <Input type="number" min="0" value={form.basicSalary} onChange={(e) => set("basicSalary", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>HRA (₹)</Label>
                <Input type="number" min="0" value={form.hra} onChange={(e) => set("hra", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Other Allowances (₹)</Label>
                <Input type="number" min="0" value={form.otherAllowances} onChange={(e) => set("otherAllowances", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Working Days / Month</Label>
                <Input type="number" min="1" max="31" value={form.workingDaysPerMonth} onChange={(e) => set("workingDaysPerMonth", e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeeDirectory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);

  const { data: employees = [], isLoading } = useGetEmployees(
    { isActive: showInactive ? undefined : true },
  );

  const canManage = SALARY_ROLES.includes(user?.role ?? ""); // salary view + create/update/deactivate

  const createEmp = useCreateEmployee({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetEmployeesQueryKey() });
        setFormOpen(false);
        toast({ title: "Employee created" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  const updateEmp = useUpdateEmployee({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetEmployeesQueryKey() });
        setFormOpen(false);
        setEditingEmp(null);
        toast({ title: "Employee updated" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  const deactivateEmp = useDeactivateEmployee({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetEmployeesQueryKey() });
        toast({ title: "Employee deactivated" });
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
    },
  });

  const filtered = employees.filter((e) => {
    const matchesDept = deptFilter === "all" || e.department === deptFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      e.name.toLowerCase().includes(q) ||
      e.employeeCode.toLowerCase().includes(q) ||
      (e.designation ?? "").toLowerCase().includes(q);
    return matchesDept && matchesSearch;
  });

  const totalSalary = filtered.reduce((sum, e) => sum + (e.grossSalary ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" />Employee Directory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{employees.length} employee{employees.length !== 1 ? "s" : ""}</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditingEmp(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add Employee
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Employees</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{employees.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Full-Time</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{employees.filter((e) => e.employmentType === "fullTime").length}</p></CardContent>
        </Card>
        {canManage && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Monthly Salary Outflow</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">₹{filtered.reduce((s, e) => s + (e.grossSalary ?? 0), 0).toLocaleString("en-IN")}</p></CardContent>
          </Card>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name, code, designation…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{DEPT_LABELS[d]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={showInactive ? "default" : "outline"} size="sm" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? "Showing All" : "Active Only"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Joining</TableHead>
                {canManage && <TableHead className="text-right">Gross Salary</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground py-8">No employees found</TableCell></TableRow>
              ) : (
                filtered.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-mono text-xs">{emp.employeeCode}</TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.designation ?? "—"}</TableCell>
                    <TableCell>{emp.department ? DEPT_LABELS[emp.department] ?? emp.department : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{EMP_TYPE_LABELS[emp.employmentType] ?? emp.employmentType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{emp.dateOfJoining ?? "—"}</TableCell>
                    {canManage && <TableCell className="text-right font-medium">₹{(emp.grossSalary ?? 0).toLocaleString("en-IN")}</TableCell>}
                    <TableCell>
                      <Badge variant={emp.isActive ? "default" : "secondary"} className="text-xs">
                        {emp.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View Profile" onClick={() => navigate(`/employees/${emp.id}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canManage && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => { setEditingEmp(emp); setFormOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && emp.isActive && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Deactivate"
                            onClick={() => {
                              if (confirm(`Deactivate ${emp.name}?`)) {
                                deactivateEmp.mutate({ id: emp.id });
                              }
                            }}
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <EmployeeFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingEmp(null); }}
        onSave={(data) => {
          if (editingEmp) {
            updateEmp.mutate({ id: editingEmp.id, data: data as UpdateEmployeeBody });
          } else {
            createEmp.mutate({ data: data as CreateEmployeeBody });
          }
        }}
        initial={editingEmp ?? undefined}
        isSaving={createEmp.isPending || updateEmp.isPending}
      />
    </div>
  );
}
