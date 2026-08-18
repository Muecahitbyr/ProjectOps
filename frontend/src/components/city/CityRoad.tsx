import Box from "@mui/material/Box";

// Rein dekoratives Cyber/Tech-Strassenraster im Hintergrund der Stadt -
// keine echten Daten, nur Optik.
export function CityRoad() {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "linear-gradient(rgba(59,130,246,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.09) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }}
    />
  );
}
