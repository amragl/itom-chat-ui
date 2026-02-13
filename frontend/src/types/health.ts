/**
 * Health check response from the backend /api/health endpoint.
 *
 * This matches the backend's HealthResponse Pydantic model.
 */
export interface HealthStatus {
  /** Current health status (e.g., "healthy", "degraded", "unhealthy"). */
  status: string;

  /** Backend application version. */
  version: string;

  /** Number of seconds the backend has been running. */
  uptime_seconds?: number;

  /** ISO 8601 timestamp of when the health check was performed. */
  timestamp: string;
}
