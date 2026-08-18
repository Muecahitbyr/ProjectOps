import { createTheme } from "@mui/material/styles";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Dunkles Monitoring-Theme: sehr dunkler Hintergrund, leicht hellere Karten
// fuer Hierarchie, dezente Signalfarben statt kraeftiger Flaechen.
export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0a0e14",
      paper: "#12161f",
    },
    primary: {
      main: "#3b82f6",
    },
    success: { main: "#22c55e" },
    warning: { main: "#f59e0b" },
    error: { main: "#ef4444" },
    info: { main: "#60a5fa" },
    divider: "rgba(255,255,255,0.08)",
    text: {
      primary: "#e6e8eb",
      secondary: "#8b95a5",
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: FONT_STACK,
    h1: { fontSize: "1.75rem", fontWeight: 600 },
    h2: { fontSize: "1.5rem", fontWeight: 600 },
    h3: { fontSize: "1.25rem", fontWeight: 600 },
    h4: { fontSize: "1.1rem", fontWeight: 600 },
    body2: { color: "#8b95a5" },
    overline: { letterSpacing: "0.08em", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#2a3142 #12161f",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(255,255,255,0.06)",
          backgroundColor: "#12161f",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#0d1119",
          backgroundImage: "none",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#0d1119",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: "rgba(255,255,255,0.06)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});
