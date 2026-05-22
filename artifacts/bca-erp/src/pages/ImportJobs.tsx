import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Ship, Plus, Eye, Container } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const WRITE_ROLES = ["purchase", "manager", "director", "admin", "cfo"];

export type ImportJobRow = {
  id: number;
  jobNumber: string;
  title: string;
  vendorName: string;
  vendorCountry: string | null;
  currency: string;
  exchangeRate: string;
  purchaseRequestId?: number | null;
  status: string;
  eta: string | null;
  etd: string | null;
  arrivalDate: string | null;
  containerNumber: string | null;
  containerCbm: string;
  supplierInvoiceAmount: string;
  itemCount: number;
  totalLandedCostInr: number;
  totalExpensesInr: number;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  inTransit: "In Transit",
  arrived: "Arrived",
  cleared: "Cleared",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  inTransit: "bg-blue-100 text-blue-800",
  arrived: "bg-yellow-100 text-yellow-800",
  cleared: "bg-purple-100 text-purple-800",
  received: "bg-green-100 text-green-800",
  closed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

function fmtInr(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? 0));
  if (!Number.isFinite(v)) return "₹0";
  return v.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export default function ImportJobs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = user && WRITE_ROLES.includes(user.role);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => customFetch<ImportJobRow[]>("/api/import-jobs"),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch<{ id: number; jobNumber: string }>("/api/import-jobs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (job) => {
      toast({ title: "Import job created", description: job.jobNumber });
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["import-jobs"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Failed to create import job",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ship className="h-6 w-6" /> Import Purchase Jobs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage shipments, expenses, and landed cost calculations
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Import Job
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobs?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Transit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs?.filter((j) => j.status === "inTransit").length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Landed Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtInr(
                jobs?.reduce((s, j) => s + (j.totalLandedCostInr || 0), 0) ?? 0,
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtInr(
                jobs?.reduce((s, j) => s + (j.totalExpensesInr || 0), 0) ?? 0,
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Container / BL</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Landed Cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : !jobs || jobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No import jobs yet. Create your first import job to start
                    tracking landed cost.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono font-medium">
                      {j.jobNumber}
                    </TableCell>
                    <TableCell>{j.title}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{j.vendorName}</div>
                        <div className="text-xs text-muted-foreground">
                          {j.vendorCountry}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {j.containerNumber ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Container className="h-3 w-3" />
                          {j.containerNumber}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{j.eta || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_COLORS[j.status] ?? "bg-gray-100"}
                      >
                        {STATUS_LABELS[j.status] ?? j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{j.itemCount}</TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtInr(j.totalLandedCostInr)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/imports/${j.id}`}>
                        <Button size="sm" variant="ghost">
                          <Eye className="h-4 w-4 mr-1" /> Open
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateImportJobDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(d) => create.mutate(d)}
        isSaving={create.isPending}
      />
    </div>
  );
}

function CreateImportJobDialog({
  open,
  onClose,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [vendorName, setVendorName] = useState("Import Vendor");
  const [vendorCountry, setVendorCountry] = useState("China");
  const [currency, setCurrency] = useState("USD");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState("");
  const [supplierInvoiceAmount, setSupplierInvoiceAmount] = useState("0");
  const [containerNumber, setContainerNumber] = useState("");
  const [containerCbm, setContainerCbm] = useState("65");
  const [blNumber, setBlNumber] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");

  const reset = () => {
    setTitle("");
    setVendorName("Import Vendor");
    setVendorCountry("China");
    setCurrency("USD");
    setSupplierInvoiceNumber("");
    setSupplierInvoiceDate("");
    setSupplierInvoiceAmount("0");
    setContainerNumber("");
    setContainerCbm("65");
    setBlNumber("");
    setVesselName("");
    setEtd("");
    setEta("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Import Job</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Import Job Name *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. May China shipment"
            />
          </div>
          <div className="hidden">
            <Label>Foreign Vendor *</Label>
            <Input
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Shenzhen Gaming Tech Co."
            />
          </div>
          <div>
            <Label>Country of Origin *</Label>
            <Input
              value={vendorCountry}
              onChange={(e) => setVendorCountry(e.target.value)}
            />
          </div>
          <div className="hidden">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="CNY">CNY</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="JPY">JPY</SelectItem>
                <SelectItem value="INR">INR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="hidden">
            <Label>Supplier Invoice #</Label>
            <Input
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
            />
          </div>
          <div className="hidden">
            <Label>Supplier Invoice Date</Label>
            <Input
              type="date"
              value={supplierInvoiceDate}
              onChange={(e) => setSupplierInvoiceDate(e.target.value)}
            />
          </div>
          <div className="hidden">
            <Label>Supplier Invoice Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={supplierInvoiceAmount}
              onChange={(e) => setSupplierInvoiceAmount(e.target.value)}
            />
          </div>
          <div className="hidden">
            <Label>Container Number</Label>
            <Input
              value={containerNumber}
              onChange={(e) => setContainerNumber(e.target.value)}
            />
          </div>
          <div>
            <Label>BL Number *</Label>
            <Input
              value={blNumber}
              onChange={(e) => setBlNumber(e.target.value)}
            />
          </div>
          <div>
            <Label>CBM *</Label>
            <Input
              type="number"
              step="0.0001"
              value={containerCbm}
              onChange={(e) => setContainerCbm(e.target.value)}
            />
          </div>
          <div className="hidden">
            <Label>Vessel Name</Label>
            <Input
              value={vesselName}
              onChange={(e) => setVesselName(e.target.value)}
            />
          </div>
          <div>
            <Label>ETD *</Label>
            <Input
              type="date"
              value={etd}
              onChange={(e) => setEtd(e.target.value)}
            />
          </div>
          <div>
            <Label>ETA *</Label>
            <Input
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            disabled={
              isSaving ||
              !title.trim() ||
              !vendorCountry.trim() ||
              !blNumber.trim() ||
              !etd ||
              !eta ||
              !containerCbm
            }
            onClick={() =>
              onSubmit({
                title: title.trim(),
                vendorName,
                vendorCountry,
                currency,
                exchangeRate: 83,
                supplierInvoiceNumber: supplierInvoiceNumber || null,
                supplierInvoiceDate: supplierInvoiceDate || null,
                supplierInvoiceAmount: parseFloat(supplierInvoiceAmount) || 0,
                containerCbm: parseFloat(containerCbm) || 0,
                containerNumber: containerNumber || null,
                blNumber: blNumber || null,
                vesselName: vesselName || null,
                etd: etd || null,
                eta: eta || null,
              })
            }
          >
            {isSaving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
