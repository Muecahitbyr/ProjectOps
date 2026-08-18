import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CityStatusIndicator } from "./CityStatusIndicator";
import { healthStatusLabels } from "../../theme/statusColors";
import type { HealthStatus } from "../../types/common.types";

const STATUSES: HealthStatus[] = ["healthy", "warning", "critical"];

export function CityLegend() {
  return (
    <Stack direction="row" sx={{ gap: 3, px: 2, py: 1.25 }}>
      {STATUSES.map((status) => (
        <Stack key={status} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CityStatusIndicator status={status} size={8} />
          <Typography variant="caption" color="text.secondary">
            {healthStatusLabels[status]}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
