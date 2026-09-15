-- Nisan-Gaesteliste: Status pro Gast (Nutzerwunsch) - "fix dabei" vs. nur
-- eingeladen/vielleicht. Default MAYBE, da eine neu eingetragene Person
-- zunaechst nur eingeladen ist, nicht automatisch zugesagt hat.
ALTER TABLE nisan_guests
    ADD COLUMN status TEXT NOT NULL DEFAULT 'MAYBE' CHECK (status IN ('CONFIRMED', 'MAYBE'));
