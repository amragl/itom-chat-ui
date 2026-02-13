/**
 * Operational status of an ITOM agent.
 * - "online"  -- Agent is running and accepting requests
 * - "offline" -- Agent is not available
 * - "busy"    -- Agent is processing a request and may have increased latency
 */
export type AgentStatus = "online" | "offline" | "busy";

/**
 * The functional domain of an ITOM agent.
 */
export type AgentDomain =
  | "discovery"
  | "asset"
  | "audit"
  | "documentation"
  | "orchestrator";

/**
 * An ITOM agent that can participate in conversations.
 *
 * Agents are specialized services that handle specific ITOM domains.
 * The frontend fetches agent information from the backend, which queries
 * the orchestrator for real-time status.
 */
export interface Agent {
  /** Unique identifier for the agent (e.g., "discovery", "asset", "auditor"). */
  id: string;

  /** Human-readable display name (e.g., "Discovery Agent"). */
  name: string;

  /** Short description of what this agent does. */
  description: string;

  /** Current operational status. */
  status: AgentStatus;

  /** The ITOM domain this agent operates in. */
  domain: AgentDomain;

  /** Optional icon identifier or URL for display in the UI. */
  icon?: string;
}
