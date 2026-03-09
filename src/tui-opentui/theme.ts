export const theme = {
  // Base Catppuccin Mocha colors
  bg: {
    primary: '#1e1e2e',     // Base
    secondary: '#181825',   // Mantle
    accent: '#313244',      // Surface0
    highlight: '#45475a',   // Surface1
  },
  text: {
    primary: '#cdd6f4',     // Text
    secondary: '#bac2de',   // Subtext1
    muted: '#a6adc8',       // Subtext0
    dim: '#585b70',         // Surface2
  },
  accent: {
    blue: '#89b4fa',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    red: '#f38ba8',
    purple: '#cba6f7',
    peach: '#fab387',
    teal: '#94e2d5',
    sky: '#89dceb',
    mauve: '#cba6f7',
    pink: '#f5c2e7',
    rosewater: '#f5e0dc',
    flamingo: '#f2cdcd',
    maroon: '#eba0ac',
    sapphire: '#74c7ec',
    lavender: '#b4befe',
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
  if (!role) return theme.accent.lavender;
  
  const roleLower = role.toLowerCase();
  
  // Map common roles to distinct Catppuccin colors
  const colorMap: Record<string, string> = {
    // Original 5
    researcher: theme.accent.blue,
    optimist: theme.accent.green,
    pessimist: theme.accent.red,
    ethicist: theme.accent.yellow,
    moderator: theme.accent.mauve,
    
    // Additional 5+
    skeptic: theme.accent.peach,
    proponent: theme.accent.teal,
    analyst: theme.accent.sky,
    creator: theme.accent.pink,
    synthesizer: theme.accent.rosewater,
    reviewer: theme.accent.flamingo,
    critic: theme.accent.maroon,
    coordinator: theme.accent.sapphire,
  };

  return colorMap[roleLower] || theme.accent.lavender;
};
