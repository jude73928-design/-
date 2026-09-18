I’ll fix this in two areas: playback control and TTS preloading.

## What I will change

1. Make Space only replay the current flashcard

- Pressing Space will restart the audio for the current card only.
- It will not grade the card.
- It will not advance to the next card.
- This will work the same whether Auto-play is on or off.

2. Stop autoplay from advancing after a manual replay

- The current bug happens because Space stops the autoplay audio, and the autoplay loop treats that stopped audio as “finished”, so it grades the card and moves forward.
- I’ll change the playback result tracking so autoplay only advances when the audio naturally finishes.
- If the user presses Space, clicks Play/Stop, changes speed, or otherwise interrupts playback, autoplay will not auto-grade from the interrupted playback.

3. Make card changes feel instant

- I’ll preload the current card’s audio as soon as the card appears.
- I’ll preload the next several cards instead of only one next card.
- I’ll keep the existing request deduplication/cache so repeated cards or replays do not refetch audio.
- I’ll warm the audio element itself, not just the blob URL, so the browser is more ready to play immediately.

4. Keep replay responsive with one press

- Space will always cancel whatever is currently playing/loading and immediately start the current card again.
- I’ll prevent held-down Space from repeatedly firing, but a single key press will trigger immediately.
- I’ll also make grade keys cancel playback cleanly without accidentally triggering another autoplay transition.

## Technical details

- Update `src/lib/tts.ts` so `TtsHandle.ended` resolves with a status such as `"ended" | "stopped" | "error"` instead of just resolving silently.
- Update `src/routes/study.tsx` so the autoplay effect only calls `grade(3)` when the result is `"ended"` for the same autoplay run/card.
- Add a separate autoplay-run/request guard so manual replay invalidates the old autoplay sequence.
- Extend `prefetchTts` into a stronger preload path that fetches and warms audio for the current card plus upcoming cards.
- Keep the existing pitch-preserving `<audio>` approach so 900 WPM support remains intact.

## Expected result

After this change:

- Space = replay current card only.
- Auto-play no longer skips when Space is pressed.
- Card-to-card playback should start much faster because upcoming audio is already fetched and warmed before it is needed.
