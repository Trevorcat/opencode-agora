export const theme = {
  // Soft Industrial Eye-Care colors (Muted & Low-Contrast)
  bg: {
    primary: '#1e2024',     // Base: Neutral dark slate, softer than pure black or #1e1e2e
    secondary: '#25272c',   // Elevated panels: Subtle depth without high contrast
    accent: '#2a2d33',      // Active/Highlight areas
    highlight: '#383c47',   // Borders/Separators: Low contrast against panels
  },
  text: {
    primary: '#7a8294',     // Text: Gray-blue (~55% lightness)
    secondary: '#646b7a',   // Metadata/Timestamps: Mid gray (~48% lightness)
    muted: '#4e5463',       // Dim/Disabled: Subdued gray (~38% lightness)
    dim: '#363b47',         // Deepest text for watermarks/borders (~27% lightness)
  },
  accent: {
    // Redesigned desaturated agent palette (30-40% less saturation, balanced luminance)
    dustyRed: '#B37673',     // Skeptic
    sageGreen: '#849E7A',    // Proponent
    steelBlue: '#7A96B8',    // Analyst
    warmSand: '#BCA474',     // Pragmatist
    mutedAmethyst: '#9E86A8',// Moderator
    
    // Supporting muted colors
    softTeal: '#6A9994',
    fadedOrange: '#BD8B6E',
    slatePink: '#B58299',
    greyBlue: '#6C8399',
    
    // Legacy compatibility aliases (mapped to new muted palette)
    red: '#B37673',          // Maps to dustyRed (status errors, etc.)
    green: '#849E7A',        // Maps to sageGreen (status success, etc.)
    blue: '#7A96B8',         // Maps to steelBlue (general UI accents)
    yellow: '#BCA474',       // Maps to warmSand (warnings, highlights)
    mauve: '#9E86A8',        // Maps to mutedAmethyst
    peach: '#BD8B6E',        // Maps to fadedOrange
    teal: '#6A9994',         // Maps to softTeal
    pink: '#B58299',         // Maps to slatePink
    sky: '#7A96B8',          // Maps to steelBlue
    rosewater: '#B58299',    // Maps to slatePink
    flamingo: '#B58299',     // Maps to slatePink
    maroon: '#B37673',       // Maps to dustyRed
    sapphire: '#7A96B8',     // Maps to steelBlue
    lavender: '#9E86A8',     // Maps to mutedAmethyst
    purple: '#9E86A8',       // Maps to mutedAmethyst
  },
  status: {
    // Braille animation for thinking
    thinkingFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    posted: '✅',
    error: '❌',
    waiting: '⭕',
    preparingFrames: ['▖', '▘', '▝', '▗'],
  }
};

export const getAgentColor = (role?: string) => {
  if (!role) return theme.accent.mutedAmethyst;
  
  const roleLower = role.toLowerCase();
  
  // Muted, professional tones that don't compete but remain distinct
  const colorMap: Record<string, string> = {
    // Primary Debate Roles
    skeptic: theme.accent.dustyRed,       // Dusty Red: Critical but not alarming
    proponent: theme.accent.sageGreen,    // Sage Green: Constructive and grounded
    analyst: theme.accent.steelBlue,      // Steel Blue: Logical and calm
    pragmatist: theme.accent.warmSand,    // Warm Sand: Practical and balanced
    moderator: theme.accent.mutedAmethyst,// Muted Amethyst: Neutral authoritative guide
    
    // Additional roles mapped to the new soft palette
    researcher: theme.accent.softTeal,
    optimist: theme.accent.sageGreen,
    pessimist: theme.accent.dustyRed,
    ethicist: theme.accent.greyBlue,
    creator: theme.accent.slatePink,
    synthesizer: theme.accent.fadedOrange,
    reviewer: theme.accent.softTeal,
    critic: theme.accent.dustyRed,
    coordinator: theme.accent.mutedAmethyst,
  };

  return colorMap[roleLower] || theme.accent.mutedAmethyst;
};

// Role-specific Unicode symbols for redundant visual encoding
// Ensures differentiation even if colors cannot be distinguished
export const getAgentSymbol = (role?: string): string => {
  if (!role) return '◆';
  
  const roleLower = role.toLowerCase();
  
  const symbolMap: Record<string, string> = {
    // Primary debate roles
    skeptic: '◆',       // Diamond: questioning/challenging
    proponent: '▲',     // Up triangle: advocating/supporting
    analyst: '●',       // Circle: examining/analyzing
    pragmatist: '■',    // Square: grounded/practical
    
    // Additional roles
    researcher: '◎',    // Bullseye: research/targeted investigation
    optimist: '★',      // Star: positive outlook
    pessimist: '▼',     // Down triangle: cautionary/downward
    ethicist: '◐',      // Half circle: balanced/moral duality
    moderator: '⚖',     // Scales: balanced/moderating
    creator: '✦',       // Four-point star: creative
    synthesizer: '❋',   // Flower: combining/synthesizing
    reviewer: '✓',      // Check: reviewing/approving
    critic: '✗',        // X: critical/challenging
    coordinator: '⬡',   // Hexagon: organizing/coordinating
  };

  return symbolMap[roleLower] || '◆';
};
