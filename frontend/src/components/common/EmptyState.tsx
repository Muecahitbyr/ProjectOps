import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";

interface EmptyStateProps {
  message?: string;
  minHeight?: number;
}

export function EmptyState({ message = "Nothing to show yet.", minHeight = 160 }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        minHeight,
        color: "text.secondary",
      }}
    >
      <InboxOutlinedIcon fontSize="large" />
      <Typography variant="body2">{message}</Typography>
    </Box>
  );
}
