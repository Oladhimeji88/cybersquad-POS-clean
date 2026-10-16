import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import AdminApp from "./admin/AdminApp";
import UnifiedLoginPage from "./auth/UnifiedLoginPage";
import { ResetPasswordPage } from "./components/ResetPassword";
import FrontdeskProtectedRoute from "./frontdesk/FrontdeskProtectedRoute";
import Dashboard from "./frontdesk/pages/Dashboard";
import WalkIn from "./frontdesk/pages/WalkIn";
import NewTicket from "./frontdesk/pages/NewTicket";
import DraftTickets from "./frontdesk/pages/DraftTickets";
import SelfService from "./frontdesk/pages/SelfService";
import CustomerRecords from "./frontdesk/pages/CustomerRecords";
import TicketDetail from "./frontdesk/pages/TicketDetail";
import Receipt from "./frontdesk/pages/Receipt";
import EngineerDesk from "./frontdesk/pages/EngineerDesk";
import TechnicianQAReviews from "./frontdesk/pages/TechnicianQAReviews";
import TechnicianDoneJobs from "./frontdesk/pages/TechnicianDoneJobs";
import QADesk from "./frontdesk/pages/QADesk";
import Inventory from "./frontdesk/pages/Inventory";
import DeviceCategoriesPage from "./frontdesk/pages/DeviceCategoriesPage";
import PosTerminal from "./pos/pages/PosTerminal";
import OperationsWorkspace from "./operations/OperationsWorkspace";
import "./frontdesk/styles/frontdesk.css";

function ResetPasswordRoute() {
  const navigate = useNavigate();

  return (
    <ResetPasswordPage
      onResetComplete={() => navigate("/admin", { replace: true })}
    />
  );
}

export default function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UnifiedLoginPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordRoute />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route
            path="/dashboard"
            element={
              <FrontdeskProtectedRoute>
                <Dashboard />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/walk-in"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk"]}>
                <WalkIn />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/new-ticket"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk"]}>
                <NewTicket />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/drafts"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk"]}>
                <DraftTickets />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/self-service"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk"]}>
                <SelfService />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <FrontdeskProtectedRoute>
                <CustomerRecords />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/ticket/:id"
            element={
              <FrontdeskProtectedRoute>
                <TicketDetail />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/ticket/:id/receipt"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk"]}>
                <Receipt />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/engineer"
            element={
              <FrontdeskProtectedRoute allowedRoles={["engineer"]}>
                <EngineerDesk />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/engineer/qa-reviews"
            element={
              <FrontdeskProtectedRoute allowedRoles={["engineer"]}>
                <TechnicianQAReviews />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/engineer/done-jobs"
            element={
              <FrontdeskProtectedRoute allowedRoles={["engineer"]}>
                <TechnicianDoneJobs />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/qa"
            element={
              <FrontdeskProtectedRoute allowedRoles={["qa"]}>
                <QADesk />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <FrontdeskProtectedRoute allowedRoles={["engineer", "inventory_manager"]}>
                <Inventory />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/device-categories"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk", "qa", "inventory_manager"]}>
                <DeviceCategoriesPage />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <FrontdeskProtectedRoute allowedRoles={["sales", "admin"]}>
                <PosTerminal />
              </FrontdeskProtectedRoute>
            }
          />
          <Route
            path="/operations"
            element={
              <FrontdeskProtectedRoute allowedRoles={["front_desk", "sales", "admin", "inventory_manager", "procurement", "logistics", "finance", "cx", "marketing", "operations"]}>
                <OperationsWorkspace />
              </FrontdeskProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-left" richColors />
    </>
  );
}
