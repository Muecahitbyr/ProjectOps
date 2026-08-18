import { useState } from "react";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Popover from "@mui/material/Popover";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import RouterOutlinedIcon from "@mui/icons-material/RouterOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import HealingOutlinedIcon from "@mui/icons-material/HealingOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import BackupOutlinedIcon from "@mui/icons-material/BackupOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import SensorsOutlinedIcon from "@mui/icons-material/SensorsOutlined";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import DeviceHubOutlinedIcon from "@mui/icons-material/DeviceHubOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import SettingsInputAntennaOutlinedIcon from "@mui/icons-material/SettingsInputAntennaOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import SyncProblemOutlinedIcon from "@mui/icons-material/SyncProblemOutlined";
import CorporateFareOutlinedIcon from "@mui/icons-material/CorporateFareOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import ApiOutlinedIcon from "@mui/icons-material/ApiOutlined";
import WebhookOutlinedIcon from "@mui/icons-material/WebhookOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import VpnKeyOutlinedIcon from "@mui/icons-material/VpnKeyOutlined";
import { useNavigate } from "react-router-dom";
import { useCity } from "../../hooks/useCity";
import { useAutomationCity } from "../../hooks/useAutomationCity";
import { useObservabilityCity } from "../../hooks/useObservabilityCity";
import { useClusterCity } from "../../hooks/useClusterCity";
import { useEnterpriseCity } from "../../hooks/useEnterpriseCity";
import { CityBuilding } from "./CityBuilding";
import { AutomationCityBuilding } from "./AutomationCityBuilding";
import { AUTOMATION_STATUS_COLORS, AUTOMATION_STATUS_LABELS } from "./AutomationCityStatusIndicator";
import { ObservabilityCityBuilding } from "./ObservabilityCityBuilding";
import { OBSERVABILITY_STATUS_COLORS, OBSERVABILITY_STATUS_LABELS } from "./ObservabilityCityStatusIndicator";
import { CityRoad } from "./CityRoad";
import { CityLegend } from "./CityLegend";
import { StatusBadge } from "../common/StatusBadge";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";
import { healthStatusColors } from "../../theme/statusColors";
import type { CityBuilding as CityBuildingData, CityBuildingType } from "../../types/city.types";
import type { AutomationCityBuildingData, AutomationBuildingType } from "../../types/automation-city.types";
import type { ObservabilityCityBuildingData, ObservabilityBuildingType } from "../../types/observability-city.types";

const BUILDING_ICONS: Record<CityBuildingType, ReactNode> = {
  "app-tower": <ApartmentOutlinedIcon />,
  website: <LanguageOutlinedIcon />,
  "database-center": <StorageOutlinedIcon />,
  "api-gateway": <RouterOutlinedIcon />,
  "ai-center": <AutoAwesomeOutlinedIcon />,
  "notification-center": <NotificationsActiveOutlinedIcon />,
};

const AUTOMATION_BUILDING_ICONS: Record<AutomationBuildingType, ReactNode> = {
  "automation-center": <SmartToyOutlinedIcon />,
  "self-healing-unit": <HealingOutlinedIcon />,
  "approval-office": <FactCheckOutlinedIcon />,
  "robot-factory": <PrecisionManufacturingOutlinedIcon />,
};

const OBSERVABILITY_BUILDING_ICONS: Record<ObservabilityBuildingType, ReactNode> = {
  "monitoring-hq": <HubOutlinedIcon />,
  "regional-agents": <PublicOutlinedIcon />,
  "backup-center": <BackupOutlinedIcon />,
  "audit-center": <ChecklistOutlinedIcon />,
  "status-center": <SensorsOutlinedIcon />,
  "prediction-lab": <ScienceOutlinedIcon />,
  "primary-node": <DnsOutlinedIcon />,
  "remote-agents-hub": <DeviceHubOutlinedIcon />,
  scheduler: <ScheduleOutlinedIcon />,
  "cluster-controller": <SettingsInputAntennaOutlinedIcon />,
  "update-center": <SystemUpdateAltOutlinedIcon />,
  "failover-center": <SyncProblemOutlinedIcon />,
  "organizations-hall": <CorporateFareOutlinedIcon />,
  "teams-hub": <GroupsOutlinedIcon />,
  "api-gateway-tower": <ApiOutlinedIcon />,
  "webhook-center": <WebhookOutlinedIcon />,
  "platform-admin-tower": <AdminPanelSettingsOutlinedIcon />,
  "service-accounts-vault": <VpnKeyOutlinedIcon />,
};

const OBSERVABILITY_BUILDING_ROUTES: Record<ObservabilityBuildingType, string> = {
  "monitoring-hq": "/diagnostics",
  "regional-agents": "/diagnostics",
  "backup-center": "/backups",
  "audit-center": "/audit",
  "status-center": "/status",
  "prediction-lab": "/analytics",
  "primary-node": "/cluster",
  "remote-agents-hub": "/cluster",
  scheduler: "/cluster",
  "cluster-controller": "/cluster",
  "update-center": "/cluster",
  "failover-center": "/cluster",
  "organizations-hall": "/platform",
  "teams-hub": "/platform",
  "api-gateway-tower": "/platform",
  "webhook-center": "/platform",
  "platform-admin-tower": "/platform",
  "service-accounts-vault": "/platform",
};

const OBSERVABILITY_BUILDING_LABELS: Record<ObservabilityBuildingType, string> = {
  "monitoring-hq": "Diagnostics",
  "regional-agents": "Diagnostics",
  "backup-center": "Backup Center",
  "audit-center": "Audit Center",
  "status-center": "Status Page",
  "prediction-lab": "Analytics",
  "primary-node": "Cluster",
  "remote-agents-hub": "Cluster",
  scheduler: "Cluster",
  "cluster-controller": "Cluster",
  "update-center": "Cluster",
  "failover-center": "Cluster",
  "organizations-hall": "Platform Administration",
  "teams-hub": "Platform Administration",
  "api-gateway-tower": "Platform Administration",
  "webhook-center": "Platform Administration",
  "platform-admin-tower": "Platform Administration",
  "service-accounts-vault": "Platform Administration",
};

interface District {
  title: string;
  buildings: CityBuildingData[];
}

function groupIntoDistricts(buildings: CityBuildingData[]): District[] {
  const projectBuildings = buildings.filter((building) => building.linkedProjectId !== null);
  const infrastructureBuildings = buildings.filter((building) => building.linkedProjectId === null);

  const districts: District[] = [];
  if (projectBuildings.length > 0) {
    districts.push({ title: "Application District", buildings: projectBuildings });
  }
  if (infrastructureBuildings.length > 0) {
    districts.push({ title: "Infrastructure District", buildings: infrastructureBuildings });
  }
  return districts;
}

export function CityView() {
  const { buildings, isLoading, isError, refetch } = useCity();
  // Teil 8 "Mini City" - eigene, additive Datenquelle (siehe useAutomationCity.ts).
  // Ein Fehler/Ladezustand hier blockiert bewusst nicht die bestehende
  // City-Ansicht (isLoading/isError unten pruefen ausschliesslich useCity()).
  const automationCity = useAutomationCity();
  // Teil 12 "Mini City Erweiterung" - eigene, additive Datenquelle
  // (Monitoring Agents/Backups/Audit/Status Page/Forecast), analog zu
  // useAutomationCity() oben; ein Fehler/Ladezustand blockiert auch hier
  // bewusst nicht die bestehende City-Ansicht.
  const observabilityCity = useObservabilityCity();
  // Phase 14 Teil 12 "Mini City Erweiterung" (Cluster District) - dieselbe
  // Begruendung wie observabilityCity oben. Nutzt bewusst dieselbe
  // Popover-Auswahl (selectedObservability/handleSelectObservability)
  // weiter unten, da ObservabilityCityBuildingData wiederverwendet wird
  // (siehe types/observability-city.types.ts) statt eines weiteren
  // parallelen Typs/einer weiteren parallelen Popover-Instanz.
  const clusterCity = useClusterCity();
  // Phase 15 Teil 12 "Mini City Erweiterung" (Enterprise District) - dieselbe
  // Begruendung wie clusterCity oben: additive Datenquelle, nutzt bewusst
  // dieselbe Popover-Auswahl (selectedObservability/handleSelectObservability)
  // weiter unten statt eines weiteren parallelen Typs/einer weiteren
  // parallelen Popover-Instanz.
  const enterpriseCity = useEnterpriseCity();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<CityBuildingData | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedAutomation, setSelectedAutomation] = useState<AutomationCityBuildingData | null>(null);
  const [automationAnchorEl, setAutomationAnchorEl] = useState<HTMLElement | null>(null);
  const [selectedObservability, setSelectedObservability] = useState<ObservabilityCityBuildingData | null>(null);
  const [observabilityAnchorEl, setObservabilityAnchorEl] = useState<HTMLElement | null>(null);

  const handleSelect = (building: CityBuildingData, anchor: HTMLElement): void => {
    setSelected(building);
    setAnchorEl(anchor);
  };

  const handleClose = (): void => {
    setAnchorEl(null);
    setSelected(null);
  };

  const handleSelectAutomation = (building: AutomationCityBuildingData, anchor: HTMLElement): void => {
    setSelectedAutomation(building);
    setAutomationAnchorEl(anchor);
  };

  const handleCloseAutomation = (): void => {
    setAutomationAnchorEl(null);
    setSelectedAutomation(null);
  };

  const handleSelectObservability = (building: ObservabilityCityBuildingData, anchor: HTMLElement): void => {
    setSelectedObservability(building);
    setObservabilityAnchorEl(anchor);
  };

  const handleCloseObservability = (): void => {
    setObservabilityAnchorEl(null);
    setSelectedObservability(null);
  };

  if (isLoading) {
    return <LoadingState label="Building the city..." minHeight={480} />;
  }

  if (isError) {
    return <ErrorState message="Could not load city data." onRetry={refetch} minHeight={480} />;
  }

  if (buildings.length === 0) {
    return <EmptyState message="No monitored projects yet." minHeight={480} />;
  }

  const districts = groupIntoDistricts(buildings);

  return (
    <Box>
      <Box
        sx={{
          position: "relative",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        <CityRoad />
        <Box sx={{ position: "relative", p: { xs: 2, md: 4 } }}>
          <Stack sx={{ gap: 5 }}>
            {districts.map((district) => (
              <Box key={district.title}>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  {district.title}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: { xs: 3, md: 5 },
                    alignItems: "flex-end",
                  }}
                >
                  {district.buildings.map((building) => (
                    <CityBuilding
                      key={building.id}
                      building={building}
                      icon={BUILDING_ICONS[building.type]}
                      onSelect={handleSelect}
                    />
                  ))}
                </Box>
              </Box>
            ))}
            {automationCity.buildings.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Automation District
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 3, md: 5 }, alignItems: "flex-end" }}>
                  {automationCity.buildings.map((building) => (
                    <AutomationCityBuilding
                      key={building.id}
                      building={building}
                      icon={AUTOMATION_BUILDING_ICONS[building.type]}
                      onSelect={handleSelectAutomation}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {observabilityCity.buildings.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Observability District
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 3, md: 5 }, alignItems: "flex-end" }}>
                  {observabilityCity.buildings.map((building) => (
                    <ObservabilityCityBuilding
                      key={building.id}
                      building={building}
                      icon={OBSERVABILITY_BUILDING_ICONS[building.type]}
                      onSelect={handleSelectObservability}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {clusterCity.buildings.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Cluster District
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 3, md: 5 }, alignItems: "flex-end" }}>
                  {clusterCity.buildings.map((building) => (
                    <ObservabilityCityBuilding
                      key={building.id}
                      building={building}
                      icon={OBSERVABILITY_BUILDING_ICONS[building.type]}
                      onSelect={handleSelectObservability}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {enterpriseCity.buildings.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                  Enterprise District
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 3, md: 5 }, alignItems: "flex-end" }}>
                  {enterpriseCity.buildings.map((building) => (
                    <ObservabilityCityBuilding
                      key={building.id}
                      building={building}
                      icon={OBSERVABILITY_BUILDING_ICONS[building.type]}
                      onSelect={handleSelectObservability}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        </Box>
        <Box sx={{ position: "relative", borderTop: "1px solid", borderColor: "divider" }}>
          <CityLegend />
        </Box>
      </Box>

      <Popover
        open={Boolean(anchorEl && selected)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 240 } } }}
      >
        {selected ? (
          <Box>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1 }}>
              <Typography variant="h4">{selected.name}</Typography>
              <StatusBadge status={selected.status} />
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Stack sx={{ gap: 0.75 }}>
              {selected.metrics.map((metric) => (
                <Stack key={metric.label} direction="row" sx={{ justifyContent: "space-between", gap: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    {metric.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: metric.label === "Status" ? healthStatusColors[selected.status] : "text.primary",
                    }}
                  >
                    {metric.value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            {selected.linkedProjectId ? (
              <Button
                size="small"
                fullWidth
                sx={{ mt: 2 }}
                onClick={() => navigate(`/projects/${selected.linkedProjectId}`)}
              >
                View project details
              </Button>
            ) : null}
          </Box>
        ) : null}
      </Popover>

      <Popover
        open={Boolean(automationAnchorEl && selectedAutomation)}
        anchorEl={automationAnchorEl}
        onClose={handleCloseAutomation}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 240 } } }}
      >
        {selectedAutomation ? (
          <Box>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1 }}>
              <Typography variant="h4">{selectedAutomation.name}</Typography>
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  color: AUTOMATION_STATUS_COLORS[selectedAutomation.status],
                  backgroundColor: `${AUTOMATION_STATUS_COLORS[selectedAutomation.status]}1f`,
                }}
              >
                {AUTOMATION_STATUS_LABELS[selectedAutomation.status]}
              </Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Stack sx={{ gap: 0.75 }}>
              {selectedAutomation.metrics.map((metric) => (
                <Stack key={metric.label} direction="row" sx={{ justifyContent: "space-between", gap: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    {metric.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {metric.value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Button size="small" fullWidth sx={{ mt: 2 }} onClick={() => navigate("/automation")}>
              Open Automation Center
            </Button>
          </Box>
        ) : null}
      </Popover>

      <Popover
        open={Boolean(observabilityAnchorEl && selectedObservability)}
        anchorEl={observabilityAnchorEl}
        onClose={handleCloseObservability}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 240 } } }}
      >
        {selectedObservability ? (
          <Box>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, mb: 1 }}>
              <Typography variant="h4">{selectedObservability.name}</Typography>
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  color: OBSERVABILITY_STATUS_COLORS[selectedObservability.status],
                  backgroundColor: `${OBSERVABILITY_STATUS_COLORS[selectedObservability.status]}1f`,
                }}
              >
                {OBSERVABILITY_STATUS_LABELS[selectedObservability.status]}
              </Typography>
            </Stack>
            <Divider sx={{ my: 1 }} />
            <Stack sx={{ gap: 0.75 }}>
              {selectedObservability.metrics.map((metric) => (
                <Stack key={metric.label} direction="row" sx={{ justifyContent: "space-between", gap: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    {metric.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {metric.value}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Button size="small" fullWidth sx={{ mt: 2 }} onClick={() => navigate(OBSERVABILITY_BUILDING_ROUTES[selectedObservability.type])}>
              Open {OBSERVABILITY_BUILDING_LABELS[selectedObservability.type]}
            </Button>
          </Box>
        ) : null}
      </Popover>
    </Box>
  );
}
