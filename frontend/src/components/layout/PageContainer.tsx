import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
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

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <Header title={title} realtimeStatus={status} />
      <Box component="main" sx={{ flexGrow: 1, px: 4, pb: 4, minWidth: 0 }}>
        <Toolbar />
        <Box sx={{ pt: 3 }}>{children}</Box>
      </Box>
      <RealtimeSnackbarQueue notifications={notifications} onDismiss={dismissNotification} />
    </Box>
  );
}
