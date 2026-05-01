import React, { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetWorkOrder,
  useUpdateWorkOrder,
  useUpdateWorkOrderItem,
  useCreatePurchaseOrder,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useReceivePurchaseOrder,
  useAddSubcontract,
  useUpsertDelivery,
  useGenerateInvoice,
  useMarkFinishedGoods,
  useReleaseWorkOrder,
  useGenerateInvoiceFromStores,
  useGetWorkOrderPnl,
  useGetWorkOrderServiceEntries,
  useCreateWorkOrderServiceEntry,
  useUpdateWorkOrderServiceEntry,
  useDeleteWorkOrderServiceEntry,
  getGetWorkOrderQueryKey,
  getGetWorkOrderServiceEntriesQueryKey,
  type WorkOrder,
  type WorkOrderItem,
  type PurchaseOrder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, Briefcase, Package, Factory, CheckCircle, XCircle,
  PackageCheck, Truck, FileText, AlertTriangle, ChevronRight, Plus, X,
  ClipboardList, TrendingUp, FileSpreadsheet, User, Wrench, Pencil, Trash2,
  Building2, Phone, Mail, MapPin, CalendarDays, ShieldCheck, Wallet,
} from "lucide-react";
import { ProductPicker, type PickedProduct } from "@/components/ProductPicker";
import { objectPathToUrl } from "@/lib/uploadFile";

type WorkflowType = "imported" | "manufacturing";

const IMPORTED_STEPS = [
  { key: "pending", label: "Created" },
  { key: "poCreated", label: "PO Created" },
  { key: "poApproved", label: "PO Approved" },
  { key: "stockIn", label: "Stock IN" },
  { key: "dispatched", label: "Dispatched" },
  { key: "invoiced", label: "Invoiced" },
];

const MANUFACTURING_STEPS = [
  { key: "pending", label: "Created" },
  { key: "productionRequest", label: "Prod. Request" },
  { key: "poCreated", label: "PO Created" },
  { key: "poApproved", label: "PO Approved" },
  { key: "rawMaterialIn", label: "Raw Material IN" },
  { key: "inProduction", label: "In Production" },
  { key: "finishedGoodsIn", label: "Finished Goods IN" },
  { key: "dispatched", label: "Dispatched" },
  { key: "invoiced", label: "Invoiced" },
];

const APPROVE_ROLES = ["manager", "director", "admin", "cfo"];
const RECEIVE_ROLES = ["stores", "manager", "director", "admin"];
const INVOICE_ROLES = ["accounts", "cfo", "director", "admin"];
const PO_CREATE_ROLES = ["purchase", "manager", "director", "admin", "cfo"];

function StepProgress({
  steps,
  currentStep,
}: {
  steps: { key: string; label: string }[];
  currentStep: string;
}) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center min-w-[64px]">
              <div
                className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                  done
                    ? "bg-green-500 border-green-500 text-white"
                    : active
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-muted border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] mt-1 text-center leading-tight ${
                  active ? "font-semibold text-primary" : done ? "text-green-600" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 min-w-[16px] mt-[-10px] ${
                  done ? "bg-green-500" : "bg-muted"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function WorkflowTypeSelector({
  item,
  onSelect,
  disabled,
}: {
  item: WorkOrderItem;
  onSelect: (type: WorkflowType) => void;
  disabled: boolean;
}) {
  if (item.workflowType) return null;

  return (
    <div className="flex gap-3 mt-2">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onSelect("imported")}
        className="flex items-center gap-2"
      >
        <Package className="h-4 w-4" />
        Set as Imported
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onSelect("manufacturing")}
        className="flex items-center gap-2"
      >
        <Factory className="h-4 w-4" />
        Set as Manufacturing
      </Button>
    </div>
  );
}

interface POLineItemForm {
  productId?: number;
  productCode?: string;
  productImageUrl?: string | null;
  hsnCode?: string | null;
  unit?: string;
  description: string;
  qty: string;
  unitPrice: string;
  gstRate: string;
}

interface POFormState {
  supplierName: string;
  supplierContact: string;
  quotedAmount: string;
  poAmount: string;
  notes: string;
  lineItems: POLineItemForm[];
}

function defaultPOForm(): POFormState {
  return {
    supplierName: "",
    supplierContact: "",
    quotedAmount: "",
    poAmount: "",
    notes: "",
    lineItems: [],
  };
}

export default function WorkOrderDetail() {
  const [, params] = useRoute("/work-orders/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const woId = params?.id ? parseInt(params.id, 10) : null;

  const { data: wo, isLoading } = useGetWorkOrder(woId ?? 0);

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetWorkOrderQueryKey(woId ?? 0) });

  const [createPOForItem, setCreatePOForItem] = useState<number | null>(null);
  const [poForm, setPOForm] = useState<POFormState>(defaultPOForm());
  const [showPOPicker, setShowPOPicker] = useState(false);

  const [subcontractForItem, setSubcontractForItem] = useState<number | null>(null);
  const [subForm, setSubForm] = useState({ vendorName: "", vendorContact: "", cost: "", description: "" });

  const [showDelivery, setShowDelivery] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    expectedDate: "",
    actualDispatchDate: "",
    transporter: "",
    trackingNumber: "",
    status: "scheduled" as "scheduled" | "dispatched" | "delivered",
    notes: "",
  });

  const [showProductionRequest, setShowProductionRequest] = useState<number | null>(null);
  const [prodNote, setProdNote] = useState("");

  const [rejectPOId, setRejectPOId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const updateWO = useUpdateWorkOrder({ mutation: { onSuccess: invalidate } });
  const updateItem = useUpdateWorkOrderItem({ mutation: { onSuccess: invalidate } });
  const createPO = useCreatePurchaseOrder({
    mutation: {
      onSuccess: () => { invalidate(); setCreatePOForItem(null); setPOForm(defaultPOForm()); toast({ title: "PO created" }); },
      onError: () => toast({ title: "Failed to create PO", variant: "destructive" }),
    },
  });
  const approvePO = useApprovePurchaseOrder({ mutation: { onSuccess: () => { invalidate(); toast({ title: "PO approved" }); }, onError: (e: Error) => toast({ title: e.message ?? "Failed to approve", variant: "destructive" }) } });
  const rejectPO = useRejectPurchaseOrder({ mutation: { onSuccess: () => { invalidate(); setRejectPOId(null); setRejectNote(""); toast({ title: "PO rejected" }); }, onError: () => toast({ title: "Failed to reject", variant: "destructive" }) } });
  const receivePO = useReceivePurchaseOrder({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Goods received — Stock IN recorded" }); }, onError: () => toast({ title: "Failed", variant: "destructive" }) } });
  const addSubcontract = useAddSubcontract({ mutation: { onSuccess: () => { invalidate(); setSubcontractForItem(null); setSubForm({ vendorName: "", vendorContact: "", cost: "", description: "" }); toast({ title: "Subcontract recorded" }); }, onError: () => toast({ title: "Failed", variant: "destructive" }) } });
  const upsertDelivery = useUpsertDelivery({ mutation: { onSuccess: () => { invalidate(); setShowDelivery(false); toast({ title: "Delivery updated" }); }, onError: () => toast({ title: "Failed", variant: "destructive" }) } });
  const generateInv = useGenerateInvoice({ mutation: { onSuccess: (d) => { invalidate(); toast({ title: `Invoice generated: ${d.invoiceNumber}` }); }, onError: () => toast({ title: "Failed to generate invoice", variant: "destructive" }) } });
  const markFinished = useMarkFinishedGoods({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Finished goods received" }); }, onError: () => toast({ title: "Failed", variant: "destructive" }) } });
  const releaseWO = useReleaseWorkOrder({
    mutation: {
      onSuccess: (d) => {
        invalidate();
        toast({ title: `Released — Purchase Request ${d.prNumber} created` });
        navigate(`/purchase-requests`);
      },
      onError: (e: Error) => toast({ title: e.message ?? "Failed to release WO", variant: "destructive" }),
    },
  });
  const generateInvFromStores = useGenerateInvoiceFromStores({
    mutation: {
      onSuccess: (d) => {
        invalidate();
        toast({ title: `Invoice generated from Stores: ${d.invoiceNumber}` });
      },
      onError: (e: Error) => toast({ title: e.message ?? "No stock-out activity to invoice", variant: "destructive" }),
    },
  });
  const canViewPnl = !!user && ["manager", "director", "admin", "cfo"].includes(user.role);
  const { data: pnl } = useGetWorkOrderPnl(woId ?? 0, {
    query: {
      enabled: !!woId && canViewPnl,
      queryKey: ["work-order-pnl", woId ?? 0],
    },
  });

  const { data: serviceEntries = [] } = useGetWorkOrderServiceEntries(woId ?? 0, {
    query: {
      enabled: !!woId,
      queryKey: getGetWorkOrderServiceEntriesQueryKey(woId ?? 0),
    },
  });

  const [customerEditOpen, setCustomerEditOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    customerName: "",
    company: "",
    customerGstin: "",
    billingAddress: "",
    shippingAddress: "",
    contactPhone: "",
    contactEmail: "",
    dispatchDate: "",
    warrantyPeriodMonths: "",
  });

  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingServiceEntryId, setEditingServiceEntryId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState({
    entryDate: "",
    technicianName: "",
    description: "",
  });

  const invalidateServiceEntries = () => {
    if (woId) {
      qc.invalidateQueries({ queryKey: getGetWorkOrderServiceEntriesQueryKey(woId) });
      qc.invalidateQueries({ queryKey: getGetWorkOrderQueryKey(woId) });
    }
  };

  const closeServiceDialog = () => {
    setServiceDialogOpen(false);
    setEditingServiceEntryId(null);
    setServiceForm({ entryDate: "", technicianName: "", description: "" });
  };

  const createServiceEntry = useCreateWorkOrderServiceEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Service entry added" });
        invalidateServiceEntries();
        closeServiceDialog();
      },
      onError: (e) => toast({ title: "Failed to add", description: String(e), variant: "destructive" }),
    },
  });

  const updateServiceEntry = useUpdateWorkOrderServiceEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Service entry updated" });
        invalidateServiceEntries();
        closeServiceDialog();
      },
      onError: (e) => toast({ title: "Failed to update", description: String(e), variant: "destructive" }),
    },
  });

  const deleteServiceEntry = useDeleteWorkOrderServiceEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Service entry removed" });
        invalidateServiceEntries();
      },
      onError: (e) => toast({ title: "Failed to remove", description: String(e), variant: "destructive" }),
    },
  });

  const canWrite = user && ["sales", "purchase", "manager", "director", "admin", "cfo", "stores", "accounts"].includes(user.role);
  const canApprove = user && APPROVE_ROLES.includes(user.role);
  const isCFO = user && ["cfo", "director", "admin"].includes(user.role);
  const canReceive = user && RECEIVE_ROLES.includes(user.role);
  const canCreatePO = user && PO_CREATE_ROLES.includes(user.role);
  const canInvoice = user && INVOICE_ROLES.includes(user.role);

  function handleSetWorkflowType(itemId: number, type: WorkflowType) {
    if (!woId) return;
    updateItem.mutate({
      id: woId,
      itemId,
      data: { workflowType: type },
    });
  }

  function handleProductionRequest(itemId: number) {
    if (!woId) return;
    updateItem.mutate({
      id: woId,
      itemId,
      data: { currentStep: "productionRequest", productionRequestNote: prodNote },
    }, { onSuccess: () => { setShowProductionRequest(null); setProdNote(""); toast({ title: "Production request raised" }); } });
  }

  function handleCreatePO(e: React.FormEvent) {
    e.preventDefault();
    if (!woId || createPOForItem === null) return;

    const item = wo?.items?.find((i) => i.id === createPOForItem);
    const type: "imported" | "rawMaterial" = item?.workflowType === "manufacturing" ? "rawMaterial" : "imported";

    createPO.mutate({
      data: {
        workOrderId: woId,
        workOrderItemId: createPOForItem,
        supplierName: poForm.supplierName,
        supplierContact: poForm.supplierContact || undefined,
        type,
        quotedAmount: parseFloat(poForm.quotedAmount) || 0,
        poAmount: parseFloat(poForm.poAmount) || 0,
        notes: poForm.notes || undefined,
        lineItems: poForm.lineItems
          .filter((li) => li.description.trim() && li.productId)
          .map((li) => ({
            productId: li.productId,
            productCode: li.productCode,
            productImageUrl: li.productImageUrl ?? null,
            hsnCode: li.hsnCode ?? null,
            unit: li.unit,
            description: li.description,
            qty: parseFloat(li.qty) || 1,
            unitPrice: parseFloat(li.unitPrice) || 0,
            gstRate: parseFloat(li.gstRate) || 18,
          })),
      },
    });
  }

  function handleSubmitSubcontract(e: React.FormEvent) {
    e.preventDefault();
    if (!woId || subcontractForItem === null) return;
    addSubcontract.mutate({
      id: woId,
      data: {
        workOrderItemId: subcontractForItem,
        vendorName: subForm.vendorName,
        vendorContact: subForm.vendorContact || undefined,
        cost: parseFloat(subForm.cost) || 0,
        description: subForm.description || undefined,
      },
    });
  }

  function handleUpsertDelivery(e: React.FormEvent) {
    e.preventDefault();
    if (!woId) return;
    upsertDelivery.mutate({
      id: woId,
      data: {
        expectedDate: deliveryForm.expectedDate || undefined,
        actualDispatchDate: deliveryForm.actualDispatchDate || undefined,
        transporter: deliveryForm.transporter || undefined,
        trackingNumber: deliveryForm.trackingNumber || undefined,
        status: deliveryForm.status,
        notes: deliveryForm.notes || undefined,
      },
    });
  }

  function openDeliveryForm() {
    const existing = wo?.deliveries?.[0];
    if (existing) {
      setDeliveryForm({
        expectedDate: existing.expectedDate ?? "",
        actualDispatchDate: existing.actualDispatchDate ?? "",
        transporter: existing.transporter ?? "",
        trackingNumber: existing.trackingNumber ?? "",
        status: existing.status as "scheduled" | "dispatched" | "delivered",
        notes: existing.notes ?? "",
      });
    } else {
      setDeliveryForm({ expectedDate: "", actualDispatchDate: "", transporter: "", trackingNumber: "", status: "scheduled", notes: "" });
    }
    setShowDelivery(true);
  }

  if (!woId || isNaN(woId)) {
    return <div className="p-6 text-muted-foreground">Invalid work order ID</div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!wo) {
    return <div className="p-6 text-muted-foreground">Work order not found.</div>;
  }

  const delivery = wo.deliveries?.[0];
  const allInvoiced = wo.items?.every((i) => i.currentStep === "invoiced");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/work-orders")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-bold font-mono">{wo.woNumber}</h1>
            <Badge variant={
              wo.status === "delivered" ? "secondary" :
              wo.status === "cancelled" ? "destructive" :
              wo.status === "pendingApproval" ? "outline" : "default"
            }>
              {wo.status === "inProgress" ? "In Progress" :
               wo.status === "pendingApproval" ? "Pending Approval" :
               wo.status.charAt(0).toUpperCase() + wo.status.slice(1)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">
            {wo.customerName}{wo.company ? ` — ${wo.company}` : ""}
          </p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-lg font-bold">₹{wo.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">
            Created {new Date(wo.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {wo.notes && (
        <div className="bg-muted/50 rounded-md px-4 py-3 text-sm text-muted-foreground">
          {wo.notes}
        </div>
      )}

      {/* Customer & Dispatch Details */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" />
            Customer & Dispatch
          </CardTitle>
          {canWrite && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCustomerForm({
                  customerName: wo.customerName ?? "",
                  company: wo.company ?? "",
                  customerGstin: wo.customerGstin ?? "",
                  billingAddress: wo.billingAddress ?? "",
                  shippingAddress: wo.shippingAddress ?? "",
                  contactPhone: wo.contactPhone ?? "",
                  contactEmail: wo.contactEmail ?? "",
                  dispatchDate: wo.dispatchDate ?? "",
                  warrantyPeriodMonths:
                    wo.warrantyPeriodMonths != null ? String(wo.warrantyPeriodMonths) : "",
                });
                setCustomerEditOpen(true);
              }}
              data-testid="button-edit-customer"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Company
              </div>
              <div className="font-medium">{wo.company || <span className="text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">GSTIN</div>
              <div className="font-mono">{wo.customerGstin || <span className="text-muted-foreground font-sans">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> Phone
              </div>
              <div>{wo.contactPhone || <span className="text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </div>
              <div>{wo.contactEmail || <span className="text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Billing Address
              </div>
              <div className="whitespace-pre-line">{wo.billingAddress || <span className="text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Shipping Address
              </div>
              <div className="whitespace-pre-line">{wo.shippingAddress || <span className="text-muted-foreground">—</span>}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Dispatch Date
              </div>
              <div>
                {wo.dispatchDate ? new Date(wo.dispatchDate).toLocaleDateString() : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Warranty
              </div>
              <div>
                {wo.warrantyPeriodMonths != null
                  ? `${wo.warrantyPeriodMonths} month(s)`
                  : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Action Bar */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={releaseWO.isPending || wo.status === "delivered" || wo.status === "cancelled"}
            onClick={() => woId && releaseWO.mutate({ id: woId })}
            data-testid="button-release-wo"
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            Release → Create Purchase Request
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={generateInvFromStores.isPending}
            onClick={() => woId && generateInvFromStores.mutate({ id: woId })}
            data-testid="button-invoice-from-stores"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Generate Invoice from Stores
          </Button>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/purchase-requests`)}>
              View PRs
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/stores-out`)}>
              Stores Out
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/subcontract-jobs`)}>
              Subcontract
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-WO P&L summary */}
      {pnl && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Profit & Loss
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Revenue (Invoiced)</div>
                  <div className="font-bold text-green-700">₹{pnl.revenueInvoiced.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{pnl.invoiceCount} invoice(s)</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Stores Cost</div>
                  <div className="font-bold">₹{pnl.costStoresOut.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{pnl.storesOutCount} issue(s)</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Subcontract + Imports</div>
                  <div className="font-bold">₹{(pnl.costSubcontract + pnl.costImportExpenses).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Margin (Invoiced)</div>
                  <div className={`font-bold ${pnl.margin >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    ₹{pnl.margin.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    <span className="text-xs ml-1">({pnl.marginPercent.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-project-vs-expense">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Project Value vs Expense
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Order Value</span>
                  <span className="font-semibold">
                    ₹{pnl.revenueOrderValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Expense</span>
                  <span className="font-semibold">
                    ₹{pnl.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Headroom</span>
                  <span
                    className={`font-bold ${
                      pnl.projectVsExpense >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    ₹{pnl.projectVsExpense.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Order value minus total tracked cost. Positive = profit headroom remaining.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* After-sales Service Entries */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            After-sales Service ({serviceEntries.length})
          </CardTitle>
          {canWrite && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingServiceEntryId(null);
                setServiceForm({
                  entryDate: new Date().toISOString().slice(0, 10),
                  technicianName: "",
                  description: "",
                });
                setServiceDialogOpen(true);
              }}
              data-testid="button-add-service-entry"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Entry
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {serviceEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No service visits recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {serviceEntries.map((se) => (
                <div
                  key={se.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md border bg-muted/30"
                  data-testid={`row-service-entry-${se.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <CalendarDays className="h-3 w-3" />
                      {se.entryDate ? new Date(se.entryDate).toLocaleDateString() : "—"}
                      <span>·</span>
                      <span className="font-medium text-foreground">{se.technicianName}</span>
                      {se.createdByName && (
                        <>
                          <span>·</span>
                          <span>logged by {se.createdByName}</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm mt-1 whitespace-pre-line">{se.description}</div>
                  </div>
                  {canWrite && woId && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingServiceEntryId(se.id);
                          setServiceForm({
                            entryDate: se.entryDate ? se.entryDate.slice(0, 10) : "",
                            technicianName: se.technicianName ?? "",
                            description: se.description ?? "",
                          });
                          setServiceDialogOpen(true);
                        }}
                        data-testid={`button-edit-service-entry-${se.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Delete this service entry?")) {
                            deleteServiceEntry.mutate({ id: woId, entryId: se.id });
                          }
                        }}
                        data-testid={`button-delete-service-entry-${se.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="font-semibold text-base">Line Items & Workflow</h2>

        {wo.items?.length === 0 && (
          <div className="text-muted-foreground text-sm">No items on this work order.</div>
        )}

        {wo.items?.map((item) => {
          const steps = item.workflowType === "manufacturing" ? MANUFACTURING_STEPS : IMPORTED_STEPS;
          const itemPOs = item.purchaseOrders ?? [];

          return (
            <Card key={item.id} className="border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {item.productImageUrl ? (
                      <img
                        src={objectPathToUrl(item.productImageUrl)}
                        alt={item.description}
                        className="w-14 h-14 rounded border object-cover bg-white shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded border bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold truncate">{item.description}</CardTitle>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        {item.productCode && <span className="font-mono">[{item.productCode}]</span>}
                        {item.hsnCode && <span>HSN: {item.hsnCode}</span>}
                        {item.unit && <span>Unit: {item.unit}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        Qty: {item.qty} × ₹{item.unitPrice.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {item.workflowType ? (
                      <Badge variant={item.workflowType === "manufacturing" ? "default" : "secondary"}>
                        {item.workflowType === "manufacturing" ? (
                          <><Factory className="h-3 w-3 mr-1" />Manufacturing</>
                        ) : (
                          <><Package className="h-3 w-3 mr-1" />Imported</>
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Unassigned</Badge>
                    )}
                  </div>
                </div>

                {!item.workflowType && canWrite && (
                  <WorkflowTypeSelector
                    item={item}
                    onSelect={(type) => handleSetWorkflowType(item.id, type)}
                    disabled={updateItem.isPending}
                  />
                )}
              </CardHeader>

              {item.workflowType && (
                <CardContent className="pt-0 space-y-4">
                  <StepProgress steps={steps} currentStep={item.currentStep} />

                  <Separator />

                  {item.workflowType === "manufacturing" && (
                    <>
                      {item.currentStep === "pending" && canWrite && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">Step 1: Raise Production Request</p>
                          {showProductionRequest === item.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={prodNote}
                                onChange={(e) => setProdNote(e.target.value)}
                                placeholder="Describe production requirements..."
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => handleProductionRequest(item.id)} disabled={updateItem.isPending}>
                                  Submit Production Request
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setShowProductionRequest(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => { setShowProductionRequest(item.id); setProdNote(""); }}>
                              <Plus className="h-3 w-3 mr-1" />
                              Raise Production Request
                            </Button>
                          )}
                        </div>
                      )}

                      {item.productionRequestNote && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                          <span className="font-medium text-blue-700">Production Request: </span>
                          <span className="text-blue-800">{item.productionRequestNote}</span>
                        </div>
                      )}
                    </>
                  )}

                  {(item.currentStep === "productionRequest" || (item.workflowType === "imported" && item.currentStep === "pending")) && canCreatePO && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {item.workflowType === "manufacturing" ? "Step 2: Create Raw Material PO" : "Step 1: Create Purchase Order"}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => { setCreatePOForItem(item.id); setPOForm(defaultPOForm()); }}>
                        <Plus className="h-3 w-3 mr-1" />
                        Create PO
                      </Button>
                    </div>
                  )}

                  {itemPOs.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Purchase Orders</p>
                      {itemPOs.map((po) => (
                        <div key={po.id} className="border rounded p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-mono font-medium text-sm">{po.poNumber}</span>
                              <span className="text-muted-foreground text-sm ml-2">— {po.supplierName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {po.requiresCfoApproval && (
                                <span className="flex items-center gap-1 text-xs text-amber-600">
                                  <AlertTriangle className="h-3 w-3" />
                                  CFO Req.
                                </span>
                              )}
                              <Badge variant={{
                                draft: "secondary", pendingApproval: "outline",
                                approved: "default", received: "secondary", cancelled: "destructive",
                              }[po.status] as "default" | "secondary" | "outline" | "destructive" || "outline"}>
                                {po.status === "pendingApproval" ? "Pending Approval" :
                                 po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-6 text-sm text-muted-foreground">
                            <span>Quoted: ₹{po.quotedAmount.toLocaleString()}</span>
                            <span>PO Amount: ₹{po.poAmount.toLocaleString()}</span>
                            {po.approvedByName && <span>Approved by: {po.approvedByName}</span>}
                          </div>
                          {po.rejectionNote && (
                            <div className="text-xs text-destructive">Rejected: {po.rejectionNote}</div>
                          )}
                          <div className="flex gap-2 mt-1">
                            {po.status === "pendingApproval" && canApprove && (!po.requiresCfoApproval || isCFO) && (
                              <>
                                <Button size="sm" onClick={() => approvePO.mutate({ id: po.id })} disabled={approvePO.isPending}>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => setRejectPOId(po.id)}>
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            {po.status === "pendingApproval" && po.requiresCfoApproval && !isCFO && (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Awaiting CFO approval
                              </span>
                            )}
                            {po.status === "approved" && canReceive && (
                              <Button size="sm" variant="outline" onClick={() => receivePO.mutate({ id: po.id })} disabled={receivePO.isPending}>
                                <PackageCheck className="h-3 w-3 mr-1" />
                                Mark Received
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.workflowType === "manufacturing" && (
                    <>
                      {item.currentStep === "rawMaterialIn" && canWrite && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Step 5: Enter Production / Subcontract</p>
                          <Button size="sm" variant="outline" onClick={() => setSubcontractForItem(item.id)}>
                            <Plus className="h-3 w-3 mr-1" />
                            Record Subcontract
                          </Button>
                        </div>
                      )}

                      {item.subcontracts && item.subcontracts.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Subcontracts</p>
                          {item.subcontracts.map((sc) => (
                            <div key={sc.id} className="border rounded p-3 text-sm">
                              <div className="font-medium">{sc.vendorName}</div>
                              {sc.vendorContact && <div className="text-muted-foreground">{sc.vendorContact}</div>}
                              <div className="text-muted-foreground">Cost: ₹{sc.cost.toLocaleString()}</div>
                              {sc.description && <div className="text-muted-foreground">{sc.description}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {item.currentStep === "inProduction" && canReceive && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Step 6: Finished Goods IN</p>
                          <Button size="sm" variant="outline" onClick={() => markFinished.mutate({ id: woId, itemId: item.id })} disabled={markFinished.isPending}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Mark Finished Goods Received
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  {(item.currentStep === "stockIn" || item.currentStep === "finishedGoodsIn") && canWrite && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">Next: Update Delivery</p>
                      <Button size="sm" variant="outline" onClick={openDeliveryForm}>
                        <Truck className="h-3 w-3 mr-1" />
                        Update Delivery
                      </Button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Delivery
          </CardTitle>
        </CardHeader>
        <CardContent>
          {delivery ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Badge variant={delivery.status === "delivered" ? "secondary" : delivery.status === "dispatched" ? "default" : "outline"}>
                  {delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1)}
                </Badge>
                {delivery.invoiceGenerated && (
                  <Badge variant="secondary" className="text-green-700 bg-green-100">
                    Invoice: {delivery.invoiceNumber}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {delivery.expectedDate && <div><span className="text-muted-foreground">Expected: </span>{delivery.expectedDate}</div>}
                {delivery.actualDispatchDate && <div><span className="text-muted-foreground">Dispatched: </span>{delivery.actualDispatchDate}</div>}
                {delivery.transporter && <div><span className="text-muted-foreground">Transporter: </span>{delivery.transporter}</div>}
                {delivery.trackingNumber && <div><span className="text-muted-foreground">Tracking: </span>{delivery.trackingNumber}</div>}
              </div>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={openDeliveryForm}>
                  Update Delivery
                </Button>
              )}
              {!delivery.invoiceGenerated && canInvoice && (
                <Button size="sm" onClick={() => generateInv.mutate({ id: woId })} disabled={generateInv.isPending}>
                  <FileText className="h-3 w-3 mr-1" />
                  Generate GST Invoice
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No delivery record yet.</p>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={openDeliveryForm}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Delivery Details
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {canInvoice && !allInvoiced && (
        <div className="flex justify-end">
          <Button
            onClick={() => generateInv.mutate({ id: woId })}
            disabled={generateInv.isPending}
          >
            <FileText className="h-4 w-4 mr-2" />
            {generateInv.isPending ? "Generating..." : "Generate GST Invoice"}
          </Button>
        </div>
      )}

      <Dialog open={createPOForItem !== null} onOpenChange={(o) => { if (!o) setCreatePOForItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePO} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Supplier Name *</Label>
                <Input value={poForm.supplierName} onChange={(e) => setPOForm((p) => ({ ...p, supplierName: e.target.value }))} placeholder="Supplier name" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Supplier Contact</Label>
                <Input value={poForm.supplierContact} onChange={(e) => setPOForm((p) => ({ ...p, supplierContact: e.target.value }))} placeholder="Phone / email" />
              </div>
              <div className="space-y-1">
                <Label>Quoted Amount (₹)</Label>
                <Input type="number" min="0" value={poForm.quotedAmount} onChange={(e) => setPOForm((p) => ({ ...p, quotedAmount: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>PO Amount (₹)</Label>
                <Input type="number" min="0" value={poForm.poAmount} onChange={(e) => setPOForm((p) => ({ ...p, poAmount: e.target.value }))} placeholder="0" />
              </div>
            </div>

            {poForm.quotedAmount && poForm.poAmount && Math.abs(parseFloat(poForm.quotedAmount) - parseFloat(poForm.poAmount)) > 0 && (
              <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded p-2">
                <AlertTriangle className="h-4 w-4" />
                PO amount differs from quoted — CFO approval will be required
              </div>
            )}

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={poForm.notes} onChange={(e) => setPOForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Additional notes" rows={2} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items (from Product Master)</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowPOPicker(true)}>
                  <Plus className="h-3 w-3 mr-1" />Add Product
                </Button>
              </div>
              {poForm.lineItems.length === 0 && (
                <div className="text-xs text-muted-foreground border border-dashed rounded p-3 text-center">
                  No products added. Click "Add Product" to pick from Product Master.
                </div>
              )}
              {poForm.lineItems.map((li, i) => (
                <div key={i} className="border rounded-md p-2 space-y-2 bg-muted/30">
                  <div className="flex items-start gap-2">
                    {li.productImageUrl ? (
                      <img src={objectPathToUrl(li.productImageUrl)} alt={li.productCode} className="w-12 h-12 rounded object-cover border bg-white shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded border bg-white flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-mono text-muted-foreground truncate">
                          {li.productCode}
                          {li.hsnCode ? ` · HSN ${li.hsnCode}` : ""}
                          {li.unit ? ` · ${li.unit}` : ""}
                        </div>
                        <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPOForm((p) => ({ ...p, lineItems: p.lineItems.filter((_, idx) => idx !== i) }))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <Textarea
                        rows={2}
                        className="mt-1 text-xs"
                        placeholder="Description"
                        value={li.description}
                        onChange={(e) => setPOForm((p) => { const ls = [...p.lineItems]; ls[i] = { ...ls[i], description: e.target.value }; return { ...p, lineItems: ls }; })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min="0" step="0.01" value={li.qty} onChange={(e) => setPOForm((p) => { const ls = [...p.lineItems]; ls[i] = { ...ls[i], qty: e.target.value }; return { ...p, lineItems: ls }; })} />
                    </div>
                    <div>
                      <Label className="text-xs">Unit ₹</Label>
                      <Input type="number" min="0" step="0.01" value={li.unitPrice} onChange={(e) => setPOForm((p) => { const ls = [...p.lineItems]; ls[i] = { ...ls[i], unitPrice: e.target.value }; return { ...p, lineItems: ls }; })} />
                    </div>
                    <div>
                      <Label className="text-xs">GST %</Label>
                      <Input type="number" min="0" max="100" step="0.01" value={li.gstRate} onChange={(e) => setPOForm((p) => { const ls = [...p.lineItems]; ls[i] = { ...ls[i], gstRate: e.target.value }; return { ...p, lineItems: ls }; })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <ProductPicker
              open={showPOPicker}
              onClose={() => setShowPOPicker(false)}
              mode="purchase"
              excludeIds={poForm.lineItems.map((li) => li.productId).filter((id): id is number => typeof id === "number")}
              onPick={(p: PickedProduct) => {
                setPOForm((prev) => ({
                  ...prev,
                  lineItems: [
                    ...prev.lineItems,
                    {
                      productId: p.productId,
                      productCode: p.productCode,
                      productImageUrl: p.productImageUrl,
                      hsnCode: p.hsnCode,
                      unit: p.unit,
                      description: p.description,
                      qty: "1",
                      unitPrice: String(p.unitPrice),
                      gstRate: String(p.gstRate),
                    },
                  ],
                }));
                setShowPOPicker(false);
              }}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreatePOForItem(null)}>Cancel</Button>
              <Button type="submit" disabled={!poForm.supplierName.trim() || createPO.isPending}>
                {createPO.isPending ? "Creating..." : "Create PO"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={subcontractForItem !== null} onOpenChange={(o) => { if (!o) setSubcontractForItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Subcontract</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitSubcontract} className="space-y-3">
            <div className="space-y-1">
              <Label>Vendor / Factory Name *</Label>
              <Input value={subForm.vendorName} onChange={(e) => setSubForm((p) => ({ ...p, vendorName: e.target.value }))} placeholder="Vendor name" />
            </div>
            <div className="space-y-1">
              <Label>Contact</Label>
              <Input value={subForm.vendorContact} onChange={(e) => setSubForm((p) => ({ ...p, vendorContact: e.target.value }))} placeholder="Phone / email" />
            </div>
            <div className="space-y-1">
              <Label>Cost (₹)</Label>
              <Input type="number" min="0" value={subForm.cost} onChange={(e) => setSubForm((p) => ({ ...p, cost: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={subForm.description} onChange={(e) => setSubForm((p) => ({ ...p, description: e.target.value }))} placeholder="Work description" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSubcontractForItem(null)}>Cancel</Button>
              <Button type="submit" disabled={!subForm.vendorName.trim() || addSubcontract.isPending}>
                {addSubcontract.isPending ? "Saving..." : "Record Subcontract"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDelivery} onOpenChange={setShowDelivery}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delivery Details</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpsertDelivery} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Expected Date</Label>
                <Input type="date" value={deliveryForm.expectedDate} onChange={(e) => setDeliveryForm((p) => ({ ...p, expectedDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Dispatch Date</Label>
                <Input type="date" value={deliveryForm.actualDispatchDate} onChange={(e) => setDeliveryForm((p) => ({ ...p, actualDispatchDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Transporter</Label>
              <Input value={deliveryForm.transporter} onChange={(e) => setDeliveryForm((p) => ({ ...p, transporter: e.target.value }))} placeholder="Transporter name" />
            </div>
            <div className="space-y-1">
              <Label>Tracking Number</Label>
              <Input value={deliveryForm.trackingNumber} onChange={(e) => setDeliveryForm((p) => ({ ...p, trackingNumber: e.target.value }))} placeholder="Waybill / tracking" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={deliveryForm.status} onValueChange={(v) => setDeliveryForm((p) => ({ ...p, status: v as "scheduled" | "dispatched" | "delivered" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={deliveryForm.notes} onChange={(e) => setDeliveryForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDelivery(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertDelivery.isPending}>
                {upsertDelivery.isPending ? "Saving..." : "Save Delivery"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectPOId !== null} onOpenChange={(o) => { if (!o) { setRejectPOId(null); setRejectNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Rejection reason..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectPOId(null); setRejectNote(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={rejectPO.isPending} onClick={() => { if (rejectPOId !== null) rejectPO.mutate({ id: rejectPOId, data: { rejectionNote: rejectNote } }); }}>
              {rejectPO.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customerEditOpen} onOpenChange={setCustomerEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Customer & Dispatch Details</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Customer Name</Label>
              <Input
                value={customerForm.customerName}
                onChange={(e) => setCustomerForm((p) => ({ ...p, customerName: e.target.value }))}
                data-testid="input-customer-name"
              />
            </div>
            <div>
              <Label>Company</Label>
              <Input
                value={customerForm.company}
                onChange={(e) => setCustomerForm((p) => ({ ...p, company: e.target.value }))}
              />
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input
                value={customerForm.customerGstin}
                onChange={(e) => setCustomerForm((p) => ({ ...p, customerGstin: e.target.value.toUpperCase() }))}
                placeholder="22AAAAA0000A1Z5"
                data-testid="input-customer-gstin"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={customerForm.contactPhone}
                onChange={(e) => setCustomerForm((p) => ({ ...p, contactPhone: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={customerForm.contactEmail}
                onChange={(e) => setCustomerForm((p) => ({ ...p, contactEmail: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Billing Address</Label>
              <Textarea
                rows={2}
                value={customerForm.billingAddress}
                onChange={(e) => setCustomerForm((p) => ({ ...p, billingAddress: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Shipping Address</Label>
              <Textarea
                rows={2}
                value={customerForm.shippingAddress}
                onChange={(e) => setCustomerForm((p) => ({ ...p, shippingAddress: e.target.value }))}
              />
            </div>
            <div>
              <Label>Dispatch Date</Label>
              <Input
                type="date"
                value={customerForm.dispatchDate ? customerForm.dispatchDate.slice(0, 10) : ""}
                onChange={(e) => setCustomerForm((p) => ({ ...p, dispatchDate: e.target.value }))}
                data-testid="input-dispatch-date"
              />
            </div>
            <div>
              <Label>Warranty (months)</Label>
              <Input
                type="number"
                min={0}
                value={customerForm.warrantyPeriodMonths}
                onChange={(e) => setCustomerForm((p) => ({ ...p, warrantyPeriodMonths: e.target.value }))}
                data-testid="input-warranty-months"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerEditOpen(false)}>Cancel</Button>
            <Button
              disabled={updateWO.isPending || !woId}
              onClick={() => {
                if (!woId) return;
                const trimOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
                updateWO.mutate(
                  {
                    id: woId,
                    data: {
                      customerName: customerForm.customerName.trim() || wo.customerName,
                      company: trimOrNull(customerForm.company),
                      customerGstin: trimOrNull(customerForm.customerGstin),
                      billingAddress: trimOrNull(customerForm.billingAddress),
                      shippingAddress: trimOrNull(customerForm.shippingAddress),
                      contactPhone: trimOrNull(customerForm.contactPhone),
                      contactEmail: trimOrNull(customerForm.contactEmail),
                      dispatchDate: trimOrNull(customerForm.dispatchDate),
                      warrantyPeriodMonths:
                        customerForm.warrantyPeriodMonths.trim() === ""
                          ? null
                          : parseInt(customerForm.warrantyPeriodMonths, 10),
                    },
                  },
                  { onSuccess: () => setCustomerEditOpen(false) },
                );
              }}
              data-testid="button-save-customer"
            >
              {updateWO.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serviceDialogOpen} onOpenChange={(o) => { if (!o) closeServiceDialog(); else setServiceDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingServiceEntryId !== null ? "Edit Service Entry" : "Add After-sales Service Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Visit Date</Label>
              <Input
                type="date"
                value={serviceForm.entryDate}
                onChange={(e) => setServiceForm((p) => ({ ...p, entryDate: e.target.value }))}
                data-testid="input-service-date"
              />
            </div>
            <div>
              <Label>Technician Name</Label>
              <Input
                value={serviceForm.technicianName}
                onChange={(e) => setServiceForm((p) => ({ ...p, technicianName: e.target.value }))}
                placeholder="e.g. Ramesh Kumar"
                data-testid="input-technician-name"
              />
            </div>
            <div>
              <Label>Description / Work Done</Label>
              <Textarea
                rows={4}
                value={serviceForm.description}
                onChange={(e) => setServiceForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Describe the issue reported and the resolution..."
                data-testid="input-service-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeServiceDialog}>Cancel</Button>
            <Button
              disabled={
                createServiceEntry.isPending ||
                updateServiceEntry.isPending ||
                !woId ||
                !serviceForm.entryDate ||
                !serviceForm.technicianName.trim() ||
                !serviceForm.description.trim()
              }
              onClick={() => {
                if (!woId) return;
                const payload = {
                  entryDate: serviceForm.entryDate,
                  technicianName: serviceForm.technicianName.trim(),
                  description: serviceForm.description.trim(),
                };
                if (editingServiceEntryId !== null) {
                  updateServiceEntry.mutate({
                    id: woId,
                    entryId: editingServiceEntryId,
                    data: payload,
                  });
                } else {
                  createServiceEntry.mutate({
                    id: woId,
                    data: payload,
                  });
                }
              }}
              data-testid="button-save-service-entry"
            >
              {createServiceEntry.isPending || updateServiceEntry.isPending
                ? "Saving..."
                : editingServiceEntryId !== null
                ? "Save Changes"
                : "Save Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
