# Sexy Lock Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A highly polished, animated custom Lovelace card for Home Assistant that displays smart lock states with smooth visual transitions.

## Features

✨ **Smooth Animations** - All state transitions are animated, even when the lock entity only provides `locked`/`unlocked` states

🎨 **Visual State Machine** - Displays distinct visual states for:
- **Locked** (green)
- **Unlocked** (red)  
- **Locking** (yellow, transitioning)
- **Unlocking** (yellow, transitioning)
- **Jammed** (orange, shaking animation)
- **Unknown** (grey, breathing animation)

🔄 **Smart Transition Detection** - Automatically animates manual lock changes (e.g., physically turning the lock)

⚡ **Lightweight** - Pure JavaScript Web Component, no external dependencies (no Lit, no Mushroom, no Button-card)

🎯 **Production Ready** - Fully compatible with Home Assistant, works with any lock entity

---

## Screenshots

```
┌──────────────────────┐
│                      │
│     ╔═══╗            │  <- Locked (green ring)
│     ║   ║            │
│     ╚═══╝            │
│                      │
│    Front Door        │
│      Locked          │
│                      │
└──────────────────────┘

┌──────────────────────┐
│                      │
│     ╔═══╗            │  <- Unlocking (yellow ring, rotating)
│      ╲  ║            │
│       ╲ ║            │
│                      │
│    Front Door        │
│   Unlocking...       │
│                      │
└──────────────────────┘

┌──────────────────────┐
│                      │
│     ╔═══╗            │  <- Unlocked (red ring, open shackle)
│         ║╲           │
│         ║ ╲          │
│                      │
│    Front Door        │
│     Unlocked         │
│                      │
└──────────────────────┘
```

---

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant
2. Click on "Frontend"
3. Click the 3-dot menu in the top right
4. Select "Custom repositories"
5. Add this repository URL: `https://github.com/electricessence/Sexy-Lock-Card`
6. Category: `Lovelace`
7. Click "Add"
8. Click "Install" on the Sexy Lock Card
9. Restart Home Assistant
10. Clear browser cache (Ctrl+Shift+R)

### Manual Installation

1. Download `sexy-lock-card.js` from the [latest release](https://github.com/electricessence/Sexy-Lock-Card/releases)
2. Copy it to `<config>/www/sexy-lock-card.js`
3. Add the resource to Lovelace:
   
   **Via UI:**
   - Go to **Settings** → **Dashboards** → **Resources** (top right menu)
   - Click **Add Resource**
   - URL: `/local/sexy-lock-card.js`
   - Resource type: **JavaScript Module**
   - Click **Create**

   **Via YAML:**
   ```yaml
   resources:
     - url: /local/sexy-lock-card.js
       type: module
   ```

4. Restart Home Assistant
5. Clear browser cache (Ctrl+Shift+R)

---

## Usage

### Basic Configuration

Add the card to your Lovelace dashboard:

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
```

### Full Configuration

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
name: Front Door Lock
show_name: true
show_state: true
animation_duration: 400
tap_action:
  action: toggle
hold_action:
  action: more-info
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | **required** | Lock entity ID |
| `name` | string | entity name | Custom display name |
| `show_name` | boolean | `true` | Show/hide lock name |
| `show_state` | boolean | `true` | Show/hide state text |
| `animation_duration` | number | `400` | Animation duration in milliseconds (300-600 recommended) |
| `tap_action` | object | `{action: 'toggle'}` | Action on tap (see actions below) |
| `hold_action` | object | `{action: 'more-info'}` | Action on hold (see actions below) |

### Actions

#### Tap/Hold Actions

```yaml
tap_action:
  action: toggle  # toggle | more-info | call-service | none

# OR

tap_action:
  action: call-service
  service: lock.unlock
  service_data:
    entity_id: lock.front_door
```

Available actions:
- **`toggle`** - Toggle lock/unlock
- **`more-info`** - Open entity more-info dialog
- **`call-service`** - Call custom service
- **`none`** - Do nothing

---

## How It Works

### State Machine

The card implements an internal state machine that handles transitions intelligently:

1. **Direct State Support**: If your lock entity provides `locking`/`unlocking` states, the card uses them directly.

2. **Synthetic Transitions**: If your lock only provides `locked`/`unlocked`, the card **automatically generates** smooth transition animations.

3. **Manual Change Detection**: If the lock state changes externally (e.g., physically operated), the card animates the transition.

### Transition Logic

```
User taps to unlock:
  locked → [animate to "unlocking" midpoint] → unlocked
  Duration: 400ms (200ms per phase)

Lock entity reports "locking":
  Card immediately shows "locking" visual state

Lock manually changed:
  Card detects state jump and animates smoothly
```

### Visual States

| Entity State | Visual Appearance | Animation |
|-------------|-------------------|-----------|
| `locked` | Green ring, closed lock | None (stable) |
| `unlocked` | Red ring, open lock | None (stable) |
| `locking` | Yellow ring, half-closed | Rotate/pulse |
| `unlocking` | Yellow ring, half-open | Rotate/pulse |
| `jammed` | Orange ring, closed lock | Shake/vibrate |
| `unknown` | Grey ring, closed lock | Breathing effect |

---

## Advanced Examples

### Multiple Locks Dashboard

```yaml
type: vertical-stack
cards:
  - type: custom:sexy-lock-card
    entity: lock.front_door
    name: Front Door
    
  - type: custom:sexy-lock-card
    entity: lock.back_door
    name: Back Door
    
  - type: custom:sexy-lock-card
    entity: lock.garage_door
    name: Garage
```

### Custom Colors

You can override colors using CSS variables in your theme:

```yaml
# In your theme configuration
sexy-lock-card:
  --lock-locked-color: '#00ff00'      # Bright green
  --lock-unlocked-color: '#ff0000'    # Bright red
  --lock-transitioning-color: '#ffaa00' # Orange
  --lock-jammed-color: '#ff3300'      # Red-orange
  --lock-unknown-color: '#888888'     # Grey
```

Or apply inline (requires card-mod):

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
style: |
  :host {
    --lock-locked-color: #4caf50;
    --lock-unlocked-color: #f44336;
  }
```

### Fast Animations

For snappier animations:

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
animation_duration: 300
```

### Slow, Dramatic Animations

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
animation_duration: 600
```

---

## Template Lock Integration

If you want to create a template lock that provides transitional states (`locking`/`unlocking`), here's an example:

### configuration.yaml

```yaml
template:
  - lock:
      - name: "Smart Front Door Lock"
        unique_id: smart_front_door_lock
        value_template: "{{ states('lock.front_door_base') }}"
        
        lock:
          # Set to locking state, then call base lock
          - service: input_text.set_value
            target:
              entity_id: input_text.front_door_lock_state
            data:
              value: "locking"
          - delay: "00:00:00.5"
          - service: lock.lock
            target:
              entity_id: lock.front_door_base
          - delay: "00:00:01.5"
          - service: input_text.set_value
            target:
              entity_id: input_text.front_door_lock_state
            data:
              value: "{{ states('lock.front_door_base') }}"
        
        unlock:
          # Set to unlocking state, then call base unlock
          - service: input_text.set_value
            target:
              entity_id: input_text.front_door_lock_state
            data:
              value: "unlocking"
          - delay: "00:00:00.5"
          - service: lock.unlock
            target:
              entity_id: lock.front_door_base
          - delay: "00:00:01.5"
          - service: input_text.set_value
            target:
              entity_id: input_text.front_door_lock_state
            data:
              value: "{{ states('lock.front_door_base') }}"

# Helper for transition state
input_text:
  front_door_lock_state:
    name: Front Door Lock State
    initial: "unknown"
```

**Note**: Even without this template, the card will **still animate transitions** - this just gives you explicit control.

---

## Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Home Assistant iOS app
- ✅ Home Assistant Android app

---

## Troubleshooting

### Card not appearing

1. Verify the resource is added (Settings → Dashboards → Resources)
2. Check browser console for errors (F12)
3. Clear browser cache (Ctrl+Shift+R)
4. Verify the file is in `/config/www/sexy-lock-card.js`

### Animations not working

1. Check `animation_duration` is between 100-1000ms
2. Verify entity state is changing (check Developer Tools → States)
3. Try refreshing the page

### Entity not found error

1. Verify the entity ID exists in Developer Tools → States
2. Check spelling of entity ID in configuration

### Card appears but doesn't respond to clicks

1. Verify the entity domain is `lock.*`
2. Check that the lock supports `lock.lock` and `lock.unlock` services

---

## Development

### File Structure

```
sexy-lock-card/
├── sexy-lock-card.js       # Main card component
├── README.md               # This file
├── examples/               # Example configurations
│   ├── basic.yaml
│   ├── template-lock.yaml
│   └── dashboard.yaml
└── docs/
    └── STATE_MACHINE.md    # Detailed state machine documentation
```

### State Machine Flow

See [STATE_MACHINE.md](docs/STATE_MACHINE.md) for detailed documentation on the internal state transition logic.

---

## Changelog

### 1.0.0 (2025-01-14)

- 🎉 Initial release
- ✨ Full state machine with synthetic transitions
- 🎨 Animated lock icon with 6 visual states
- ⚡ Lightweight vanilla JS Web Component
- 📱 Mobile-friendly with long-press support

---

## License

MIT License - See LICENSE file for details

---

## Credits

Created by a senior UI component engineer for the Home Assistant community.

If you find this useful, consider:
- ⭐ Starring the repository
- 🐛 Reporting issues
- 💡 Suggesting features
- ☕ Buying me a coffee

---

## Support

- **Issues**: [GitHub Issues](https://github.com/electricessence/Sexy-Lock-Card/issues)
- **Discussions**: [GitHub Discussions](https://github.com/electricessence/Sexy-Lock-Card/discussions)
- **Home Assistant Community**: [Forum Thread](https://community.home-assistant.io/)

---

**Enjoy your sexy animated locks! 🔐✨**
