ALTER TABLE ai_analysis
    DROP COLUMN IF EXISTS affected_systems,
    DROP COLUMN IF EXISTS recommended_steps,
    DROP COLUMN IF EXISTS confidence_score;
