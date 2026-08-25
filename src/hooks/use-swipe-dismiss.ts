'use client';

import { useRef, type TouchEventHandler } from 'react';

interface SwipeDismissHandlers {
  onTouchStart: TouchEventHandler<HTMLElement>;
  onTouchEnd: TouchEventHandler<HTMLElement>;
}

export function useSwipeDismiss(onDismiss: () => void, threshold = 72): SwipeDismissHandlers {
  const startY = useRef<number | null>(null);

  return {
    onTouchStart: (event) => {
      startY.current = event.changedTouches[0]?.clientY ?? null;
    },
    onTouchEnd: (event) => {
      const endY = event.changedTouches[0]?.clientY;
      if (startY.current !== null && endY !== undefined && endY - startY.current >= threshold) onDismiss();
      startY.current = null;
    },
  };
}
