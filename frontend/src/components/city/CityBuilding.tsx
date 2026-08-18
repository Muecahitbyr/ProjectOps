import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import type { CityBuilding as CityBuildingData } from "../../types/city.types";
import { healthStatusColors } from "../../theme/statusColors";
import { CityStatusIndicator } from "./CityStatusIndicator";

interface CityBuildingProps {
  building: CityBuildingData;
  icon: ReactNode;
  onSelect: (building: CityBuildingData, anchor: HTMLElement) => void;
}

const MIN_TOWER_HEIGHT = 56;
const MAX_TOWER_HEIGHT = 116;

// Die Turmhoehe skaliert dezent mit dem Health-Score - je gesuender, desto
// hoeher wirkt das Gebaeude. Rein visuell, keine zusaetzliche Datenquelle.
function heightForScore(score: number): number {
  return MIN_TOWER_HEIGHT + (MAX_TOWER_HEIGHT - MIN_TOWER_HEIGHT) * (score / 100);
}

export function CityBuilding({ building, icon, onSelect }: CityBuildingProps) {
  const color = healthStatusColors[building.status];

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
        "&:hover .city-building-tower": {
          borderColor: color,
          boxShadow: `0 0 20px ${color}55`,
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <Box
          className="city-building-tower"
          sx={{
            width: 84,
            height: heightForScore(building.healthScore),
            borderRadius: "6px 6px 2px 2px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: `linear-gradient(180deg, ${color}26 0%, rgba(18,22,31,0.92) 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
          }}
        >
          {icon}
        </Box>
        <Box sx={{ position: "absolute", top: 6, right: 6 }}>
          <CityStatusIndicator status={building.status} />
        </Box>
      </Box>
      <Typography variant="caption" sx={{ maxWidth: 100, textAlign: "center", lineHeight: 1.25 }}>
        {building.name}
      </Typography>
    </ButtonBase>
  );
}
