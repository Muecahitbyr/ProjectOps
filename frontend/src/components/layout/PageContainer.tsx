import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import { useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useRealtime } from "../../hooks/useRealtime";
import { RealtimeSnackbarQueue } from "../realtime/RealtimeSnackbarQueue";

interface PageContainerProps {
  title: string;
  children: ReactNode;
}

// Gemeinsamer Rahmen fuer alle Seiten: Sidebar + Header + gepolsterter
// Content-Bereich. Jede Seite rendert nur ihren eigentlichen Inhalt.
//
// useRealtime() wird bewusst hier zentral aufgerufen (nicht auf jeder Seite
// einzeln) - dadurch bekommen alle Seiten inkl. Mini City dieselbe
// Realtime-Synchronisation (React-Query-Cache-Updates) und denselben
// Verbindungsstatus/Snackbar-Kanal, ueber eine einzige WebSocket-Verbindung.
export function PageContainer({ title, children }: PageContainerProps) {
  const { status, notifications, dismissNotification } = useRealtime();
  // Steuert die mobile Overlay-Sidebar (siehe Sidebar.tsx) - lebt hier, weil
  // sowohl Header (Hamburger-Icon zum Oeffnen) als auch Sidebar (Icon-Klick/
  // Backdrop zum Schliessen) darauf zugreifen muessen.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <Header title={title} realtimeStatus={status} onMenuClick={() => setMobileNavOpen((open) => !open)} />
      <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, sm: 3, md: 4 }, pb: 4, minWidth: 0 }}>
        <Toolbar />
        <Box sx={{ pt: 3 }}>{children}</Box>
      </Box>
      <RealtimeSnackbarQueue notifications={notifications} onDismiss={dismissNotification} />
    </Box>
  );
}
