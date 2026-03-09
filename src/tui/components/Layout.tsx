import React, { ReactNode } from 'react';
import { Box } from 'ink';

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
  footer,
}) => {
  return (
    <Box flexDirection="column" height="100%" width="100%">
      {/* Header - Fixed height */}
      <Box height={3}>
        {header}
      </Box>

      {/* Main Content Area - 20/50/30 Split */}
      <Box flexGrow={1} flexDirection="row" width="100%">
        {/* Left Panel - Agents (20%) */}
        <Box width="20%">
          {leftPanel}
        </Box>

        {/* Center Panel - Forum (50%) */}
        <Box width="50%">
          {centerPanel}
        </Box>

        {/* Right Panel - Blackboard (30%) */}
        <Box width="30%">
          {rightPanel}
        </Box>
      </Box>

      {/* Footer - Fixed height */}
      <Box height={3}>
        {footer}
      </Box>
    </Box>
  );
};
