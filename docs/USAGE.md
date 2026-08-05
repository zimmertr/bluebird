# Using the App

Bluebird is not a recommendation engine. It does not decide what weather is "good" or "bad." It attaches objective forecast data to geographic features and lets you sort the results however you like. A typical question it answers: it's Thursday, the weekend looks wet across Washington, so which peaks in the North Cascades see the least total precipitation from Saturday morning through Sunday evening?

## Destinations

One analysis ranks a single set of destinations, which you define using one or all of the following methods. The first two live on the map rather than in the panel, so the panel groups them under **Map**: hovering that group rings the search box and lights every clickable feature, showing you where both controls are.

### a. Search by name

The search box at the top-left of the map recenters on any named place (a peak, city, lake, river, or trailhead) or on an exact coordinate pair. Type a name like `Mt Whitney` or `Mt Whitney, ca`, or coordinates like `36.57862, -118.29107` (parentheses and space-separated forms work too), then press Enter. Point features get a roughly 10 mile view; larger features like cities, parks, and rivers are framed whole. A searched place registers as a destination (a neutral blue dot until analyzed) and competes in the same ranking as everything else on the next Analyze. Search is powered by [Nominatim](https://nominatim.org), so it works for anything OSM knows about, including places Bluebird can't analyze yet.

### b. Click a destination

The control for this one is the map itself, which is why the panel carries no widget for it beyond the pointer line above. Whenever you are not drawing, the peaks and lakes labeled on the map can be picked. Tap or click one for a popup with its name, and its elevation where there is one, then press **Add to analysis**. Picking it again offers **Remove from analysis**.

An added feature behaves exactly like a place searched by name: a neutral blue dot until analyzed, saved in the URL, and ranked against everything else on the next Analyze. Its elevation and its link to Peakbagger or OpenStreetMap are filled in during that analysis, by matching the point to the nearest mapped feature the way a pasted coordinate is.

Three things are worth knowing about what you can click:

- **Lakes show no elevation.** Peaks do, because the map data carries one for a summit and none for a water body. Analyzing the lake fills it in.
- **Unnamed summits are clickable too.** OSM knows plenty of peaks only by their height, and the map draws those as a bare elevation. Clicking one adds it as `Peak 5961`, after the number you clicked on.
- **Shift-click keeps a popup open** instead of replacing it, so two destinations can be compared side by side. A popup opened that way stays until you close it.
- **A clicked lake becomes the middle of the water**, not the spot you clicked and not the middle of its bounding box, which on a bent lake would land on the far shore. The point chosen is the one furthest from any shoreline.
- **A crowded label may show only its icon.** Where names would overlap, the map keeps the marker and drops the text, so a ridge of summits or a lake beside a city still shows you what is there. The icon is clickable either way.

Trailheads are not clickable: the basemap does not carry them, so a polygon is still how you find them.

### c. Polygon

Press **Draw polygon** to start. While drawing, each click on the map drops a point and the polygon previews live as you add them.

- You need at least 3 points before Analyze turns on.
- The estimated bounding-box area is shown in km² as you draw.
- Drag a vertex to move it, drag a midpoint handle to add one, or click a vertex to remove it.
- Once the shape is closed, a click lands on the edge nearest to it rather than at the end of the outline, so clicking across the polygon widens the side you pointed at instead of folding the shape over itself.
- Press **Done**, or the Enter or Escape key, to finish. Analyze finishes for you.
- Press **Edit polygon** to pick the shape back up, and **Clear** to throw it away and start over.

Outside draw mode the polygon stays on the map but has no handles, so panning and zooming around your results can't nudge a corner, and a click belongs to whatever sits under it.

The checkboxes under the buttons control what discovery looks for inside your polygon. Tick as many as you like: they are found in a single query, so peaks and lakes together cost what peaks alone would, and each result is labelled with what it actually is.

| Type | OSM Query | Status |
|---|---|---|
| Peaks | `natural=peak` (named nodes) | Implemented |
| Lakes | `natural=water` + `water=lake` (named nodes/ways/relations) | Implemented |
| Trailheads | `highway=trailhead` (named nodes/ways) | Implemented |

Nothing is ticked to begin with, and a polygon with nothing ticked finds nothing. **Include unnamed peaks**, in Options, adds the summits OSM knows only by their height, listed as `Peak 5961`. It is off by default because it is not a small addition: in one 8 by 10 km box in the Alpine Lakes, 7 peaks are named and 13 are not, so it roughly triples how many destinations an analysis covers, how long it takes, and how often it hits the candidate ceiling. The other three methods below still work on their own, so an analysis of pasted coordinates or clicked destinations needs no polygon and no ticks at all.

### d. Coordinates

Paste a CSV of your own coordinates to add them to the analysis — alongside whatever the polygon finds, or entirely on their own (no polygon needed):

```
# Lines beginning with # are ignored
46.8529,-121.7604,Mount Rainier
46.2024,-121.4909
48.1122,-121.1139,Glacier Peak
```

The format is `Lat,Lon` or `Lat,Lon,Name`, one per line; without a name the coordinates are used. Custom rows compete in the same ranked table as discovered destinations, and a custom row that duplicates a discovered one (same name or same coordinates) replaces it.

You do not need to supply an elevation, and there is nowhere in the format to put one. Each pasted coordinate is matched to the nearest mapped peak and shows that peak's elevation once you analyze, the same figure a polygon search shows for it. A point with no mapped peak beside it stays blank, and a blank elevation is never filtered out by the elevation range, so those rows always ride along. The ready-made lists in [`examples/`](../examples/) are formatted this way.

## Forecast

Which model answers, and over which hours.

### Model

Which weather model answers. Opening the picker shows all eight together, because choosing well here means reading them against each other rather than one at a time. Each carries its resolution and its range in a right-aligned column, so the whole list can be compared by scanning one edge, and two sentences saying what it is best at and what it blends in. The list is ordered best first for mountain terrain, so the default, **NOAA GFS**, is the top entry and is marked **Recommended**.

Each entry's second sentence says what it blends in. Six of the eight use one agency's fine regional grid for roughly the first two days and its coarse global one after that, which is why the grid figure and the reach are never both true at the same moment. None of them blends across agencies. This is also where **NOAA HRRR** says it is already inside **NOAA GFS**, which reaches further, so picking it separately gets you the same numbers with an earlier stop.

The grid figure is the finest that model offers **anywhere**, which for most of them is a regional component rather than a worldwide one: NOAA GFS is 3 km over North America and roughly 13 km over Nepal. That is what each summary names, so read the two together. The reach is the model's own, and it is the same number that bounds the calendar below.

That default is a blend rather than plain GFS: it is HRRR's 3 km grid for the first two days and GFS's coarser grid out to sixteen. High resolution when the resolution matters, reach when it does not.

Models disagree, sometimes by more than the thing being measured: over three days at one Cascades summit, ECMWF and GFS both totalled 0.000 in of precipitation while ICON gave 0.004 in. None of them is lying, and there is no way to know in advance which was right, so this is a knob rather than a setting with a correct value. If a number matters to you, try it under two models.

They also reach different distances ahead, which is why the calendar below redraws when you change this. Three are worth knowing by name:

- **ECCC GEM** is Canada's, and second in the list because over the North Cascades it is arguably the sharpest thing here: 2.5 km for two days and 10 km out to three and a half, finer than the default through exactly the window that decides a trip. It stops at about nine days.
- **ECMWF IFS** has the best medium-range record of any of these. It is the one to ask which weekend, though at roughly 25 km it cannot see an individual valley.
- **NOAA HRRR** reaches only about two days, and the default already contains it for that stretch, so pick it when you specifically want a number that is purely HRRR. It is also the only regional model here, covering the continental US and neighbouring parts of Canada and Mexico; asking it about anywhere else stops the analysis and says so rather than returning a partial answer.

Changing the model needs a new **Analyze**, like changing the polygon or the window: different models mean different forecasts, not a different view of the ones already fetched.

### Forecast window

A calendar, with a **When** toggle above the grid reading **Current** or **Dates**.

- **Current** analyzes the hour you press Analyze. It is the default, so a fresh load can Analyze without touching this step at all.
- **Pick a day** to analyze that whole day, midnight to 23:59 your local time; that also moves the toggle to **Dates**. Precipitation ranks by the day's total; wind, temperature, and AQI by its average.
- **Pick a second day** to extend to a range, or **drag across days** to choose one in a single gesture. Dragging either end of an existing range adjusts that end, and picking a day inside a range starts over from that day.
- **Dates** on the toggle brings back the last range you had, so switching to Current to compare and back does not cost you the range. With no range yet the calendar opens empty — today is outlined, nothing is selected, and Analyze waits until you pick a day (one click for a single day, a second click or a drag for a range).
- **Hours** appears under **When**, set to **All Day**. Switch it to **Hourly** for part of a day rather than all of it: it opens on the current hour through the end of the day, and runs from the first time on your first day to the second time on your last, as one continuous window. Two equal hours analyze that single hour, which is the finest question you can ask.

Both rows sit above the grid, so the two decisions the window needs are together and neither is below the fold on a short screen. Days in the past are ordinary here: the calendar reaches 55 days back against about 15 forward, which is why the toggle says Dates rather than anything that implies the future.

Narrowed hours apply to the selection as a whole, not to each day in it: 06:00 to 18:00 across five days is one continuous window from the first morning to the last evening, and the app says so under the control. Daylight hours on each of several days is a separate feature and is not built yet.

How bright a day is says how much of it Bluebird can tell you about:

| Day | Meaning |
| --- | --- |
| Normal | Weather and air quality. |
| Dimmed | Weather only. Past the ~5-day air-quality horizon, so the AQI columns come back blank. Still analyzes fine. |
| Greyed, not clickable | Outside what the weather service serves. The near edge is where its archive runs out; the far edge is whichever comes first, the API's own limit or the reach of the forecast model you picked in Step 2. |

Hovering either dimmed step says why, and selecting one past the air-quality horizon says so beside the calendar. Air quality runs shorter than weather because the underlying CAMS model only reaches about 5 days out; that horizon is not the only thing worth knowing about the column, so see [Air quality](DATA.md#air-quality) for how coarse the model grid is and which scale the number is on.

Days are your local calendar days, converted to UTC for the API, and the far edge accounts for that: west of Greenwich the last local day's final hour falls on the next UTC date, so the calendar offers one day less there than it does in London. Selecting days in the past is fine and normal. Those hours are recorded conditions rather than a forecast, and a chart covering both marks where one becomes the other.

**The forecast model moves this calendar.** Picking a short-range model above greys out the days it cannot reach, and shortens a window you had already chosen, with a note saying it did. The shortening is undoable by construction: switch back to a model that can serve your original window and it returns whole. The remembered window is dropped once you edit the dates yourself or run an analysis. HRRR is the case that matters: it reaches about two days where the global models reach one to two weeks.

The calendar is fully keyboard operable: arrow keys move by day, Page Up and Page Down by month, Enter or Space selects, and Escape abandons a half-made range.

## Ranking, filters, and options

Once you have set your destinations and forecast window, three short sections shape the report: **Ranking** picks the order, **Filters** picks who qualifies, and **Options** holds the remaining knobs (max results, unnamed peaks, and the map layers).

### Ranking

Sort destinations by any metric: total precipitation, average wind, average temperature, or average AQI. The table re-ranks every destination in your analyzed area, not just the ones on screen, so the winners really are the extremes of the area. You can also see these four metrics in the table itself and click any of them to re-rank.

### Map layers

Four optional overlays, on the map's own **Layers** button rather than in the
controls panel: they are the only controls in the app that change what you are
looking at rather than what you are asking for. All off by default, all live. Switching one on draws it
immediately and changes nothing about the analysis: an overlay is a picture beside
the ranking, never an input to it, so none of them ever asks you to press Analyze
again. Each is credited on its own legend, and each rides in the shared link.

| Layer | What it draws | Coverage |
|---|---|---|
| **Wildfires** | Active fire perimeters, in red | United States |
| **Rain radar** | The NEXRAD reflectivity mosaic, as a loop of the last 50 minutes | Continental United States |
| **Smoke** | Smoke plumes at three densities, in grey | North America |
| **Forecast grid** | The ranked metric drawn across the area your analysis covered | Wherever the chosen model reaches |

Clicking a perimeter opens NIFC's live map on that fire; clicking a plume says how
dense it is, which satellite it was traced from, and over what hours. Where smoke
sits over a fire — which is most of the time, since one causes the other — the
click goes to the fire.

Read them for what they are. Radar is a **measurement of the last hour**,
which makes it the one layer here that is not a model's opinion about the future.
Smoke is an analyst's tracing of what a satellite could see, updated about twice a
day, and it describes a column of air rather than the ground: a plume overhead can
mean a hazy sky and clean air to breathe, or the opposite. The AQI columns in the
table are what measure air.

#### The forecast grid

The other three overlays draw somebody else's data. This one draws yours: the same
metric your results are ranked by, asked for on a lattice of points across the area
your analysis covered, and painted on the colors the marker legend already shows. It answers the question the markers cannot — is this one summit's
weather, or is the whole valley like that?

It is the one layer whose switch costs something, which is why it is a switch. Turning
it on fetches a forecast for every square, after your results have landed and never
in front of them; leave it on and each later analysis grids itself the same way. Once
the points are in hand everything else is free: changing the ranking recolors the
field without asking for anything new, and so does the timeline. It fills in as it
arrives rather than appearing all at once.

After a very large analysis it can take a while to start, because it shares a
per-minute allowance with the analysis you just ran and has to wait its turn. The
legend says so while that is happening, and counts down. If it cannot be fetched
at all, the legend says that too rather than leaving the layer switched on with
nothing under it.

**Style** picks how it is drawn, and both readings are true:

- **Blocks** (the default) draws each point as its own square. You can see and count
  the points, so how much detail the forecast actually has is visible rather than
  stated. The hard edges are the one thing it overstates: the model has no boundary
  there.
- **Smooth** draws the space between the points, which is how every other forecast
  map reads and is the honest shape of something the model already treats as
  continuous. What it hides is how few points are underneath.

Switching costs nothing. It is the same data drawn two ways, so it applies instantly
and rides in the shared link. Picking a style with the layer off switches the layer on
as well, so you can go straight to the drawing you want.

Two things to know when reading it:

- **The legend states the sample spacing** — `Grid size: 3 km`. That is
  the distance between the points actually asked about: inside it you are looking
  at one forecast, and between two of them you are looking at a blend. Over a
  large area the points spread further apart to keep the request reasonable, and
  the legend says the spacing actually used.
- **It covers where you looked.** The field spans the destinations the analysis
  found plus a margin, and fades out at that edge. Panning away does not extend
  it: every point is a live request rather than a pre-drawn tile.

The field can disagree with a marker standing on it. A 3 km grid cell holds a summit
and the valley floor below it, and the model answers for the cell rather than for
either. That is the model's real resolution showing, not a fault. [DATA.md](DATA.md)
has the longer version, including why drawing between grid points is a different act
from drawing between summits.

### The timeline

A bar appears at the bottom of the map whenever something on it spans time. Press
play to run it, or drag the scrubber to a moment.

It has up to two axes, and a switch to pick between them when both exist:

- **Radar** plays the last 50 minutes of observed rain, in six frames ten
  minutes apart. The readout counts backwards from now rather than naming a clock
  time, because the frames are addressed as "ten minutes ago" and the capture
  moment is only known that closely.
- **The forecast axis**, which the switch labels with the ranked metric —
  Wind, Precipitation, Temperature, or AQI — appears once an analysis covers
  more than one hour, and scrubs the window you asked for. The markers recolor to the hour under the playhead, on the
  same bands the legend shows, and the legend follows: precipitation switches to
  inches per hour, since an hour of rain and a window's total are different
  quantities. Ranking a wind metric also draws an arrow beside each marker,
  pointing the way the wind is blowing at that hour. With the forecast grid
  switched on, the field scrubs too, on the same colors and with an arrow of its
  own per sample, so an hour of playback shows the whole picture moving rather
  than a handful of points.

The chart below the map draws the same playhead as a vertical line, and clicking
the chart moves it. The two are one grid seen twice, so finding the bad afternoon
on the chart puts it on the map.

Playback costs nothing upstream. Every destination's hourly series is already in
hand from the analysis; the timeline is a position in it.

### Filtering

Filters say which destinations you would consider at all. Set bounds on elevation, precipitation, wind, temperature, or AQI. The grid has a Min and a Max box on each row; leave a box empty and that side is unbounded.

**A ceiling is a promise about every hour**, not an average: a 20 mph wind ceiling excludes a destination that gusts to 45 at noon even if it averages 8. A floor is the opposite: a 15 mph wind floor asks for somewhere whose *calmest* hour still blows 15, which almost nowhere satisfies. For elevation, wind and temperature the bounds are exactly the table's Min and Max columns. Precipitation is bounded on its window total in both columns, because a per-hour minimum would read 0.000 almost everywhere.

**Destinations with unknown elevation or AQI are included.** Many peaks carry no elevation in the map data, and air quality is only forecast about five days out. Missing values are not evidence of bad conditions, so those rows ride along and the table shows a dash where the number would be.

Four of the five filters apply the instant you type, since the browser already holds forecasts for every destination it found. **Elevation is the exception:** it decides what gets fetched, so narrowing it is instant while widening it needs Analyze again, and the panel says so.

Everything on screen follows a filter change: the table, the map markers, the chart, and the row count in the header.

### Viewing the results

The results bar at the top of the report gives you three viewing modes. The report opens as a table; a desktop-sized window switches to Both when an analysis completes, and a mode you pick yourself sticks across visits. **Table** is the detailed breakdown you can sort, filter and download. **Chart** is a time series of the plotted destinations. In Both, the table's checkbox column is the series picker; in Chart alone, a legend under the plot lists every destination — click one to hide or show its line, or its × to remove it from the report, and scroll the legend when two rows cannot hold them all. Every destination gets its line color the moment it appears — searched places included, before any analysis — and keeps it for the whole session no matter how the list changes; the first destination of a session wears Bluebird blue. **Both** stacks them. Each view has a drag handle to trade height with the map, and in Both the divider between the two trades their share.

Every column is resizable: drag the divider at a header's right edge, or double-click it to fit the column to its longest value. Name opens wide enough for a 25-character name so more numbers fit on a phone — widen it whenever a longer name is cut off. Widths hold for the session.

**Columns** opens a picker for the columns the table shows. Every column starts on — the table scrolls sideways when it must — and unticking narrows the view for easier comparison. The downloaded CSV always carries every column regardless of what the table displays.

### Max results (in Options)

The default is 200, sized to sit above the 100-row lists people usually paste so a first analysis does not open half-cut. The ceiling is what the running service reports. Raising this number costs nothing upstream: weather is fetched for *every* destination in your area, and the top N by your ranking come back. Lowering it shows you the extremes.

## Analyze

The default is 200, chosen to sit above the 100-row lists people usually paste so a first analysis does not open with half of one cut off; the ceiling is whatever the running service reports as its analysis cap. The Forecast Table's header says how many rows you are seeing out of how many there are. Weather is fetched for *every* named destination in the polygon (after the optional elevation filter), and the top N by the selected ranking come back. There is no sampling, so the winners really are the extremes of the area. Raising this number therefore costs nothing upstream: it widens the view onto work already done. Past the cap on candidates the app asks you to draw a smaller polygon or narrow the elevation range rather than silently truncating. See [Limits](LIMITS.md) for why the caps exist and where to read their current values.

Destinations you name yourself are candidates like any other. A searched place and every row of a pasted CSV are analyzed and then ranked against whatever the polygon found, so combining the two can push some of your own destinations below the cut, where they are simply not listed. Their forecasts were still fetched: raise max results and they appear, already filled in.

## What happens when you analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map itself.

Once results are up, the knobs split in two. **Ranking, max results, every forecast filter, and narrowing the elevation range apply instantly**, with no second click: the browser keeps the forecast for every destination it found, not just the ones that fit on screen, so it can re-rank, re-filter and re-cut them for free. Changing the **destinations, the forecast window, the model, or widening the elevation range** needs Analyze again, because those need forecasts the app does not have yet, and the panel says which one is waiting. That is also why the numbers are exact rather than approximate: a new ranking reconsiders every destination in your area, not just the rows currently listed.

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

Every row carries a **Type** — Peak, Lake, Trailhead, or Custom for one you supplied — because a single polygon can now look for several kinds at once. It travels into the downloaded CSV too, lower-case there, so a file you re-import reads the same value the API uses.

Click any column header to sort the rows on screen by it, ascending or descending. That is all a header click does: the ranking, the column order, and the cell shading move only with the **Ranking** control in the panel. By default the table reads in the ranking's order, for example lowest total precipitation for driest-first, and a header click reorders those same rows in place.

Hovering a row reveals a × at its end (always visible on touch screens) that removes the destination from the report — the rows below renumber, and it stays gone as you re-rank, raise the max results, or change any filter, elevation included. Changing the destinations themselves starts a fresh report where it may return. To undo one, a **Removed** button appears in the results bar while any removal is in force: it lists every removed row by name, and restores them one at a time or all at once. A restore never fetches — a row the report still holds simply reappears, and one it no longer holds (a searched place, or a row removed before a re-analysis) comes back as a pending destination that rejoins the next Analyze.

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
back into [Coordinates](#d-coordinates).
