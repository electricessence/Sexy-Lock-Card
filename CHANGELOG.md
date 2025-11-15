# Changelog

All notable changes to Sexy Lock Card will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/electricessence/Sexy-Lock-Card/releases/tag/v1.0.0
