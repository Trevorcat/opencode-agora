import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { COLORS, ANIMATION, createProgressBar } from '../design-tokens.js';

export type StatusType = 'thinking' | 'waiting' | 'posted' | 'error';

export interface AnimatedStatusProps {
  status: StatusType;
  progress?: number; // 0-100
  label?: string;
}

export function AnimatedStatus({ status, progress, label }: AnimatedStatusProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (status !== 'thinking') return;
    
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % ANIMATION.brailleSpinner.length);
    }, ANIMATION.interval);
    
    return () => clearInterval(timer);
  }, [status]);

  const getColor = () => {
    switch (status) {
      case 'thinking': return COLORS.thinking;
      case 'waiting': return COLORS.waiting;
      case 'posted': return COLORS.posted;
      case 'error': return COLORS.error;
      default: return COLORS.waiting;
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'thinking': return ANIMATION.brailleSpinner[frame];
      case 'waiting': return '○';
      case 'posted': return '●';
      case 'error': return '✗';
      default: return '○';
    }
  };

  const color = getColor();
  const icon = getIcon();

  return (
    <Text color={color}>
      {icon} {label && <Text>{label} </Text>}
      {progress !== undefined && <Text>{createProgressBar(progress, 5)}</Text>}
    </Text>
  );
}
