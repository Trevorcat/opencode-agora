import React from 'react';
import { theme } from '../theme.js';

export type GuidanceInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export const GuidanceInput: React.FC<GuidanceInputProps> = ({ 
  value, 
  onChange, 
  onSubmit, 
  onCancel 
}) => {
  return (
    <box 
      style={{ 
        borderStyle: 'single', 
        borderColor: theme.accent.yellow,
        width: '100%',
        height: 3,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text style={{ bold: true, fg: theme.accent.yellow }}>⚡ INJECT GUIDANCE ➔ </text>
      <input
        value={value}
        onInput={onChange}
        onSubmit={onSubmit}
        placeholder="Type guidance..."
        style={{ flexGrow: 1 }}
        focused={true}
      />
      <text style={{ fg: theme.text.dim }}> (Enter to send, Esc to cancel)</text>
    </box>
  );
};
