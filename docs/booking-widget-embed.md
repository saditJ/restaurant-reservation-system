# Booking Widget Embed Guide

Integrate the booking widget on any site with a single script tag. The script looks for the host element you provide and bootstraps the widget in-place.

```html
<script src="https://your-domain.com/embed/booking-widget.js" data-root="#booking-widget" data-locale="en" data-venue="default"></script>
```

Place a host node where you want the widget to appear:

```html
<div id="booking-widget"></div>
```

## Configuration

| Attribute         | Description                                                                 | Default   |
| ----------------- | --------------------------------------------------------------------------- | --------- |
| `data-root`       | CSS selector that points to the container node where the widget mounts.     | `#booking-widget` |
| `data-locale`     | Locale code (`en` or `al`).                                                  | `en`      |
| `data-venue`      | Venue/restaurant identifier used when fetching availability.                | `default` |
| `data-theme`      | Optional theme token (e.g. `light`, `dark`).                                | `light`   |
| `data-accent`     | Hex color (e.g. `#111827`) used for primary buttons.                        | `#000000` |
| `data-enable-waitlist` | `true` to link to the waitlist page when enabled.                      | `false`   |
| `data-api-base`   | Override API base URL (only needed when hosting the widget on a separate origin). | `/api` |

Include the script at the end of the body so the host node exists by the time the loader runs. All configuration attributes are optional—omitting them falls back to the values shown above. Update the snippet URL to point at the deployed widget bundle for your environment.
