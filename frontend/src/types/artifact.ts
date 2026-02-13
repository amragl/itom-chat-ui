/**
 * The type of artifact produced by an ITOM agent.
 *
 * - "report"    -- Audit reports, compliance reports (structured tables/sections)
 * - "dashboard" -- Health dashboards, metric summaries (charts/indicators)
 * - "document"  -- Long-form docs, runbooks, policies (markdown)
 * - "table"     -- Tabular data like CMDB records, inventory lists
 * - "code"      -- Code snippets, scripts, configuration files
 */
export type ArtifactType = 'report' | 'dashboard' | 'document' | 'table' | 'code';

/**
 * Metadata associated with an artifact, providing context about its origin and structure.
 */
export interface ArtifactMetadata {
  /** The ITOM agent that produced this artifact. */
  sourceAgent?: string;

  /** When the artifact data was generated (ISO 8601). */
  generatedAt?: string;

  /** MIME type of the content, if applicable (e.g., "application/json", "text/markdown"). */
  mimeType?: string;

  /** Number of rows for table-type artifacts. */
  rowCount?: number;

  /** Column definitions for table-type artifacts. */
  columns?: string[];

  /** Additional key-value pairs specific to the artifact type. */
  [key: string]: unknown;
}

/**
 * A structured artifact produced by an ITOM agent within a conversation.
 *
 * Artifacts are extracted from agent responses and rendered inline in the chat
 * using specialized viewer components (ReportViewer, DashboardRenderer, etc.).
 */
export interface Artifact {
  /** Unique identifier for the artifact (UUID from the backend). */
  id: string;

  /** The category of artifact, which determines the rendering component. */
  type: ArtifactType;

  /** Human-readable title for the artifact. */
  title: string;

  /** The raw content of the artifact. Format depends on type (JSON string, markdown, etc.). */
  content: string;

  /** Optional metadata providing additional context about the artifact. */
  metadata?: ArtifactMetadata;
}
