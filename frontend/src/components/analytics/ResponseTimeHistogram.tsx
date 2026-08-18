import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../common/EmptyState";
import type { ResponseTimeHistogramBucket } from "../../types/analytics.types";

interface ResponseTimeHistogramProps {
  buckets: ResponseTimeHistogramBucket[];
  height?: number;
}

interface TooltipEntry {
  payload: ResponseTimeHistogramBucket;
}

function HistogramTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const bucket = payload[0]?.payload;
  if (!bucket) return null;
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary">
        {bucket.rangeStartMs}ms - {bucket.rangeEndMs}ms
      </Typography>
      <Typography variant="body2">{bucket.count} samples</Typography>
    </Box>
  );
}

export function ResponseTimeHistogram({ buckets, height = 240 }: ResponseTimeHistogramProps) {
  const theme = useTheme();

  if (buckets.length === 0) {
    return <EmptyState message="No response time data for this period." minHeight={height} />;
  }

  const data = buckets.map((bucket) => ({ ...bucket, label: `${bucket.rangeStartMs}` }));

  return (
    <Box sx={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="label" stroke={theme.palette.text.secondary} fontSize={10} unit="ms" minTickGap={20} />
          <YAxis stroke={theme.palette.text.secondary} fontSize={12} width={36} allowDecimals={false} />
          <Tooltip content={<HistogramTooltip />} />
          <Bar dataKey="count" fill={theme.palette.primary.main} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
