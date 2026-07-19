# Arr Calendar Card

A standalone, always-visible Home Assistant dashboard card for the Arr Stack Integration calendar experience. It is not a wrapper around Arr Stack Card and it does not open a modal.
A standalone HACS-compatible Home Assistant Lovelace card for the Arr Stack Integration calendar experience.

```yaml
type: custom:arr-calendar-card
week_start: monday
default_filter: all
include_radarr2: true
include_sonarr2: true
show_empty_days: true
card_height: 720px
card_height: 620px
item_density: comfortable
refresh_interval: 300
show_episode_title: true
show_series_title: true
show_instance_badges: true
```

## Features

- Seven-day weekly layout with Previous, Next, First, Last, and Today controls.
- All, Shows, and Movies filters with remembered selection.
- Current-day highlighting, poster artwork, movie/show and instance badges, season/episode labels, and independent scrolling for each day.
- Multiple episodes of the same series on the same day and Sonarr instance collapse into one poster with combined episode labels and an episode-count badge.
- Blue show borders and red movie borders make release types recognizable without relying only on text. Both colors follow Home Assistant theme variables (`--info-color` and `--error-color`) when available.
- Current-day highlighting, poster artwork, movie/show and instance badges, season/episode labels, and per-day scrolling.
- Responsive mobile layout that stacks days and scrolls busy days horizontally.
- Merges Radarr, Sonarr, Radarr 2, and Sonarr 2 data through the authenticated Home Assistant Arr Stack Integration proxy.
- Light/dark Home Assistant theme support and loading, empty, unavailable, and API-error states.
- Visual card editor support.

## Requirements

Install and configure [Arr Stack Integration](https://github.com/martinargalas/arr-stack-integration) first. This card intentionally does not call Radarr or Sonarr directly from the browser; it uses Home Assistant authenticated proxy paths under `/api/arr_stack/...` via `hass.callApi`.

## Installation

### HACS custom repository

1. Add this repository to HACS as a Frontend custom repository.
2. Install **Arr Calendar Card**.
3. Add the dashboard resource if HACS does not do it automatically. Home Assistant loads custom dashboard cards as JavaScript module resources; the card itself remains an always-visible dashboard card:
3. Add the resource if HACS does not do it automatically:
   ```yaml
   url: /hacsfiles/ha-arr-calendar-card/arr-calendar-card.js
   type: module
   ```
4. Add `type: custom:arr-calendar-card` to a dashboard.

### Manual

Copy `arr-calendar-card.js` to `/config/www/arr-calendar-card.js`, add `/local/arr-calendar-card.js` as a JavaScript module resource, then add the card to a dashboard.

## Credits and license

This project is MIT licensed. The weekly calendar UX and implementation concepts are based on the calendar modal from [martinargalas/ha-arr-stack-card](https://github.com/martinargalas/ha-arr-stack-card), also MIT licensed. Source headers retain attribution to martinargalas where those concepts are implemented.
