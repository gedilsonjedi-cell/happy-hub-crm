
UPDATE campaigns 
SET status = 'running', completed_at = NULL, updated_at = now()
WHERE id = 'b6b4820c-72b5-4a3b-be0c-0df9489a12fe'
AND status = 'completed';
