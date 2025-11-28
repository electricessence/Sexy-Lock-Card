# Quick Start Guide

Door Sense Card v2 is a full HACS package now—installation is usually a two-minute job.

## 1. Install via HACS (Recommended)

1. In Home Assistant open **HACS → Frontend**.
2. Select **Explore & Download Repositories** and search for "Door Sense Card" (or add this repo as a custom source once, if it is not public yet).
3. Click **Download** and restart Home Assistant when prompted.

That’s it—the resource is registered automatically.

## 2. Add the Card to a Dashboard

1. Edit any dashboard.
2. Click **Add Card → Door Sense Card** (found under **Custom**).
3. Pick your lock entity and optional door sensor/battery entities.
4. Save and you are done.

Prefer YAML? Drop this into any Lovelace view:

```yaml
type: custom:door-sense-card
entity: lock.front_door
door_entity: binary_sensor.front_door_contact
battery_entity: sensor.front_door_lock_battery
```

## 3. Manual Install (Fallback)

If you are not using HACS:

1. Download `door-sense-card.js` from the latest release.
2. Copy it to `/config/www/door-sense-card.js`.
3. Add a Lovelace resource: **Settings → Dashboards → Resources → Add Resource** with URL `/local/door-sense-card.js` and type **JavaScript Module**.
4. Clear cache (`Ctrl+Shift+R` or `Cmd+Shift+R`).

## Next Steps

- Review [README.md](README.md) for every option (per-state tap actions, door sensor guard, low-battery indicator, etc.).
- Configure per-state tap actions directly—only locked/unlocked taps plus hold exist, so set an action to `none` if you want to disable it.
- Use the local [test.html](test.html) harness to preview animations without Home Assistant.
- Skim [docs/STATE_MACHINE.md](docs/STATE_MACHINE.md) if you are curious about the visual transitions.

## Troubleshooting

- **Card missing?** Confirm the resource is loaded (HACS handles this automatically) and clear cache.
- **No animations?** Make sure the entity is in the `lock.` domain and the dashboard is not in edit mode.
- **Door/battery sensors ignored?** Double-check the entity IDs and that the door sensor reports `on/off` or `open/closed` states.
