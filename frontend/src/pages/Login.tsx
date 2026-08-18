import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Stack from "@mui/material/Stack";
import { useAuth } from "../auth/AuthContext";

interface LocationState {
  from?: Location;
}

// Auftragspunkt 1 "Echtes Auth-System" - eine Seite fuer Login und
// Registrierung (Tab-Umschaltung). Registrierung uebernimmt (claimt) auch
// einen bestehenden, noch passwortlosen users-Datensatz mit derselben
// E-Mail (siehe backend routes/auth.routes.ts) - so koennen die in Phase
// 7-9 angelegten Benutzer ohne Datenverlust ein Passwort setzen.
export function Login() {
  const { isAuthenticated, login, register, loginError, registerError, isLoginPending, isRegisterPending } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (isAuthenticated) {
    const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      if (tab === "login") {
        await login({ email, password });
      } else {
        await register({ name, email, password });
      }
      navigate("/", { replace: true });
    } catch {
      // Fehler wird bereits ueber loginError/registerError (AuthContext) angezeigt.
    }
  };

  const error = tab === "login" ? loginError : registerError;
  const isPending = tab === "login" ? isLoginPending : isRegisterPending;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
      }}
    >
      <Card sx={{ width: 400, maxWidth: "100%" }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            ProjectOps
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Monitoring Platform
          </Typography>

          <Tabs
            value={tab}
            onChange={(_event, value: "login" | "register") => setTab(value)}
            sx={{ mb: 3 }}
            variant="fullWidth"
          >
            <Tab value="login" label="Sign in" />
            <Tab value="register" label="Create account" />
          </Tabs>

          <form onSubmit={(event) => void handleSubmit(event)}>
            <Stack sx={{ gap: 2 }}>
              {tab === "register" && (
                <TextField
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  fullWidth
                  autoComplete="name"
                />
              )}
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
                autoComplete="email"
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                fullWidth
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                helperText={tab === "register" ? "At least 8 characters" : undefined}
              />

              {error && <Alert severity="error">{error}</Alert>}

              <Button type="submit" variant="contained" size="large" disabled={isPending} fullWidth>
                {tab === "login" ? "Sign in" : "Create account"}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
