import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { useRegisterClusterAgent } from "../../hooks/useClusterAgents";
import { getErrorMessage } from "../../utils/getErrorMessage";

interface RegisterAgentDialogProps {
  open: boolean;
  onClose: () => void;
}

// Phase 14 Teil 1-3 "Remote Monitoring Agents"/"Agent Discovery" - das
// zurueckgegebene Secret wird GENAU EINMAL angezeigt (der Server speichert
// nur dessen Hash, siehe core/agent-auth.ts) und muss vom Operator in die
// Konfiguration des tatsaechlichen Agent-Prozesses uebernommen werden.
export function RegisterAgentDialog({ open, onClose }: RegisterAgentDialogProps) {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [region, setRegion] = useState("");
  const [os, setOs] = useState("linux");
  const mutation = useRegisterClusterAgent();

  const handleClose = (): void => {
    if (mutation.isPending) return;
    setName("");
    setHostname("");
    setRegion("");
    setOs("linux");
    mutation.reset();
    onClose();
  };

  const handleSubmit = (): void => {
    mutation.mutate({
      name: name.trim(),
      hostname: hostname.trim(),
      os: os.trim(),
      agentVersion: "1.0.0",
      schedulerVersion: "1.0.0",
      ...(region.trim() ? { region: region.trim() } : {}),
    });
  };

  const canSubmit = name.trim().length > 0 && hostname.trim().length > 0 && os.trim().length > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Register remote agent</DialogTitle>
      <DialogContent>
        {mutation.data ? (
          <Stack sx={{ gap: 2, pt: 1 }}>
            <Alert severity="success">Agent "{mutation.data.agent.name}" registered.</Alert>
            <Alert severity="warning">
              This secret is shown only once. Copy it into the agent's configuration now - it cannot be retrieved again.
            </Alert>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
              <TextField label="Agent Secret" value={mutation.data.secret} fullWidth slotProps={{ input: { readOnly: true } }} />
              <IconButton onClick={() => void navigator.clipboard.writeText(mutation.data!.secret)} aria-label="Copy secret">
                <ContentCopyOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Agent ID: {mutation.data.agent.id}
            </Typography>
          </Stack>
        ) : (
          <Stack sx={{ gap: 2, pt: 1 }}>
            {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />
            <TextField label="Hostname" value={hostname} onChange={(event) => setHostname(event.target.value)} fullWidth />
            <TextField label="Region (optional)" value={region} onChange={(event) => setRegion(event.target.value)} fullWidth />
            <TextField label="OS" value={os} onChange={(event) => setOs(event.target.value)} fullWidth />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {mutation.data ? (
          <Button onClick={handleClose} variant="contained">
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || mutation.isPending}>
              Register
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
