import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { PageContainer } from "../components/layout/PageContainer";
import { LoadingState } from "../components/common/LoadingState";
import { ErrorState } from "../components/common/ErrorState";
import { EmptyState } from "../components/common/EmptyState";
import { StatsCard } from "../components/dashboard/StatsCard";
import { useOrganizations } from "../hooks/useOrganizations";
import { useServicePortfolio } from "../hooks/useServices";
import { getErrorMessage } from "../utils/getErrorMessage";
import { healthStatusColors } from "../theme/statusColors";
import type { PortfolioClassification } from "../types/service-portfolio.types";
import type { ResilienceRange } from "../types/resilience.types";

const RANGE_OPTIONS: { value: ResilienceRange; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence" -
// Farbgebung nach Dringlichkeit, dieselbe Palette wie Resilience.tsx.
const CLASSIFICATION_COLOR: Record<PortfolioClassification, string> = {
  STRATEGIC_REVIEW_RECOMMENDED: healthStatusColors.critical,
  RETIREMENT_RISK: "#f97316",
  AT_RISK: healthStatusColors.critical,
  NEEDS_ATTENTION: healthStatusColors.warning,
  STABLE: healthStatusColors.healthy,
  INSUFFICIENT_DATA: "#9ca3af",
};

const CLASSIFICATION_LABEL: Record<PortfolioClassification, string> = {
  STRATEGIC_REVIEW_RECOMMENDED: "Strategic review recommended",
  RETIREMENT_RISK: "Retirement risk",
  AT_RISK: "At risk",
  NEEDS_ATTENTION: "Needs attention",
  STABLE: "Stable",
  INSUFFICIENT_DATA: "Insufficient data",
};

function ClassificationChip({ classification }: { classification: PortfolioClassification }) {
  const color = CLASSIFICATION_COLOR[classification];
  return <Chip size="small" label={CLASSIFICATION_LABEL[classification]} sx={{ backgroundColor: `${color}1f`, color, fontWeight: 600 }} />;
}

// Phase 48 Auftragspunkt "Frontend" - eigene, fokussierte Seite unter
// /platform/services/portfolio (spiegelt den Backend-Pfad), verlinkt von der
// bestehenden Service-Catalog-Seite statt diese zu ueberladen.
export function ServicePortfolio() {
  const navigate = useNavigate();
  const [organizationId, setOrganizationId] = useState("");
  const [range, setRange] = useState<ResilienceRange>("7d");

  const organizationsQuery = useOrganizations();

  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    const firstOrg = organizationsQuery.data?.[0];
    if (firstOrg) {
      hasAutoSelected.current = true;
      setOrganizationId(firstOrg.id);
    }
  }, [organizationsQuery.data]);

  const enabled = Boolean(organizationId);
  const portfolioQuery = useServicePortfolio(organizationId, range, enabled);

  return (
    <PageContainer title="Service Portfolio">
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
            <TextField select size="small" label="Organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} sx={{ minWidth: 200 }}>
              {(organizationsQuery.data ?? []).map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Time range" value={range} onChange={(event) => setRange(event.target.value as ResilienceRange)} sx={{ minWidth: 170 }}>
              {RANGE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {!organizationId ? (
        <EmptyState message="Select an organization to view its service portfolio." minHeight={240} />
      ) : portfolioQuery.isLoading ? (
        <LoadingState label="Loading service portfolio..." minHeight={200} />
      ) : portfolioQuery.isError ? (
        <ErrorState message={getErrorMessage(portfolioQuery.error)} onRetry={() => portfolioQuery.refetch()} minHeight={200} />
      ) : portfolioQuery.data && portfolioQuery.data.totalServices === 0 ? (
        <EmptyState message="No services in the catalog for this organization yet." minHeight={240} />
      ) : (
        <Stack sx={{ gap: 3 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Strategic review" value={portfolioQuery.data!.counts.STRATEGIC_REVIEW_RECOMMENDED} accentColor={CLASSIFICATION_COLOR.STRATEGIC_REVIEW_RECOMMENDED} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Retirement risk" value={portfolioQuery.data!.counts.RETIREMENT_RISK} accentColor={CLASSIFICATION_COLOR.RETIREMENT_RISK} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="At risk" value={portfolioQuery.data!.counts.AT_RISK} accentColor={CLASSIFICATION_COLOR.AT_RISK} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Needs attention" value={portfolioQuery.data!.counts.NEEDS_ATTENTION} accentColor={CLASSIFICATION_COLOR.NEEDS_ATTENTION} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Stable" value={portfolioQuery.data!.counts.STABLE} accentColor={CLASSIFICATION_COLOR.STABLE} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <StatsCard label="Insufficient data" value={portfolioQuery.data!.counts.INSUFFICIENT_DATA} />
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                All {portfolioQuery.data!.totalServices} cataloged service(s), ranked by strategic urgency - combining lifecycle status (Service Catalog), current resilience state, business impact, capacity trend and outcome history. Services never flagged as anything less than what the underlying data actually shows - "Insufficient data" is shown explicitly rather than guessed.
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Service</TableCell>
                      <TableCell>Lifecycle</TableCell>
                      <TableCell>Criticality</TableCell>
                      <TableCell>Resilience</TableCell>
                      <TableCell align="right">Dependents</TableCell>
                      <TableCell>Business Impact</TableCell>
                      <TableCell>Classification</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {portfolioQuery.data!.entries.map((entry) => (
                      <TableRow key={entry.serviceId} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/platform/services/${entry.serviceId}`)}>
                        <TableCell>
                          <Stack sx={{ gap: 0 }}>
                            {entry.serviceName}
                            {entry.businessOwner ? (
                              <Typography variant="caption" color="text.secondary">
                                {entry.businessOwner}
                              </Typography>
                            ) : null}
                          </Stack>
                        </TableCell>
                        <TableCell>{entry.lifecycleStatus}</TableCell>
                        <TableCell>{entry.criticality}</TableCell>
                        <TableCell>{entry.resilienceStatus ?? "-"}</TableCell>
                        <TableCell align="right">
                          {entry.isPotentialSpof ? (
                            <Tooltip title="Potential Single Point of Failure">
                              <Chip size="small" label={`${entry.dependentCount} · SPOF`} color="error" variant="outlined" />
                            </Tooltip>
                          ) : (
                            entry.dependentCount
                          )}
                        </TableCell>
                        <TableCell>{entry.businessImpactTier === "NOT_EVALUATED" ? "-" : entry.businessImpactTier}</TableCell>
                        <TableCell>
                          <Tooltip title={entry.reasons.length > 0 ? entry.reasons.map((r) => r.detail).join(" ") : "No notable technical or business signals."}>
                            <span>
                              <ClassificationChip classification={entry.classification} />
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Stack>
      )}
    </PageContainer>
  );
}
