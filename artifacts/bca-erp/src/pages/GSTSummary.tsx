import React, { useState } from "react";
import {
  useGetGstSummary,
  useGetGstInvoices,
  useGetArAgeing,
  type GstInvoice,
} from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(Number(n));
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ageBadge(days: number) {
  if (days <= 0) return <Badge className="bg-green-100 text-green-800 text-xs">Current</Badge>;
  if (days <= 30) return <Badge className="bg-yellow-100 text-yellow-800 text-xs">{days}d</Badge>;
  if (days <= 60) return <Badge className="bg-orange-100 text-orange-800 text-xs">{days}d</Badge>;
  return <Badge className="bg-red-100 text-red-800 text-xs">{days}d overdue</Badge>;
}

// ─── GST Summary Tab ───────────────────────────────────────────────────────────

function GstSummaryTab() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(now.getFullYear()));

  const { data: summary, isLoading } = useGetGstSummary({ year, month });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-blue-800">Output Tax (Sales)</CardTitle>
                <p className="text-xs text-muted-foreground">{summary.invoiceCount} invoice(s)</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm"><span>Taxable Value</span><span className="font-medium">₹{fmt(summary.outputSubtotal)}</span></div>
                <div className="flex justify-between text-sm"><span>CGST</span><span>₹{fmt(summary.outputCgst)}</span></div>
                <div className="flex justify-between text-sm"><span>SGST</span><span>₹{fmt(summary.outputSgst)}</span></div>
                <div className="flex justify-between text-sm"><span>IGST</span><span>₹{fmt(summary.outputIgst)}</span></div>
                <div className="flex justify-between font-bold border-t pt-2"><span>Total Output GST</span><span>₹{fmt(summary.outputGst)}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-purple-800">Input Tax Credit (Purchases)</CardTitle>
                <p className="text-xs text-muted-foreground">{summary.billCount} bill(s)</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm"><span>Taxable Value</span><span className="font-medium">₹{fmt(summary.inputSubtotal)}</span></div>
                <div className="flex justify-between text-sm"><span>CGST</span><span>₹{fmt(summary.inputCgst)}</span></div>
                <div className="flex justify-between text-sm"><span>SGST</span><span>₹{fmt(summary.inputSgst)}</span></div>
                <div className="flex justify-between text-sm"><span>IGST</span><span>₹{fmt(summary.inputIgst)}</span></div>
                <div className="flex justify-between font-bold border-t pt-2"><span>Total Input GST</span><span>₹{fmt(summary.inputGst)}</span></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Net GST by Tax Type</CardTitle>
              <p className="text-xs text-muted-foreground">Output − Input per head of tax</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: "Net CGST", value: summary.netCgst },
                  { label: "Net SGST", value: summary.netSgst },
                  { label: "Net IGST", value: summary.netIgst },
                ].map(({ label, value }) => (
                  <div key={label} className={`rounded-lg p-3 ${value >= 0 ? "bg-red-50" : "bg-green-50"}`}>
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className={`text-lg font-bold ${value >= 0 ? "text-red-600" : "text-green-600"}`}>₹{fmt(Math.abs(value))}</p>
                    <p className="text-[10px] text-muted-foreground">{value >= 0 ? "payable" : "credit"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={`border-2 ${summary.netGstLiability >= 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">Net GST {summary.netGstLiability >= 0 ? "Liability" : "Credit"}</p>
                  <p className="text-sm text-muted-foreground">Output GST − Input ITC = Net payable to government</p>
                </div>
                <p className={`text-3xl font-bold ${summary.netGstLiability >= 0 ? "text-red-600" : "text-green-600"}`}>
                  ₹{fmt(Math.abs(summary.netGstLiability))}
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground border-t pt-2">
            This is a reference summary for manual GST filing. Direct GSTN portal integration is out of scope.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No data for this period.</p>
      )}
    </div>
  );
}

// ─── AR Ageing Tab ─────────────────────────────────────────────────────────────

function ArAgeingTab() {
  const { data: ageing, isLoading } = useGetArAgeing();

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>;
  if (!ageing) return null;

  const { rows, summary } = ageing;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Current (not due)", value: summary.current, cls: "text-green-600" },
          { label: "1-30 days overdue", value: summary.days30, cls: "text-yellow-600" },
          { label: "31-60 days overdue", value: summary.days60, cls: "text-orange-600" },
          { label: "90+ days overdue", value: summary.days90plus, cls: "text-red-600" },
        ].map(({ label, value, cls }) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className={`text-xl font-bold ${cls}`}>₹{fmt(value)}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice No.</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Invoice Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No outstanding invoices</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.invoiceId}>
                  <TableCell className="font-mono text-sm">{row.invoiceNumber}</TableCell>
                  <TableCell>{row.customerName}</TableCell>
                  <TableCell>{fmtDate(row.invoiceDate)}</TableCell>
                  <TableCell>{fmtDate(row.dueDate)}</TableCell>
                  <TableCell className="text-right">₹{fmt(row.total)}</TableCell>
                  <TableCell className="text-right text-green-600">₹{fmt(row.paidAmount)}</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">₹{fmt(row.outstanding)}</TableCell>
                  <TableCell>{ageBadge(row.daysOverdue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GSTSummaryPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finance Reports</h1>
        <p className="text-muted-foreground text-sm">GST summary, AR/AP ageing and financial analytics</p>
      </div>

      <Tabs defaultValue="gst">
        <TabsList>
          <TabsTrigger value="gst">GST Monthly Summary</TabsTrigger>
          <TabsTrigger value="ar">AR Ageing</TabsTrigger>
        </TabsList>
        <TabsContent value="gst" className="pt-4"><GstSummaryTab /></TabsContent>
        <TabsContent value="ar" className="pt-4"><ArAgeingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
