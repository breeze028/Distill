ALTER TABLE transcript ADD COLUMN provider TEXT;
ALTER TABLE transcript ADD COLUMN model TEXT;
ALTER TABLE transcript ADD COLUMN source_job_id TEXT REFERENCES processing_job(id);
