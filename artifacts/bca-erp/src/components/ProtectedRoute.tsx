import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect, useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!isAuthenticated && location !== "/login") {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}
