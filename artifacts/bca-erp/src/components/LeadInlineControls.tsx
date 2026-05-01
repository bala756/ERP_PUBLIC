import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetLeadsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "proposalSent", label: "Proposal Sent" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "onHold", label: "On Hold" },
];

const STATUS_COLOR: Record<string, string> = {
  new: "text-blue-600",
  contacted: "text-cyan-600",
  proposalSent: "text-amber-600",
  negotiating: "text-violet-600",
  won: "text-green-600",
  lost: "text-red-600",
  onHold: "text-slate-500",
};

export function InlineStatusSelect({
  leadId,
  currentStatus,
  disabled,
  onChanged,
}: {
  leadId: number;
  currentStatus: string;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: string) =>
      customFetch<unknown>(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["lead-activities", leadId] });
      onChanged?.();
    },
    onError: () =>
      toast({ variant: "destructive", title: "Failed to update status" }),
  });

  return (
    <Select
      value={currentStatus}
      onValueChange={(v) => mutation.mutate(v)}
      disabled={disabled || mutation.isPending}
    >
      <SelectTrigger
        className={`h-8 w-[140px] text-xs font-medium ${STATUS_COLOR[currentStatus] ?? ""}`}
        data-testid={`inline-status-${leadId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FollowupPopover({
  leadId,
  disabled,
  onAdded,
}: {
  leadId: number;
  disabled?: boolean;
  onAdded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      customFetch<unknown>(`/api/leads/${leadId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      toast({ title: "Follow-up logged" });
      queryClient.invalidateQueries({ queryKey: getGetLeadsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["lead-activities", leadId] });
      setOpen(false);
      setNote("");
      onAdded?.();
    },
    onError: () =>
      toast({
        variant: "destructive",
        title: "Failed to save follow-up",
      }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          data-testid={`followup-add-${leadId}`}
        >
          <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
          Follow-up
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Log a follow-up</h4>
          <Textarea
            placeholder="What did you discuss / next step?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            data-testid={`followup-note-${leadId}`}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!note.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
              data-testid={`followup-save-${leadId}`}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
