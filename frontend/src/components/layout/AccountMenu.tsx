import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import { useNavigate } from "react-router-dom";
import { UserAvatar } from "../users/UserAvatar";
import { useAuth } from "../../auth/AuthContext";

// Auftragspunkt 12 "Frontend Security" - ersetzt UserSwitcher.tsx (Phase 9,
// "Acting as"-Auswahl aus localStorage) durch die echte, angemeldete
// Identitaet aus AuthContext. Kein Auswahlfeld mehr - der Benutzer ist, wer
// er ist.
export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <Box sx={{ px: 2.5, py: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
        <UserAvatar name={user.name} avatar={user.avatar} online size={36} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.email}
          </Typography>
        </Box>
        <Tooltip title="Sign out">
          <IconButton size="small" onClick={() => void handleLogout()} aria-label="Sign out">
            <LogoutOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}
