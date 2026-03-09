import React, { ReactNode } from 'react';
import { Box, Text } from 'ink';

interface LayoutProps {
  header: ReactNode;
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  footer: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  header,
  leftPanel,
  centerPanel,
  rightPanel,
  footer
}) => {
  return (
    <Box flexDirection="column" height="100%" width="100%">
      {/* High-impact Header */}
      <Box height={3} borderStyle="double" borderColor="magenta">
        {header}
      </Box>

      {/* Main Asymmetrical 3-Column Content Area */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left Column: AgentPanel - Slim, tight */}
        <Box width="20%" borderStyle="bold" borderColor="cyan" paddingX={1}>
          {leftPanel}
        </Box>

        {/* Center Column: PostFeed - The main stage */}
        <Box width="55%" borderStyle="round" borderColor="white" paddingX={1}>
          {centerPanel}
        </Box>

        {/* Right Column: BlackboardPanel - Data heavy */}
        <Box width="25%" borderStyle="single" borderColor="yellow" paddingX={1}>
          {rightPanel}
        </Box>
      </Box>

      {/* Footer / StatusBar - Sharp accent */}
      <Box height={3} borderStyle="classic" borderColor="green">
        {footer}
      </Box>
    </Box>
  );
};
