import { useState, useEffect, useCallback } from "react";

// Storage Keys
const KEYS = {
  FOCUS_DURATION: "pomodoro_focus_duration",
  BREAK_DURATION: "pomodoro_break_duration",
  AUTO_START: "pomodoro_auto_start",
  AUTO_MOVE_BREAK: "pomodoro_auto_move_break",
  IS_BREAK: "pomodoro_is_break",
  BREAK_CREDITS: "pomodoro_break_credits",
  CREDITS_DATE: "pomodoro_credits_date",
  SAVED_REMAINING: "pomodoro_saved_remaining",
  IS_PAUSED: "pomodoro_is_paused",
  DAILY_FOCUS_DATE: "pomodoro_daily_focus_date",
  DAILY_FOCUS_TIME: "pomodoro_daily_focus_time",
};

export const getTodayDateString = (): string => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

export interface PomodoroState {
  timeRemaining: number | null; // in seconds
  activeDuration: number | null; // in seconds
  isBreak: boolean;
  isPaused: boolean;
  focusDuration: number; // in minutes
  breakDuration: number; // in minutes
  autoStart: boolean;
  autoMoveToBreak: boolean;
  breakCredits: number; // in minutes
  totalDailyFocusTime: number; // in seconds
  sessionFinishedChoice: boolean;
}

export function usePomodoro() {
  const [focusDuration, setFocusDuration] = useState<number>(25);
  const [breakDuration, setBreakDuration] = useState<number>(5);
  const [autoStart, setAutoStart] = useState<boolean>(true);
  const [autoMoveToBreak, setAutoMoveToBreak] = useState<boolean>(false);

  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [activeDuration, setActiveDuration] = useState<number | null>(null);
  const [isBreak, setIsBreak] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [sessionFinishedChoice, setSessionFinishedChoice] = useState<boolean>(false);

  // Daily Focus & Break Credits State
  const [breakCredits, setBreakCredits] = useState<number>(0);
  const [totalDailyFocusTime, setTotalDailyFocusTime] = useState<number>(0);

  // Hydrate from localStorage on client mount to prevent SSR hydration mismatches
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedFocus = localStorage.getItem(KEYS.FOCUS_DURATION);
    if (savedFocus) setFocusDuration(Math.min(60, Math.max(1, parseInt(savedFocus, 10))));

    const savedBreak = localStorage.getItem(KEYS.BREAK_DURATION);
    if (savedBreak) setBreakDuration(Math.min(10, Math.max(5, parseInt(savedBreak, 10))));

    const savedAutoStart = localStorage.getItem(KEYS.AUTO_START);
    if (savedAutoStart !== null) setAutoStart(savedAutoStart === "true");

    const savedAutoMove = localStorage.getItem(KEYS.AUTO_MOVE_BREAK);
    if (savedAutoMove !== null) setAutoMoveToBreak(savedAutoMove === "true");

    const savedRemaining = localStorage.getItem(KEYS.SAVED_REMAINING);
    if (savedRemaining) setTimeRemaining(parseInt(savedRemaining, 10));

    setIsBreak(localStorage.getItem(KEYS.IS_BREAK) === "true");

    const today = getTodayDateString();
    const savedCreditsDate = localStorage.getItem(KEYS.CREDITS_DATE);
    if (savedCreditsDate && savedCreditsDate !== today) {
      localStorage.setItem(KEYS.CREDITS_DATE, today);
      localStorage.setItem(KEYS.BREAK_CREDITS, "0");
      setBreakCredits(0);
    } else {
      const savedCredits = localStorage.getItem(KEYS.BREAK_CREDITS);
      if (savedCredits) setBreakCredits(parseInt(savedCredits, 10));
    }

    const savedDailyDate = localStorage.getItem(KEYS.DAILY_FOCUS_DATE);
    const savedDailyTime = localStorage.getItem(KEYS.DAILY_FOCUS_TIME);
    if (savedDailyDate === today && savedDailyTime !== null) {
      setTotalDailyFocusTime(parseInt(savedDailyTime, 10));
    } else {
      localStorage.setItem(KEYS.DAILY_FOCUS_DATE, today);
      localStorage.setItem(KEYS.DAILY_FOCUS_TIME, "0");
      setTotalDailyFocusTime(0);
    }
  }, []);

  // Global event dispatcher for app-wide break state changes
  const notifyBreakState = useCallback((inBreak: boolean) => {
    if (typeof window === "undefined") return;
    setIsBreak(inBreak);
    if (inBreak) {
      localStorage.setItem(KEYS.IS_BREAK, "true");
    } else {
      localStorage.removeItem(KEYS.IS_BREAK);
    }
    window.dispatchEvent(new CustomEvent("pomodoroStateChange"));
  }, []);

  // Midnight Rollover Reset
  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkMidnight = () => {
      const today = getTodayDateString();
      const savedDate = localStorage.getItem(KEYS.CREDITS_DATE);
      if (savedDate && savedDate !== today) {
        setBreakCredits(0);
        localStorage.setItem(KEYS.CREDITS_DATE, today);
        localStorage.setItem(KEYS.BREAK_CREDITS, "0");
      }
    };
    const interval = setInterval(checkMidnight, 30000);
    return () => clearInterval(interval);
  }, []);

  // Start Focus Session
  const startFocus = useCallback(
    (minutes: number = focusDuration) => {
      notifyBreakState(false);
      setSessionFinishedChoice(false);
      setIsPaused(false);
      const durationSec = Math.min(60, Math.max(1, minutes)) * 60;
      setActiveDuration(durationSec);
      setTimeRemaining(durationSec);
      if (typeof window !== "undefined") {
        localStorage.setItem(KEYS.SAVED_REMAINING, durationSec.toString());
      }
    },
    [focusDuration, notifyBreakState],
  );

  // Start Break Session
  const startBreak = useCallback(
    (minutes: number = breakDuration) => {
      notifyBreakState(true);
      setSessionFinishedChoice(false);
      setIsPaused(false);
      const durationSec = Math.min(15, Math.max(1, minutes)) * 60;
      setActiveDuration(durationSec);
      setTimeRemaining(durationSec);
      if (typeof window !== "undefined") {
        localStorage.setItem(KEYS.SAVED_REMAINING, durationSec.toString());
      }
    },
    [breakDuration, notifyBreakState],
  );

  // Stop / Reset Timer
  const stopTimer = useCallback(() => {
    setTimeRemaining(null);
    setActiveDuration(null);
    setIsPaused(false);
    notifyBreakState(false);
    if (typeof window !== "undefined") {
      localStorage.removeItem(KEYS.SAVED_REMAINING);
    }
  }, [notifyBreakState]);

  // Pause & Resume
  const pauseTimer = useCallback(() => setIsPaused(true), []);
  const resumeTimer = useCallback(() => setIsPaused(false), []);

  // Earn & Consume Break Credits
  const addBreakCredit = useCallback((mins: number) => {
    const today = getTodayDateString();
    setBreakCredits((prev) => {
      const next = prev + mins;
      if (typeof window !== "undefined") {
        localStorage.setItem(KEYS.BREAK_CREDITS, next.toString());
        localStorage.setItem(KEYS.CREDITS_DATE, today);
      }
      return next;
    });
  }, []);

  const skipBreakToStudy = useCallback(() => {
    addBreakCredit(breakDuration);
    if (autoStart) {
      startFocus(focusDuration);
    } else {
      stopTimer();
    }
  }, [addBreakCredit, breakDuration, autoStart, focusDuration, startFocus, stopTimer]);

  // Core Timer Tick Interval
  useEffect(() => {
    if (timeRemaining === null || isPaused) return;

    if (timeRemaining <= 0) {
      if (!isBreak) {
        // Focus Completed -> Accumulate daily total
        const addedSecs = activeDuration || focusDuration * 60;
        setTotalDailyFocusTime((prev) => {
          const next = prev + addedSecs;
          if (typeof window !== "undefined") {
            localStorage.setItem(KEYS.DAILY_FOCUS_TIME, next.toString());
          }
          return next;
        });

        if (autoMoveToBreak) {
          startBreak(breakDuration);
        } else {
          setSessionFinishedChoice(true);
          setTimeRemaining(null);
        }
      } else {
        // Break Completed -> Start next focus if autoStart is active
        notifyBreakState(false);
        if (autoStart) {
          startFocus(focusDuration);
        } else {
          stopTimer();
        }
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [
    timeRemaining,
    isPaused,
    isBreak,
    activeDuration,
    focusDuration,
    breakDuration,
    autoMoveToBreak,
    autoStart,
    startBreak,
    startFocus,
    stopTimer,
    notifyBreakState,
  ]);

  // Save State on Tab Close / Hide
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleClose = () => {
      if (timeRemaining !== null && timeRemaining > 0) {
        localStorage.setItem(KEYS.SAVED_REMAINING, timeRemaining.toString());
      }
    };
    window.addEventListener("beforeunload", handleClose);
    window.addEventListener("pagehide", handleClose);
    return () => {
      window.removeEventListener("beforeunload", handleClose);
      window.removeEventListener("pagehide", handleClose);
    };
  }, [timeRemaining]);

  return {
    timeRemaining,
    activeDuration,
    isBreak,
    isPaused,
    focusDuration,
    breakDuration,
    autoStart,
    autoMoveToBreak,
    breakCredits,
    totalDailyFocusTime,
    sessionFinishedChoice,
    startFocus,
    startBreak,
    stopTimer,
    pauseTimer,
    resumeTimer,
    skipBreakToStudy,
    setFocusDuration: (m: number) => {
      setFocusDuration(m);
      if (typeof window !== "undefined") localStorage.setItem(KEYS.FOCUS_DURATION, m.toString());
    },
    setBreakDuration: (m: number) => {
      setBreakDuration(m);
      if (typeof window !== "undefined") localStorage.setItem(KEYS.BREAK_DURATION, m.toString());
    },
    setAutoStart: (v: boolean) => {
      setAutoStart(v);
      if (typeof window !== "undefined") localStorage.setItem(KEYS.AUTO_START, v.toString());
    },
    setAutoMoveToBreak: (v: boolean) => {
      setAutoMoveToBreak(v);
      if (typeof window !== "undefined") localStorage.setItem(KEYS.AUTO_MOVE_BREAK, v.toString());
    },
  };
}
