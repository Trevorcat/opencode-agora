// Cyber-Renaissance Design Tokens for Agora TUI
// Based on ANSI Base16 color palette

export const COLORS = {
  // Agent Identity Colors
  oracle: '#D2B4DE',      // Bright Magenta - Thinker/Analyst
  builder: '#58D68D',     // Bright Green - Maker/Implementer
  critic: '#F4D03F',      // Bright Yellow - Reviewer/Warning
  user: '#5DADE2',        // Bright Blue - Human User
  skeptic: '#E74C3C',     // Bright Red - Challenger
  neutral: '#A9A9A9',     // Gray - Neutral/Observer
  
  // Status Colors
  thinking: '#00FFFF',    // Cyan - Animated state
  waiting: '#555555',     // Dim Gray - Inactive
  posted: '#58D68D',      // Green - Completed
  error: '#E74C3C',       // Red - Failed
  
  // UI Colors
  borderActive: '#FFFFFF',    // White - Focused pane
  borderInactive: '#555555',  // Bright Black - Unfocused
  borderHighlight: '#5DADE2', // Blue - Selection
  textPrimary: '#FFFFFF',     // White - Main text
  textMuted: '#A9A9A9',       // Gray - Secondary text
  textDim: '#555555',         // Dim - Tertiary text
  backgroundDark: '#0F0F1A',  // Deep background
} as const;

// Animation constants
export const ANIMATION = {
  brailleSpinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dotSpinner: ['⣾', '⣽', '⣻', '⢿', '⡿', '⡽', '⡾', '⡷'],
  interval: 80, // ms
  streamDelay: 5, // ms per character for typing effect
} as const;

// Layout proportions
export const LAYOUT = {
  agents: {
    minWidth: 25,
    maxWidth: 35,
    defaultWidth: 28,
  },
  forum: {
    flex: 1,
    minWidth: 40,
  },
  blackboard: {
    minWidth: 40,
    maxWidth: 80,
    defaultWidth: 45,
  },
} as const;

// Border styles for visual hierarchy
export const BORDERS = {
  agents: 'bold' as const,
  forum: 'round' as const,
  blackboard: 'single' as const,
  header: 'double' as const,
  footer: 'classic' as const,
};

// Unicode box drawing characters
export const BOX = {
  horizontal: '─',
  vertical: '│',
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  cross: '┼',
  tDown: '┬',
  tUp: '┴',
  tRight: '├',
  tLeft: '┤',
} as const;

// Scrollbar characters
export const SCROLLBAR = {
  up: '▲',
  down: '▼',
  track: '║',
  thumb: '█',
  dot: '·',
} as const;

// Status indicators
export const STATUS = {
  waiting: '○',
  thinking: '◐',
  posted: '●',
  error: '✗',
  offline: '◌',
} as const;

// Agent role color mapping
export function getAgentColor(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('乐观') || roleLower.includes('pro') || roleLower.includes('support')) return COLORS.builder;
  if (roleLower.includes('悲观') || roleLower.includes('con') || roleLower.includes('skeptic')) return COLORS.critic;
  if (roleLower.includes('中立') || roleLower.includes('neutral') || roleLower.includes('mix')) return COLORS.oracle;
  if (roleLower.includes('analyst') || roleLower.includes('thinker')) return COLORS.oracle;
  if (roleLower.includes('builder') || roleLower.includes('dev')) return COLORS.builder;
  if (roleLower.includes('critic') || roleLower.includes('review')) return COLORS.critic;
  return COLORS.neutral;
}

// Progress bar generation
export function createProgressBar(percent: number, width: number = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}
