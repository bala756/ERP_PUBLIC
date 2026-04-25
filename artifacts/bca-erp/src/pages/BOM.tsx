import React, { useState } from "react";
import {
  useGetBomList,
  useCreateBom,
  useUpdateBom,
  useDeleteBom,
  useGetInventoryItems,
  getGetBomListQueryKey,
  type BomTemplate,
  type InventoryItem,
  type CreateBomBody,
  type UpdateBomBody,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Layers, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

const WRITE_ROLES = ["stores", "manager", "director", "admin", "cfo"];
const DELETE_ROLES = ["manager", "director", "admin", "cfo"];

type LineItemInput = {
  rawMaterialItemId: number;
  qty: string;
  unit: string;
  notes: string;
};

function BomFormDialog({
  open,
  onClose,
  onSave,
  isSaving,
  initial,
  inventoryItems,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateBomBody | UpdateBomBody) => void;
  isSaving: boolean;
  initial?: BomTemplate;
  inventoryItems: InventoryItem[];
}) {
  const finishedGoods = inventoryItems.filter((i) => i.category === "finishedGoods");
  const rawMaterials = inventoryItems.filter((i) => i.category !== "finishedGoods");

  const [form, setForm] = useState({
    finishedItemId: String(initial?.finishedItemId ?? ""),
    name: initial?.name ?? "",
    description: initial?.description ?? "",
  });
  const [lineItems, setLineItems] = useState<LineItemInput[]>(
    initial?.lineItems.map((li) => ({
      rawMaterialItemId: li.rawMaterialItemId,
      qty: String(li.qty),
      unit: li.unit ?? "",
      notes: li.notes ?? "",
    })) ?? [],
  );

  React.useEffect(() => {
    if (open) {
      setForm({
        finishedItemId: String(initial?.finishedItemId ?? ""),
        name: initial?.name ?? "",
        description: initial?.description ?? "",
      });
      setLineItems(
        initial?.lineItems.map((li) => ({
          rawMaterialItemId: li.rawMaterialItemId,
          qty: String(li.qty),
          unit: li.unit ?? "",
          notes: li.notes ?? "",
        })) ?? [],
      );
    }
  }, [open]);

  const addLine = () =>
    setLineItems((prev) => [...prev, { rawMaterialItemId: 0, qty: "", unit: "", notes: "" }]);

  const updateLine = (i: number, patch: Partial<LineItemInput>) =>
    setLineItems((prev) => prev.map((li, idx) => idx === i ? { ...li, ...patch } : li));

  const removeLine = (i: number) => setLineItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lineItems
      .filter((li) => li.rawMaterialItemId > 0 && li.qty)
      .map((li) => ({
        rawMaterialItemId: li.rawMaterialItemId,
        qty: parseFloat(li.qty),
        unit: li.unit || undefined,
        notes: li.notes || undefined,
      }));
    const payload: CreateBomBody = {
      finishedItemId: parseInt(form.finishedItemId),
      name: form.name,
      description: form.description || undefined,
      lineItems: validLines,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit BOM" : "New Bill of Materials"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Finished Goods Item *</Label>
              <Select
                value={form.finishedItemId}
                onValueChange={(v) => {
                  const item = finishedGoods.find((i) => String(i.id) === v);
                  setForm({ ...form, finishedItemId: v, name: form.name || (item ? `BOM - ${item.name}` : "") });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select finished goods item" />
                </SelectTrigger>
                <SelectContent>
                  {finishedGoods.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.itemCode} — {i.name}
                    </SelectItem>
                  ))}
                  {finishedGoods.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No finished goods items. Create items with category "Finished Goods" first.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>BOM Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Raw Materials / Components</Label>
              <Button type="button" size="sm" variant="outline" onClick={addLine}>
                <Plus className="mr-1 h-4 w-4" /> Add Line
              </Button>
            </div>
            {lineItems.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4 border rounded-md border-dashed">
                No components added yet. Click "Add Line" to start.
              </div>
            )}
            {lineItems.map((li, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-muted/30 p-2 rounded-md">
                <div className="col-span-4">
                  <Select
                    value={li.rawMaterialItemId > 0 ? String(li.rawMaterialItemId) : ""}
                    onValueChange={(v) => {
                      const item = rawMaterials.find((rm) => String(rm.id) === v);
                      updateLine(i, {
                        rawMaterialItemId: parseInt(v),
                        ...(item && !li.unit ? { unit: item.unit } : {}),
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {rawMaterials.map((rm) => (
                        <SelectItem key={rm.id} value={String(rm.id)}>
                          {rm.itemCode} — {rm.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    placeholder="Qty"
                    className="h-8 text-sm"
                    value={li.qty}
                    onChange={(e) => updateLine(i, { qty: e.target.value })}
                    min={0.001}
                    step={0.001}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    placeholder="Unit"
                    className="h-8 text-sm"
                    value={li.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Notes"
                    className="h-8 text-sm"
                    value={li.notes}
                    onChange={(e) => updateLine(i, { notes: e.target.value })}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeLine(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSaving || !form.finishedItemId || !form.name}>
              {isSaving ? "Saving…" : "Save BOM"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BomRow({ bom, canWrite, canDelete, onEdit, onDelete }: {
  bom: BomTemplate;
  canWrite: boolean;
  canDelete: boolean;
  onEdit: (b: BomTemplate) => void;
  onDelete: (b: BomTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded(!expanded)}>
        <TableCell>
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="font-medium">{bom.name}</TableCell>
        <TableCell>{bom.finishedItemName ?? "—"}</TableCell>
        <TableCell>
          <Badge variant={bom.isActive ? "default" : "secondary"}>
            {bom.isActive ? "Active" : "Inactive"}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{bom.lineItems.length} component(s)</TableCell>
        <TableCell>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {canWrite && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(bom)}>Edit</Button>
            )}
            {canDelete && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(bom)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 p-0">
            <div className="px-8 py-3">
              {bom.lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No components defined.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs uppercase tracking-wide border-b">
                      <th className="text-left py-1 pr-4">Code</th>
                      <th className="text-left py-1 pr-4">Material</th>
                      <th className="text-right py-1 pr-4">Qty</th>
                      <th className="text-left py-1 pr-4">Unit</th>
                      <th className="text-left py-1">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.lineItems.map((li) => (
                      <tr key={li.id} className="border-b last:border-0">
                        <td className="py-1 pr-4 font-mono text-xs text-muted-foreground">{li.rawMaterialCode ?? "—"}</td>
                        <td className="py-1 pr-4 font-medium">{li.rawMaterialName ?? "—"}</td>
                        <td className="py-1 pr-4 text-right">{li.qty}</td>
                        <td className="py-1 pr-4">{li.unit ?? "—"}</td>
                        <td className="py-1 text-muted-foreground">{li.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function BOM() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingBom, setEditingBom] = useState<BomTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BomTemplate | null>(null);

  const { data: boms = [], isLoading } = useGetBomList();
  const { data: inventoryItems = [] } = useGetInventoryItems();

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetBomListQueryKey() });

  const createBom = useCreateBom({
    mutation: {
      onSuccess: () => { invalidate(); setFormOpen(false); toast({ title: "BOM created" }); },
      onError: (err: Error) => toast({ title: err.message ?? "Failed to create BOM", variant: "destructive" }),
    },
  });

  const updateBom = useUpdateBom({
    mutation: {
      onSuccess: () => { invalidate(); setFormOpen(false); setEditingBom(null); toast({ title: "BOM updated" }); },
      onError: (err: Error) => toast({ title: err.message ?? "Failed to update BOM", variant: "destructive" }),
    },
  });

  const deleteBom = useDeleteBom({
    mutation: {
      onSuccess: () => { invalidate(); setDeleteTarget(null); toast({ title: "BOM deleted" }); },
      onError: () => toast({ title: "Failed to delete BOM", variant: "destructive" }),
    },
  });

  const canWrite = user && WRITE_ROLES.includes(user.role);
  const canDelete = user && DELETE_ROLES.includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Bill of Materials</h1>
            <p className="text-sm text-muted-foreground">Define component lists for finished goods</p>
          </div>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditingBom(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New BOM
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>BOM Name</TableHead>
              <TableHead>Finished Goods Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Components</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : boms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No BOMs defined yet. Create your first Bill of Materials.
                </TableCell>
              </TableRow>
            ) : (
              boms.map((bom) => (
                <BomRow
                  key={bom.id}
                  bom={bom}
                  canWrite={!!canWrite}
                  canDelete={!!canDelete}
                  onEdit={(b) => { setEditingBom(b); setFormOpen(true); }}
                  onDelete={(b) => setDeleteTarget(b)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BomFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingBom(null); }}
        onSave={(data) => {
          if (editingBom) {
            updateBom.mutate({ id: editingBom.id, data: data as UpdateBomBody });
          } else {
            createBom.mutate({ data: data as CreateBomBody });
          }
        }}
        isSaving={createBom.isPending || updateBom.isPending}
        initial={editingBom ?? undefined}
        inventoryItems={inventoryItems}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BOM</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will remove all line items permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteBom.mutate({ id: deleteTarget.id })}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
