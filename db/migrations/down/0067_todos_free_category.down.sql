ALTER INDEX idx_todos_category RENAME TO idx_todos_project_id;
ALTER TABLE todos RENAME COLUMN category TO project_id;
ALTER TABLE todos ADD CONSTRAINT todos_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
