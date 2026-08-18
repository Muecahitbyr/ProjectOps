import Grid from "@mui/material/Grid";
import { StatsCard } from "../dashboard/StatsCard";
import { LoadingState } from "../common/LoadingState";
import { usePlanBreakdown, PLAN_COLOR } from "./OrganizationsTab";

// Phase 15 Teil 9 "Global Administration" (Plans-Tab) - reine Ableitung aus
// der bereits geladenen Organisationsliste (keine separate Plan-Tabelle,
// "plan" ist ein Feld auf organizations, siehe Migration 0033).
export function PlansTab() {
  const { breakdown, isLoading } = usePlanBreakdown();

  if (isLoading) {
    return <LoadingState label="Loading plans..." minHeight={200} />;
  }

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatsCard label="Free" value={breakdown.FREE} accentColor={PLAN_COLOR.FREE} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatsCard label="Pro" value={breakdown.PRO} accentColor={PLAN_COLOR.PRO} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatsCard label="Enterprise" value={breakdown.ENTERPRISE} accentColor={PLAN_COLOR.ENTERPRISE} />
      </Grid>
    </Grid>
  );
}
