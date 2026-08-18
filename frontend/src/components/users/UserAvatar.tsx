import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import { healthStatusColors } from "../../theme/statusColors";

interface UserAvatarProps {
  name: string;
  avatar: string | null;
  online: boolean;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

// Kleiner farbiger Punkt oben rechts zeigt echte Live-Praesenz (siehe
// UserPresence) - kein statischer/erfundener Status.
export function UserAvatar({ name, avatar, online, size = 40 }: UserAvatarProps) {
  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      badgeContent={
        <Avatar
          sx={{
            width: 10,
            height: 10,
            bgcolor: online ? healthStatusColors.healthy : "text.disabled",
            border: "2px solid",
            borderColor: "background.paper",
          }}
        />
      }
    >
      <Avatar src={avatar ?? undefined} sx={{ width: size, height: size, fontSize: size * 0.4 }}>
        {avatar ? null : initials(name)}
      </Avatar>
    </Badge>
  );
}
