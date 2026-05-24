# Tab Icon — Phosphor Dot

The chosen tab icon: an amber phosphor dot with a soft halo on a dark rounded
square. Echoes the pulsing "running" status indicator from the dashboard.

## Files

| File | Use |
|---|---|
| `favicon.svg` | Modern browsers — vector, sharp at any size, dark-mode friendly |
| `favicon-16.png` | Legacy `<16x16>` fallback |
| `favicon-32.png` | Legacy `<32x32>` fallback |
| `apple-touch-icon.png` | iOS home-screen icon (180×180) |
| `favicon-192.png` | PWA / Android home-screen (192×192) |
| `favicon-512.png` | PWA splash / large display (512×512) |
| `manifest.webmanifest` | PWA install metadata |

## Drop into your HTML `<head>`

```html
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" />
<link rel="manifest" href="manifest.webmanifest" />
<meta name="theme-color" content="#0b0c0e" />
```

Adjust the `manifest.webmanifest` `start_url` to match your app's entry point.

## Colors used

- Background: `#0b0c0e` (matches the app shell)
- Border: `#1f2329` (matches `--line`)
- Halo: `#e6b34a` @ 18% opacity
- Dot: `#e6b34a` (`--accent`)
