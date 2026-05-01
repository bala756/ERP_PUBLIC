import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useChangePassword,
  useGetAppSettings,
  useUpdateAppSettings,
  getGetAppSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Lock, User, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ImageUpload } from "@/components/ImageUpload";
import { RichTextEditor } from "@/components/RichTextEditor";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

const PRINT_TEMPLATE_ADMIN_ROLES = ["admin"];

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const passwordMutation = useChangePassword();
  const canEditTemplate = !!user && PRINT_TEMPLATE_ADMIN_ROLES.includes(user.role);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: PasswordFormValues) => {
    passwordMutation.mutate(
      { data: { currentPassword: data.currentPassword, newPassword: data.newPassword } },
      {
        onSuccess: () => {
          toast({ title: "Password changed successfully" });
          form.reset();
        },
        onError: (error: any) => {
          toast({
            variant: "destructive",
            title: "Failed to change password",
            description: error?.error || "Check your current password",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account preferences and security.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="mr-2 h-5 w-5" /> My Profile
            </CardTitle>
            <CardDescription>
              Your personal information (contact admin to update)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground font-medium">Name</dt>
                <dd className="font-medium mt-1">{user?.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-medium">Email</dt>
                <dd className="font-medium mt-1">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-medium">Role</dt>
                <dd className="font-medium mt-1 capitalize">{user?.role}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-medium">Department</dt>
                <dd className="font-medium mt-1">{user?.department}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Lock className="mr-2 h-5 w-5" /> Security
            </CardTitle>
            <CardDescription>Change your password</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 max-w-md"
              >
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          {...field}
                          data-testid="input-current-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator className="my-4" />
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          {...field}
                          data-testid="input-new-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          {...field}
                          data-testid="input-confirm-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="mt-2"
                  disabled={passwordMutation.isPending}
                  data-testid="button-submit-password"
                >
                  {passwordMutation.isPending ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {canEditTemplate && <PrintTemplateCard />}
      </div>
    </div>
  );
}

function PrintTemplateCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAppSettings();
  const updateMutation = useUpdateAppSettings();

  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyGstin, setCompanyGstin] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [proposalFooterNotes, setProposalFooterNotes] = useState("");
  const [proposalTermsAndConditions, setProposalTermsAndConditions] = useState("");

  useEffect(() => {
    if (!data) return;
    setCompanyName(data.companyName ?? "");
    setCompanyAddress(data.companyAddress ?? "");
    setCompanyGstin(data.companyGstin ?? "");
    setCompanyPhone(data.companyPhone ?? "");
    setCompanyEmail(data.companyEmail ?? "");
    setCompanyWebsite(data.companyWebsite ?? "");
    setCompanyLogoUrl(data.companyLogoUrl ?? null);
    setProposalFooterNotes(data.proposalFooterNotes ?? "");
    setProposalTermsAndConditions(data.proposalTermsAndConditions ?? "");
  }, [data]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(
      {
        data: {
          companyName: companyName.trim() || "BCA Entertainment Works",
          companyAddress: companyAddress || null,
          companyGstin: companyGstin || null,
          companyPhone: companyPhone || null,
          companyEmail: companyEmail || null,
          companyWebsite: companyWebsite || null,
          companyLogoUrl,
          proposalFooterNotes: proposalFooterNotes || null,
          proposalTermsAndConditions: proposalTermsAndConditions || null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetAppSettingsQueryKey(),
          });
          toast({ title: "Proposal print template saved" });
        },
        onError: () =>
          toast({
            variant: "destructive",
            title: "Failed to save template",
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5" /> Proposal Print Template
        </CardTitle>
        <CardDescription>
          Company branding, logo, footer note, and Terms &amp; Conditions used on
          all proposal printouts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-name">Company Name *</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  data-testid="input-company-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-gstin">GSTIN</Label>
                <Input
                  id="company-gstin"
                  value={companyGstin}
                  onChange={(e) => setCompanyGstin(e.target.value)}
                  data-testid="input-company-gstin"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-address">Address</Label>
              <Textarea
                id="company-address"
                rows={2}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                data-testid="textarea-company-address"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-phone">Phone</Label>
                <Input
                  id="company-phone"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-email">Email</Label>
                <Input
                  id="company-email"
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company-website">Website</Label>
                <Input
                  id="company-website"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Company Logo</Label>
              <ImageUpload
                value={companyLogoUrl}
                onChange={setCompanyLogoUrl}
                label="Upload Logo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proposal-tc">Terms &amp; Conditions (rich text)</Label>
              <RichTextEditor
                value={proposalTermsAndConditions}
                onChange={setProposalTermsAndConditions}
                placeholder="Standard T&C printed on each proposal. Use bold, lists, links..."
                minRows={6}
                testId="editor-proposal-tc"
              />
              <p className="text-xs text-muted-foreground">
                Supports bold, italic, underline, bulleted/numbered lists and links. HTML is sanitized before saving and rendering.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proposal-footer">Footer Note</Label>
              <Textarea
                id="proposal-footer"
                rows={2}
                value={proposalFooterNotes}
                onChange={(e) => setProposalFooterNotes(e.target.value)}
                placeholder="Shown at the very bottom of each proposal printout."
                data-testid="textarea-proposal-footer"
              />
            </div>

            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-save-template"
            >
              {updateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
