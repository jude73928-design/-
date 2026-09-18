import React, { useState } from "react";
import { usePomodoro } from "@/hooks/usePomodoro";
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  Award,
  Settings,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export const PomodoroWidget: React.FC = () => {
  const {
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
    setFocusDuration,
    setBreakDuration,
    setAutoStart,
    setAutoMoveToBreak,
  } = usePomodoro();

  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatHoursMins = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  const isTimerRunning = timeRemaining !== null;
  const progressPercent =
    timeRemaining !== null && activeDuration && activeDuration > 0
      ? Math.max(0, Math.min(100, ((activeDuration - timeRemaining) / activeDuration) * 100))
      : 0;

  return (
    <div className="relative inline-block text-left">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={isBreak ? "secondary" : isTimerRunning ? "default" : "outline"}
            size="sm"
            className={`gap-2 font-mono transition-all duration-300 shadow-sm ${
              isBreak
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                : isTimerRunning
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700"
            }`}
          >
            {isBreak ? (
              <Coffee className="w-4 h-4 text-emerald-400 animate-pulse" />
            ) : (
              <Brain className="w-4 h-4 text-purple-400" />
            )}
            <span className="font-semibold text-sm">
              {isTimerRunning ? formatTime(timeRemaining) : "Pomodoro"}
            </span>
            {isBreak && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/30 text-emerald-200 border-emerald-400/50 px-1.5 py-0"
              >
                Break
              </Badge>
            )}
            {breakCredits > 0 && !isTimerRunning && (
              <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30 px-1.5 py-0 gap-1">
                <Award className="w-2.5 h-2.5" />
                {breakCredits}m
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-80 p-4 bg-slate-900/95 backdrop-blur-md border-slate-800 text-slate-100 shadow-2xl rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg ${
                  isBreak
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-purple-500/20 text-purple-400"
                }`}
              >
                {isBreak ? <Coffee className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
              </div>
              <div>
                <h4 className="text-sm font-semibold leading-none">
                  {isBreak ? "Break Time" : "Focus Session"}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isBreak ? "Relax & refresh" : "Deep concentration mode"}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-slate-100"
              onClick={() => setShowSettings(!showSettings)}
              title="Pomodoro Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>

          {/* Settings View */}
          {showSettings ? (
            <div className="py-3 space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Timer Configuration
                </h5>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-purple-400 hover:text-purple-300 p-0"
                  onClick={() => setShowSettings(false)}
                >
                  Done
                </Button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <Label htmlFor="focus-dur" className="text-slate-300">
                    Focus Duration
                  </Label>
                  <div className="flex items-center gap-1.5">
                    {[15, 25, 45, 50].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setFocusDuration(m)}
                        className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                          focusDuration === m
                            ? "bg-purple-600 text-white font-medium"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="break-dur" className="text-slate-300">
                    Break Duration
                  </Label>
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 15].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setBreakDuration(m)}
                        className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                          breakDuration === m
                            ? "bg-emerald-600 text-white font-medium"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-move" className="text-slate-300 cursor-pointer">
                      Auto-start Breaks
                    </Label>
                    <Switch
                      id="auto-move"
                      checked={autoMoveToBreak}
                      onCheckedChange={setAutoMoveToBreak}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-start" className="text-slate-300 cursor-pointer">
                      Auto-start Focus Sessions
                    </Label>
                    <Switch id="auto-start" checked={autoStart} onCheckedChange={setAutoStart} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Main Timer View */
            <div className="py-4 space-y-4">
              {/* Display Countdown */}
              <div className="text-center relative py-2">
                <div
                  className={`text-4xl font-extrabold font-mono tracking-tight ${
                    isBreak
                      ? "text-emerald-400"
                      : isTimerRunning
                        ? "text-purple-300"
                        : "text-slate-300"
                  }`}
                >
                  {isTimerRunning
                    ? formatTime(timeRemaining)
                    : `${focusDuration.toString().padStart(2, "0")}:00`}
                </div>

                <p className="text-[11px] text-slate-400 mt-1">
                  {isTimerRunning
                    ? isPaused
                      ? "Paused"
                      : isBreak
                        ? "Resting & recharge"
                        : "Focused studying..."
                    : `Ready for ${focusDuration}m focus session`}
                </p>

                {/* Progress Bar */}
                {isTimerRunning && (
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 rounded-full ${
                        isBreak ? "bg-emerald-400" : "bg-purple-500"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Choice prompt when focus finishes without auto-move */}
              {sessionFinishedChoice && (
                <div className="p-3 bg-purple-950/60 border border-purple-500/30 rounded-xl text-center space-y-2">
                  <p className="text-xs text-purple-200 font-medium">🎉 Focus Session Completed!</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                      onClick={() => startBreak(breakDuration)}
                    >
                      <Coffee className="w-3.5 h-3.5 mr-1" />
                      Take Break ({breakDuration}m)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                      onClick={skipBreakToStudy}
                    >
                      <Zap className="w-3.5 h-3.5 mr-1" />
                      Skip (+{breakDuration}m Credit)
                    </Button>
                  </div>
                </div>
              )}

              {/* Action Controls */}
              <div className="flex items-center justify-center gap-2">
                {!isTimerRunning ? (
                  <>
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-500 text-white px-5 rounded-xl font-medium text-xs shadow-lg shadow-purple-900/30"
                      onClick={() => startFocus(focusDuration)}
                    >
                      <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                      Start Focus
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 rounded-xl font-medium text-xs border border-emerald-500/20"
                      onClick={() => startBreak(breakDuration)}
                    >
                      <Coffee className="w-3.5 h-3.5 mr-1" />
                      Break
                    </Button>
                  </>
                ) : (
                  <>
                    {isPaused ? (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 rounded-xl text-xs font-medium"
                        onClick={resumeTimer}
                      >
                        <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                        Resume
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 rounded-xl text-xs font-medium border border-slate-700"
                        onClick={pauseTimer}
                      >
                        <Pause className="w-3.5 h-3.5 mr-1" />
                        Pause
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-3 rounded-xl text-xs"
                      onClick={stopTimer}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Reset
                    </Button>
                  </>
                )}
              </div>

              {/* Daily Stats Footer */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1">
                  <Brain className="w-3 h-3 text-purple-400" />
                  <span>Daily Focus:</span>
                  <strong className="text-slate-200">{formatHoursMins(totalDailyFocusTime)}</strong>
                </div>

                <div className="flex items-center gap-1">
                  <Award className="w-3 h-3 text-amber-400" />
                  <span>Credits:</span>
                  <strong className="text-amber-300">{breakCredits}m</strong>
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
