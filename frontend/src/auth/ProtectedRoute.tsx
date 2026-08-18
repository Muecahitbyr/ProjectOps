import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "./AuthContext";

// Auftragspunkt 12 "Frontend Security" - kapselt alle Seiten in App.tsx;
// leitet unauthentifizierte Aufrufe auf /login um und merkt sich die
// urspruenglich angeforderte Route (state.from), damit Login danach dorthin
// zurueckleiten kann statt immer auf das Dashboard.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
