# Changelog

All notable changes to Sexy Lock Card will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-11-17

### Added
- 🚪 **Door sensor awareness**: optional binary sensor gating prevents taps when the door is open and dims the lock UI for instant feedback.
- 👆 **Per-state tap actions** with debounce, allowing different behaviors when locked vs unlocked and the ability to disable either state entirely.
- 🔋 **Battery indicator**: configurable entity, threshold (default 35%), and corner placement; vertical, color-mapped gauge appears only when the level is low, plus new test harness controls to simulate battery drain.

### Changed
- 🔄 Direct locked↔unlocked transitions now snap rotation with halved duration and tuned easing but leave slide animations untouched for natural motion.
- 🌀 Requested-state handling snaps back reliably thanks to tighter timers and smarter state syncing during HA updates.
- 🧰 `test.html` gained live controls for the new door sensor, lock direction, and battery slider so you can demo all behaviors without HA.

### Fixed
- 🚫 Tap gestures are ignored while transitional states run or when door/battery guardrails block them, preventing accidental service calls.
- 🎯 Visual state stays in sync with entity reports even when HA skips intermediate states, avoiding stuck animations.

## [1.2.5] - 2025-11-15

### Added
- ↔️ `unlock_direction` option now mirrors the entire lock icon horizontally for true clockwise/counterclockwise parity.
- 🧪 `test.html` demo includes buttons to flip the direction live so you can verify behavior without HA.

### Changed
- 🎛️ Rotation math simplified internally; flipping now uses a CSS transform so the animations stay in sync.

## [1.2.4] - 2025-11-15

### Changed
- 🔄 Visual state now snaps directly to the reported Home Assistant state so missed intermediate events no longer leave the card in limbo.
- 🧹 Removed duplicate stub configuration helper to keep the editor metadata lean and accurate.

## [1.2.1] - 2025-11-15

### Added
- ⚙️ Configurable rotation duration (500-10000ms, default 3000ms)
- ⚙️ Configurable slide duration (100-5000ms, default 1000ms)
- 🎨 Expandable sections for Color Settings and Actions in UI editor
- 🎨 Home Assistant theme variable support with proper cascade

### Changed
- 🎨 Increased lock icon size by 25% (radius 35 → 43.75)
- ⏱️ Decoupled rotation (3s) and slide (1s) animation speeds
- 🔄 Unknown state: 45° rotation with subtle breathing glow (30-60% opacity)
- 🔄 Jammed state: 45° rotation with red breathing glow, removed wobble animation
- 🎯 Card background now transparent, inherits from ha-card
- 📐 Card now scales to fill container height like button-card
- 🎨 Responsive icon sizing using min() with width, height, and viewport units
- 📝 Text alignment centered for better layout

### Fixed
- 🔧 Color picker now uses text input for proper hex color support
- 🔧 All expandable sections now work independently
- 🔧 Card height and layout now properly fills available space
- 🎨 Theming now properly inherits HA CSS variables (--state-lock-*-color)
- 🎨 Removed black background, card now transparent by default

### Technical
- Animation durations now use CSS variables for dynamic updates
- Card uses flexbox layout with height: 100% for proper scaling
- CSS variables cascade: custom colors → --state-lock-{state}-color → domain colors → common colors
- Icon uses aspect-ratio and min() for responsive sizing
- Added --state-inactive-color support
- Multiple accordion sections supported via querySelectorAll

## [1.2.0] - 2025-11-15

### Added
- 🎨 **Advanced Animation Settings** - Expandable section in UI editor for power users
- 🌀 **Rotating gradient effect** on ring during lock-requested/unlock-requested states
- ⚙️ Configurable gradient rotation speed (0.5-10 seconds)
- 🔄 Configurable unlock direction (clockwise/counterclockwise)
- 📏 Adjustable slide offset (-1.0 to 1.0, supports negative values)
- 🎭 Refined animation choreography:
  - Locking: Semi-circles slide together early, then rotate
  - Unlocking: Rotate first, then semi-circles slide apart
- 🎯 Smart state transitions skip intermediate states when not user-initiated

### Changed
- ⏱️ Default animation duration increased to 2000ms for smoother visual effect
- 🎨 Improved color transitions during state changes
- 🔄 Decoupled rotation timing from slide timing for more natural motion
- 💫 Gradient overlay fades smoothly to prevent visible animation stops

### Technical
- Rotation only triggered on locking/unlocking/locked/unlocked states
- lock-requested maintains unlocked rotation until backend confirms
- unlock-requested maintains locked rotation until backend confirms
- Gradient speed now configurable via `gradient_speed` config parameter

## [1.1.1] - 2025-11-14

### Fixed
- 🔧 Entity selector now properly displays lock entities in UI editor
- 🔧 Fixed all form inputs to use proper Home Assistant selectors
- 🔧 Event handlers now correctly read values from selector components
- 🔧 Elements created programmatically to ensure proper hass object binding

## [1.1.0] - 2025-11-14

### Added
- 🎨 **Visual Card Editor** - Full UI configuration without YAML editing
- 📝 Entity picker with lock domain filtering
- 🎚️ Interactive controls for all card options
- ⚡ Real-time preview of configuration changes
- 🎯 Action selectors for tap and hold actions
- 📊 Animation duration slider with validation
- 💡 Smart defaults and helpful descriptions for all options

### Changed
- Card now appears in Home Assistant card picker with preview
- Enhanced card metadata with `getConfigElement()` and `getStubConfig()`

### Technical
- Added `SexyLockCardEditor` custom element
- Implemented Home Assistant editor protocol
- Full support for both UI and YAML configuration methods

## [1.0.0] - 2025-01-14

### Added
- 🎉 Initial release of Sexy Lock Card
- ✨ Full state machine with synthetic transitions
- 🎨 Animated lock icon with 6 visual states (locked, unlocked, locking, unlocking, jammed, unknown)
- 🔄 Automatic midpoint animation for locks without transitional states
- 📱 Mobile-friendly with long-press support for more-info
- ⚡ Lightweight vanilla JavaScript Web Component (no dependencies)
- 🎯 Configurable animation duration (300-600ms recommended)
- 🌈 Customizable colors via CSS variables
- 💡 Smart manual change detection (animates even when state jumps directly)
- 🛠️ Custom tap/hold actions support
- 📝 Complete documentation including state machine details
- 📦 Example configurations for various use cases
- 🔐 Template lock example with transitional states

### Features

#### Visual States
- **Locked**: Green ring, closed lock icon
- **Unlocked**: Red ring, open lock icon
- **Locking**: Yellow ring, half-closed icon with rotate-pulse animation
- **Unlocking**: Yellow ring, half-open icon with rotate-pulse animation
- **Jammed**: Orange ring, closed lock with "!" and shake animation
- **Unknown**: Grey ring, closed lock with "?" and breathe animation

#### Animations
- Rotate-pulse animation during transitions (400ms default)
- Shake animation for jammed state (infinite)
- Breathe animation for unknown state (2s cycle, infinite)
- Smooth CSS transitions for color and size changes

#### Configuration Options
- `entity` (required): Lock entity ID
- `name`: Custom display name
- `show_name`: Show/hide lock name (default: true)
- `show_state`: Show/hide state text (default: true)
- `animation_duration`: Animation timing in ms (default: 400)
- `tap_action`: Action on tap (default: toggle)
- `hold_action`: Action on hold (default: more-info)

#### Actions
- `toggle`: Lock/unlock toggle
- `more-info`: Open entity dialog
- `call-service`: Custom service call
- `none`: No action

### Documentation
- Comprehensive README with installation guide
- Quick start guide for 5-minute setup
- State machine documentation with flow diagrams
- 6 example YAML configurations
- Template lock example for transitional states
- Browser compatibility information
- Troubleshooting guide

### Technical
- Web Component built with vanilla JavaScript
- Shadow DOM encapsulation
- CSS custom properties for theming
- Efficient timer management (single active timer)
- Memory leak prevention (cleanup on disconnect)
- No external dependencies or frameworks
- Home Assistant card picker integration

### Browser Support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Home Assistant mobile apps (iOS/Android)

---

## [Unreleased]

### Planned Features
- Multiple lock icon styles (shackle, deadbolt, smart lock)
- Optional sound effects on state change
- Accessibility improvements (ARIA labels, keyboard navigation)
- HACS integration
- Animations for open/close direction (left/right)
- Battery level indicator support
- Last changed timestamp display
- Multiple entity support (gang lock control)

---

[1.1.1]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v1.1.1
[1.1.0]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v1.1.0
[1.0.0]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v1.0.0
[1.2.4]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v1.2.4
[1.2.5]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v1.2.5
[2.0.0]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v2.0.0
