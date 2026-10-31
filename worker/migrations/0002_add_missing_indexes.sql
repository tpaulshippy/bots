-- Follow-up indexes missing from 0001 (ported from Django db_index=True).
CREATE INDEX IF NOT EXISTS bots_flashcard_due_at_idx ON bots_flashcard(due_at);
