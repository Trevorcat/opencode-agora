import { useState, useEffect, useCallback } from 'react';

interface StreamOptions {
  chunkSize?: number;
  delay?: number;
  onComplete?: () => void;
}

/**
 * Hook for streaming text content character by character
 * Simulates organic typing effect like LLM output
 */
export function useStreamText(
  fullText: string,
  isActive: boolean,
  options: StreamOptions = {}
) {
  const { chunkSize = 1, delay = 5, onComplete } = options;
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!isActive || !fullText) {
      setDisplayedText(fullText || '');
      setIsComplete(true);
      return;
    }

    setIsComplete(false);
    setDisplayedText('');
    
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex >= fullText.length) {
        clearInterval(interval);
        setIsComplete(true);
        onComplete?.();
        return;
      }

      const endIndex = Math.min(currentIndex + chunkSize, fullText.length);
      setDisplayedText(fullText.substring(0, endIndex));
      currentIndex = endIndex;
    }, delay);

    return () => clearInterval(interval);
  }, [fullText, isActive, chunkSize, delay, onComplete]);

  // Blinking cursor effect when streaming
  useEffect(() => {
    if (isComplete) {
      setCursorVisible(false);
      return;
    }

    const cursorInterval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, [isComplete]);

  return {
    text: displayedText,
    isComplete,
    cursorVisible,
    cursor: cursorVisible ? '█' : '',
  };
}

/**
 * Hook for animated Braille spinner
 */
export function useBrailleSpinner(isActive: boolean, interval: number = 80) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isActive, interval]);

  return frames[frame];
}

/**
 * Hook for dot spinner animation
 */
export function useDotSpinner(isActive: boolean, interval: number = 100) {
  const frames = ['⣾', '⣽', '⣻', '⢿', '⡿', '⡽', '⡾', '⡷'];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isActive, interval]);

  return frames[frame];
}

/**
 * Hook for polling with intelligent backoff
 */
export function usePolledData<T>(
  fetcher: () => Promise<T>,
  interval: number = 1000,
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    fetch();

    // Setup polling
    const timer = setInterval(fetch, interval);
    return () => clearInterval(timer);
  }, [fetch, interval, enabled]);

  return { data, error, isLoading, refetch: fetch };
}
