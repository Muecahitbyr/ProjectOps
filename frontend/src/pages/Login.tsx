import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { useAuth } from "../auth/AuthContext";

interface LocationState {
  from?: Location;
}

// Auftragspunkt 1 "Echtes Auth-System" - nur noch Login, keine
// Selbstregistrierung mehr (Nutzerwunsch 2026-10-07: "Account erstellen
// raus, ich soll der einzige sein"). Vorgeschichte: zunaechst war
// /auth/register oeffentlich (jeder konnte sich ein Konto anlegen), dann
// auf "nur eingeladene E-Mails" eingeschraenkt (echter Sicherheitsfund) -
// jetzt ist der ganze Registrierungs-Pfad entfernt, siehe backend
// routes/auth.routes.ts.
export function Login() {
  const { isAuthenticated, login, loginError, isLoginPending } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (isAuthenticated) {
    const redirectTo = (location.state as LocationState | null)?.from?.pathname ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      await login({ email, password });
      navigate("/", { replace: true });
    } catch {
      // Fehler wird bereits ueber loginError (AuthContext) angezeigt.
    }
  };

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

          <form onSubmit={(event) => void handleSubmit(event)}>
            <Stack sx={{ gap: 2 }}>
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
                autoComplete="current-password"
              />

              {loginError && <Alert severity="error">{loginError}</Alert>}

              <Button type="submit" variant="contained" size="large" disabled={isLoginPending} fullWidth>
                Sign in
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
