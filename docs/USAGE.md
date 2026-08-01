# Using the App

Bluebird is not a recommendation engine. It does not decide what weather is "good" or "bad." It attaches objective forecast data to geographic features and lets you sort the results however you like. A typical question it answers: it's Thursday, the weekend looks wet across Washington, so which peaks in the North Cascades see the least total precipitation from Saturday morning through Sunday evening?

## Step 1: Destinations

One analysis ranks a single set of destinations, which you define using one or all of the following methods.

### a. Search by Name

The search box at the top-left of the map recenters on any named place (a peak, city, lake, river, or trailhead) or on an exact coordinate pair. Type a name like `Mt Whitney` or `Mt Whitney, ca`, or coordinates like `36.57862, -118.29107` (parentheses and space-separated forms work too), then press Enter. Point features get a roughly 10 mile view; larger features like cities, parks, and rivers are framed whole. A searched place registers as a destination (a neutral blue dot until analyzed) and competes in the same ranking as everything else on the next Analyze. Search is powered by [Nominatim](https://nominatim.org), so it works for anything OSM knows about, including places Bluebird can't analyze yet.

### b. Search by Polygon

Press **Draw Polygon** to start. While drawing, each click on the map drops a point and the polygon previews live as you add them.

- You need at least 3 points before Analyze turns on.
- The estimated bounding-box area is shown in km² as you draw.
- Drag a vertex to move it, drag a midpoint handle to add one, or click a vertex to remove it.
- Once the shape is closed, a click lands on the edge nearest to it rather than at the end of the outline, so clicking across the polygon widens the side you pointed at instead of folding the shape over itself.
- Press **Done**, or the Enter or Escape key, to finish. Analyze finishes for you.
- Press **Edit Polygon** to pick the shape back up, and **Clear** to throw it away and start over.

Outside draw mode the polygon stays on the map but has no handles, so panning and zooming around your results can't nudge a corner, and a click belongs to whatever sits under it.

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

You do not need to supply an elevation, and there is nowhere in the format to put one. Each pasted coordinate is matched to the nearest mapped peak and shows that peak's elevation once you analyze, the same figure a polygon search shows for it. A point with no mapped peak beside it stays blank, and a blank elevation is never filtered out by the elevation range, so those rows always ride along. The ready-made lists in [`examples/`](../examples/) are formatted this way.

### Clicking the map

There is no fourth control in the panel for this one, because it is on the map. Whenever you are not drawing, the peaks and lakes labeled on the map are clickable. Click one for a popup with its name, and its elevation where there is one, then press **Add to analysis**. Clicking it again offers **Remove from analysis**.

An added feature behaves exactly like a place searched by name: a neutral blue dot until analyzed, saved in the URL, and ranked against everything else on the next Analyze. Its elevation and its link to Peakbagger or OpenStreetMap are filled in during that analysis, by matching the point to the nearest mapped feature the way a pasted coordinate is.

Three things are worth knowing about what you can click:

- **Lakes show no elevation.** Peaks do, because the map data carries one for a summit and none for a water body. Analyzing the lake fills it in.
- **A clicked lake becomes the middle of the water**, not the spot you clicked and not the middle of its bounding box, which on a bent lake would land on the far shore. The point chosen is the one furthest from any shoreline.
- **A crowded label may show only its icon.** Where names would overlap, the map keeps the marker and drops the text, so a ridge of summits or a lake beside a city still shows you what is there. The icon is clickable either way.

Trailheads are not clickable: the basemap does not carry them, so a polygon is still how you find them.

## Step 2: Forecast Window

A calendar, and a **Now** chip beside it.

- **Click a day** to analyze that whole day, midnight to 23:59 your local time. Precipitation ranks by the day's total; wind, temperature, and AQI by its average.
- **Click a second day** to extend to a range, or **drag across days** to pick one in a single gesture. Dragging either end of an existing range adjusts that end, and clicking inside a range starts over from the day you clicked.
- **Now** analyzes the hour you click Analyze. It is the default, so a fresh load can Analyze without touching this step at all.
- **Hours** sits under the grid, set to **All Day**. Switch it to **Hourly** for part of a day rather than all of it: it opens on the current hour through the end of the day, and runs from the first time on your first day to the second time on your last, as one continuous window. Two equal hours analyze that single hour, which is the finest question you can ask.

Narrowed hours apply to the selection as a whole, not to each day in it: 06:00 to 18:00 across five days is one continuous window from the first morning to the last evening, and the app says so under the control. Daylight hours on each of several days is a separate feature and is not built yet.

How bright a day is says how much of it Bluebird can tell you about:

| Day | Meaning |
| --- | --- |
| Normal | Weather and air quality. |
| Dimmed | Weather only. Past the ~5-day air-quality horizon, so the AQI columns come back blank. Still analyzes fine. |
| Greyed, not clickable | Outside what the weather service serves: about 90 days of history through 16 days of forecast, today included. |

Hovering either dimmed step says why, and selecting one past the air-quality horizon says so beside the calendar. Air quality runs shorter than weather because the underlying CAMS model only reaches about 5 days out; that horizon is not the only thing worth knowing about the column, so see [Air quality](DATA.md#air-quality) for how coarse the model grid is and which scale the number is on.

Days are your local calendar days, converted to UTC for the API, and the far edge accounts for that: west of Greenwich the last local day's final hour falls on the next UTC date, so the calendar offers one day less there than it does in London. Selecting days in the past is fine and normal. Those hours are recorded conditions rather than a forecast, and a chart covering both marks where one becomes the other.

The calendar is fully keyboard operable: arrow keys move by day, Page Up and Page Down by month, Enter or Space selects, and Escape abandons a half-made range.

## Step 3: Set Max Results

The default is 200, chosen to sit above the 100-row lists people usually paste so a first analysis does not open with half of one cut off; the ceiling is whatever the running service reports as its analysis cap. Weather is fetched for *every* named destination in the polygon (after the optional elevation filter), and the top N by the selected ranking come back. There is no sampling, so the winners really are the extremes of the area. Raising this number therefore costs nothing upstream: it widens the view onto work already done. Past the cap on candidates the app asks you to draw a smaller polygon or narrow the elevation range rather than silently truncating. See [Limits](LIMITS.md) for why the caps exist and where to read their current values.

Destinations you name yourself are candidates like any other. A searched place and every row of a pasted CSV are analyzed and then ranked against whatever the polygon found, so combining the two can push some of your own destinations below the cut, where they are simply not listed. Their forecasts were still fetched: raise max results and they appear, already filled in.

## Step 4: Analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map itself.

Once results are up, the knobs split in two. **Ranking, max results, and narrowing the elevation range apply instantly**, with no second click: the browser keeps the forecast for every destination it found, not just the ones that fit on screen, so it can re-rank and re-cut them for free. Changing the **destinations, the forecast window, or widening the elevation range** needs Analyze again, because those need forecasts the app does not have yet, and the panel says which one is waiting. That is also why the numbers are exact rather than approximate: a new ranking reconsiders every destination in your area, not just the rows currently listed.

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

The columns belonging to whichever metric you ranked by are shaded, and **each
cell is shaded by its own number** rather than by the ranking. So a destination
with a low precipitation total and one violent hour inside it shows a green
total beside a red peak, which is the spread those extra columns exist to show.

The two per-hour precipitation columns are read on a rainfall-intensity scale
rather than on the totals scale the markers and the map legend use, because
they measure a different quantity: 0.30" spread over three days is drizzle and
0.30 in/hr is a downpour. Their boundaries are the National Weather Service's
intensity classes, at 0.01 / 0.10 / 0.30 / 0.50 in/hr. Every other group shares
one unit across its columns, and so shares one scale.

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
