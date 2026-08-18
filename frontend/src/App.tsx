import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LoadingState } from "./components/common/LoadingState";

// Auftragspunkt 13 "Performance Optimierung" (Phase 10): jede Seite ist ein
// eigener Chunk, der erst beim ersten Aufruf der jeweiligen Route geladen
// wird - vorher lagen alle Seiten (inkl. der Recharts/xlsx/jspdf-lastigen
// Analytics-Seiten) in einem einzigen Bundle, das jeder Nutzer beim ersten
// Laden komplett herunterladen musste, auch wenn er nur das Dashboard sieht.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Projects = lazy(() => import("./pages/Projects").then((m) => ({ default: m.Projects })));
const ProjectDetails = lazy(() => import("./pages/ProjectDetails").then((m) => ({ default: m.ProjectDetails })));
const Incidents = lazy(() => import("./pages/Incidents").then((m) => ({ default: m.Incidents })));
const IncidentDetail = lazy(() => import("./pages/IncidentDetail").then((m) => ({ default: m.IncidentDetail })));
const IncidentCommand = lazy(() => import("./pages/IncidentCommand").then((m) => ({ default: m.IncidentCommand })));
const Postmortems = lazy(() => import("./pages/Postmortems").then((m) => ({ default: m.Postmortems })));
const City = lazy(() => import("./pages/City").then((m) => ({ default: m.City })));
const Users = lazy(() => import("./pages/Users").then((m) => ({ default: m.Users })));
const UserDetail = lazy(() => import("./pages/UserDetail").then((m) => ({ default: m.UserDetail })));
const Alerts = lazy(() => import("./pages/Alerts").then((m) => ({ default: m.Alerts })));
const AlertRuleCreate = lazy(() => import("./pages/AlertRuleCreate").then((m) => ({ default: m.AlertRuleCreate })));
const AlertHistory = lazy(() => import("./pages/AlertHistory").then((m) => ({ default: m.AlertHistory })));
const Maintenance = lazy(() => import("./pages/Maintenance").then((m) => ({ default: m.Maintenance })));
const AutomationCenter = lazy(() => import("./pages/AutomationCenter").then((m) => ({ default: m.AutomationCenter })));
const Analytics = lazy(() => import("./pages/Analytics").then((m) => ({ default: m.Analytics })));
const AnalyticsIncidents = lazy(() => import("./pages/AnalyticsIncidents").then((m) => ({ default: m.AnalyticsIncidents })));
const Compare = lazy(() => import("./pages/Compare").then((m) => ({ default: m.Compare })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const SlaReports = lazy(() => import("./pages/SlaReports").then((m) => ({ default: m.SlaReports })));
const AuditCenter = lazy(() => import("./pages/AuditCenter").then((m) => ({ default: m.AuditCenter })));
const BackupCenter = lazy(() => import("./pages/BackupCenter").then((m) => ({ default: m.BackupCenter })));
const DiagnosticsCenter = lazy(() => import("./pages/DiagnosticsCenter").then((m) => ({ default: m.DiagnosticsCenter })));
const ClusterCenter = lazy(() => import("./pages/ClusterCenter").then((m) => ({ default: m.ClusterCenter })));
const AgentLogs = lazy(() => import("./pages/AgentLogs").then((m) => ({ default: m.AgentLogs })));
const PlatformAdministration = lazy(() => import("./pages/PlatformAdministration").then((m) => ({ default: m.PlatformAdministration })));
const ApiAnalytics = lazy(() => import("./pages/ApiAnalytics").then((m) => ({ default: m.ApiAnalytics })));
const DeveloperPortal = lazy(() => import("./pages/DeveloperPortal").then((m) => ({ default: m.DeveloperPortal })));
const SloOverview = lazy(() => import("./pages/SloOverview").then((m) => ({ default: m.SloOverview })));
const SloDetail = lazy(() => import("./pages/SloDetail").then((m) => ({ default: m.SloDetail })));
const ServiceCatalog = lazy(() => import("./pages/ServiceCatalog").then((m) => ({ default: m.ServiceCatalog })));
const ServiceDetail = lazy(() => import("./pages/ServiceDetail").then((m) => ({ default: m.ServiceDetail })));
const ServicePortfolio = lazy(() => import("./pages/ServicePortfolio").then((m) => ({ default: m.ServicePortfolio })));
const Topology = lazy(() => import("./pages/Topology").then((m) => ({ default: m.Topology })));
const OnCall = lazy(() => import("./pages/OnCall").then((m) => ({ default: m.OnCall })));
const Changes = lazy(() => import("./pages/Changes").then((m) => ({ default: m.Changes })));
const ChangeDetail = lazy(() => import("./pages/ChangeDetail").then((m) => ({ default: m.ChangeDetail })));
const Reliability = lazy(() => import("./pages/Reliability").then((m) => ({ default: m.Reliability })));
const Problems = lazy(() => import("./pages/Problems").then((m) => ({ default: m.Problems })));
const ProblemDetail = lazy(() => import("./pages/ProblemDetail").then((m) => ({ default: m.ProblemDetail })));
const Resilience = lazy(() => import("./pages/Resilience").then((m) => ({ default: m.Resilience })));
const AiOperationsOffice = lazy(() => import("./pages/AiOperationsOffice").then((m) => ({ default: m.AiOperationsOffice })));
const ResilienceDetail = lazy(() => import("./pages/ResilienceDetail").then((m) => ({ default: m.ResilienceDetail })));
// Phase 13 Teil 3 "Public Status Page" - eigener Chunk, aber bewusst NICHT
// Teil der /* -ProtectedRoute-Gruppe unten (siehe eigene Route neben
// /login).
const StatusPage = lazy(() => import("./pages/StatusPage").then((m) => ({ default: m.StatusPage })));

function RouteFallback() {
  return <LoadingState label="Loading page..." minHeight={window.innerHeight} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/status"
          element={
            <Suspense fallback={<RouteFallback />}>
              <StatusPage />
            </Suspense>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/projects/:id" element={<ProjectDetails />} />
                  <Route path="/incidents" element={<Incidents />} />
                  <Route path="/incidents/:id" element={<IncidentDetail />} />
                  <Route path="/incident-command/:id" element={<IncidentCommand />} />
                  <Route path="/postmortems" element={<Postmortems />} />
                  <Route path="/city" element={<City />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/users/:id" element={<UserDetail />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/alerts/create" element={<AlertRuleCreate />} />
                  <Route path="/alerts/history" element={<AlertHistory />} />
                  <Route path="/maintenance" element={<Maintenance />} />
                  <Route path="/automation" element={<AutomationCenter />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/analytics/incidents" element={<AnalyticsIncidents />} />
                  <Route path="/analytics/compare" element={<Compare />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/sla-reports" element={<SlaReports />} />
                  <Route path="/audit" element={<AuditCenter />} />
                  <Route path="/backups" element={<BackupCenter />} />
                  <Route path="/diagnostics" element={<DiagnosticsCenter />} />
                  <Route path="/cluster" element={<ClusterCenter />} />
                  <Route path="/agent-logs" element={<AgentLogs />} />
                  <Route path="/platform" element={<PlatformAdministration />} />
                  <Route path="/platform/api-analytics" element={<ApiAnalytics />} />
                  <Route path="/platform/developer" element={<DeveloperPortal />} />
                  <Route path="/platform/slo" element={<SloOverview />} />
                  <Route path="/platform/slo/:id" element={<SloDetail />} />
                  <Route path="/platform/services" element={<ServiceCatalog />} />
                  <Route path="/platform/services/portfolio" element={<ServicePortfolio />} />
                  <Route path="/platform/services/:id" element={<ServiceDetail />} />
                  <Route path="/platform/topology" element={<Topology />} />
                  <Route path="/platform/on-call" element={<OnCall />} />
                  <Route path="/changes" element={<Changes />} />
                  <Route path="/changes/:id" element={<ChangeDetail />} />
                  <Route path="/reliability" element={<Reliability />} />
                  <Route path="/problems" element={<Problems />} />
                  <Route path="/problems/:id" element={<ProblemDetail />} />
                  <Route path="/resilience" element={<Resilience />} />
                  <Route path="/resilience/:projectId" element={<ResilienceDetail />} />
                  <Route path="/ai-office" element={<AiOperationsOffice />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
