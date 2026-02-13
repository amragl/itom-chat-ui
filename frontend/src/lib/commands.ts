/**
 * Slash command registry for the ITOM Chat UI.
 *
 * Defines all available chat commands, their parameters, agent routing,
 * and whether they are handled client-side or forwarded to the backend.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory = 'itom' | 'cmdb' | 'general';

export interface SlashCommand {
  /** The slash command trigger (e.g. "/discover"). */
  name: string;
  /** Short description shown in the autocomplete palette. */
  description: string;
  /** Category for grouping in the palette. */
  category: CommandCategory;
  /** Parameter hint shown after the command name (e.g. "[target]"). */
  paramHint?: string;
  /**
   * Agent ID to route to. When set, the command is sent to the backend
   * targeting this agent. When null, the command is handled client-side.
   */
  agentTarget: string | null;
  /**
   * Template for transforming the command + args into a natural language
   * prompt sent to the agent. Use `{args}` as a placeholder.
   * Only used when agentTarget is set.
   */
  promptTemplate?: string;
}

// ---------------------------------------------------------------------------
// Category labels (for display)
// ---------------------------------------------------------------------------

export const categoryLabels: Record<CommandCategory, string> = {
  itom: 'ITOM Operations',
  cmdb: 'CMDB Queries',
  general: 'General',
};

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

export const commands: SlashCommand[] = [
  // ── ITOM Operations ─────────────────────────────────────────────────
  {
    name: '/discover',
    description: 'Start network discovery scan',
    category: 'itom',
    paramHint: '[target]',
    agentTarget: 'discovery-agent',
    promptTemplate: 'Run a network discovery scan targeting {args}',
  },
  {
    name: '/audit',
    description: 'Run compliance audit',
    category: 'itom',
    paramHint: '[scope]',
    agentTarget: 'itom-auditor',
    promptTemplate: 'Run a compliance audit on {args}',
  },
  {
    name: '/assets',
    description: 'Query asset inventory',
    category: 'itom',
    paramHint: '[filter]',
    agentTarget: 'asset-agent',
    promptTemplate: 'Query the asset inventory for {args}',
  },
  {
    name: '/docs',
    description: 'Generate documentation',
    category: 'itom',
    paramHint: '[topic]',
    agentTarget: 'itom-documentator',
    promptTemplate: 'Generate documentation for {args}',
  },
  {
    name: '/status',
    description: 'Show system health',
    category: 'itom',
    agentTarget: 'orchestrator',
    promptTemplate: 'Show the current system health status for all ITOM agents',
  },

  // ── CMDB Queries ────────────────────────────────────────────────────
  {
    name: '/ci-search',
    description: 'Search configuration items',
    category: 'cmdb',
    paramHint: '<query>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Search for configuration items matching: {args}',
  },
  {
    name: '/ci-count',
    description: 'Count CIs by class',
    category: 'cmdb',
    paramHint: '[class]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'How many {args} are in the CMDB',
  },
  {
    name: '/ci-details',
    description: 'Get full CI details',
    category: 'cmdb',
    paramHint: '<name or sys_id>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show details for CI: {args}',
  },
  {
    name: '/ci-history',
    description: 'CI change history',
    category: 'cmdb',
    paramHint: '<name or sys_id>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the change history of CI: {args}',
  },
  {
    name: '/ci-relations',
    description: 'Show CI relationships',
    category: 'cmdb',
    paramHint: '<name or sys_id>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the relationships for configuration item: {args}',
  },
  {
    name: '/ci-dependencies',
    description: 'Show CI dependency tree',
    category: 'cmdb',
    paramHint: '<name or sys_id>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the dependency tree for CI: {args}',
  },
  {
    name: '/ci-impact',
    description: 'Analyze change impact on a CI',
    category: 'cmdb',
    paramHint: '<name or sys_id>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Analyze the impact analysis of changes to CI: {args}',
  },
  {
    name: '/ci-types',
    description: 'List available CI types',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'List all available CI types and their fields',
  },
  {
    name: '/cmdb-health',
    description: 'CMDB health metrics & KPIs',
    category: 'cmdb',
    paramHint: '[ci type]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the CMDB health metrics for {args}',
  },
  {
    name: '/cmdb-trend',
    description: 'CMDB health trend report',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the CMDB health trend report over time',
  },
  {
    name: '/cmdb-compliance',
    description: 'Run compliance check',
    category: 'cmdb',
    paramHint: '[ci type]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Run a CMDB compliance check on {args}',
  },
  {
    name: '/cmdb-stale',
    description: 'Find stale CIs',
    category: 'cmdb',
    paramHint: '[ci type]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Find stale {args} in the CMDB',
  },
  {
    name: '/cmdb-duplicates',
    description: 'Find duplicate CIs',
    category: 'cmdb',
    paramHint: '[ci type]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Find duplicate {args} in the CMDB',
  },
  {
    name: '/cmdb-reconcile',
    description: 'Run data reconciliation',
    category: 'cmdb',
    paramHint: '[ci type]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Run CMDB data reconciliation on {args}',
  },
  {
    name: '/cmdb-audit',
    description: 'Audit summary & stats',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the CMDB audit summary and statistics',
  },
  {
    name: '/cmdb-activity',
    description: 'Recent CI activity log',
    category: 'cmdb',
    paramHint: '[ci type]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show recent activity log for {args}',
  },
  {
    name: '/cmdb-dashboard',
    description: 'Operational dashboard',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the CMDB operational dashboard',
  },
  {
    name: '/cmdb-ire',
    description: 'IRE rules & CI classes',
    category: 'cmdb',
    paramHint: '[ci class]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the IRE rules for CI class: {args}',
  },
  {
    name: '/cmdb-rel-types',
    description: 'List relationship types',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'List all available relationship types in the CMDB',
  },
  {
    name: '/mcp-health',
    description: 'MCP server health check',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Run an MCP server health check',
  },

  // ── General ─────────────────────────────────────────────────────────
  {
    name: '/help',
    description: 'Show all available commands',
    category: 'general',
    agentTarget: null,
  },
  {
    name: '/clear',
    description: 'Clear conversation',
    category: 'general',
    agentTarget: null,
  },
  {
    name: '/export',
    description: 'Export conversation',
    category: 'general',
    paramHint: '[format]',
    agentTarget: null,
  },
  {
    name: '/agents',
    description: 'List available agents with status',
    category: 'general',
    agentTarget: 'orchestrator',
    promptTemplate: 'List all available ITOM agents and their current status',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find commands matching a partial input string (e.g. "/dis" -> ["/discover"]).
 * Returns all commands if the input is just "/".
 */
export function matchCommands(input: string): SlashCommand[] {
  const lower = input.toLowerCase();
  if (lower === '/') return commands;
  return commands.filter((cmd) => cmd.name.startsWith(lower));
}

/**
 * Parse a message into a command name and arguments string.
 * Returns null if the message is not a slash command.
 */
export function parseCommand(
  message: string,
): { command: SlashCommand; args: string } | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  const name = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const args = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

  const command = commands.find((cmd) => cmd.name === name.toLowerCase());
  if (!command) return null;

  return { command, args };
}

/**
 * Build the natural language prompt for an agent command.
 * If there are no args and the template contains {args}, uses a sensible default.
 */
export function buildPrompt(command: SlashCommand, args: string): string {
  if (!command.promptTemplate) return args || command.description;
  if (!args) {
    // Remove the {args} placeholder and trailing preposition artifacts
    return command.promptTemplate
      .replace(/\s*targeting\s*\{args\}/, '')
      .replace(/\s*on\s*\{args\}/, '')
      .replace(/\s*for\s*\{args\}/, '')
      .replace(/\s*matching:\s*\{args\}/, '')
      .replace(/\s*item:\s*\{args\}/, '')
      .replace(/\s*class:\s*\{args\}/, '')
      .replace(/\{args\}/g, '')
      .trim();
  }
  return command.promptTemplate.replace('{args}', args);
}

/**
 * Build the help text listing all commands, grouped by category.
 */
export function buildHelpText(): string {
  const grouped = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<CommandCategory, SlashCommand[]>,
  );

  const sections: string[] = [];
  for (const category of ['itom', 'cmdb', 'general'] as CommandCategory[]) {
    const cmds = grouped[category];
    if (!cmds?.length) continue;
    const label = categoryLabels[category];
    const lines = cmds.map(
      (cmd) =>
        `  ${cmd.name}${cmd.paramHint ? ' ' + cmd.paramHint : ''}  —  ${cmd.description}`,
    );
    sections.push(`**${label}**\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
