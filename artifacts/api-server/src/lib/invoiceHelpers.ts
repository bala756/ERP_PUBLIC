import { db, gstInvoicesTable } from "@workspace/db";
import { like, desc } from "drizzle-orm";

export async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const fy =
    now.getMonth() >= 3
      ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(-2)}`
      : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(-2)}`;
  const prefix = `BCA/INV/${fy}/`;
  const [latest] = await db
    .select({ invoiceNumber: gstInvoicesTable.invoiceNumber })
    .from(gstInvoicesTable)
    .where(like(gstInvoicesTable.invoiceNumber, `${prefix}%`))
    .orderBy(desc(gstInvoicesTable.id))
    .limit(1);
  let seq = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split("/");
    seq = (parseInt(parts[parts.length - 1] ?? "0", 10) || 0) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export function calcGst(taxableValue: number, gstRate: number, transactionType: string) {
  const halfRate = gstRate / 2;
  if (transactionType === "interstate") {
    return { cgst: 0, sgst: 0, igst: (taxableValue * gstRate) / 100 };
  }
  return {
    cgst: (taxableValue * halfRate) / 100,
    sgst: (taxableValue * halfRate) / 100,
    igst: 0,
  };
}
