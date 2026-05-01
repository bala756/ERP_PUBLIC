import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { Plus, Trash2, RefreshCw, Save, ShieldAlert } from "lucide-react";

interface RoutingRule {
  id: number;
  name: string;
  salespersonId: number;
  salespersonName: string | null;
  states: string[];
  productKeywords: string[];
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Salesperson {
  id: number;
  name: string;
  role: string;
}

interface IndiaMartSettings {
  enabled: boolean;
  intervalMinutes: number;
  hasKey: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "failure" | null;
  lastSyncMessage: string | null;
  lastSyncCount: number | null;
  totalImported: number;
  dedupeWindowDays: number;
}

export default function LeadRouting() {
  const { user } = useAuth();
  const allowed = user && ["admin", "director", "cfo"].includes(user.role);

  if (!allowed) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" /> Access Denied
            </CardTitle>
            <CardDescription>
              Lead Routing settings are restricted to admins, directors, and the CFO.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lead Routing</h1>
        <p className="text-muted-foreground mt-1">
          Configure auto-assignment rules and the IndiaMart integration.
        </p>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" data-testid="tab-rules">Routing Rules</TabsTrigger>
          <TabsTrigger value="indiamart" data-testid="tab-indiamart">IndiaMart</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <RoutingRulesTab />
        </TabsContent>
        <TabsContent value="indiamart" className="mt-4">
          <IndiaMartTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoutingRulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["lead-routing-rules"],
    queryFn: () =>
      customFetch<RoutingRule[]>("/api/lead-routing-rules"),
  });

  const { data: salespeople } = useQuery({
    queryKey: ["lead-routing-salespeople"],
    queryFn: () =>
      customFetch<Salesperson[]>("/api/lead-routing/salespeople"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/lead-routing-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-routing-rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) =>
      customFetch(`/api/lead-routing-rules/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: params.isActive }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-routing-rules"] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Routing Rules</CardTitle>
          <CardDescription>
            Lower priority numbers run first. Each rule routes leads matching the listed states AND product keywords (a rule with only one type set matches on that field alone).
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-new-rule">
          <Plus className="h-4 w-4 mr-2" />
          New Rule
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Priority</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Salesperson</TableHead>
              <TableHead>States</TableHead>
              <TableHead>Keywords</TableHead>
              <TableHead className="w-[80px]">Active</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>
            ) : !rules?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No rules yet. Create one to enable auto-assignment.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((r) => (
                <TableRow key={r.id} data-testid={`rule-row-${r.id}`}>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.salespersonName ?? `User #${r.salespersonId}`}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.states.length === 0
                        ? <span className="text-muted-foreground text-xs">any</span>
                        : r.states.map((s) => <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.productKeywords.length === 0
                        ? <span className="text-muted-foreground text-xs">any</span>
                        : r.productKeywords.map((k) => <Badge key={k} variant="outline" className="text-xs">{k}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.isActive}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: r.id, isActive: checked })
                      }
                      data-testid={`rule-toggle-${r.id}`}
                    />
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)} data-testid={`rule-edit-${r.id}`}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete rule "${r.name}"?`)) deleteMutation.mutate(r.id);
                      }}
                      data-testid={`rule-delete-${r.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      {(creating || editing) && (
        <RuleDialog
          rule={editing}
          salespeople={salespeople ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function RuleDialog({
  rule,
  salespeople,
  onClose,
}: {
  rule: RoutingRule | null;
  salespeople: Salesperson[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = rule !== null;
  const [name, setName] = useState(rule?.name ?? "");
  const [salespersonId, setSalespersonId] = useState(
    rule?.salespersonId ? rule.salespersonId.toString() : "",
  );
  const [statesText, setStatesText] = useState((rule?.states ?? []).join(", "));
  const [keywordsText, setKeywordsText] = useState(
    (rule?.productKeywords ?? []).join(", "),
  );
  const [priority, setPriority] = useState(rule?.priority?.toString() ?? "100");

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        salespersonId: parseInt(salespersonId, 10),
        states: statesText.split(",").map((s) => s.trim()).filter(Boolean),
        productKeywords: keywordsText.split(",").map((s) => s.trim()).filter(Boolean),
        priority: parseInt(priority, 10),
      };
      if (isEdit) {
        return customFetch(`/api/lead-routing-rules/${rule!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      return customFetch(`/api/lead-routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Rule updated" : "Rule created" });
      qc.invalidateQueries({ queryKey: ["lead-routing-rules"] });
      onClose();
    },
    onError: (err: unknown) => {
      const e = err as { error?: string } | null;
      toast({
        variant: "destructive",
        title: "Save failed",
        description: e?.error ?? "Check the form values.",
      });
    },
  });

  const valid = name.trim() && salespersonId && (statesText.trim() || keywordsText.trim());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Routing Rule" : "New Routing Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maharashtra LED Display" data-testid="input-rule-name"/>
          </div>
          <div>
            <Label>Assign to</Label>
            <Select value={salespersonId} onValueChange={setSalespersonId}>
              <SelectTrigger data-testid="select-rule-salesperson"><SelectValue placeholder="Choose salesperson" /></SelectTrigger>
              <SelectContent>
                {salespeople.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id.toString()}>{sp.name} ({sp.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>States <span className="text-muted-foreground text-xs">(comma-separated, leave blank for any)</span></Label>
            <Input value={statesText} onChange={(e) => setStatesText(e.target.value)} placeholder="Maharashtra, MH" data-testid="input-rule-states"/>
          </div>
          <div>
            <Label>Product Keywords <span className="text-muted-foreground text-xs">(comma-separated, leave blank for any)</span></Label>
            <Input value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} placeholder="LED, display, screen" data-testid="input-rule-keywords"/>
          </div>
          <div>
            <Label>Priority <span className="text-muted-foreground text-xs">(lower runs first)</span></Label>
            <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="input-rule-priority"/>
          </div>
          {!statesText.trim() && !keywordsText.trim() && (
            <p className="text-xs text-amber-700">A rule must specify at least one state or keyword.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="button-save-rule"
          >
            <Save className="h-4 w-4 mr-2" />
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IndiaMartTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["indiamart-settings"],
    queryFn: () =>
      customFetch<IndiaMartSettings>("/api/integration-settings/indiamart"),
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState<string>("");
  const [dedupeWindowDays, setDedupeWindowDays] = useState<string>("");

  React.useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setIntervalMinutes(settings.intervalMinutes.toString());
      setDedupeWindowDays(settings.dedupeWindowDays.toString());
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch<IndiaMartSettings>("/api/integration-settings/indiamart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      qc.invalidateQueries({ queryKey: ["indiamart-settings"] });
    },
    onError: () =>
      toast({ variant: "destructive", title: "Failed to save settings" }),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      customFetch<{ status: string; message: string; fetched: number; imported: number; skipped: number; errors: number }>(
        "/api/integration-settings/indiamart/sync",
        { method: "POST" },
      ),
    onSuccess: (r) => {
      toast({
        title: "Sync completed",
        description: `${r.imported} imported, ${r.skipped} skipped, ${r.errors} errors`,
      });
      qc.invalidateQueries({ queryKey: ["indiamart-settings"] });
    },
    onError: (err: unknown) => {
      const e = err as { error?: string | { message?: string } } | null;
      const msg =
        typeof e?.error === "string"
          ? e.error
          : e?.error?.message ?? "Check API key & connectivity.";
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: msg,
      });
      qc.invalidateQueries({ queryKey: ["indiamart-settings"] });
    },
  });

  if (isLoading || !settings || enabled === null) {
    return <Card><CardContent className="py-8">Loading…</CardContent></Card>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>IndiaMart CRM Integration</CardTitle>
          <CardDescription>
            Pulls new enquiries from IndiaMart's CRM Lead Manager v2 API and creates leads automatically (assigned per your routing rules).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable scheduled sync</Label>
              <p className="text-xs text-muted-foreground">Pulls new enquiries on the interval below.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-enabled" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Sync interval (minutes)</Label>
              <Input type="number" min={5} max={1440} value={intervalMinutes} onChange={(e) => setIntervalMinutes(e.target.value)} data-testid="input-interval"/>
            </div>
            <div>
              <Label>Dedupe window (days)</Label>
              <Input type="number" min={1} max={365} value={dedupeWindowDays} onChange={(e) => setDedupeWindowDays(e.target.value)} data-testid="input-dedupe"/>
            </div>
          </div>

          <Separator />

          <div>
            <Label>
              CRM API Key{" "}
              {settings.hasKey ? (
                <Badge variant="outline" className="ml-2">configured</Badge>
              ) : (
                <Badge variant="destructive" className="ml-2">not configured</Badge>
              )}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              The IndiaMart CRM key is read from the <code>INDIAMART_API_KEY</code> Replit Secret. Add or rotate it from the Secrets pane in the workspace; the app reads it at request time.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={!settings.hasKey || syncMutation.isPending}
              data-testid="button-sync-now"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
            <Button
              onClick={() => {
                const body: Record<string, unknown> = {
                  enabled,
                  intervalMinutes: parseInt(intervalMinutes, 10),
                  dedupeWindowDays: parseInt(dedupeWindowDays, 10),
                };
                saveMutation.mutate(body);
              }}
              disabled={saveMutation.isPending}
              data-testid="button-save-indiamart"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync Status</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Last sync</dt>
              <dd className="font-medium">{settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString("en-IN") : "Never"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {settings.lastSyncStatus === "success"
                  ? <Badge className="bg-green-600">success</Badge>
                  : settings.lastSyncStatus === "failure"
                  ? <Badge variant="destructive">failure</Badge>
                  : <Badge variant="outline">—</Badge>}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Message</dt>
              <dd className="font-mono text-xs">{settings.lastSyncMessage ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total imported (lifetime)</dt>
              <dd className="font-medium">{settings.totalImported}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last batch count</dt>
              <dd className="font-medium">{settings.lastSyncCount ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
