# State Machine Documentation

## Overview

The Sexy Lock Card implements a sophisticated state machine that handles lock state transitions with smooth animations. This document explains the internal logic and transition rules.

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
Entity State → Visual State
─────────────────────────────
locked       → locked
unlocked     → unlocked
locking      → locking (with animation)
unlocking    → unlocking (with animation)
jammed       → jammed (with shake)
unknown      → unknown (with breathe)
```

### 2. Synthetic Transition Generation

When the lock entity jumps directly between states (e.g., `locked` → `unlocked`), the card generates a smooth transition:

```
User Action: Unlock
─────────────────────────────────────────────
Time: 0ms      → Visual: locked
Time: 0ms      → Start transition
Time: 200ms    → Visual: unlocking (midpoint)
Time: 400ms    → Visual: unlocked
Time: 400ms    → Animation complete
```

```
User Action: Lock
─────────────────────────────────────────────
Time: 0ms      → Visual: unlocked
Time: 0ms      → Start transition
Time: 200ms    → Visual: locking (midpoint)
Time: 400ms    → Visual: locked
Time: 400ms    → Animation complete
```

### 3. Manual Change Detection

When the lock state changes without a user action (e.g., someone manually turns the lock), the card still animates:

```
External Change: locked → unlocked
─────────────────────────────────────────────
Detection      → State jump detected
Phase 1        → Animate to "unlocking"
Phase 2        → Animate to "unlocked"
Duration       → 400ms total (200ms per phase)
```

## Transition Decision Matrix

### Should Animate Through Midpoint?

The card uses this logic to determine if a midpoint animation is needed:

```javascript
FROM        TO          MIDPOINT?   MIDPOINT STATE
────────────────────────────────────────────────────
locked   → unlocked     YES         unlocking
locked   → unlocking    NO          (direct)
locked   → locking      NO          (direct)

unlocked → locked       YES         locking
unlocked → locking      NO          (direct)
unlocked → unlocking    NO          (direct)

locking  → unlocked     YES         unlocking
locking  → unlocking    NO          (direct)
locking  → locked       NO          (direct)

unlocking → locked      YES         locking
unlocking → locking     NO          (direct)
unlocking → unlocked    NO          (direct)

jammed   → any          NO          (direct)
unknown  → any          NO          (direct)
```

### Midpoint State Selection

```
Target is "locked" or "locking"  → Midpoint = "locking"
Target is "unlocked" or "unlocking" → Midpoint = "unlocking"
```

## Animation Timeline

### Example: User Taps to Unlock

```
Timeline (400ms animation_duration)
═══════════════════════════════════════════════════════════

0ms     ┃ User taps card
        ┃ Current: locked
        ┃ Target: unlocked
        ┃ Decision: Needs midpoint animation
        ┃
        ├─→ Phase 1 starts
        ┃   Visual state: unlocking
        ┃   Animation: rotate-pulse
        ┃   Color: yellow
        ┃
200ms   ┃ Phase 1 completes
        ┃
        ├─→ Phase 2 starts
        ┃   Visual state: unlocked
        ┃   Animation: rotate-pulse (finishing)
        ┃   Color: red
        ┃
400ms   ┃ Phase 2 completes
        ┃
        ├─→ Set to idle
        ┃   Visual state: unlocked
        ┃   Animation: none
        ┃   Color: red
        ┃
        ▼ Complete
```

### Example: Entity Provides "locking" State

```
Timeline (entity has transitional state)
═══════════════════════════════════════════════════════════

0ms     ┃ User taps card
        ┃ HA service: lock.lock
        ┃
~50ms   ┃ Entity state: locking
        ┃ Decision: Direct mapping (no midpoint)
        ┃
        ├─→ Immediate update
        ┃   Visual state: locking
        ┃   Animation: rotate-pulse
        ┃   Color: yellow
        ┃
~2000ms ┃ Entity state: locked (actual lock completes)
        ┃ Decision: Direct mapping
        ┃
        ├─→ Immediate update
        ┃   Visual state: locked
        ┃   Animation: none
        ┃   Color: green
        ┃
        ▼ Complete
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
┌─────────────────────────────────────────────────────────┐
│                  Entity State Change                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │ Normalize      │
            │ State          │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │ Same as        │ YES
            │ previous?      ├────────→ (do nothing)
            └────────┬───────┘
                     │ NO
                     ▼
            ┌────────────────┐
            │ Needs          │ NO    ┌──────────────┐
            │ midpoint?      ├───────→│ Direct       │
            └────────┬───────┘        │ transition   │
                     │ YES            └──────────────┘
                     ▼
            ┌────────────────┐
            │ Get midpoint   │
            │ state          │
            └────────┬───────┘
                     │
                     ▼
            ┌────────────────┐
            │ Phase 1:       │
            │ Animate to     │
            │ midpoint       │
            └────────┬───────┘
                     │
                     │ (animation_duration / 2)
                     ▼
            ┌────────────────┐
            │ Phase 2:       │
            │ Animate to     │
            │ target         │
            └────────┬───────┘
                     │
                     │ (animation_duration / 2)
                     ▼
            ┌────────────────┐
            │ Mark as idle   │
            └────────────────┘
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
  Time 0ms:   locked → unlocked transition starts
  Time 100ms: Entity reports "locking"
  
Action: 
  Cancel unlock animation
  Start lock animation
  Visual state: locking
```

### 3. Unknown → Known Transition

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
Action: Tap card (locked → unlocked)
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
