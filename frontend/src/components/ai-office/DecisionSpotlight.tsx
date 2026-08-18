import { memo } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { EmptyState } from "../common/EmptyState";
import { severityColors } from "../../theme/statusColors";
import type { AttentionItem } from "../../types/attention.types";

interface DecisionSpotlightProps {
  items: AttentionItem[];
}

// Zeigt die bereits vom Backend (Phase 64, Attention List) nach Dringlichkeit
// sortierten Top-Eintraege samt ihrer bereits vorhandenen recommendedAction -
// keine zweite, frontend-seitige Empfehlungslogik.
export const DecisionSpotlight = memo(function DecisionSpotlight({ items }: DecisionSpotlightProps) {
  const top = items.slice(0, 5);
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
          <AutoAwesomeOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="h4">Decision Spotlight</Typography>
        </Stack>
        {top.length === 0 ? (
          <EmptyState message="No active recommendations right now." minHeight={100} />
        ) : (
          <Stack spacing={1.5} divider={<Stack sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
            {top.map((item) => (
              <Stack key={`${item.kind}-${item.entityId}-${item.title}`} spacing={0.5}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 600 }}>
                    {item.title}
                  </Typography>
                  <Chip size="small" label={item.tier} sx={{ backgroundColor: `${severityColors[item.tier]}1f`, color: severityColors[item.tier], fontWeight: 600, height: 20, fontSize: "0.7rem" }} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {item.recommendedAction}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
});
