import React, { useState } from "react";
import {
  useGetPayrollRecords,
  type PayrollRecord,
} from "@workspace/api-client-react";
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
import { useToast } from "@/hooks/use-toast";
import { Banknote, Download, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function currentMonthYear() {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1).padStart(2, "0"),
    year: String(now.getFullYear()),
  };
}

const EMP_TYPE_LABELS: Record<string, string> = {
  fullTime: "Full-Time",
  contract: "Contract",
  partTime: "Part-Time",
};

export default function PayrollPage() {
  const { toast } = useToast();
  const { month: m, year: y } = currentMonthYear();
  const [month, setMonth] = useState(m);
  const [year, setYear] = useState(y);

  const { data: payroll = [], isLoading } = useGetPayrollRecords(
    { month, year },
  );

  const totalGross = payroll.reduce((s, r) => s + r.grossSalary, 0);
  const totalNet = payroll.reduce((s, r) => s + r.netPay, 0);
  const totalDeductions = totalGross - totalNet;

  const handleExportCSV = () => {
    if (payroll.length === 0) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    const headers = [
      "Employee Code", "Employee Name", "Department", "Designation", "Type",
      "Working Days", "Present", "Half Day", "Late", "On Leave", "Absent",
      "Effective Days", "Basic Salary", "HRA", "Other Allowances", "Gross Salary", "Net Pay",
    ];
    const rows = payroll.map((r) => [
      r.employeeCode,
      r.employeeName,
      r.department ?? "",
      r.designation ?? "",
      EMP_TYPE_LABELS[r.employmentType] ?? r.employmentType,
      r.workingDays,
      r.present,
      r.halfDay,
      r.late,
      r.onLeave,
      r.absent,
      r.effectiveDays.toFixed(1),
      r.basicSalary.toFixed(2),
      r.hra.toFixed(2),
      r.otherAllowances.toFixed(2),
      r.grossSalary.toFixed(2),
      r.netPay.toFixed(2),
    ]);

    const monthName = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
      .toLocaleString("en-IN", { month: "long", year: "numeric" });

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_${year}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Payroll exported" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Banknote className="h-6 w-6" />Payroll Summary</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monthly salary computation based on attendance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={payroll.length === 0}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={payroll.length === 0}>
            <Printer className="h-4 w-4 mr-1" />Print / PDF
          </Button>
        </div>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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
          <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-24" type="number" min="2020" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Employees</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{payroll.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Gross Salary</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">₹{totalGross.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Absent Deductions</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">₹{totalDeductions.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Pay Total</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">₹{totalNet.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Work Days</TableHead>
                <TableHead className="text-center">P</TableHead>
                <TableHead className="text-center">A</TableHead>
                <TableHead className="text-center">HD</TableHead>
                <TableHead className="text-center">Eff.</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">HRA</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right font-semibold">Net Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payroll.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                    No payroll data for this period. Add employees and mark attendance first.
                  </TableCell>
                </TableRow>
              ) : (
                payroll.map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell>
                      <div className="font-medium text-sm">{row.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.department ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{EMP_TYPE_LABELS[row.employmentType] ?? row.employmentType}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{row.workingDays}</TableCell>
                    <TableCell className="text-center text-green-600">{row.present}</TableCell>
                    <TableCell className="text-center text-red-600">{row.absent}</TableCell>
                    <TableCell className="text-center text-yellow-600">{row.halfDay}</TableCell>
                    <TableCell className="text-center font-medium">{row.effectiveDays.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-sm">₹{row.basicSalary.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right text-sm">₹{row.hra.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right text-sm">₹{row.otherAllowances.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right">₹{row.grossSalary.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</TableCell>
                    <TableCell className="text-right font-bold text-green-700">
                      ₹{row.netPay.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Net Pay = (Effective Days / Working Days) × Gross Salary. P = Present, A = Absent, HD = Half Day, Eff. = Effective Days.
      </p>
    </div>
  );
}
