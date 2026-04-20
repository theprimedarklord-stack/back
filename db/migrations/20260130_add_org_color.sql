-- db/migrations/20260130_add_org_color.sql
-- Add color column to org_organizations table

ALTER TABLE org_organizations 
ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#3b82f6';

-- Add check constraint for basic hex color format
ALTER TABLE org_organizations
ADD CONSTRAINT check_color_format CHECK (color ~* '^#[a-f0-9]{6}$');
