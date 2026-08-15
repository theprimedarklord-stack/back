/**
 * Node types a canvas node row is allowed to carry.
 *
 * Wider than what actually syncs today — only `multinode` stores `content_blocks`
 * so far — because `ReactFlowAdapter` already stamps a `canvasNodeId` onto
 * drawing / ai-chat / media / table / runtime nodes. Those ids can legitimately
 * show up here the moment their editors start storing content, and a whitelist
 * that rejected them would turn that into a 400 instead of a feature.
 */
export const CANVAS_NODE_TYPES = [
  'multinode',
  'smart_table',
  'info',
  'runtime',
  'drawing',
  'ai-chat',
  'media',
  'table',
] as const;

export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[number];

export function isCanvasNodeType(value: unknown): value is CanvasNodeType {
  return typeof value === 'string' && (CANVAS_NODE_TYPES as readonly string[]).includes(value);
}
