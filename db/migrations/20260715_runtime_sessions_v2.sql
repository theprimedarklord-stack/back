-- 1. Змінити node_id з bigint на TEXT (ReactFlow node IDs are strings)
ALTER TABLE rt_runtime_sessions ALTER COLUMN node_id TYPE text USING node_id::text;

-- 2. Додати нові колонки до sessions
ALTER TABLE rt_runtime_sessions
ADD COLUMN IF NOT EXISTS map_card_id bigint,
ADD COLUMN IF NOT EXISTS organization_id uuid;

-- 3. Додати last_ip до devices
ALTER TABLE rt_devices
ADD COLUMN IF NOT EXISTS last_ip text;

-- 4. Індекс для швидкого пошуку за mapCardId + status
CREATE INDEX IF NOT EXISTS idx_rt_sessions_mapcard_status
ON rt_runtime_sessions (map_card_id, status)
WHERE status IN ('active', 'paused', 'creating');

-- 5. Індекс для лімітів сесій на device
CREATE INDEX IF NOT EXISTS idx_rt_sessions_device_active
ON rt_runtime_sessions (device_id, status)
WHERE status IN ('active', 'creating', 'paused', 'disconnected');
