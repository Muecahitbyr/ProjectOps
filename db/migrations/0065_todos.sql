-- Todo-Liste unter KI-Buero: optional einem Projekt zugeordnet (NULL =
-- allgemein/projektlos), sonst reine CRUD-Ablage ohne eigene Statuslogik.
CREATE TABLE todos (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_todos_project_id ON todos (project_id);
CREATE INDEX idx_todos_done ON todos (done);
