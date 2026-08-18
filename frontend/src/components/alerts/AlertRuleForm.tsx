import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import { useCreateAlertRule, useUpdateAlertRule } from "../../hooks/useAlerts";
import { useProjectsHealth } from "../../hooks/useProjects";
import { getErrorMessage } from "../../utils/getErrorMessage";
import type {
  AlertComparator,
  AlertCondition,
  AlertMetric,
  AlertRule,
  AlertRuleSeverity,
  AlertRuleType,
  AlertSeverityThreshold,
  AnomalyCondition,
  CompositeCondition,
  CreateAlertRuleInput,
  TrendCondition,
} from "../../types/alert.types";

interface AlertRuleFormProps {
  open: boolean;
  onClose: () => void;
  rule?: AlertRule;
  defaultProjectId?: string;
}

// Phase 10 "AlertRule Editor komplett neu" - dynamische Felder je Regeltyp
// statt nur THRESHOLD (Phase 9 hatte TREND/ANOMALY/COMPOSITE im Backend,
// aber keine UI dafuer). Ein neutraler Comparator wird fuer TREND/ANOMALY/
// COMPOSITE mitgeschickt, weil das Backend-Schema ihn immer verlangt -
// die Auswertung (alerts/alert-evaluator.ts) liest fuer diese Regeltypen
// ausschliesslich aus `condition`, comparator/metric auf oberster Ebene
// werden dort ignoriert (metric muss dennoch gesetzt sein, siehe DB-Spalte
// alert_rules.metric NOT NULL).
const INERT_COMPARATOR: AlertComparator = "GTE";

const RULE_TYPE_OPTIONS: Array<{ value: AlertRuleType; label: string; helper: string }> = [
  { value: "THRESHOLD", label: "Threshold", helper: "Metric crosses a fixed value" },
  { value: "TREND", label: "Trend", helper: "Metric moves consistently in one direction" },
  { value: "ANOMALY", label: "Anomaly", helper: "Metric deviates from its recent baseline" },
  { value: "COMPOSITE", label: "Composite", helper: "Multiple checks/incidents at once" },
];

const RULE_SEVERITY_OPTIONS: AlertRuleSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];

const THRESHOLD_METRIC_OPTIONS: Array<{ value: AlertMetric; label: string; unit: string }> = [
  { value: "HEALTH_SCORE", label: "Health score", unit: "points" },
  { value: "INCIDENT_SEVERITY", label: "Open incident severity", unit: "" },
  { value: "OFFLINE_DURATION", label: "Offline duration", unit: "minutes" },
  { value: "SSL_EXPIRY", label: "SSL days remaining", unit: "days" },
  { value: "RESPONSE_TIME", label: "Response time", unit: "ms" },
  { value: "ERROR_COUNT", label: "Error count in window", unit: "errors" },
];

const COMPARATOR_OPTIONS: Array<{ value: AlertComparator; label: string }> = [
  { value: "LT", label: "<" },
  { value: "LTE", label: "≤" },
  { value: "GT", label: ">" },
  { value: "GTE", label: "≥" },
  { value: "EQ", label: "=" },
];

const SEVERITY_THRESHOLD_OPTIONS: AlertSeverityThreshold[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const TREND_METRIC_OPTIONS: TrendCondition["metric"][] = ["HEALTH_SCORE", "RESPONSE_TIME", "ERROR_COUNT"];
const ANOMALY_METRIC_OPTIONS: AnomalyCondition["metric"][] = ["ERROR_COUNT", "RESPONSE_TIME"];
const COMPOSITE_MODE_OPTIONS: Array<{ value: CompositeCondition["mode"]; label: string }> = [
  { value: "MULTIPLE_CHECKS_OFFLINE", label: "Multiple checks offline at once" },
  { value: "INCIDENT_SPIKE", label: "Spike of new incidents" },
];

function conditionOf<T extends AlertCondition["type"]>(
  rule: AlertRule | undefined,
  type: T,
): Extract<AlertCondition, { type: T }> | undefined {
  if (rule?.condition && rule.condition.type === type) {
    return rule.condition as Extract<AlertCondition, { type: T }>;
  }
  return undefined;
}

// Ein Formular fuer Erstellen (rule=undefined) und Bearbeiten (rule
// gesetzt) - deckt "Erstellen/Bearbeiten" aus dem Auftrag ab. Aktivieren/
// Deaktivieren geschieht separat ueber den Switch auf der Karte (siehe
// AlertRuleCard), nicht ueber dieses Formular.
export function AlertRuleForm({ open, onClose, rule, defaultProjectId }: AlertRuleFormProps) {
  const isEdit = rule !== undefined;
  const projectsQuery = useProjectsHealth();
  const createMutation = useCreateAlertRule();
  const updateMutation = useUpdateAlertRule(rule?.id ?? "");
  const mutation = isEdit ? updateMutation : createMutation;

  const [projectId, setProjectId] = useState(rule?.projectId ?? defaultProjectId ?? "");
  const [name, setName] = useState(rule?.name ?? "");
  const [ruleType, setRuleType] = useState<AlertRuleType>(rule?.ruleType ?? "THRESHOLD");
  const [severity, setSeverity] = useState<AlertRuleSeverity>(rule?.severity ?? "WARNING");

  // THRESHOLD
  const [metric, setMetric] = useState<AlertMetric>(rule?.ruleType === "THRESHOLD" || !rule ? (rule?.metric ?? "HEALTH_SCORE") : "HEALTH_SCORE");
  const [comparator, setComparator] = useState<AlertComparator>(rule?.comparator ?? "LT");
  const [threshold, setThreshold] = useState(rule?.threshold !== null && rule?.threshold !== undefined ? String(rule.threshold) : "");
  const [severityThreshold, setSeverityThreshold] = useState<AlertSeverityThreshold>(rule?.severityThreshold ?? "CRITICAL");
  const [windowMinutes, setWindowMinutes] = useState(rule?.windowMinutes ? String(rule.windowMinutes) : "10");

  // TREND
  const trendDefaults = conditionOf(rule, "TREND");
  const [trendMetric, setTrendMetric] = useState<TrendCondition["metric"]>(trendDefaults?.metric ?? "HEALTH_SCORE");
  const [trendDirection, setTrendDirection] = useState<TrendCondition["direction"]>(trendDefaults?.direction ?? "DECREASING");
  const [consecutivePoints, setConsecutivePoints] = useState(String(trendDefaults?.consecutivePoints ?? 3));
  const [bucketMinutes, setBucketMinutes] = useState(String(trendDefaults?.bucketMinutes ?? 10));

  // ANOMALY
  const anomalyDefaults = conditionOf(rule, "ANOMALY");
  const [anomalyMetric, setAnomalyMetric] = useState<AnomalyCondition["metric"]>(anomalyDefaults?.metric ?? "ERROR_COUNT");
  const [anomalyWindowMinutes, setAnomalyWindowMinutes] = useState(String(anomalyDefaults?.windowMinutes ?? 15));
  const [baselineWindowMinutes, setBaselineWindowMinutes] = useState(String(anomalyDefaults?.baselineWindowMinutes ?? 120));
  const [stdDevMultiplier, setStdDevMultiplier] = useState(String(anomalyDefaults?.stdDevMultiplier ?? 2));

  // COMPOSITE
  const compositeDefaults = conditionOf(rule, "COMPOSITE");
  const [compositeMode, setCompositeMode] = useState<CompositeCondition["mode"]>(compositeDefaults?.mode ?? "MULTIPLE_CHECKS_OFFLINE");
  const [minCount, setMinCount] = useState(String(compositeDefaults?.minCount ?? 2));
  const [compositeWindowMinutes, setCompositeWindowMinutes] = useState(compositeDefaults?.windowMinutes !== undefined ? String(compositeDefaults.windowMinutes) : "");

  useEffect(() => {
    if (!open) return;
    setProjectId(rule?.projectId ?? defaultProjectId ?? "");
    setName(rule?.name ?? "");
    setRuleType(rule?.ruleType ?? "THRESHOLD");
    setSeverity(rule?.severity ?? "WARNING");

    setMetric(rule?.ruleType === "THRESHOLD" ? (rule.metric ?? "HEALTH_SCORE") : "HEALTH_SCORE");
    setComparator(rule?.comparator ?? "LT");
    setThreshold(rule?.threshold !== null && rule?.threshold !== undefined ? String(rule.threshold) : "");
    setSeverityThreshold(rule?.severityThreshold ?? "CRITICAL");
    setWindowMinutes(rule?.windowMinutes ? String(rule.windowMinutes) : "10");

    const trend = conditionOf(rule, "TREND");
    setTrendMetric(trend?.metric ?? "HEALTH_SCORE");
    setTrendDirection(trend?.direction ?? "DECREASING");
    setConsecutivePoints(String(trend?.consecutivePoints ?? 3));
    setBucketMinutes(String(trend?.bucketMinutes ?? 10));

    const anomaly = conditionOf(rule, "ANOMALY");
    setAnomalyMetric(anomaly?.metric ?? "ERROR_COUNT");
    setAnomalyWindowMinutes(String(anomaly?.windowMinutes ?? 15));
    setBaselineWindowMinutes(String(anomaly?.baselineWindowMinutes ?? 120));
    setStdDevMultiplier(String(anomaly?.stdDevMultiplier ?? 2));

    const composite = conditionOf(rule, "COMPOSITE");
    setCompositeMode(composite?.mode ?? "MULTIPLE_CHECKS_OFFLINE");
    setMinCount(String(composite?.minCount ?? 2));
    setCompositeWindowMinutes(composite?.windowMinutes !== undefined ? String(composite.windowMinutes) : "");

    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule, defaultProjectId]);

  const isSeverityMetric = ruleType === "THRESHOLD" && metric === "INCIDENT_SEVERITY";
  const isWindowMetric = ruleType === "THRESHOLD" && metric === "ERROR_COUNT";

  const isPositiveInt = (value: string): boolean => /^\d+$/.test(value.trim()) && Number(value) > 0;
  const isPositiveNumber = (value: string): boolean => value.trim().length > 0 && Number.isFinite(Number(value)) && Number(value) > 0;

  const canSubmit = (() => {
    if (projectId.length === 0 || name.trim().length === 0) return false;
    switch (ruleType) {
      case "THRESHOLD":
        return (isSeverityMetric || threshold.trim().length > 0) && (!isWindowMetric || windowMinutes.trim().length > 0);
      case "TREND":
        return isPositiveInt(consecutivePoints) && isPositiveInt(bucketMinutes);
      case "ANOMALY":
        return isPositiveInt(anomalyWindowMinutes) && isPositiveInt(baselineWindowMinutes) && isPositiveNumber(stdDevMultiplier);
      case "COMPOSITE":
        return isPositiveInt(minCount) && (compositeWindowMinutes.trim().length === 0 || isPositiveInt(compositeWindowMinutes));
    }
  })();

  function buildTypeSpecificFields(): Pick<CreateAlertRuleInput, "metric" | "comparator" | "threshold" | "severityThreshold" | "windowMinutes" | "condition"> {
    switch (ruleType) {
      case "THRESHOLD":
        return {
          metric,
          comparator,
          ...(isSeverityMetric ? { severityThreshold } : { threshold: Number(threshold) }),
          ...(isWindowMetric ? { windowMinutes: Number(windowMinutes) } : {}),
        };
      case "TREND":
        return {
          metric: trendMetric,
          comparator: INERT_COMPARATOR,
          condition: {
            type: "TREND",
            metric: trendMetric,
            direction: trendDirection,
            consecutivePoints: Number(consecutivePoints),
            bucketMinutes: Number(bucketMinutes),
          },
        };
      case "ANOMALY":
        return {
          metric: anomalyMetric,
          comparator: INERT_COMPARATOR,
          condition: {
            type: "ANOMALY",
            metric: anomalyMetric,
            windowMinutes: Number(anomalyWindowMinutes),
            baselineWindowMinutes: Number(baselineWindowMinutes),
            stdDevMultiplier: Number(stdDevMultiplier),
          },
        };
      case "COMPOSITE":
        return {
          // Backend verlangt stets ein top-level `metric` (DB-Spalte NOT
          // NULL) - fuer COMPOSITE ist das der Modus selbst (siehe METRICS-
          // Enum in routes/alerts.routes.ts, das MULTIPLE_CHECKS_OFFLINE/
          // INCIDENT_SPIKE als Pseudo-Metriken genau dafuer enthaelt).
          metric: compositeMode,
          comparator: INERT_COMPARATOR,
          condition: {
            type: "COMPOSITE",
            mode: compositeMode,
            minCount: Number(minCount),
            ...(compositeWindowMinutes.trim().length > 0 ? { windowMinutes: Number(compositeWindowMinutes) } : {}),
          },
        };
    }
  }

  const handleSubmit = (): void => {
    const base = { name: name.trim(), ruleType, severity, ...buildTypeSpecificFields() };

    if (isEdit) {
      updateMutation.mutate(base, { onSuccess: onClose });
    } else {
      createMutation.mutate({ projectId, ...base }, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEdit ? "Edit alert rule" : "New alert rule"}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}

          <TextField
            select
            label="Project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={isEdit}
            fullWidth
          >
            {(projectsQuery.data ?? []).map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} fullWidth autoFocus />

          <Stack direction="row" sx={{ gap: 2 }}>
            <TextField
              select
              label="Rule type"
              value={ruleType}
              onChange={(event) => setRuleType(event.target.value as AlertRuleType)}
              disabled={isEdit}
              fullWidth
              helperText={RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.helper}
            >
              {RULE_TYPE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as AlertRuleSeverity)}
              sx={{ width: 150 }}
            >
              {RULE_SEVERITY_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Divider />

          {ruleType === "THRESHOLD" && (
            <>
              <TextField select label="Metric" value={metric} onChange={(event) => setMetric(event.target.value as AlertMetric)} fullWidth>
                {THRESHOLD_METRIC_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <Stack direction="row" sx={{ gap: 2 }}>
                <TextField
                  select
                  label="Comparator"
                  value={comparator}
                  onChange={(event) => setComparator(event.target.value as AlertComparator)}
                  sx={{ width: 120 }}
                >
                  {COMPARATOR_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>

                {isSeverityMetric ? (
                  <TextField
                    select
                    label="Severity"
                    value={severityThreshold}
                    onChange={(event) => setSeverityThreshold(event.target.value as AlertSeverityThreshold)}
                    fullWidth
                  >
                    {SEVERITY_THRESHOLD_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    label={`Threshold (${THRESHOLD_METRIC_OPTIONS.find((option) => option.value === metric)?.unit})`}
                    type="number"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    fullWidth
                  />
                )}
              </Stack>

              {isWindowMetric && (
                <TextField label="Window (minutes)" type="number" value={windowMinutes} onChange={(event) => setWindowMinutes(event.target.value)} fullWidth />
              )}
            </>
          )}

          {ruleType === "TREND" && (
            <>
              <TextField select label="Metric" value={trendMetric} onChange={(event) => setTrendMetric(event.target.value as TrendCondition["metric"])} fullWidth>
                {TREND_METRIC_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Direction"
                value={trendDirection}
                onChange={(event) => setTrendDirection(event.target.value as TrendCondition["direction"])}
                fullWidth
              >
                <MenuItem value="DECREASING">Decreasing</MenuItem>
                <MenuItem value="INCREASING">Increasing</MenuItem>
              </TextField>
              <Stack direction="row" sx={{ gap: 2 }}>
                <TextField
                  label="Consecutive points"
                  type="number"
                  value={consecutivePoints}
                  onChange={(event) => setConsecutivePoints(event.target.value)}
                  helperText="2-20"
                  fullWidth
                />
                <TextField
                  label="Bucket (minutes)"
                  type="number"
                  value={bucketMinutes}
                  onChange={(event) => setBucketMinutes(event.target.value)}
                  fullWidth
                />
              </Stack>
            </>
          )}

          {ruleType === "ANOMALY" && (
            <>
              <TextField
                select
                label="Metric"
                value={anomalyMetric}
                onChange={(event) => setAnomalyMetric(event.target.value as AnomalyCondition["metric"])}
                fullWidth
              >
                {ANOMALY_METRIC_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" sx={{ gap: 2 }}>
                <TextField
                  label="Window (minutes)"
                  type="number"
                  value={anomalyWindowMinutes}
                  onChange={(event) => setAnomalyWindowMinutes(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Baseline window (minutes)"
                  type="number"
                  value={baselineWindowMinutes}
                  onChange={(event) => setBaselineWindowMinutes(event.target.value)}
                  fullWidth
                />
              </Stack>
              <TextField
                label="Std. deviation multiplier"
                type="number"
                value={stdDevMultiplier}
                onChange={(event) => setStdDevMultiplier(event.target.value)}
                helperText="How many standard deviations above baseline counts as anomalous (e.g. 2)"
                fullWidth
              />
            </>
          )}

          {ruleType === "COMPOSITE" && (
            <>
              <TextField
                select
                label="Mode"
                value={compositeMode}
                onChange={(event) => setCompositeMode(event.target.value as CompositeCondition["mode"])}
                fullWidth
              >
                {COMPOSITE_MODE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" sx={{ gap: 2 }}>
                <TextField
                  label={compositeMode === "MULTIPLE_CHECKS_OFFLINE" ? "Min. checks offline" : "Min. incidents"}
                  type="number"
                  value={minCount}
                  onChange={(event) => setMinCount(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Window (minutes, optional)"
                  type="number"
                  value={compositeWindowMinutes}
                  onChange={(event) => setCompositeWindowMinutes(event.target.value)}
                  helperText={compositeMode === "MULTIPLE_CHECKS_OFFLINE" ? "Not used for this mode" : "Default 10"}
                  disabled={compositeMode === "MULTIPLE_CHECKS_OFFLINE"}
                  fullWidth
                />
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit || mutation.isPending}>
          {isEdit ? "Save" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
