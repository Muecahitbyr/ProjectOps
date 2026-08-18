import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { AnalyticsRange } from "../../types/analytics.types";

export interface CustomRangeValue {
  from: string;
  to: string;
}

interface RangeSelectorProps {
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  custom: CustomRangeValue;
  onCustomChange: (value: CustomRangeValue) => void;
}

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "custom", label: "Custom" },
];

// datetime-local liefert/erwartet lokale Zeit ohne Zeitzonen-Suffix (z.B.
// "2026-08-04T10:00") - new Date(...) interpretiert das als lokale
// Browserzeit, .toISOString() wandelt korrekt nach UTC fuer die API um.
function toIsoOrEmpty(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function RangeSelector({ range, onRangeChange, custom, onCustomChange }: RangeSelectorProps) {
  return (
    <Stack direction="row" sx={{ gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range}
        onChange={(_event, value: AnalyticsRange | null) => value && onRangeChange(value)}
      >
        {RANGE_OPTIONS.map((option) => (
          <ToggleButton key={option.value} value={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {range === "custom" ? (
        <Stack direction="row" sx={{ gap: 1.5 }}>
          <TextField
            label="From"
            type="datetime-local"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => onCustomChange({ ...custom, from: toIsoOrEmpty(event.target.value) })}
          />
          <TextField
            label="To"
            type="datetime-local"
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => onCustomChange({ ...custom, to: toIsoOrEmpty(event.target.value) })}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
