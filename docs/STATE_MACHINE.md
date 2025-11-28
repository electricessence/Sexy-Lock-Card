# State Machine Documentation

## Overview

The Door Sense Card implements a sophisticated state machine that handles lock state transitions with smooth animations. This document explains the internal logic and transition rules.

## State Model

### Entity States (Input)

These are the states that can be reported by the Home Assistant lock entity:

| State | Description | Source |
|-------|-------------|--------|
| `locked` | Lock is fully locked | Any lock |
| `unlocked` | Lock is fully unlocked | Any lock |
| `locking` | Lock is in the process of locking | Advanced locks or template locks |
| `unlocking` | Lock is in the process of unlocking | Advanced locks or template locks |
| `jammed` | Lock mechanism is jammed | Advanced locks |
| `unknown` | Lock state cannot be determined | Any lock |
| `unavailable` | Lock entity is offline | Any lock |

### Visual States (Internal)

These are the internal visual states used by the card for rendering:

| Visual State | Icon | Color | Animation |
|--------------|------|-------|-----------|
| `locked` | Closed lock | Green | None |
| `unlocked` | Open lock | Red | None |
| `locking` | Half-closed lock | Yellow | Rotate-pulse |
| `unlocking` | Half-open lock | Yellow | Rotate-pulse |
| `jammed` | Closed lock + "!" | Orange | Shake |
| `unknown` | Closed lock + "?" | Grey | Breathe |

### Animation Phases

The card tracks animation state through phases:

| Phase | Description |
|-------|-------------|
| `idle` | No animation in progress |
| `transitioning` | Currently animating between states |
| `complete` | Animation just completed, settling |

## State Transition Logic

### 1. Direct State Mapping

When the lock entity provides transitional states, the card uses them directly:

```
Entity State â†’ Visual State
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
locked       â†’ locked
unlocked     â†’ unlocked
locking      â†’ locking (with animation)
unlocking    â†’ unlocking (with animation)
jammed       â†’ jammed (with shake)
unknown      â†’ unknown (with breathe)
```

### 2. Synthetic Transition Generation

When the lock entity jumps directly between states (e.g., `locked` â†’ `unlocked`), the card generates a smooth transition:

```
User Action: Unlock
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Time: 0ms      â†’ Visual: locked
Time: 0ms      â†’ Start transition
Time: 200ms    â†’ Visual: unlocking (midpoint)
Time: 400ms    â†’ Visual: unlocked
Time: 400ms    â†’ Animation complete
```

```
User Action: Lock
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Time: 0ms      â†’ Visual: unlocked
Time: 0ms      â†’ Start transition
Time: 200ms    â†’ Visual: locking (midpoint)
Time: 400ms    â†’ Visual: locked
Time: 400ms    â†’ Animation complete
```

### 3. Manual Change Detection

When the lock state changes without a user action (e.g., someone manually turns the lock), the card still animates:

```
External Change: locked â†’ unlocked
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Detection      â†’ State jump detected
Phase 1        â†’ Animate to "unlocking"
Phase 2        â†’ Animate to "unlocked"
Duration       â†’ 400ms total (200ms per phase)
```

## Transition Decision Matrix

### Should Animate Through Midpoint?

The card uses this logic to determine if a midpoint animation is needed:

```javascript
FROM        TO          MIDPOINT?   MIDPOINT STATE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
locked   â†’ unlocked     YES         unlocking
locked   â†’ unlocking    NO          (direct)
locked   â†’ locking      NO          (direct)

unlocked â†’ locked       YES         locking
unlocked â†’ locking      NO          (direct)
unlocked â†’ unlocking    NO          (direct)

locking  â†’ unlocked     YES         unlocking
locking  â†’ unlocking    NO          (direct)
locking  â†’ locked       NO          (direct)

unlocking â†’ locked      YES         locking
unlocking â†’ locking     NO          (direct)
unlocking â†’ unlocked    NO          (direct)

jammed   â†’ any          NO          (direct)
unknown  â†’ any          NO          (direct)
```

### Midpoint State Selection

```
Target is "locked" or "locking"  â†’ Midpoint = "locking"
Target is "unlocked" or "unlocking" â†’ Midpoint = "unlocking"
```

## Animation Timeline

### Example: User Taps to Unlock

```
Timeline (400ms animation_duration)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

0ms     â”ƒ User taps card
        â”ƒ Current: locked
        â”ƒ Target: unlocked
        â”ƒ Decision: Needs midpoint animation
        â”ƒ
        â”œâ”€â†’ Phase 1 starts
        â”ƒ   Visual state: unlocking
        â”ƒ   Animation: rotate-pulse
        â”ƒ   Color: yellow
        â”ƒ
200ms   â”ƒ Phase 1 completes
        â”ƒ
        â”œâ”€â†’ Phase 2 starts
        â”ƒ   Visual state: unlocked
        â”ƒ   Animation: rotate-pulse (finishing)
        â”ƒ   Color: red
        â”ƒ
400ms   â”ƒ Phase 2 completes
        â”ƒ
        â”œâ”€â†’ Set to idle
        â”ƒ   Visual state: unlocked
        â”ƒ   Animation: none
        â”ƒ   Color: red
        â”ƒ
        â–¼ Complete
```

### Example: Entity Provides "locking" State

```
Timeline (entity has transitional state)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

0ms     â”ƒ User taps card
        â”ƒ HA service: lock.lock
        â”ƒ
~50ms   â”ƒ Entity state: locking
        â”ƒ Decision: Direct mapping (no midpoint)
        â”ƒ
        â”œâ”€â†’ Immediate update
        â”ƒ   Visual state: locking
        â”ƒ   Animation: rotate-pulse
        â”ƒ   Color: yellow
        â”ƒ
~2000ms â”ƒ Entity state: locked (actual lock completes)
        â”ƒ Decision: Direct mapping
        â”ƒ
        â”œâ”€â†’ Immediate update
        â”ƒ   Visual state: locked
        â”ƒ   Animation: none
        â”ƒ   Color: green
        â”ƒ
        â–¼ Complete
```

## CSS Animation Details

### Rotate-Pulse Animation

Used during `locking`/`unlocking` states:

```css
@keyframes rotate-pulse {
  0%   { transform: scale(1) rotate(0deg); }
  25%  { transform: scale(1.1) rotate(-10deg); }
  50%  { transform: scale(1.15) rotate(0deg); }
  75%  { transform: scale(1.1) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); }
}
```

Duration: Matches `animation_duration` (default 400ms)

### Shake Animation

Used for `jammed` state:

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px) rotate(-2deg); }
  75%      { transform: translateX(4px) rotate(2deg); }
}
```

Duration: 500ms
Iteration: infinite

### Breathe Animation

Used for `unknown`/`unavailable` states:

```css
@keyframes breathe {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
```

Duration: 2000ms
Iteration: infinite

## State Machine Flow Diagram

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                  Entity State Change                     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Normalize      â”‚
            â”‚ State          â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Same as        â”‚ YES
            â”‚ previous?      â”œâ”€â”€â”€â”€â”€â”€â”€â”€â†’ (do nothing)
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚ NO
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Needs          â”‚ NO    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ midpoint?      â”œâ”€â”€â”€â”€â”€â”€â”€â†’â”‚ Direct       â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜        â”‚ transition   â”‚
                     â”‚ YES            â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Get midpoint   â”‚
            â”‚ state          â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Phase 1:       â”‚
            â”‚ Animate to     â”‚
            â”‚ midpoint       â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
                     â”‚ (animation_duration / 2)
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Phase 2:       â”‚
            â”‚ Animate to     â”‚
            â”‚ target         â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                     â”‚
                     â”‚ (animation_duration / 2)
                     â–¼
            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
            â”‚ Mark as idle   â”‚
            â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Edge Cases

### 1. Rapid State Changes

If the entity state changes multiple times during an animation:

```
Strategy: Cancel current animation, start new transition
Result: Smooth continuation to new target state
```

### 2. State Change During Midpoint

```
Example:
  Time 0ms:   locked â†’ unlocked transition starts
  Time 100ms: Entity reports "locking"
  
Action: 
  Cancel unlock animation
  Start lock animation
  Visual state: locking
```

### 3. Unknown â†’ Known Transition

```
Strategy: Direct transition (no midpoint)
Reason: Cannot determine meaningful midpoint
```

### 4. Same State Update

```
Example: Entity reports "locked" while already showing "locked"
Action: No visual change, no animation
```

## Performance Considerations

### Timer Management

- Only one animation timer active at a time
- Timers are cleared when:
  - New transition starts
  - Component is disconnected from DOM
  - State change interrupts current animation

### DOM Updates

- Visual updates only triggered when state actually changes
- CSS transitions handle smooth color/size changes
- JavaScript only manages state classes, not manual frame updates

### Memory

- No memory leaks: timers cleared on disconnect
- Minimal state storage: only current visual state and animation phase
- No animation frame loops (uses CSS transitions)

## Customization

### Adjusting Animation Speed

```yaml
animation_duration: 300  # Faster (snappier)
animation_duration: 600  # Slower (more dramatic)
```

Affects:
- Midpoint transition timing (duration / 2)
- Rotate-pulse animation speed
- Overall feel of the card

### Custom State Logic

To modify transition logic, edit `_shouldAnimateThroughMidpoint()`:

```javascript
_shouldAnimateThroughMidpoint(from, to) {
  // Custom logic here
  // Return true for midpoint animation
  // Return false for direct transition
}
```

## Testing Scenarios

### Test 1: Basic Toggle
```
Action: Tap card (locked â†’ unlocked)
Expected: Smooth animation through "unlocking" midpoint
Duration: ~400ms
```

### Test 2: Manual Lock Operation
```
Setup: Change entity state directly in Developer Tools
Action: Set lock.entity to "unlocked" (from "locked")
Expected: Card animates transition automatically
```

### Test 3: Template Lock
```
Setup: Use template lock with "locking" state
Action: Lock the lock
Expected: Card shows "locking" state immediately, then "locked"
```

### Test 4: Jammed State
```
Setup: Set entity to "jammed"
Expected: Orange color, shaking animation, no transition
```

### Test 5: Rapid Changes
```
Setup: Quickly toggle lock multiple times
Expected: Each transition animates, interrupting previous
```

## Conclusion

The state machine provides:
- **Robustness**: Works with any lock, regardless of capabilities
- **Smoothness**: Always animates, never snaps
- **Intelligence**: Detects manual changes and animates them
- **Flexibility**: Customizable timing and behavior
- **Performance**: Efficient CSS-based animations

This architecture ensures a polished, professional user experience for any Home Assistant lock entity.

