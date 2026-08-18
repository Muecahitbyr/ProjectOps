import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputAdornment from "@mui/material/InputAdornment";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import type { ProjectHealthSummary } from "../../types/dashboard.types";
import type { CheckStatus, IncidentSeverity } from "../../types/common.types";

export interface AnalyticsFilterValue {
  projectId?: string;
  status?: CheckStatus;
  severity?: IncidentSeverity;
  checkType?: string;
  search?: string;
}

interface AnalyticsFilterBarProps {
  value: AnalyticsFilterValue;
  onChange: (value: AnalyticsFilterValue) => void;
  projects: ProjectHealthSummary[];
  showStatus?: boolean;
  showSeverity?: boolean;
  showCheckType?: boolean;
  showSearch?: boolean;
}

const CHECK_STATUS_OPTIONS: CheckStatus[] = ["ONLINE", "WARNING", "OFFLINE", "ERROR"];
const SEVERITY_OPTIONS: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CHECK_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "http", label: "HTTP" },
  { value: "ssl", label: "SSL/TLS Certificate" },
  { value: "dns", label: "DNS" },
  { value: "response-time", label: "Response Time" },
  { value: "firebase-status", label: "Firebase Status" },
  { value: "firestore", label: "Firestore" },
  { value: "stripe", label: "Stripe" },
  { value: "api-health", label: "API Health" },
  { value: "custom", label: "Custom" },
];

// Ein einziger, wiederverwendbarer Mehrfach-Filter (Projekt/Status/Severity/
// Check-Typ/Suche) fuer alle Analytics-Seiten (/analytics, /analytics/
// incidents, Drill-Down) - haelt die Filterlogik an einer Stelle statt in
// jeder Seite dupliziert. Undefined statt leerem String bedeutet "kein
// Filter" und wird von den aufrufenden Seiten beim API-Aufruf weggelassen.
export function AnalyticsFilterBar({
  value,
  onChange,
  projects,
  showStatus = true,
  showSeverity = true,
  showCheckType = true,
  showSearch = true,
}: AnalyticsFilterBarProps) {
  const set = <K extends keyof AnalyticsFilterValue>(key: K, next: AnalyticsFilterValue[K]): void => {
    onChange({ ...value, [key]: next });
  };

  return (
    <Stack direction="row" sx={{ gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
      <TextField
        select
        label="Project"
        size="small"
        value={value.projectId ?? ""}
        onChange={(event) => set("projectId", event.target.value || undefined)}
        sx={{ minWidth: 180 }}
      >
        <MenuItem value="">All projects</MenuItem>
        {projects.map((project) => (
          <MenuItem key={project.id} value={project.id}>
            {project.name}
          </MenuItem>
        ))}
      </TextField>

      {showStatus ? (
        <TextField
          select
          label="Status"
          size="small"
          value={value.status ?? ""}
          onChange={(event) => set("status", (event.target.value || undefined) as CheckStatus | undefined)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {CHECK_STATUS_OPTIONS.map((status) => (
            <MenuItem key={status} value={status}>
              {status}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {showSeverity ? (
        <TextField
          select
          label="Severity"
          size="small"
          value={value.severity ?? ""}
          onChange={(event) => set("severity", (event.target.value || undefined) as IncidentSeverity | undefined)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All severities</MenuItem>
          {SEVERITY_OPTIONS.map((severity) => (
            <MenuItem key={severity} value={severity}>
              {severity}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {showCheckType ? (
        <TextField
          select
          label="Check type"
          size="small"
          value={value.checkType ?? ""}
          onChange={(event) => set("checkType", event.target.value || undefined)}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">All check types</MenuItem>
          {CHECK_TYPE_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {showSearch ? (
        <TextField
          size="small"
          placeholder="Search check / project"
          value={value.search ?? ""}
          onChange={(event) => set("search", event.target.value || undefined)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 200 }}
        />
      ) : null}
    </Stack>
  );
}
