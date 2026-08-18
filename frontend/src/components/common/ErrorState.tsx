import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  minHeight?: number;
}

export function ErrorState({ message = "Failed to load data.", onRetry, minHeight = 200 }: ErrorStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        minHeight,
        color: "error.main",
        textAlign: "center",
        px: 2,
      }}
    >
      <ErrorOutlineOutlinedIcon fontSize="large" />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
      {onRetry ? (
        <Button size="small" variant="outlined" color="error" onClick={onRetry} sx={{ mt: 1 }}>
          Retry
        </Button>
      ) : null}
    </Box>
  );
}
