# Arr Calendar Card

A standalone, always-visible Home Assistant dashboard card for the Arr Stack Integration calendar experience. It is not a wrapper around Arr Stack Card and it does not open a modal.

Current release: **v0.4.3**. Maintainers publishing an update should follow
the complete [release procedure](RELEASE.md); merging a pull request by itself
does not notify HACS that a new version is available.

```yaml
type: custom:arr-calendar-card
week_start: monday
default_filter: all
include_radarr2: true
include_sonarr2: true
show_empty_days: true
card_height: 720px
item_density: comfortable
refresh_interval: 300
show_episode_title: true
show_series_title: true
show_instance_badges: true
days_to_show: 7
```

## Features

- Seven-day weekly layout with Previous, Next, First, Last, and Today controls.
- Configurable `days_to_show` from 1–7. The default displays the whole week;
  smaller mobile cards can display, for example, two or four days at a time.
  The **Days** selector on the card changes this without editing YAML and remembers
  the selection in that browser. Previous and Next move by that many days.
- The initial range always begins with today and continues across week boundaries,
  so a three-day view on Sunday still displays Sunday, Monday, and Tuesday.
- All, Shows, and Movies filters with remembered selection.
- Current-day highlighting, poster artwork, movie/show and instance badges, and
  season/episode labels. Busy calendars use one scrollbar for the whole card
  instead of a separate scrollbar in every day.
- Movies use Radarr's digital release date only; theatrical and physical-only
  dates are not shown as downloadable releases.
- Multiple episodes of the same series on the same day and Sonarr instance collapse into one poster with combined episode labels and an episode-count badge.
- Blue show borders and red movie borders make release types recognizable without relying only on text. Both colors follow Home Assistant theme variables (`--info-color` and `--error-color`) when available.
- Responsive mobile layout that stacks days and scrolls busy days horizontally.
- Merges Radarr, Sonarr, Radarr 2, and Sonarr 2 data through the authenticated Home Assistant Arr Stack Integration proxy.
- Light/dark Home Assistant theme support and loading, empty, unavailable, and API-error states.
- Visual card editor support.

## Requirements

Install and configure [Arr Stack Integration](https://github.com/martinargalas/arr-stack-integration) first. This card intentionally does not call Radarr or Sonarr directly from the browser; it uses Home Assistant authenticated proxy paths under `/api/arr_stack/...` via `hass.callApi`.

## Installation

### HACS custom repository

1. In HACS, open **Custom repositories**, paste this repository URL, and select
   **Dashboard** as the category.
2. Install **Arr Calendar Card**.
3. Refresh Home Assistant (a hard refresh may be needed after an update).
4. Edit a dashboard, choose **Add card**, search for **Arr Calendar Card**, and
   configure it in the visual editor. HACS installs and registers the dashboard
   card; no resource entry needs to be added by hand.

### Manual

Copy `arr-calendar-card.js` to `/config/www/arr-calendar-card.js`, register the
file in **Settings → Dashboards → Resources**, then add **Arr Calendar Card** to
a dashboard. This resource step is only necessary for a manual installation.

## Credits and license

This project is MIT licensed. The weekly calendar UX and implementation concepts are based on the calendar modal from [martinargalas/ha-arr-stack-card](https://github.com/martinargalas/ha-arr-stack-card), also MIT licensed. Source headers retain attribution to martinargalas where those concepts are implemented.
