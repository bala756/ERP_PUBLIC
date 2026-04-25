import React from "react";
import { StubPage } from "@/components/StubPage";
import { Package, Layers, Clock, Banknote, FileSpreadsheet, Wrench, CheckSquare } from "lucide-react";

export const Inventory = () => <StubPage title="Inventory" icon={Package} />;
export const BOM = () => <StubPage title="Bill of Materials" icon={Layers} />;
export const Attendance = () => <StubPage title="Attendance" icon={Clock} />;
export const Payroll = () => <StubPage title="Payroll" icon={Banknote} />;
export const GSTInvoices = () => <StubPage title="GST Invoices" icon={FileSpreadsheet} />;
export const ServiceOrders = () => <StubPage title="Service Department" icon={Wrench} />;
export const Approvals = () => <StubPage title="Approvals" icon={CheckSquare} />;
