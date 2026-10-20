import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface TimerDisplayProps {
  initialTimeRemaining: number;
  totalDuration: number;
  isPaused: boolean;
  /** Called each second with remaining seconds; updates a ref in parent without re-rendering the entire page */
  onTimeUpdate: (seconds: number) => void;
  onTimeUp: () => void;
  compact?: boolean;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = React.memo(
  ({
    initialTimeRemaining,
    totalDuration,
    isPaused,
    onTimeUpdate,
    onTimeUp,
    compact = false,
  }) => {
    const [secondsLeft, setSecondsLeft] = useState<number>(initialTimeRemaining);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const onTimeUpRef = useRef(onTimeUp);
    onTimeUpdateRef.current = onTimeUpdate;
    onTimeUpRef.current = onTimeUp;

    // Sync if initialTimeRemaining changes externally (e.g. draft restored or retry)
    useEffect(() => {
      setSecondsLeft(initialTimeRemaining);
    }, [initialTimeRemaining]);

    useEffect(() => {
      if (isPaused || totalDuration <= 0) return;

      if (secondsLeft <= 0) {
        onTimeUpRef.current();
        return;
      }

      // Use wall-clock target timestamp so background tab throttling never causes timer drift
      const targetEndMs = Date.now() + secondsLeft * 1000;

      const interval = setInterval(() => {
        const nextSecs = Math.max(
          0,
          Math.round((targetEndMs - Date.now()) / 1000)
        );
        setSecondsLeft(nextSecs);
        onTimeUpdateRef.current(nextSecs);

        if (nextSecs <= 0) {
          clearInterval(interval);
          onTimeUpRef.current();
        }
      }, 1000);

      return () => clearInterval(interval);
    }, [isPaused, totalDuration, initialTimeRemaining]);

    // Format seconds to MM:SS or HH:MM:SS
    const formatTime = (secs: number) => {
      if (secs < 0) return '00:00';
      const hours = Math.floor(secs / 3600);
      const minutes = Math.floor((secs % 3600) / 60);
      const seconds = secs % 60;

      const pad = (n: number) => n.toString().padStart(2, '0');

      if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
      }
      return `${pad(minutes)}:${pad(seconds)}`;
    };

    const isLowTime = secondsLeft <= 300 && secondsLeft > 0; // Under 5 minutes
    const isCriticalTime = secondsLeft <= 60 && secondsLeft > 0; // Under 1 minute

    if (totalDuration <= 0) {
      return (
        <div
          className={`flex items-center gap-1.5 ${
            compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs'
          } bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-semibold`}
        >
          <Clock size={compact ? 14 : 16} />
          <span>{compact ? 'Tự do' : 'Không giới hạn thời gian'}</span>
        </div>
      );
    }

    return (
      <div
        className={`flex items-center gap-2 ${
          compact
            ? 'px-2.5 py-1 text-xs sm:text-sm'
            : 'px-3.5 py-2 text-sm sm:text-base'
        } rounded-xl font-mono font-bold border transition-colors ${
          isCriticalTime
            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 animate-pulse'
            : isLowTime
            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
            : 'bg-blue-50/90 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
        }`}
        title="Thời gian làm bài còn lại"
      >
        {isCriticalTime ? (
          <AlertTriangle size={compact ? 15 : 18} />
        ) : (
          <Clock size={compact ? 15 : 18} />
        )}
        <span>{formatTime(secondsLeft)}</span>
      </div>
    );
  }
);
