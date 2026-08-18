import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { ReactNode } from "react";

interface StatsCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  accentColor?: string;
}

// Generische Kennzahl-Karte (Projects/Checks/Online/Open Incidents/...) -
// wiederverwendbar statt fuer jede Kennzahl eine eigene Komponente zu bauen.
export function StatsCard({ label, value, icon, accentColor }: StatsCardProps) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="overline" color="text.secondary">
            {label}
          </Typography>
          {icon ? (
            <Box sx={{ color: accentColor ?? "text.secondary", display: "flex" }}>{icon}</Box>
          ) : null}
        </Box>
        <Typography
          variant="h1"
          sx={{ mt: 0.5, color: accentColor ?? "text.primary", fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
