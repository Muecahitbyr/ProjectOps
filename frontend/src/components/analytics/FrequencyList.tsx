import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { EmptyState } from "../common/EmptyState";
import type { FrequencyEntry } from "../../types/analytics.types";

interface FrequencyListProps {
  entries: FrequencyEntry[];
  emptyMessage: string;
}

// Wird fuer "haeufigste Fehlerarten" und "haeufigste Incident-Ursachen"
// verwendet - ein horizontaler Balken pro Eintrag, Breite relativ zum
// haeufigsten Eintrag (kein separates Chart noetig fuer eine Top-10-Liste).
export function FrequencyList({ entries, emptyMessage }: FrequencyListProps) {
  if (entries.length === 0) {
    return <EmptyState message={emptyMessage} minHeight={120} />;
  }

  const maxCount = Math.max(...entries.map((entry) => entry.count));

  return (
    <Stack sx={{ gap: 1.25 }}>
      {entries.map((entry) => (
        <Box key={entry.key}>
          <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.25 }}>
            <Typography variant="body2">{entry.label}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {entry.count}
            </Typography>
          </Stack>
          <Box sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}>
            <Box
              sx={{
                height: "100%",
                width: `${maxCount === 0 ? 0 : (entry.count / maxCount) * 100}%`,
                bgcolor: "primary.main",
                borderRadius: 3,
              }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
