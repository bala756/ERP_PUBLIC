import React from "react";
import { useRoute } from "wouter";
import { useGetPurchaseOrder } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, AlertTriangle, ShieldAlert } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "DRAFT",
  pendingApproval: "PENDING APPROVAL",
  pendingDirectorApproval: "PENDING DIRECTOR APPROVAL",
  approved: "APPROVED",
  received: "RECEIVED",
  cancelled: "CANCELLED",
};

export default function PurchaseOrderPrint() {
  const [, params] = useRoute("/purchase-orders/:id/print");
  const poId = params?.id ? parseInt(params.id, 10) : 0;
  const { data: po, isLoading } = useGetPurchaseOrder(poId);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!po) {
    return <div className="p-8 text-muted-foreground">Purchase Order not found.</div>;
  }

  const isDirectorPending = po.status === "pendingDirectorApproval";
  const subTotal = po.lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0);
  const totalGst = po.lineItems.reduce((s, li) => {
    const lineTotal = li.qty * li.unitPrice;
    return s + (lineTotal * (li.gstRate / 100));
  }, 0);
  const grandTotal = subTotal + totalGst;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto p-8">
        <div className="print:hidden flex gap-3 mb-6 no-print">
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>

        {isDirectorPending && (
          <div className="print:hidden mb-4 flex items-center gap-2 bg-amber-50 border border-amber-300 rounded p-3 text-amber-700 text-sm">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            This PO is awaiting Director approval before it can proceed.
          </div>
        )}

        <div className="border border-gray-300 rounded-sm p-8 print:border-0 print:p-0">
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">BCA Entertainment Works</h1>
              <p className="text-sm text-gray-600 mt-1">Entertainment Infrastructure Solutions</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-900">PURCHASE ORDER</p>
              <p className="text-lg font-mono font-semibold text-blue-700 mt-1">{po.poNumber}</p>
              <p className="text-sm text-gray-600 mt-1">
                Date: {new Date(po.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
              <div className="mt-2">
                <Badge variant={isDirectorPending ? "outline" : po.status === "approved" ? "default" : "secondary"} className={isDirectorPending ? "border-amber-500 text-amber-700" : ""}>
                  {STATUS_LABELS[po.status] ?? po.status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Vendor / Supplier</p>
              <p className="font-semibold text-gray-900">{po.supplierName}</p>
              {po.supplierContact && <p className="text-sm text-gray-700">{po.supplierContact}</p>}
              {po.supplierGstin && (
                <p className="text-sm text-gray-700">GSTIN: <span className="font-mono">{po.supplierGstin}</span></p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Reference</p>
              <p className="text-sm text-gray-700">Work Order: <span className="font-mono font-semibold">#{po.workOrderId}</span></p>
              {po.paymentTerms && (
                <p className="text-sm text-gray-700">Payment Terms: <span className="font-semibold">{po.paymentTerms}</span></p>
              )}
              {po.deliveryDate && (
                <p className="text-sm text-gray-700">Delivery Date: <span className="font-semibold">{po.deliveryDate}</span></p>
              )}
              {po.warrantyText && (
                <p className="text-sm text-gray-700">Warranty: <span className="font-semibold">{po.warrantyText}</span></p>
              )}
              <p className="text-sm text-gray-700">
                Type: <span className="font-semibold">{po.type === "rawMaterial" ? "Raw Material / Manufacturing" : "Imported"}</span>
              </p>
            </div>
          </div>

          {po.requiresDirectorApproval && (
            <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded p-2 text-amber-700 text-xs print:hidden">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              This PO was created with line prices that differ from master price — Director approval required.
            </div>
          )}

          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase">#</th>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase">Description</th>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase">HSN</th>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase">Unit</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-xs font-semibold uppercase">Qty</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-xs font-semibold uppercase">Rate (₹)</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-xs font-semibold uppercase">GST %</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-xs font-semibold uppercase">GST Amt (₹)</th>
                <th className="border border-gray-300 px-3 py-2 text-right text-xs font-semibold uppercase">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {po.lineItems.map((li, i) => {
                const lineBase = li.qty * li.unitPrice;
                const lineGst = lineBase * (li.gstRate / 100);
                const lineTotal = lineBase + lineGst;
                return (
                  <tr key={li.id} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                    <td className="border border-gray-300 px-3 py-2 text-center">{i + 1}</td>
                    <td className="border border-gray-300 px-3 py-2">
                      <div className="font-medium">{li.description}</div>
                      {li.productCode && <div className="text-xs text-gray-500 font-mono">{li.productCode}</div>}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 font-mono text-xs">{li.hsnCode ?? "—"}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">{li.unit ?? "—"}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{li.qty.toLocaleString("en-IN")}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{li.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{li.gstRate}%</td>
                    <td className="border border-gray-300 px-3 py-2 text-right">{lineGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-semibold">{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
              {po.lineItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="border border-gray-300 px-3 py-4 text-center text-gray-400 italic">
                    No line items
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right font-semibold text-sm">Sub Total</td>
                <td className="border border-gray-300 px-3 py-2 text-right text-sm">{totalGst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                <td className="border border-gray-300 px-3 py-2 text-right font-semibold text-sm">{subTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr className="bg-gray-100">
                <td colSpan={8} className="border border-gray-300 px-3 py-3 text-right font-bold text-base">Grand Total (incl. GST)</td>
                <td className="border border-gray-300 px-3 py-3 text-right font-bold text-base text-blue-700">
                  ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {po.notes && (
            <div className="mb-6 border border-gray-200 rounded p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700">{po.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 mt-10 pt-6 border-t border-gray-300">
            <div className="space-y-8">
              <div>
                <div className="border-b border-gray-400 w-48 mb-1" />
                <p className="text-xs text-gray-600">Authorised Signatory — BCA Entertainment Works</p>
              </div>
            </div>
            <div className="space-y-8">
              <div>
                <div className="border-b border-gray-400 w-48 mb-1" />
                <p className="text-xs text-gray-600">Vendor Acknowledgement</p>
              </div>
            </div>
          </div>

          {po.approvedByName && (
            <div className="mt-4 text-xs text-gray-500">
              Approved by: {po.approvedByName}
              {po.approvedAt ? ` on ${new Date(po.approvedAt).toLocaleDateString("en-IN")}` : ""}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          .print\\:border-0 { border: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
