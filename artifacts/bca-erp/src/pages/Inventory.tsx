import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetInventoryItems,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useRecordStockTransaction,
  useGetInventoryDashboard,
  getGetInventoryItemsQueryKey,
  getGetInventoryDashboardQueryKey,
  getGetLowStockItemsQueryKey,
  type InventoryItem,
  type CreateInventoryItemBody,
  type UpdateInventoryItemBody,
  type CreateStockTransactionBody,
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
import {
  Package, Plus, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, BookOpen, LayoutDashboard, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUpload } from "@/components/ImageUpload";
import { useGetBomList } from "@workspace/api-client-react";
import { Textarea } from "@/components/ui/textarea";
import { objectPathToUrl } from "@/lib/uploadFile";

const WRITE_ROLES = ["stores", "manager", "director", "admin", "cfo"];
const ITEM_MGMT_ROLES = ["manager", "director", "admin", "cfo"];
const CATEGORIES = ["rawMaterial", "wip", "finishedGoods"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  rawMaterial: "Raw Material",
  wip: "WIP",
  finishedGoods: "Finished Goods",
};
const CATEGORY_COLORS: Record<string, string> = {
  rawMaterial: "bg-blue-100 text-blue-800",
  wip: "bg-yellow-100 text-yellow-800",
  finishedGoods: "bg-green-100 text-green-800",
};

function ItemFormDialog({
  open,
  onClose,
  onSave,
  initial,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateInventoryItemBody | UpdateInventoryItemBody) => void;
  initial?: Partial<InventoryItem>;
  isSaving: boolean;
}) {
  const { data: bomList = [] } = useGetBomList();

  type FormState = {
    itemCode: string;
    name: string;
    category: "rawMaterial" | "wip" | "finishedGoods";
    unit: string;
    hsnCode: string;
    gstRate: string;
    reorderLevel: string;
    description: string;
    longDescription: string;
    imageUrl: string | null;
    defaultSalePrice: string;
    defaultPurchasePrice: string;
    bomTemplateId: string;
  };

  const buildInitial = (): FormState => ({
    itemCode: initial?.itemCode ?? "",
    name: initial?.name ?? "",
    category:
      (initial?.category as "rawMaterial" | "wip" | "finishedGoods") ??
      "rawMaterial",
    unit: initial?.unit ?? "pcs",
    hsnCode: initial?.hsnCode ?? "",
    gstRate: String(initial?.gstRate ?? 18),
    reorderLevel: String(initial?.reorderLevel ?? 0),
    description: initial?.description ?? "",
    longDescription: initial?.longDescription ?? "",
    imageUrl: initial?.imageUrl ?? null,
    defaultSalePrice: String(initial?.defaultSalePrice ?? 0),
    defaultPurchasePrice: String(initial?.defaultPurchasePrice ?? 0),
    bomTemplateId: initial?.bomTemplateId ? String(initial.bomTemplateId) : "",
  });

  const [form, setForm] = useState<FormState>(buildInitial);

  React.useEffect(() => {
    if (open) setForm(buildInitial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: UpdateInventoryItemBody = {
      itemCode: form.itemCode || undefined,
      name: form.name,
      category: form.category,
      unit: form.unit,
      hsnCode: form.hsnCode || undefined,
      gstRate: parseFloat(form.gstRate) || 0,
      reorderLevel: parseFloat(form.reorderLevel) || 0,
      description: form.description || undefined,
      longDescription: form.longDescription || undefined,
      imageUrl: form.imageUrl ?? null,
      defaultSalePrice: parseFloat(form.defaultSalePrice) || 0,
      defaultPurchasePrice: parseFloat(form.defaultPurchasePrice) || 0,
      bomTemplateId: form.bomTemplateId
        ? parseInt(form.bomTemplateId, 10)
        : null,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial?.id ? "Edit Product" : "New Product"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4 items-start">
            <ImageUpload
              value={form.imageUrl}
              onChange={(v) => setForm({ ...form, imageUrl: v })}
              label="Upload Image"
            />
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Product Code</Label>
                  <Input
                    value={form.itemCode}
                    onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
                    placeholder="auto if empty"
                    data-testid="input-product-code"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    data-testid="input-product-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) =>
                      setForm({ ...form, category: v as FormState["category"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unit</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="pcs, kg, m..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>HSN Code</Label>
              <Input
                value={form.hsnCode}
                onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                data-testid="input-product-hsn"
              />
            </div>
            <div className="space-y-1">
              <Label>GST Rate (%)</Label>
              <Input
                type="number"
                value={form.gstRate}
                onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
                min={0}
                max={100}
                step={0.5}
                data-testid="input-product-gst"
              />
            </div>
            <div className="space-y-1">
              <Label>Reorder Level</Label>
              <Input
                type="number"
                value={form.reorderLevel}
                onChange={(e) =>
                  setForm({ ...form, reorderLevel: e.target.value })
                }
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default Sale Price (₹)</Label>
              <Input
                type="number"
                value={form.defaultSalePrice}
                onChange={(e) =>
                  setForm({ ...form, defaultSalePrice: e.target.value })
                }
                min={0}
                step={0.01}
                data-testid="input-default-sale-price"
              />
            </div>
            <div className="space-y-1">
              <Label>Default Purchase Price (₹)</Label>
              <Input
                type="number"
                value={form.defaultPurchasePrice}
                onChange={(e) =>
                  setForm({ ...form, defaultPurchasePrice: e.target.value })
                }
                min={0}
                step={0.01}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>BOM Template (optional)</Label>
            <Select
              value={form.bomTemplateId || "none"}
              onValueChange={(v) =>
                setForm({ ...form, bomTemplateId: v === "none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {bomList.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Link to a BOM so production knows components for this product.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Short Description</Label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Used as default proposal/PO line text"
            />
          </div>

          <div className="space-y-1">
            <Label>Long Description (printed on proposals)</Label>
            <Textarea
              rows={4}
              value={form.longDescription}
              onChange={(e) =>
                setForm({ ...form, longDescription: e.target.value })
              }
              placeholder="Full product write-up, specifications, etc."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} data-testid="button-product-save">
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StockDialog({
  open,
  onClose,
  onSave,
  isSaving,
  type,
  item,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateStockTransactionBody) => void;
  isSaving: boolean;
  type: "in" | "out";
  item: InventoryItem | null;
}) {
  const [form, setForm] = useState({
    qty: "", rate: "", notes: "", referenceNumber: "",
    poNumber: "", supplierBillNumber: "", dcNumber: "",
  });

  React.useEffect(() => {
    if (open) setForm({ qty: "", rate: "", notes: "", referenceNumber: "", poNumber: "", supplierBillNumber: "", dcNumber: "" });
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    const payload: CreateStockTransactionBody = {
      itemId: item.id,
      type,
      qty: parseFloat(form.qty),
      rate: parseFloat(form.rate) || 0,
      notes: form.notes || undefined,
      referenceNumber: form.referenceNumber || undefined,
      referenceType: "manual",
      ...(type === "in" ? { poNumber: form.poNumber || undefined, supplierBillNumber: form.supplierBillNumber || undefined } : {}),
      ...(type === "out" ? { dcNumber: form.dcNumber || undefined } : {}),
    } as CreateStockTransactionBody;
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "in"
              ? <ArrowDownCircle className="h-5 w-5 text-green-600" />
              : <ArrowUpCircle className="h-5 w-5 text-red-600" />}
            Stock {type === "in" ? "IN" : "OUT"} — {item?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {item && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              Current balance: <strong>{item.stockBalance} {item.unit}</strong>
            </div>
          )}
          <div className="space-y-1">
            <Label>Quantity * ({item?.unit})</Label>
            <Input
              type="number"
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
              required
              min={0.01}
              step={0.01}
              max={type === "out" ? (item?.stockBalance ?? undefined) : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label>Rate per {item?.unit} (₹)</Label>
            <Input
              type="number"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              min={0}
              step={0.01}
              placeholder="0"
            />
          </div>

          {type === "in" && (
            <>
              <div className="space-y-1">
                <Label>PO Number *</Label>
                <Input
                  value={form.poNumber}
                  onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                  placeholder="PO-2025-001"
                  required
                  data-testid="input-stock-po-number"
                />
              </div>
              <div className="space-y-1">
                <Label>Supplier Bill Number *</Label>
                <Input
                  value={form.supplierBillNumber}
                  onChange={(e) => setForm({ ...form, supplierBillNumber: e.target.value })}
                  placeholder="INV/2025/00123"
                  required
                  data-testid="input-stock-supplier-bill"
                />
              </div>
            </>
          )}

          {type === "out" && (
            <div className="space-y-1">
              <Label>DC / Delivery Challan Number *</Label>
              <Input
                value={form.dcNumber}
                onChange={(e) => setForm({ ...form, dcNumber: e.target.value })}
                placeholder="DC-2025-001"
                required
                data-testid="input-stock-dc-number"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Reference # (optional)</Label>
            <Input
              value={form.referenceNumber}
              onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
              placeholder="WO-012, MR-003..."
            />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={isSaving}
              className={type === "in" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isSaving ? "Saving…" : `Record ${type === "in" ? "IN" : "OUT"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showLowStock, setShowLowStock] = useState(false);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [stockDialog, setStockDialog] = useState<{ type: "in" | "out"; item: InventoryItem } | null>(null);

  const { data: items = [], isLoading } = useGetInventoryItems({
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    search: search || undefined,
    lowStock: showLowStock ? true : undefined,
  });

  const { data: dashboard } = useGetInventoryDashboard();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetInventoryItemsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetInventoryDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetLowStockItemsQueryKey() });
  };

  const createItem = useCreateInventoryItem({
    mutation: {
      onSuccess: () => { invalidateAll(); setItemDialogOpen(false); toast({ title: "Item created" }); },
      onError: (err: Error) => toast({ title: err.message ?? "Failed to create item", variant: "destructive" }),
    },
  });

  const updateItem = useUpdateInventoryItem({
    mutation: {
      onSuccess: () => { invalidateAll(); setItemDialogOpen(false); setEditingItem(null); toast({ title: "Item updated" }); },
      onError: (err: Error) => toast({ title: err.message ?? "Failed to update item", variant: "destructive" }),
    },
  });

  const recordTx = useRecordStockTransaction({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setStockDialog(null);
        toast({ title: `Stock ${stockDialog?.type === "in" ? "IN" : "OUT"} recorded` });
      },
      onError: (err: Error) => toast({ title: err.message ?? "Transaction failed", variant: "destructive" }),
    },
  });

  const canWrite = user && WRITE_ROLES.includes(user.role);
  const canManageItems = user && ITEM_MGMT_ROLES.includes(user.role);

  const lowStockCount = dashboard?.lowStockCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-sm text-muted-foreground">Stock catalogue & movements</p>
          </div>
        </div>
        {canManageItems && (
          <Button onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New Item
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <LayoutDashboard className="h-4 w-4" /> Total SKUs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.totalSkus ?? items.length}</div>
          </CardContent>
        </Card>
        <Card className={lowStockCount > 0 ? "border-orange-300" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" /> Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-orange-600" : ""}`}>
              {lowStockCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Movements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard?.recentTransactions.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showLowStock ? "default" : "outline"}
          size="sm"
          onClick={() => setShowLowStock(!showLowStock)}
          className={showLowStock ? "bg-orange-600 hover:bg-orange-700" : ""}
        >
          <AlertTriangle className="mr-1 h-4 w-4" />
          Low Stock
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Image</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Sale ₹</TableHead>
              <TableHead className="text-right">GST %</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  {showLowStock ? "No low-stock items — great!" : "No items found. Add your first inventory item."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className={item.isLowStock ? "bg-orange-50" : ""}>
                  <TableCell>
                    <div className="h-9 w-9 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {item.imageUrl ? (
                        <img
                          src={objectPathToUrl(item.imageUrl)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {item.name}
                      {item.isLowStock && (
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category]}`}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className={`text-right font-bold ${item.isLowStock ? "text-orange-600" : ""}`}>
                    {item.stockBalance}
                  </TableCell>
                  <TableCell className="text-right">
                    ₹{Number(item.defaultSalePrice ?? 0).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right">{item.gstRate}%</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {canWrite && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-700 hover:text-green-900 hover:bg-green-50"
                            onClick={() => setStockDialog({ type: "in", item })}
                            title="Stock IN"
                          >
                            <ArrowDownCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-700 hover:text-red-900 hover:bg-red-50"
                            onClick={() => setStockDialog({ type: "out", item })}
                            title="Stock OUT"
                            disabled={item.stockBalance <= 0}
                          >
                            <ArrowUpCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/inventory/${item.id}/ledger`)}
                        title="View Ledger"
                      >
                        <BookOpen className="h-4 w-4" />
                      </Button>
                      {canManageItems && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingItem(item); setItemDialogOpen(true); }}
                          title="Edit"
                        >
                          Edit
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

      <ItemFormDialog
        open={itemDialogOpen}
        onClose={() => { setItemDialogOpen(false); setEditingItem(null); }}
        onSave={(data) => {
          if (editingItem) {
            updateItem.mutate({ id: editingItem.id, data });
          } else {
            createItem.mutate({ data: data as CreateInventoryItemBody });
          }
        }}
        initial={editingItem ?? undefined}
        isSaving={createItem.isPending || updateItem.isPending}
      />

      <StockDialog
        open={!!stockDialog}
        onClose={() => setStockDialog(null)}
        onSave={(data) => recordTx.mutate({ data })}
        isSaving={recordTx.isPending}
        type={stockDialog?.type ?? "in"}
        item={stockDialog?.item ?? null}
      />
    </div>
  );
}
