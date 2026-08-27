-- SurveyJS adoption 2026-08-28: optional per-template form-render engine (benchmark row 9, E4).
-- Hand-written following the 0025/0026 pattern. No new foreign keys, no identifier over 64 chars.
-- Presentation-only column: existing templates keep DEFAULT 'sections' and behave exactly as before.
ALTER TABLE `consentTemplates` ADD `renderEngine` enum('sections','surveyjs') NOT NULL DEFAULT 'sections';
