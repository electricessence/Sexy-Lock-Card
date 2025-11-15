# Quick Start Guide

Get your animated lock card up and running in 5 minutes!

## Step 1: Download the Card

Download `sexy-lock-card.js` from this repository.

## Step 2: Install in Home Assistant

1. Copy `sexy-lock-card.js` to your Home Assistant config folder:
   ```
   /config/www/sexy-lock-card.js
   ```

2. In Home Assistant, go to:
   **Settings** → **Dashboards** → **Resources** (⋮ menu, top-right)

3. Click **Add Resource**:
   - URL: `/local/sexy-lock-card.js`
   - Resource type: **JavaScript Module**

4. Click **Create**

## Step 3: Add the Card

1. Edit your dashboard
2. Click **Add Card**
3. Search for "Sexy Lock Card"
4. Select your lock entity
5. Done!

Or add manually in YAML mode:

```yaml
type: custom:sexy-lock-card
entity: lock.front_door
```

## Step 4: Refresh

Press `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac) to clear cache.

## That's It! 🎉

Your lock should now have smooth animations when locking/unlocking.

---

## Next Steps

- See [README.md](README.md) for full configuration options
- Check [examples/](examples/) for advanced configurations
- Read [docs/STATE_MACHINE.md](docs/STATE_MACHINE.md) to understand the animation logic

---

## Troubleshooting

**Card not showing?**
- Check the file is in `/config/www/`
- Verify resource is added in Dashboard Resources
- Clear browser cache (Ctrl+Shift+R)

**No animations?**
- Entity must be a `lock.*` domain
- Try changing `animation_duration: 300`

**Need help?**
- Check the browser console (F12) for errors
- Make sure the entity ID exists (Developer Tools → States)
