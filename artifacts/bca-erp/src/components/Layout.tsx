import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useGetPendingMyApproval } from "@workspace/api-client-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Users2,
  UserCircle,
  FileText,
  Briefcase,
  ShoppingCart,
  Ship,
  Package,
  Layers,
  Clock,
  CalendarDays,
  Banknote,
  FileSpreadsheet,
  FileCheck,
  Wallet,
  BarChart2,
  Wrench,
  CheckSquare,
  Settings,
  Route,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Role = string;

const SECTIONS = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["director", "cfo", "manager", "accounts", "purchase", "sales", "stores", "production", "service", "admin"] },
    ],
  },
  {
    title: "CRM",
    items: [
      { title: "Leads", url: "/leads", icon: Users2, roles: ["sales", "manager", "director", "admin"] },
      { title: "Proposals", url: "/proposals", icon: FileText, roles: ["sales", "manager", "director", "admin"] },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Work Orders", url: "/work-orders", icon: Briefcase, roles: ["purchase", "manager", "director", "admin", "production"] },
      { title: "Purchase Orders", url: "/purchase-orders", icon: ShoppingCart, roles: ["purchase", "manager", "director", "admin"] },
      { title: "Imports & Landed Cost", url: "/imports", icon: Ship, roles: ["purchase", "manager", "director", "admin", "cfo", "accounts", "stores"] },
    ],
  },
  {
    title: "Inventory",
    items: [
      { title: "Inventory", url: "/inventory", icon: Package, roles: ["stores", "manager", "director", "admin"] },
      { title: "BOM", url: "/bom", icon: Layers, roles: ["stores", "manager", "director", "admin", "production"] },
    ],
  },
  {
    title: "HR",
    items: [
      { title: "Employees", url: "/employees", icon: UserCircle, roles: ["manager", "director", "admin", "accounts", "cfo", "staff", "sales", "purchase", "production", "service", "stores"] },
      { title: "Attendance", url: "/attendance", icon: Clock, roles: ["manager", "director", "admin", "accounts", "cfo", "staff", "sales", "purchase", "production", "service", "stores"] },
      { title: "Leave", url: "/leave-requests", icon: CalendarDays, roles: ["manager", "director", "admin", "accounts", "cfo", "staff", "sales", "purchase", "production", "service", "stores"] },
      { title: "Payroll", url: "/payroll", icon: Banknote, roles: ["director", "admin", "accounts", "cfo"] },
    ],
  },
  {
    title: "Finance",
    items: [
      { title: "GST Invoices", url: "/gst-invoices", icon: FileSpreadsheet, roles: ["accounts", "cfo", "director", "admin"] },
      { title: "Supplier Bills", url: "/supplier-bills", icon: FileCheck, roles: ["accounts", "cfo", "director", "admin", "purchase"] },
      { title: "Expenses", url: "/expenses", icon: Wallet, roles: ["accounts", "cfo", "director", "admin"] },
      { title: "Finance Reports", url: "/gst-summary", icon: BarChart2, roles: ["accounts", "cfo", "director", "admin"] },
    ],
  },
  {
    title: "Service",
    items: [
      { title: "Service Orders", url: "/service-orders", icon: Wrench, roles: ["service", "manager", "director", "admin"] },
    ],
  },
  {
    title: "Approvals",
    items: [
      { title: "Approvals", url: "/approvals", icon: CheckSquare, roles: ["manager", "cfo", "director", "admin", "accounts", "purchase"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Users", url: "/users", icon: Users, roles: ["admin", "director"] },
      { title: "Lead Routing", url: "/admin/lead-routing", icon: Route, roles: ["admin", "director", "cfo"] },
      { title: "Settings", url: "/settings", icon: Settings, roles: ["director", "cfo", "manager", "accounts", "purchase", "sales", "stores", "production", "service", "admin"] },
    ],
  },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: pendingPOs = [] } = useGetPendingMyApproval();
  const pendingCount = pendingPOs.length;

  if (!user) return null;

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2 font-bold text-lg">
          <div className="h-8 w-8 bg-primary rounded flex items-center justify-center text-primary-foreground">
            BCA
          </div>
          <span>Entertainment Works</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) =>
            item.roles.includes(user.role)
          );

          if (visibleItems.length === 0) return null;

          return (
            <SidebarGroup key={section.title}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url || location.startsWith(item.url + "/")}
                      >
                        <Link href={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {item.url === "/purchase-orders" && pendingCount > 0 && (
                            <Badge className="ml-auto h-5 px-1.5 text-xs bg-orange-500 text-white border-0">
                              {pendingCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-4">
          <Avatar>
            <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user.name}</span>
            <Badge variant="secondary" className="w-fit text-xs px-1 py-0">{user.role}</Badge>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start text-destructive" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/20">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center px-4 bg-background z-10 sticky top-0">
            <SidebarTrigger />
          </header>
          <div className="p-6 flex-1 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
