import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import type { HealthStatus } from "../../types/common.types";
import { healthStatusColors } from "../../theme/statusColors";

interface HealthScoreCardProps {
  status: HealthStatus;
  score: number;
}

// Der globale Score ist der Durchschnitt der einzelnen Projekt-Scores
// (echte Werte aus GET /api/dashboard/projects) - die Summary-API liefert
// selbst keinen globalen Zahlenwert, nur den Status.
export function HealthScoreCard({ status, score }: HealthScoreCardProps) {
  const color = healthStatusColors[status];

  return (
    <Card>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 3, py: 3 }}>
        <Box sx={{ position: "relative", display: "inline-flex" }}>
          <CircularProgress
            variant="determinate"
            value={100}
            size={92}
            thickness={3.5}
            sx={{ color: "rgba(255,255,255,0.08)", position: "absolute" }}
          />
          <CircularProgress
            variant="determinate"
            value={score}
            size={92}
            thickness={3.5}
            sx={{ color }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="h2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {score}
            </Typography>
          </Box>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">
            System Status
          </Typography>
          <Typography variant="h1" sx={{ color, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {status}
          </Typography>
          <Typography variant="body2">Health score across all monitored projects</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
