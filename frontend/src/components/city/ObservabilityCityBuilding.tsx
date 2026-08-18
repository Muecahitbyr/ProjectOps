import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { ObservabilityCityBuildingData } from "../../types/observability-city.types";
import { OBSERVABILITY_STATUS_COLORS, ObservabilityCityStatusIndicator } from "./ObservabilityCityStatusIndicator";

interface ObservabilityCityBuildingProps {
  building: ObservabilityCityBuildingData;
  icon: ReactNode;
  onSelect: (building: ObservabilityCityBuildingData, anchor: HTMLElement) => void;
}

const TOWER_HEIGHT = 84;

// Analog zu AutomationCityBuilding.tsx, mit dem Observability-Status-
// Farbschema (idle/active/alert/healthy statt idle/running/
// waiting_approval/failed/healthy).
export function ObservabilityCityBuilding({ building, icon, onSelect }: ObservabilityCityBuildingProps) {
  const color = OBSERVABILITY_STATUS_COLORS[building.status];

  return (
    <ButtonBase
      onClick={(event) => onSelect(building, event.currentTarget)}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        borderRadius: 2,
        p: 1,
        "&:hover .observability-city-building-tower": {
          borderColor: color,
          boxShadow: `0 0 20px ${color}55`,
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <Box
          className="observability-city-building-tower"
          sx={{
            width: 84,
            height: TOWER_HEIGHT,
            borderRadius: "6px 6px 2px 2px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: `linear-gradient(180deg, ${color}26 0%, rgba(18,22,31,0.92) 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            opacity: building.status === "idle" ? 0.6 : 1,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ position: "absolute", top: 6, right: 6 }}>
          <ObservabilityCityStatusIndicator status={building.status} />
        </Box>
      </Box>
      <Typography variant="caption" sx={{ maxWidth: 100, textAlign: "center", lineHeight: 1.25 }}>
        {building.name}
      </Typography>
    </ButtonBase>
  );
}
