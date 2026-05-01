import { useMemo, useState } from "react";
import {
  useGetInventoryItems,
  getGetInventoryItemsQueryKey,
  type InventoryItem,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Package, Check } from "lucide-react";
import { objectPathToUrl } from "@/lib/uploadFile";
import { cn } from "@/lib/utils";

export interface PickedProduct {
  productId: number;
  productCode: string;
  productImageUrl: string | null;
  hsnCode: string | null;
  unit: string;
  description: string;
  unitPrice: number;
  gstRate: number;
}

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (p: PickedProduct) => void;
  mode?: "sale" | "purchase";
  excludeIds?: number[];
}

function toPicked(item: InventoryItem, mode: "sale" | "purchase"): PickedProduct {
  const price =
    mode === "purchase"
      ? item.defaultPurchasePrice ?? 0
      : item.defaultSalePrice ?? 0;
  return {
    productId: item.id,
    productCode: item.itemCode ?? `ITEM-${item.id}`,
    productImageUrl: item.imageUrl ?? null,
    hsnCode: item.hsnCode ?? null,
    unit: item.unit,
    description: item.longDescription || item.description || item.name,
    unitPrice: price,
    gstRate: item.gstRate,
  };
}

export function ProductPicker({
  open,
  onClose,
  onPick,
  mode = "sale",
  excludeIds = [],
}: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const { data: items = [], isLoading } = useGetInventoryItems(
    { search: search || undefined },
    {
      query: {
        enabled: open,
        queryKey: getGetInventoryItemsQueryKey({
          search: search || undefined,
        }),
      },
    },
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (i) => i.isActive !== false && !excludeIds.includes(i.id),
      ),
    [items, excludeIds],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Select Product
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, or HSN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
            data-testid="input-product-picker-search"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto border rounded-md">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No matching products. Add them in the Product Master (Inventory)
              first.
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((item) => {
                const price =
                  mode === "purchase"
                    ? item.defaultPurchasePrice
                    : item.defaultSalePrice;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 hover-elevate cursor-pointer",
                    )}
                    onClick={() => {
                      onPick(toPicked(item, mode));
                      onClose();
                    }}
                    data-testid={`product-row-${item.id}`}
                  >
                    <div className="h-12 w-12 shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={objectPathToUrl(item.imageUrl)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        <span className="font-mono">{item.itemCode}</span>
                        {item.hsnCode && <span>HSN {item.hsnCode}</span>}
                        <span>GST {item.gstRate}%</span>
                        <span>
                          Stock {item.stockBalance} {item.unit}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        ₹{Number(price ?? 0).toLocaleString("en-IN")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        per {item.unit}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" tabIndex={-1}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
