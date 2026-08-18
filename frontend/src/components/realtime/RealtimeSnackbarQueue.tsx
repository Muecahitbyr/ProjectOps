import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import type { RealtimeNotification } from "../../hooks/useRealtime";

interface RealtimeSnackbarQueueProps {
  notifications: RealtimeNotification[];
  onDismiss: (id: string) => void;
}

const AUTO_HIDE_DURATION_MS = 6_000;

// MUI Snackbar zeigt nativ nur eine Instanz gleichzeitig - hier bewusst
// einfach gehalten: die aelteste offene Benachrichtigung wird angezeigt,
// weitere folgen automatisch nach, sobald diese geschlossen wird.
export function RealtimeSnackbarQueue({ notifications, onDismiss }: RealtimeSnackbarQueueProps) {
  const current = notifications[0];

  return (
    <Snackbar
      open={current !== undefined}
      autoHideDuration={AUTO_HIDE_DURATION_MS}
      onClose={() => current && onDismiss(current.id)}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
    >
      {current ? (
        <Alert severity={current.severity} onClose={() => onDismiss(current.id)} variant="filled" sx={{ width: "100%" }}>
          {current.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}
