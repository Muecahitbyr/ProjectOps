import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LoadingState } from "./components/common/LoadingState";

// Auf Nutzerwunsch radikal reduziert: die App zeigt ausschliesslich das
// KI-Buero (AI Operations Office) plus Settings - alle anderen, in frueheren
// Phasen gebauten Seiten (Dashboard, Projects, Incidents, Analytics, SLA
// Reports, Platform-Admin-Bereiche, ...) bleiben als Quellcode vollstaendig
// erhalten (siehe Git-Historie), sind aber bewusst nicht mehr verlinkt/
// geroutet, um die Oberflaeche auf genau das gewuenschte "nur meine 3D-
// animierten Menschen sehen" zu reduzieren.
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const AiOperationsOffice = lazy(() => import("./pages/AiOperationsOffice").then((m) => ({ default: m.AiOperationsOffice })));
// Phase 13 Teil 3 "Public Status Page" - eigener Chunk, aber bewusst NICHT
// Teil der /* -ProtectedRoute-Gruppe unten (siehe eigene Route neben
// /login). Unveraendert, da oeffentlich und nicht Teil der internen Navigation.
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
                  <Route path="/" element={<Navigate to="/ai-office" replace />} />
                  <Route path="/ai-office" element={<AiOperationsOffice />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/ai-office" replace />} />
                </Routes>
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
