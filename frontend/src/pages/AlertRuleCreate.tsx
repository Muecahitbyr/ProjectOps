import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import { PageContainer } from "../components/layout/PageContainer";
import { AlertsTabs } from "../components/alerts/AlertsTabs";
import { useProjectsHealth } from "../hooks/useProjects";
import { useCreateAlertRule, useReplaceEscalationSteps } from "../hooks/useAlerts";
import { useOnCallSchedules } from "../hooks/useOnCall";
import { useAuth } from "../auth/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";
import type {
  AlertCondition,
  AlertComparator,
  AlertMetric,
  AlertRule,
  AlertRuleSeverity,
  AlertRuleType,
  AlertSeverityThreshold,
  CreateEscalationStepInput,
} from "../types/alert.types";
import type { NotificationChannelId } from "../types/notification-settings.types";
import type { RoleId } from "../types/user.types";

const RULE_TYPES: Array<{ value: AlertRuleType; label: string; description: string }> = [
  { value: "THRESHOLD", label: "Threshold", description: "e.g. Response Time > 1000ms" },
  { value: "TREND", label: "Trend", description: "e.g. Health Score falling continuously" },
  { value: "ANOMALY", label: "Anomaly", description: "e.g. Error rate rising unusually vs. baseline" },
  { value: "COMPOSITE", label: "Composite", description: "e.g. Multiple checks offline at once" },
];

const RULE_SEVERITIES: AlertRuleSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];
const THRESHOLD_METRICS: Array<{ value: AlertMetric; label: string; unit: string }> = [
  { value: "HEALTH_SCORE", label: "Health score", unit: "points" },
  { value: "INCIDENT_SEVERITY", label: "Open incident severity", unit: "" },
  { value: "OFFLINE_DURATION", label: "Offline duration", unit: "minutes" },
  { value: "SSL_EXPIRY", label: "SSL days remaining", unit: "days" },
  { value: "RESPONSE_TIME", label: "Response time", unit: "ms" },
  { value: "ERROR_COUNT", label: "Error count in window", unit: "errors" },
];
const COMPARATORS: Array<{ value: AlertComparator; label: string }> = [
  { value: "LT", label: "<" },
  { value: "LTE", label: "≤" },
  { value: "GT", label: ">" },
  { value: "GTE", label: "≥" },
  { value: "EQ", label: "=" },
];
const SEVERITY_THRESHOLDS: AlertSeverityThreshold[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CHANNELS: NotificationChannelId[] = ["EMAIL", "PUSH", "IN_APP", "WEBSOCKET"];
const PROJECT_ROLES: RoleId[] = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"];
const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

// Auftragspunkt 2 "Alert Conditions Builder" (/alerts/create) - deckt alle
// vier Regeltypen (Auftragspunkt 1) plus optionale Eskalationskette
// (Auftragspunkt 6) in einem professionellen Editor ab. Die bestehende
// AlertRuleForm.tsx (Dialog auf /alerts, nur THRESHOLD, Bearbeiten
// bestehender Regeln) bleibt unveraendert - dieser Editor ist der
// vollstaendige Neubau-Weg, kein Ersatz.
export function AlertRuleCreate() {
  const navigate = useNavigate();
  const projectsQuery = useProjectsHealth();
  const createMutation = useCreateAlertRule();
  const { hasProjectRole } = useAuth();

  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<AlertRuleType>("THRESHOLD");
  const [severity, setSeverity] = useState<AlertRuleSeverity>("WARNING");

  // THRESHOLD
  const [metric, setMetric] = useState<AlertMetric>("HEALTH_SCORE");
  const [comparator, setComparator] = useState<AlertComparator>("LT");
  const [threshold, setThreshold] = useState("50");
  const [severityThreshold, setSeverityThreshold] = useState<AlertSeverityThreshold>("CRITICAL");
  const [windowMinutes, setWindowMinutes] = useState("10");

  // TREND
  const [trendMetric, setTrendMetric] = useState<"HEALTH_SCORE" | "RESPONSE_TIME" | "ERROR_COUNT">("HEALTH_SCORE");
  const [trendDirection, setTrendDirection] = useState<"DECREASING" | "INCREASING">("DECREASING");
  const [consecutivePoints, setConsecutivePoints] = useState("3");
  const [bucketMinutes, setBucketMinutes] = useState("5");

  // ANOMALY
  const [anomalyMetric, setAnomalyMetric] = useState<"ERROR_COUNT" | "RESPONSE_TIME">("ERROR_COUNT");
  const [anomalyWindowMinutes, setAnomalyWindowMinutes] = useState("10");
  const [baselineWindowMinutes, setBaselineWindowMinutes] = useState("120");
  const [stdDevMultiplier, setStdDevMultiplier] = useState("2");

  // COMPOSITE
  const [compositeMode, setCompositeMode] = useState<"MULTIPLE_CHECKS_OFFLINE" | "INCIDENT_SPIKE">("MULTIPLE_CHECKS_OFFLINE");
  const [minCount, setMinCount] = useState("2");
  const [spikeWindowMinutes, setSpikeWindowMinutes] = useState("10");

  const [createdRule, setCreatedRule] = useState<AlertRule | null>(null);
  const [steps, setSteps] = useState<CreateEscalationStepInput[]>([
    { stepOrder: 1, afterMinutes: 5, channelId: "EMAIL" },
  ]);
  const escalationMutation = useReplaceEscalationSteps(createdRule?.id ?? "");
  const [escalationSaved, setEscalationSaved] = useState(false);
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - unscoped
  // (kein organizationId-Filter): zeigt alle Schedules, auf die dieser
  // Nutzer Sichtbarkeit hat (siehe middleware/authorize.ts#authorizePlatformOrOrganizationMembership,
  // Bootstrap-Zweig ohne organizationId). Ohne Sichtbarkeit bleibt die Liste
  // schlicht leer/fehlerhaft - blockiert das Speichern der uebrigen
  // Eskalationsstufen-Felder nicht (onCallScheduleId ist optional).
  const onCallSchedulesQuery = useOnCallSchedules({});

  const isSeverityMetric = ruleType === "THRESHOLD" && metric === "INCIDENT_SEVERITY";
  const isWindowMetric = ruleType === "THRESHOLD" && metric === "ERROR_COUNT";

  const buildCondition = (): AlertCondition | undefined => {
    if (ruleType === "TREND") {
      return {
        type: "TREND",
        metric: trendMetric,
        direction: trendDirection,
        consecutivePoints: Number(consecutivePoints),
        bucketMinutes: Number(bucketMinutes),
      };
    }
    if (ruleType === "ANOMALY") {
      return {
        type: "ANOMALY",
        metric: anomalyMetric,
        windowMinutes: Number(anomalyWindowMinutes),
        baselineWindowMinutes: Number(baselineWindowMinutes),
        stdDevMultiplier: Number(stdDevMultiplier),
      };
    }
    if (ruleType === "COMPOSITE") {
      return {
        type: "COMPOSITE",
        mode: compositeMode,
        minCount: Number(minCount),
        ...(compositeMode === "INCIDENT_SPIKE" ? { windowMinutes: Number(spikeWindowMinutes) } : {}),
      };
    }
    return undefined;
  };

  const effectiveMetric: AlertMetric =
    ruleType === "TREND" ? trendMetric : ruleType === "ANOMALY" ? anomalyMetric : ruleType === "COMPOSITE" ? compositeMode : metric;

  const canManageSelectedProject = projectId.length === 0 || hasProjectRole(projectId, MANAGE_ROLES);

  const canSubmit =
    projectId.length > 0 &&
    canManageSelectedProject &&
    name.trim().length > 0 &&
    (ruleType !== "THRESHOLD" || isSeverityMetric || threshold.trim().length > 0) &&
    (ruleType !== "THRESHOLD" || !isWindowMetric || windowMinutes.trim().length > 0);

  const handleSubmit = (): void => {
    createMutation.mutate(
      {
        projectId,
        name: name.trim(),
        ruleType,
        severity,
        metric: effectiveMetric,
        comparator: ruleType === "THRESHOLD" ? comparator : "GTE",
        ...(ruleType === "THRESHOLD"
          ? {
              ...(isSeverityMetric ? { severityThreshold } : { threshold: Number(threshold) }),
              ...(isWindowMetric ? { windowMinutes: Number(windowMinutes) } : {}),
            }
          : { condition: buildCondition() }),
      },
      { onSuccess: (rule) => setCreatedRule(rule) },
    );
  };

  const addStep = (): void => {
    setSteps((current) => [...current, { stepOrder: current.length + 1, afterMinutes: 15, channelId: "PUSH" }]);
  };
  const removeStep = (index: number): void => {
    setSteps((current) => current.filter((_, i) => i !== index).map((step, i) => ({ ...step, stepOrder: i + 1 })));
  };
  const updateStep = (index: number, patch: Partial<CreateEscalationStepInput>): void => {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const handleSaveEscalation = (): void => {
    escalationMutation.mutate(steps, { onSuccess: () => setEscalationSaved(true) });
  };

  return (
    <PageContainer title="Create Alert Rule">
      <AlertsTabs />
      <Stack sx={{ gap: 3, maxWidth: 720 }}>
        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 2 }}>
              1. Rule
            </Typography>
            <Stack sx={{ gap: 2 }}>
              {createMutation.isError ? <Alert severity="error">{getErrorMessage(createMutation.error)}</Alert> : null}
              {!canManageSelectedProject ? (
                <Alert severity="warning">You need the OWNER or ADMIN role on this project to create alert rules.</Alert>
              ) : null}
              {createdRule ? (
                <Alert severity="success" icon={<CheckCircleOutlinedIcon fontSize="small" />}>
                  Rule "{createdRule.name}" created.
                </Alert>
              ) : null}

              <TextField
                select
                label="Project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={createdRule !== null}
                fullWidth
              >
                {(projectsQuery.data ?? []).map((project) => (
                  <MenuItem key={project.id} value={project.id}>
                    {project.name}
                  </MenuItem>
                ))}
              </TextField>

              <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} disabled={createdRule !== null} fullWidth autoFocus />

              <Stack direction="row" sx={{ gap: 2, flexWrap: "wrap" }}>
                <TextField
                  select
                  label="Severity"
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as AlertRuleSeverity)}
                  disabled={createdRule !== null}
                  sx={{ width: 160 }}
                >
                  {RULE_SEVERITIES.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <div>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Rule type
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  value={ruleType}
                  onChange={(_event, value: AlertRuleType | null) => value && setRuleType(value)}
                  disabled={createdRule !== null}
                  sx={{ flexWrap: "wrap" }}
                >
                  {RULE_TYPES.map((option) => (
                    <ToggleButton key={option.value} value={option.value} sx={{ textTransform: "none", px: 2 }}>
                      <Stack sx={{ alignItems: "flex-start" }}>
                        <Typography variant="body2">{option.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Stack>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>

              {ruleType === "THRESHOLD" ? (
                <>
                  <TextField select label="Metric" value={metric} onChange={(event) => setMetric(event.target.value as AlertMetric)} disabled={createdRule !== null} fullWidth>
                    {THRESHOLD_METRICS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Stack direction="row" sx={{ gap: 2 }}>
                    <TextField
                      select
                      label="Operator"
                      value={comparator}
                      onChange={(event) => setComparator(event.target.value as AlertComparator)}
                      disabled={createdRule !== null}
                      sx={{ width: 120 }}
                    >
                      {COMPARATORS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    {isSeverityMetric ? (
                      <TextField
                        select
                        label="Severity threshold"
                        value={severityThreshold}
                        onChange={(event) => setSeverityThreshold(event.target.value as AlertSeverityThreshold)}
                        disabled={createdRule !== null}
                        fullWidth
                      >
                        {SEVERITY_THRESHOLDS.map((option) => (
                          <MenuItem key={option} value={option}>
                            {option}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <TextField
                        label={`Threshold (${THRESHOLD_METRICS.find((option) => option.value === metric)?.unit})`}
                        type="number"
                        value={threshold}
                        onChange={(event) => setThreshold(event.target.value)}
                        disabled={createdRule !== null}
                        fullWidth
                      />
                    )}
                  </Stack>
                  {isWindowMetric ? (
                    <TextField
                      label="Window (minutes)"
                      type="number"
                      value={windowMinutes}
                      onChange={(event) => setWindowMinutes(event.target.value)}
                      disabled={createdRule !== null}
                      fullWidth
                    />
                  ) : null}
                </>
              ) : null}

              {ruleType === "TREND" ? (
                <>
                  <TextField
                    select
                    label="Metric"
                    value={trendMetric}
                    onChange={(event) => setTrendMetric(event.target.value as typeof trendMetric)}
                    disabled={createdRule !== null}
                    fullWidth
                  >
                    <MenuItem value="HEALTH_SCORE">Health score</MenuItem>
                    <MenuItem value="RESPONSE_TIME">Response time</MenuItem>
                    <MenuItem value="ERROR_COUNT">Error count</MenuItem>
                  </TextField>
                  <Stack direction="row" sx={{ gap: 2 }}>
                    <TextField
                      select
                      label="Direction"
                      value={trendDirection}
                      onChange={(event) => setTrendDirection(event.target.value as typeof trendDirection)}
                      disabled={createdRule !== null}
                      fullWidth
                    >
                      <MenuItem value="DECREASING">Falling continuously</MenuItem>
                      <MenuItem value="INCREASING">Rising continuously</MenuItem>
                    </TextField>
                    <TextField
                      label="Consecutive points"
                      type="number"
                      value={consecutivePoints}
                      onChange={(event) => setConsecutivePoints(event.target.value)}
                      disabled={createdRule !== null}
                      sx={{ width: 200 }}
                    />
                    <TextField
                      label="Bucket (minutes)"
                      type="number"
                      value={bucketMinutes}
                      onChange={(event) => setBucketMinutes(event.target.value)}
                      disabled={createdRule !== null}
                      sx={{ width: 180 }}
                    />
                  </Stack>
                </>
              ) : null}

              {ruleType === "ANOMALY" ? (
                <>
                  <TextField
                    select
                    label="Metric"
                    value={anomalyMetric}
                    onChange={(event) => setAnomalyMetric(event.target.value as typeof anomalyMetric)}
                    disabled={createdRule !== null}
                    fullWidth
                  >
                    <MenuItem value="ERROR_COUNT">Error count</MenuItem>
                    <MenuItem value="RESPONSE_TIME">Response time</MenuItem>
                  </TextField>
                  <Stack direction="row" sx={{ gap: 2 }}>
                    <TextField
                      label="Window (minutes)"
                      type="number"
                      value={anomalyWindowMinutes}
                      onChange={(event) => setAnomalyWindowMinutes(event.target.value)}
                      disabled={createdRule !== null}
                      fullWidth
                    />
                    <TextField
                      label="Baseline window (minutes)"
                      type="number"
                      value={baselineWindowMinutes}
                      onChange={(event) => setBaselineWindowMinutes(event.target.value)}
                      disabled={createdRule !== null}
                      fullWidth
                    />
                    <TextField
                      label="Std. deviation multiplier"
                      type="number"
                      value={stdDevMultiplier}
                      onChange={(event) => setStdDevMultiplier(event.target.value)}
                      disabled={createdRule !== null}
                      fullWidth
                    />
                  </Stack>
                </>
              ) : null}

              {ruleType === "COMPOSITE" ? (
                <>
                  <TextField
                    select
                    label="Mode"
                    value={compositeMode}
                    onChange={(event) => setCompositeMode(event.target.value as typeof compositeMode)}
                    disabled={createdRule !== null}
                    fullWidth
                  >
                    <MenuItem value="MULTIPLE_CHECKS_OFFLINE">Multiple checks offline at once</MenuItem>
                    <MenuItem value="INCIDENT_SPIKE">Incident spike</MenuItem>
                  </TextField>
                  <Stack direction="row" sx={{ gap: 2 }}>
                    <TextField
                      label={compositeMode === "MULTIPLE_CHECKS_OFFLINE" ? "Minimum checks offline" : "Minimum incidents"}
                      type="number"
                      value={minCount}
                      onChange={(event) => setMinCount(event.target.value)}
                      disabled={createdRule !== null}
                      fullWidth
                    />
                    {compositeMode === "INCIDENT_SPIKE" ? (
                      <TextField
                        label="Window (minutes)"
                        type="number"
                        value={spikeWindowMinutes}
                        onChange={(event) => setSpikeWindowMinutes(event.target.value)}
                        disabled={createdRule !== null}
                        fullWidth
                      />
                    ) : null}
                  </Stack>
                </>
              ) : null}

              {createdRule === null ? (
                <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                  <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
                    Create rule
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        {createdRule ? (
          <Card>
            <CardContent>
              <Typography variant="h3" sx={{ mb: 1 }}>
                2. Escalation (optional)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                After the rule stays triggered for the given time, notify via the selected channel. Steps fire in order.
              </Typography>

              {escalationMutation.isError ? <Alert severity="error" sx={{ mb: 2 }}>{getErrorMessage(escalationMutation.error)}</Alert> : null}
              {escalationSaved ? (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Escalation chain saved.
                </Alert>
              ) : null}

              <Stack sx={{ gap: 1.5 }}>
                {steps.map((step, index) => (
                  <Stack key={index} direction="row" sx={{ gap: 1.5, alignItems: "center" }}>
                    <Chip size="small" label={`Step ${step.stepOrder}`} />
                    <TextField
                      label="After (minutes)"
                      type="number"
                      size="small"
                      value={step.afterMinutes}
                      onChange={(event) => updateStep(index, { afterMinutes: Number(event.target.value) })}
                      sx={{ width: 160 }}
                    />
                    <TextField
                      select
                      label="Channel"
                      size="small"
                      value={step.channelId}
                      onChange={(event) => updateStep(index, { channelId: event.target.value as NotificationChannelId })}
                      sx={{ width: 160 }}
                    >
                      {CHANNELS.map((channel) => (
                        <MenuItem key={channel} value={channel}>
                          {channel}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Also notify role"
                      size="small"
                      value={step.additionalProjectRole ?? ""}
                      onChange={(event) =>
                        updateStep(index, {
                          additionalProjectRole: event.target.value ? (event.target.value as RoleId) : undefined,
                        })
                      }
                      sx={{ width: 180 }}
                    >
                      <MenuItem value="">None</MenuItem>
                      {PROJECT_ROLES.map((role) => (
                        <MenuItem key={role} value={role}>
                          {role}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Notify on-call"
                      size="small"
                      value={step.onCallScheduleId ?? ""}
                      onChange={(event) =>
                        updateStep(index, {
                          onCallScheduleId: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      sx={{ width: 200 }}
                      helperText={onCallSchedulesQuery.isError ? "No schedules visible" : undefined}
                    >
                      <MenuItem value="">None</MenuItem>
                      {(onCallSchedulesQuery.data ?? []).map((schedule) => (
                        <MenuItem key={schedule.id} value={schedule.id}>
                          {schedule.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <IconButton size="small" onClick={() => removeStep(index)} aria-label="Remove step">
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Stack direction="row" sx={{ justifyContent: "space-between", mt: 1 }}>
                  <Button startIcon={<AddOutlinedIcon />} onClick={addStep}>
                    Add step
                  </Button>
                  <Button variant="contained" onClick={handleSaveEscalation} disabled={escalationMutation.isPending}>
                    Save escalation
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        {createdRule ? (
          <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
            <Button variant="outlined" onClick={() => navigate("/alerts")}>
              Done · Back to Alerts
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </PageContainer>
  );
}
