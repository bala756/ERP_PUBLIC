import React, { useEffect } from "react";
import { useParams } from "wouter";
import { useGetProposal } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const formatINR = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v);

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

export default function ProposalPrint() {
  const params = useParams<{ id: string }>();
  const proposalId = parseInt(params.id ?? "0", 10);

  const { data: proposal, isLoading, isError } = useGetProposal(proposalId);

  useEffect(() => {
    if (proposal) {
      document.title = `${proposal.proposalNumber} — BCA Entertainment Works`;
    }
    return () => {
      document.title = "BCA Entertainment Works ERP";
    };
  }, [proposal]);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !proposal) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-destructive">
        Proposal not found.
      </div>
    );
  }

  const lineItems = proposal.lineItems as LineItem[];
  const lineItemTotal = lineItems.reduce(
    (s, li) => s + li.qty * li.unitPrice,
    0,
  );

  return (
    <>
      <div className="print:hidden sticky top-0 z-10 bg-background border-b py-3 px-6 flex items-center justify-between">
        <span className="font-semibold">{proposal.proposalNumber}</span>
        <Button onClick={() => window.print()} size="sm">
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </Button>
      </div>

      <div className="max-w-3xl mx-auto p-10 print:p-0 space-y-8 font-sans text-sm text-foreground print:text-black">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              BCA Entertainment Works
            </h1>
            <p className="text-muted-foreground print:text-gray-500 text-xs mt-1">
              Entertainment Production &amp; Event Management
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold">{proposal.proposalNumber}</p>
            <p className="text-muted-foreground print:text-gray-500 text-xs mt-1">
              Created:{" "}
              {new Date(proposal.createdAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
            {proposal.validUntil && (
              <p className="text-muted-foreground print:text-gray-500 text-xs">
                Valid Until:{" "}
                {new Date(proposal.validUntil).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-8 border-t pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500 mb-1">
              Bill To
            </p>
            <p className="font-semibold text-base">
              {proposal.customerName ?? "—"}
            </p>
            {proposal.company && (
              <p className="text-muted-foreground print:text-gray-600">
                {proposal.company}
              </p>
            )}
          </div>
          {proposal.salespersonName && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500 mb-1">
                Handled By
              </p>
              <p className="font-medium">{proposal.salespersonName}</p>
            </div>
          )}
        </section>

        <section>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-foreground print:border-black text-left">
                <th className="pb-2 font-semibold w-[50%]">Description</th>
                <th className="pb-2 font-semibold text-right w-[10%]">Qty</th>
                <th className="pb-2 font-semibold text-right w-[20%]">
                  Unit Price
                </th>
                <th className="pb-2 font-semibold text-right w-[10%]">
                  GST%
                </th>
                <th className="pb-2 font-semibold text-right w-[20%]">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => (
                <tr
                  key={i}
                  className="border-b border-border print:border-gray-200"
                >
                  <td className="py-2">{li.description}</td>
                  <td className="py-2 text-right">{li.qty}</td>
                  <td className="py-2 text-right">{formatINR(li.unitPrice)}</td>
                  <td className="py-2 text-right">{li.gstRate}%</td>
                  <td className="py-2 text-right">
                    {formatINR(li.qty * li.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-gray-600">
                  Subtotal
                </span>
                <span>{formatINR(lineItemTotal)}</span>
              </div>
              {proposal.discountPercent > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({proposal.discountPercent}%)</span>
                  <span>- {formatINR(proposal.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground print:text-gray-600">
                  GST ({proposal.gstRate}%)
                </span>
                <span>{formatINR(proposal.gstAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-foreground print:border-black pt-2">
                <span>Total</span>
                <span>{formatINR(proposal.total)}</span>
              </div>
            </div>
          </div>
        </section>

        {proposal.notes && (
          <section className="border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500 mb-1">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-sm">{proposal.notes}</p>
          </section>
        )}

        <footer className="border-t pt-4 text-xs text-muted-foreground print:text-gray-500 text-center">
          BCA Entertainment Works — This is a computer-generated proposal and
          does not require a signature.
        </footer>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:text-black { color: black !important; }
          .print\\:text-gray-500 { color: #6b7280 !important; }
          .print\\:text-gray-600 { color: #4b5563 !important; }
          .print\\:border-black { border-color: black !important; }
          .print\\:border-gray-200 { border-color: #e5e7eb !important; }
          body { print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
