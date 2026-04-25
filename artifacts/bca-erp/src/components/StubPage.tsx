import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StubPageProps {
  title: string;
  icon: LucideIcon;
  description?: string;
}

export function StubPage({ title, icon: Icon, description = "This module is currently under development." }: StubPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">{title}</h1>
      <p className="text-muted-foreground max-w-md">
        {description}
      </p>
      
      <Card className="mt-8 border-dashed bg-muted/50 max-w-sm w-full">
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Status</span>
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-background">
              Coming Soon
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
