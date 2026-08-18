import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import { useCreateUser } from "../../hooks/useUsers";
import { getErrorMessage } from "../../utils/getErrorMessage";

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
}

// Einziger Weg, echte Benutzer anzulegen (kein Seed, keine Fake-User) -
// schreibt via POST /api/users direkt in die Datenbank.
export function CreateUserDialog({ open, onClose }: CreateUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");
  const mutation = useCreateUser();

  const handleClose = (): void => {
    if (mutation.isPending) return;
    setName("");
    setEmail("");
    setAvatar("");
    mutation.reset();
    onClose();
  };

  const handleSubmit = (): void => {
    mutation.mutate(
      { name: name.trim(), email: email.trim(), ...(avatar.trim() ? { avatar: avatar.trim() } : {}) },
      { onSuccess: handleClose },
    );
  };

  const canSubmit = name.trim().length > 0 && email.trim().length > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>New user</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          {mutation.isError ? <Alert severity="error">{getErrorMessage(mutation.error)}</Alert> : null}
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            fullWidth
          />
          <TextField
            label="Avatar URL (optional)"
            value={avatar}
            onChange={(event) => setAvatar(event.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!canSubmit || mutation.isPending}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
