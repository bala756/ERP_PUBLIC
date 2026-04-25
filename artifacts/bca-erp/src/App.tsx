import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Users from "@/pages/Users";
import UserProfile from "@/pages/UserProfile";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import Leads from "@/pages/Leads";
import Proposals from "@/pages/Proposals";
import ProposalPrint from "@/pages/ProposalPrint";
import WorkOrders from "@/pages/WorkOrders";
import WorkOrderDetail from "@/pages/WorkOrderDetail";
import PurchaseOrders from "@/pages/PurchaseOrders";
import Inventory from "@/pages/Inventory";
import InventoryLedger from "@/pages/InventoryLedger";
import BOM from "@/pages/BOM";
import EmployeeDirectory from "@/pages/EmployeeDirectory";
import EmployeeProfile from "@/pages/EmployeeProfile";
import AttendancePage from "@/pages/AttendancePage";
import LeaveManagement from "@/pages/LeaveManagement";
import PayrollPage from "@/pages/PayrollPage";
import GSTInvoices from "@/pages/GSTInvoices";
import SupplierBills from "@/pages/SupplierBills";
import ExpensesPage from "@/pages/Expenses";
import GSTSummaryPage from "@/pages/GSTSummary";
import {
  ServiceOrders,
  Approvals,
} from "@/pages/Stubs";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      {/* Protected Routes */}
      <Route path="/">
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Layout>
            <Dashboard />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute>
          <Layout>
            <Users />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/users/:id">
        <ProtectedRoute>
          <Layout>
            <UserProfile />
          </Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Layout>
            <Settings />
          </Layout>
        </ProtectedRoute>
      </Route>
      
      {/* Stubs */}
      <Route path="/leads"><ProtectedRoute><Layout><Leads /></Layout></ProtectedRoute></Route>
      <Route path="/proposals"><ProtectedRoute><Layout><Proposals /></Layout></ProtectedRoute></Route>
      <Route path="/proposals/:id/print"><ProtectedRoute><ProposalPrint /></ProtectedRoute></Route>
      <Route path="/work-orders"><ProtectedRoute><Layout><WorkOrders /></Layout></ProtectedRoute></Route>
      <Route path="/work-orders/:id"><ProtectedRoute><Layout><WorkOrderDetail /></Layout></ProtectedRoute></Route>
      <Route path="/purchase-orders"><ProtectedRoute><Layout><PurchaseOrders /></Layout></ProtectedRoute></Route>
      <Route path="/inventory"><ProtectedRoute><Layout><Inventory /></Layout></ProtectedRoute></Route>
      <Route path="/inventory/:id/ledger"><ProtectedRoute><Layout><InventoryLedger /></Layout></ProtectedRoute></Route>
      <Route path="/bom"><ProtectedRoute><Layout><BOM /></Layout></ProtectedRoute></Route>
      <Route path="/employees"><ProtectedRoute><Layout><EmployeeDirectory /></Layout></ProtectedRoute></Route>
      <Route path="/employees/:id"><ProtectedRoute><Layout><EmployeeProfile /></Layout></ProtectedRoute></Route>
      <Route path="/attendance"><ProtectedRoute><Layout><AttendancePage /></Layout></ProtectedRoute></Route>
      <Route path="/leave-requests"><ProtectedRoute><Layout><LeaveManagement /></Layout></ProtectedRoute></Route>
      <Route path="/payroll"><ProtectedRoute><Layout><PayrollPage /></Layout></ProtectedRoute></Route>
      <Route path="/gst-invoices"><ProtectedRoute><Layout><GSTInvoices /></Layout></ProtectedRoute></Route>
      <Route path="/supplier-bills"><ProtectedRoute><Layout><SupplierBills /></Layout></ProtectedRoute></Route>
      <Route path="/expenses"><ProtectedRoute><Layout><ExpensesPage /></Layout></ProtectedRoute></Route>
      <Route path="/gst-summary"><ProtectedRoute><Layout><GSTSummaryPage /></Layout></ProtectedRoute></Route>
      <Route path="/service-orders"><ProtectedRoute><Layout><ServiceOrders /></Layout></ProtectedRoute></Route>
      <Route path="/approvals"><ProtectedRoute><Layout><Approvals /></Layout></ProtectedRoute></Route>

      <Route>
        <ProtectedRoute>
          <Layout>
            <NotFound />
          </Layout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
