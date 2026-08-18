import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { AutomationCityBuildingData } from "../../types/automation-city.types";
import { AUTOMATION_STATUS_COLORS, AutomationCityStatusIndicator } from "./AutomationCityStatusIndicator";

interface AutomationCityBuildingProps {
  building: AutomationCityBuildingData;
  icon: ReactNode;
  onSelect: (building: AutomationCityBuildingData, anchor: HTMLElement) => void;
}

const TOWER_HEIGHT = 84;

// Analog zu CityBuilding.tsx, aber mit dem automatisierungsspezifischen
// Status-Farbschema (idle/running/waiting_approval/failed/healthy statt
// healthy/warning/critical) - siehe types/automation-city.types.ts fuer die
// Begruendung, warum dies eine eigene Komponente ist statt CityBuilding
// wiederzuverwenden.
export function AutomationCityBuilding({ building, icon, onSelect }: AutomationCityBuildingProps) {
  const color = AUTOMATION_STATUS_COLORS[building.status];

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
        "&:hover .automation-city-building-tower": {
          borderColor: color,
          boxShadow: `0 0 20px ${color}55`,
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <Box
          className="automation-city-building-tower"
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
          <AutomationCityStatusIndicator status={building.status} />
        </Box>
      </Box>
      <Typography variant="caption" sx={{ maxWidth: 100, textAlign: "center", lineHeight: 1.25 }}>
        {building.name}
      </Typography>
    </ButtonBase>
  );
}
