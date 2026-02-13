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
    name: '/ci-relations',
    description: 'Show CI relationships',
    category: 'cmdb',
    paramHint: '<ci>',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Show the relationships for configuration item: {args}',
  },
  {
    name: '/cmdb-health',
    description: 'CMDB health check',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Run a CMDB health check and report the results',
  },
  {
    name: '/cmdb-audit',
    description: 'CMDB data quality audit',
    category: 'cmdb',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Run a CMDB data quality audit and report findings',
  },
  {
    name: '/ci-count',
    description: 'Count CIs by class',
    category: 'cmdb',
    paramHint: '[class]',
    agentTarget: 'cmdb-agent',
    promptTemplate: 'Count configuration items by class: {args}',
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
