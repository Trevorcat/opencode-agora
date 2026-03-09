import { useEffect, useRef } from 'react';
import { Mouse, type MouseEvent as XtermMouseEvent } from 'xterm-mouse';

export interface MousePosition {
  x: number;
  y: number;
}

export interface MouseEvent {
  type: 'click' | 'scroll' | 'press';
  button: 'left' | 'right' | 'middle' | 'wheel' | 'none';
  position: MousePosition;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  scrollDelta?: number;
}

export type MouseHandler = (event: MouseEvent) => void;

/**
 * Hook to handle mouse events in terminal.
 * Uses xterm-mouse to enable mouse support.
 */
export function useMouse(handler: MouseHandler): void {
  const handlerRef = useRef(handler);
  
  // Keep ref up to date
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let mouse: Mouse | null = null;

    const setupMouse = () => {
      try {
        // Check if running in a TTY with required methods
        if (!process.stdin.isTTY || typeof process.stdin.ref !== 'function') {
          return;
        }

        mouse = new Mouse();
        
        // Enable mouse tracking
        mouse.enable();

        // Handle click events
        mouse.on('click', (event: XtermMouseEvent) => {
          const mappedEvent: MouseEvent = {
            type: 'click',
            button: mapButton(event.button),
            position: { x: event.x, y: event.y },
            shift: event.shift,
            ctrl: event.ctrl,
            alt: event.alt,
          };
          handlerRef.current(mappedEvent);
        });

        // Handle press events
        mouse.on('press', (event: XtermMouseEvent) => {
          const mappedEvent: MouseEvent = {
            type: 'press',
            button: mapButton(event.button),
            position: { x: event.x, y: event.y },
            shift: event.shift,
            ctrl: event.ctrl,
            alt: event.alt,
          };
          handlerRef.current(mappedEvent);
        });

        // Handle wheel events (scroll)
        mouse.on('wheel', (event: XtermMouseEvent) => {
          // Determine scroll delta based on wheel direction
          let scrollDelta = 0;
          if (event.button === 'wheel-up') scrollDelta = -1;
          else if (event.button === 'wheel-down') scrollDelta = 1;
          
          const mappedEvent: MouseEvent = {
            type: 'scroll',
            button: 'wheel',
            position: { x: event.x, y: event.y },
            shift: event.shift,
            ctrl: event.ctrl,
            alt: event.alt,
            scrollDelta,
          };
          handlerRef.current(mappedEvent);
        });

      } catch (err) {
        // Silently fail if mouse support not available
        // (e.g., in non-terminal environment or CI)
      }
    };

    setupMouse();

    return () => {
      if (mouse) {
        try {
          mouse.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);
}

function mapButton(
  button: string
): 'left' | 'right' | 'middle' | 'wheel' | 'none' {
  if (button === 'left') return 'left';
  if (button === 'right') return 'right';
  if (button === 'middle') return 'middle';
  if (button.startsWith('wheel')) return 'wheel';
  return 'none';
}

/**
 * Check if a position is within a box.
 */
export function isInBox(
  pos: MousePosition,
  box: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    pos.x >= box.x &&
    pos.x < box.x + box.width &&
    pos.y >= box.y &&
    pos.y < box.y + box.height
  );
}
