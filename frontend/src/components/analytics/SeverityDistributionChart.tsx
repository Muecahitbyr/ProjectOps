import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { EmptyState } from "../common/EmptyState";
import { severityColors } from "../../theme/statusColors";
import type { IncidentSeverity } from "../../types/common.types";

interface SeverityDistributionChartProps {
  distribution: Record<IncidentSeverity, number>;
  height?: number;
}

const SEVERITY_ORDER: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function SeverityDistributionChart({ distribution, height = 220 }: SeverityDistributionChartProps) {
  const theme = useTheme();
  const data = SEVERITY_ORDER.map((severity) => ({ name: severity, value: distribution[severity] }));
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) {
    return <EmptyState message="No incidents in this period." minHeight={height} />;
  }

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={severityColors[entry.name]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}` }} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}
