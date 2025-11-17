# Sexy Lock Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A highly polished, animated custom Lovelace card for Home Assistant that displays smart lock states with smooth visual transitions.

![Sexy Lock Card Demo](https://via.placeholder.com/600x400.png?text=Sexy+Lock+Card+Demo)

## ✨ Features

- **🎬 Smooth Animations** - All state transitions are animated, even when the lock entity only provides `locked`/`unlocked` states
- **🎨 Visual State Machine** - Displays distinct visual states for locked, unlocked, locking, unlocking, jammed, and unknown
- **🔄 Smart Transition Detection** - Automatically animates manual lock changes (e.g., physically turning the lock)
- **⚡ Lightweight** - Pure JavaScript Web Component, no external dependencies
- **🎯 Production Ready** - Fully compatible with Home Assistant, works with any lock entity
- **📱 Mobile Friendly** - Touch-optimized with long-press support

### Visual States

| State | Icon | Color | Animation |
|-------|------|-------|-----------|
| Locked | 🔒 Closed lock | Green | None |
| Unlocked | 🔓 Open lock | Red | None |
| Locking | 🔒 Half-closed | Yellow | Rotate-pulse |
| Unlocking | 🔓 Half-open | Yellow | Rotate-pulse |
| Jammed | ⚠️ Closed lock + ! | Orange | Shake |
| Unknown | ❓ Closed lock + ? | Grey | Breathe |

## 📦 Installation

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
   - Go to **Settings** → **Dashboards** → **Resources**
   - Click **Add Resource**
   - URL: `/local/sexy-lock-card.js`
   - Resource type: **JavaScript Module**

   **Via YAML:**
   ```yaml
   resources:
     - url: /local/sexy-lock-card.js
       type: module
   ```

4. Restart Home Assistant
5. Clear browser cache (Ctrl+Shift+R)

## 🚀 Usage

### Basic Configuration

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
| `tap_action` | object | `{action: 'toggle'}` | Action on tap |
| `hold_action` | object | `{action: 'more-info'}` | Action on long press |

### Actions

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

## 📚 Examples

### Multiple Locks Dashboard

```yaml
type: grid
columns: 2
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
    
  - type: custom:sexy-lock-card
    entity: lock.side_gate
    name: Side Gate
```

### Custom Animation Speed

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
animation_duration: 300  # Faster animations
```

### Custom Actions

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
tap_action:
  action: call-service
  service: script.unlock_and_notify
  service_data:
    lock_entity: lock.front_door
hold_action:
  action: more-info
```

## 🎨 Customization

### Custom Colors

Override colors using CSS variables in your theme:

```yaml
# In your theme configuration
sexy-lock-card:
  --lock-locked-color: '#00ff00'
  --lock-unlocked-color: '#ff0000'
  --lock-transitioning-color: '#ffaa00'
  --lock-jammed-color: '#ff3300'
  --lock-unknown-color: '#888888'
```

## 🔧 How It Works

The card implements an intelligent state machine:

1. **Direct State Support**: If your lock provides `locking`/`unlocking` states, the card uses them
2. **Synthetic Transitions**: If your lock only provides `locked`/`unlocked`, the card generates smooth animations
3. **Manual Change Detection**: External state changes are automatically animated

See [docs/STATE_MACHINE.md](docs/STATE_MACHINE.md) for detailed technical documentation.

## 🐛 Troubleshooting

**Card not appearing?**
- Verify resource is added in Settings → Dashboards → Resources
- Clear browser cache (Ctrl+Shift+R)
- Check browser console (F12) for errors

**No animations?**
- Entity must be in `lock.*` domain
- Try adjusting `animation_duration`
- Verify entity state changes in Developer Tools → States

**Entity not found?**
- Check entity ID exists in Developer Tools → States
- Verify spelling matches exactly

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

## ⭐ Support

If you find this card useful:
- ⭐ Star this repository
- 🐛 Report issues
- 💡 Suggest features
- ☕ [Buy me a coffee](https://github.com/sponsors/electricessence)

## 📊 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## 🔗 Links

- [Home Assistant Community](https://community.home-assistant.io/)
- [HACS](https://hacs.xyz/)
- [Report a Bug](https://github.com/electricessence/Sexy-Lock-Card/issues)
- [Request a Feature](https://github.com/electricessence/Sexy-Lock-Card/issues)

---

**Made with ❤️ for the Home Assistant community**
