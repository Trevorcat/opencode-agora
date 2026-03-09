import React from 'react';

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
        borderColor: '#e0af68',
        padding: 1,
        flexDirection: 'row',
        height: '100%'
      }}
    >
      <text style={{ bold: true, color: '#e0af68' }}>⚡ INJECT GUIDANCE ➔ </text>
      <input
        value={value}
        onInput={onChange}
        onSubmit={onSubmit}
        placeholder="Type guidance..."
        style={{ flexGrow: 1 }}
        focused={true}
      />
      <text style={{ color: '#565f89' }}> (Enter to send, Esc to cancel)</text>
    </box>
  );
};
