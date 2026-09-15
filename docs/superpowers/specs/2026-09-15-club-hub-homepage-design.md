# Club Hub Homepage Design

**Date:** 2026-09-15
**Status:** Approved for planning
**Scope:** Public web homepage and responsive mobile web

## Purpose

Turn the homepage into a useful club hub for football supporters. It will open in the Hapoel Be'er Sheva context by default, while retaining the ability to switch to any supported club. The page combines immediate match information with season context, explainable statistics, news, visual trends, and a club-history entry point.

The existing StatsAI red, black, white, and light-gray visual system remains the product identity. A selected club changes the data context and small club identifiers; it does not replace the global StatsAI theme.

## Information hierarchy

### 1. Matchday hero

The first element after navigation is the next relevant fixture:

- Competition, kickoff, opponent, venue, and relative time.
- Both club marks and names.
- Actions for the match center and the complete fixture list.
- A compact season snapshot alongside it on desktop: league position, points, goal difference, and latest five results.
- On mobile, only the match content is shown in the hero; the season snapshot moves directly underneath.

If a live match exists, it replaces the upcoming fixture. If neither is available, the most recent completed fixture becomes the hero with an appropriate completed-state label.

### 2. Season snapshot

The selected team's league position, points, goals for, goals against, home success rate, form, and selected key season facts are presented in small, readable cards.

The existing season dossier route becomes the detailed destination. Each fact that is calculated from matches includes an unobtrusive “מאיפה המספר?” link to the existing evidence interface, which exposes its source, coverage period, and included matches.

### 3. Match and league context

The next visual block places:

- The latest completed match, score, competition, and report link.
- A compact league table with the selected club highlighted.
- A small performance summary with a direct link to the full statistics view.

The layout on desktop places these elements in adjacent cards. On mobile, the latest match and next match form a two-card row, followed by the season summary and chart content.

### 4. News and supporter content

“מה קורה באדום” is a visual news feed using the existing Telegram/news data source. Items have a source, time, headline, and image when the source provides one. Missing images use the current safe media fallback rather than fabricated imagery.

Below the operational content is a rotating “ארכיון אדום” card. It links to a historically meaningful match, season, player, venue, or achievement. Its first implementation can use existing match and season records; fan-submitted archive material is a later, moderated feature.

### 5. Visual storytelling

The homepage adds a compact “מומנטום העונה” chart, showing a transparent rolling team trend against the league baseline. It must only render when the selected season has enough completed matches; otherwise, it shows a clear empty state and directs the supporter to the season page.

The chart is intentionally compact. Deeper charts remain on existing team, player, and season pages.

## Team selection

Hapoel Be'er Sheva remains the initial selected team for anonymous visitors. The existing team selection and query/state mechanism is reused so that every homepage section derives from the same selected team and season.

When another club is selected:

- Fixture hero, season snapshot, latest match, standings highlight, chart, and news context refresh together.
- The StatsAI palette remains red/black/white.
- Club crest and name provide the local club identity.
- Links retain the selected team and season where current routing supports it.

## Responsive rules

Desktop uses a wide hero followed by a three-column information grid. News occupies a clear, persistent column to make the site feel active between match days.

Mobile is a deliberate stacked experience:

1. Navigation and club selector.
2. Matchday hero.
3. Season snapshot.
4. Last match and next match cards.
5. Trend chart.
6. News.
7. Archive card and remaining secondary content.

Cards use large tap targets and preserve RTL reading order. Charts must have a textual summary for small screens and assistive technology.

## Data and integrity

No mock or editorial statistic will be presented as a factual statistic. Homepage values come from existing game, standing, season, team, leaderboard, news, and evidence data.

The UI must distinguish unavailable data from zero. All match-derived facts must use the same completed-match filters as the linked detailed page. News image URLs are rendered through the existing media component and image safety rules.

## Non-goals for this iteration

- A social network, comments, or unmoderated fan uploads.
- Creating a new global club-brand color system.
- Replacing detailed team, game, statistics, or season-dossier pages.
- New external data providers.

## Player media extension

Player pages include a media section only when verified content exists:

- Existing published player songs are shown through the current Song model, song page, and YouTube thumbnail/link helpers.
- Match recaps and official player-related YouTube videos may appear as source-labelled cards or privacy-friendly YouTube embeds.
- Every video retains its originating URL and title. The product does not download, self-host, or fabricate video media.
- If a player has neither songs nor verified videos, the section is omitted entirely.

## Acceptance criteria

- Homepage opens with Hapoel Be'er Sheva selected and gives the next live/upcoming/recent match priority.
- All core cards change consistently when the team and season context changes.
- Desktop and mobile use the described content ordering and retain full RTL support.
- Missing fixture, standings, news image, or chart data leads to intentional empty states rather than broken space or misleading zero values.
- Every derived homepage stat has an evidence destination where a suitable existing source is available.
- Existing links to match, standings, club, season dossier, news, and statistics pages remain reachable.
