# Using the App

Bluebird is not a recommendation engine. It does not decide what weather is "good" or "bad." It attaches objective forecast data to geographic features and lets you sort the results however you like. A typical question it answers: it's Thursday, the weekend looks wet across Washington, so which peaks in the North Cascades see the least total precipitation from Saturday morning through Sunday evening?

## Step 1: Destinations

One analysis ranks a single set of destinations, which you define using one or all of the following methods.

### a. Search by Name

The search box at the top-left of the map recenters on any named place (a peak, city, lake, river, or trailhead) or on an exact coordinate pair. Type a name like `Mt Whitney` or `Mt Whitney, ca`, or coordinates like `36.57862, -118.29107` (parentheses and space-separated forms work too), then press Enter. Point features get a roughly 10 mile view; larger features like cities, parks, and rivers are framed whole. An amber pin marks the result and stays out of the way of polygon drawing. A searched place registers as a destination (a neutral blue dot until analyzed) and competes in the same ranking as everything else on the next Analyze. Search is powered by [Nominatim](https://nominatim.org), so it works for anything OSM knows about, including places Bluebird can't analyze yet.

### b. Search by Polygon

Click anywhere on the map to start drawing — each click drops a point, and the polygon previews live as you add them.

- You need at least 3 points before Analyze turns on.
- The estimated bounding-box area is shown in km² as you draw.
- Drawing stays editable after you Analyze. Drag a vertex to move it, drag a midpoint handle to add one, or click a vertex to remove it, then Analyze again.
- Click **Clear** at any time to throw the polygon away and start over.

There is no "Finish Polygon" button. Once you have 3 or more points, click **Analyze** and the polygon closes itself.

The **Find** picker controls what discovery looks for inside your polygon:

| Type | OSM Query | Status |
|---|---|---|
| Peaks | `natural=peak` (named nodes) | Implemented |
| Lakes | `natural=water` + `water=lake` (named nodes/ways/relations) | Implemented |
| Trailheads | `highway=trailhead` (named nodes/ways) | Implemented |

### c. Search by Coordinates

Paste a CSV of your own coordinates to add them to the analysis — alongside whatever the polygon finds, or entirely on their own (no polygon needed):

```
# Lines beginning with # are ignored
46.8529,-121.7604,Mount Rainier
46.2024,-121.4909
48.1122,-121.1139,Glacier Peak
```

The format is `Lat,Lon` or `Lat,Lon,Name`, one per line; without a name the coordinates are used. Custom rows compete in the same ranked table as discovered destinations, and a custom row that duplicates a discovered one (same name or same coordinates) replaces it.

## Step 2: Forecast Window

Three ways to pick the time being analyzed:

- **Current Conditions** (the default) samples the hour you click Analyze. It needs no date input, so a fresh load can Analyze immediately.
- **Future Day/Time** samples a single chosen hour.
- **Multi-Hour Window** takes a start and an end, and aggregates across it: precipitation ranks by window total, wind, temperature, and AQI by window average.

Open-Meteo provides hourly forecasts up to 16 days ahead and about 90 days of history, so the date pickers are constrained to that range and a window outside it disables Analyze with an explanation. Each mode keeps its own inputs while another is selected, so switching back restores them. Everything is entered in your local browser time and converted to UTC for the API.

Air quality (AQI) forecasts run shorter, because the underlying CAMS model only reaches about 5 days out. Windows past that still analyze fine. The AQI columns just show a blank for hours beyond the horizon, and the app notes this next to the date inputs. The horizon is not the only thing worth knowing about that column: see [Air quality](DATA.md#air-quality) for how coarse the model grid is and which scale the number is on.

## Step 3: Set Max Results

The default is 200, chosen to sit above the 100-row lists people usually paste so a first analysis does not open with half of one cut off; the ceiling is whatever the running service reports as its analysis cap. Weather is fetched for *every* named destination in the polygon (after the optional elevation filter), and the top N by the selected ranking come back. There is no sampling, so the winners really are the extremes of the area. Raising this number therefore costs nothing upstream: it widens the view onto work already done. Past the cap on candidates the app asks you to draw a smaller polygon or narrow the elevation range rather than silently truncating. See [Limits](LIMITS.md) for why the caps exist and where to read their current values.

Destinations you name yourself are candidates like any other. A searched place and every row of a pasted CSV are analyzed and then ranked against whatever the polygon found, so combining the two can push some of your own destinations below the cut, where they are simply not listed. Their forecasts were still fetched: raise max results and they appear, already filled in.

## Step 4: Analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map itself.

Once results are up, the knobs split in two. **Ranking, max results, and narrowing the elevation range apply instantly**, with no second click: the browser keeps the forecast for every destination it found, not just the ones that fit on screen, so it can re-rank and re-cut them for free. Changing the **destinations, the forecast window, or widening the elevation range** needs Analyze again, because those need forecasts the app does not have yet. That is also why the numbers are exact rather than approximate: a new ranking reconsiders every destination in your area, not just the rows currently listed.

If the weather service cannot be reached from your browser, Bluebird says so and retries through its own server. That path only receives the rows it shows, so on it every knob goes back to needing Analyze, and the app says which one is waiting.

Marker colors follow total precipitation:

| Color | Precip Total |
|---|---|
| Green | 0.01" or less |
| Lime | 0.01" to 0.10" |
| Yellow | 0.10" to 0.25" |
| Orange | 0.25" to 0.50" |
| Red | more than 0.50" |

Click a marker for a popup with rank, precipitation, wind, temperature, and AQI. Click a destination name in the table to open Windy centered on that spot with the rain overlay. When you sort by AQI instead, the marker thresholds switch to the US EPA category boundaries (50 / 100 / 150 / 200 / 300).

## Results Table

Click any column header to sort by it, ascending or descending. By default the table follows the **Result Ranking** selection, for example lowest total precipitation for driest-first.

The four columns that are also ranking options (Precipitation · Total, Wind · Avg, Temperature · Avg, AQI · Avg) *are* that selection: clicking one re-ranks every destination in your area and re-picks the top N, and the Result Ranking control moves to match. So clicking **Wind** gives you the least windy destinations in the area, not the driest ones reordered by wind. The remaining columns are detail rather than ranking, and reorder the rows currently listed.

Hovering a row reveals a × at its end (always visible on touch screens) that removes the destination from the report — the rows below renumber, and it stays gone as you re-rank, raise the max results, or narrow the elevation range. Changing the destinations, the window, or widening the elevation range starts a fresh report where it may return.

| Column | Description |
|---|---|
| Name | Destination name, links to Windy |
| Elevation (ft) | Elevation in feet, from the OSM `ele` tag |
| Precipitation · Total (in) | Sum of hourly precipitation over the window, in inches |
| Precipitation · Avg (in/hr) | Average hourly precipitation rate |
| Precipitation · Max (in/hr) | Peak single-hour precipitation rate |
| Temperature · Min/Max/Avg (°F) | Temperature range and average over the window |
| Wind · Min/Max/Avg (mph) | Wind speed range and average over the window |
| AQI · Avg/Max | US AQI over the window, blank past the air quality horizon |

A single-hour analysis ("now", or a chosen moment) collapses each of those
groups to one column, because over one hour the average, the minimum and the
maximum are the same number three times.

### Downloading the Table

**Download CSV**, in the table's header bar, saves what is currently on screen
as a file. It is a pure copy of the report you are looking at rather than a
fresh query, so nothing is fetched and nothing is spent.

What lands in the file:

- The rows in the order you are reading them, ranking or detail-column sort
  alike, numbered by a leading **Rank** column.
- The columns the table is showing, under the same headers, which means a
  single-hour analysis exports the collapsed set.
- A **Nearby Wildfire (mi)** column, which the table itself carries as the ⚠️
  beside a name. A file has nowhere to hover, so the number gets a column. It
  holds a distance only where one is within 10 miles, and is blank otherwise,
  which is why it is not headed as a distance to the nearest fire outright.
- Nothing a removed row would have contributed. Removals and the max-results
  cut apply first, exactly as on screen.

A blank cell means no value, never a zero. AQI is blank past its forecast
horizon, and elevation is blank where OpenStreetMap has no `ele` tag.

The wildfire column is the one that can disappear. If the fire check could not
run, the column is left out of the file entirely and the results header says
**Wildfire check unavailable**, rather than the file reporting every row as
clear. So a blank wildfire cell means the check ran and found nothing within 10
miles, which still is not proof there is no fire:
[the wildfire notes](DATA.md#wildfires) explain the coverage gap that a
successful check can still miss.

Coordinates are deliberately absent. The file is meant to be read, not pasted
back into [Search by Coordinates](#c-search-by-coordinates).
