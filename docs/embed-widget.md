# Booking Widget Embed

Use the script snippet below to drop the booking widget into any site. Replace the sample values with your venue settings.

```html
<script src="https://your-domain.example/booking-widget.js" data-venue-id="venue-main" data-locale="en" data-theme="light"></script>
```

**Config attributes**
- `data-venue-id` (required): venue identifier, e.g. `venue-main`.
- `data-locale` (optional): UI language, `en` (English) or `al` (Shqip). Defaults to `en`.
- `data-theme` (optional): visual theme key such as `light` or `dark`. Defaults to `light`.

For full control, render an element placeholder and call the global initializer once the script loads.

```html
<div id="reserve-widget"></div>
<script src="https://your-domain.example/booking-widget.js"></script>
<script>
  window.ReserveWidget?.init({
    target: '#reserve-widget',
    venueId: 'venue-main',
    locale: 'en',
    theme: 'light',
  });
</script>
```
