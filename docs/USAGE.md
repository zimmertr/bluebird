# Using the App

Bluebird Forecast is not a recommendation engine. It does not decide what weather is "good" or "bad." It attaches objective forecast data to geographic features and lets you sort the results however you like. A typical question it answers: it's Thursday, the weekend looks wet across Washington, so which peaks in the North Cascades see the least total precipitation from Saturday morning through Sunday evening?

## Destinations

One analysis ranks a single set of destinations, which you define using one or all of the following methods. The first two live on the map rather than in the panel, so the panel groups them under **Map**: hovering that group rings the search box and lights every clickable feature, showing you where both controls are.

### a. Search by name

The search box at the top-left of the map recenters on any named place (a peak, city, lake, river, or trailhead) or on an exact coordinate pair. Type a name like `Mt Whitney` or `Mt Whitney, ca`, or coordinates like `36.57862, -118.29107` (parentheses and space-separated forms work too), then press Enter. Point features get a roughly 10 mile view; larger features like cities, parks, and rivers are framed whole. A searched place registers as a destination (a neutral blue dot until analyzed) and competes in the same ranking as everything else on the next Analyze. Search is powered by [Nominatim](https://nominatim.org), so it works for anything OSM knows about, including places Bluebird Forecast can't analyze yet.

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
- The estimated bounding-box area is shown in km² while you draw, and for a polygon a shared link brings in.
- Drag a vertex to move it, drag a midpoint handle to add one, or click a vertex to remove it.
- Once the shape is closed, a click lands on the edge nearest to it rather than at the end of the outline, so clicking across the polygon widens the side you pointed at instead of folding the shape over itself.
- Press **Done**, or the Enter key, to finish. Analyze finishes for you.
- Press **Cancel**, or the Escape key, to leave without keeping your changes. A new polygon is dropped, and an edited one goes back to the shape it had when you pressed **Edit polygon**.
- While drawing, **Clear** removes every point and keeps you drawing, so you can start over.
- Press **Edit polygon** to pick the shape back up, and **Clear** to throw it away.

Outside draw mode the polygon stays on the map but has no handles, so panning and zooming around your results can't nudge a corner, and a click belongs to whatever sits under it.

The checkboxes under the buttons control what discovery looks for inside your polygon. Tick as many as you like: they are found in a single query, so peaks and lakes together cost what peaks alone would, and each result is labelled with what it actually is.

| Type | OSM Query | Status |
|---|---|---|
| Peaks | `natural=peak` or `natural=volcano` (named nodes; OSM tags the Cascade volcanoes as volcano instead of peak) | Implemented |
| Lakes | `natural=water` + `water=lake` (named nodes/ways/relations) | Implemented |
| Trailheads | `highway=trailhead` (named nodes/ways) | Implemented |

Nothing is ticked to begin with, and a polygon with nothing ticked finds nothing. **Include unnamed peaks**, under the type checkboxes, adds the summits OSM knows only by their height, listed as `Peak 5961`. It is off by default because it is not a small addition: in one 8 by 10 km box in the Alpine Lakes, 7 peaks are named and 13 are not, so it roughly triples how many destinations an analysis covers, how long it takes, and how often it hits the candidate ceiling. The other three methods below still work on their own, so an analysis of pasted coordinates or clicked destinations needs no polygon and no ticks at all.

### d. Coordinates

Paste a CSV of your own coordinates to add them to the analysis — alongside whatever the polygon finds, or entirely on their own (no polygon needed):

```
# Lines beginning with # are ignored
46.8529,-121.7604,Mount Rainier
46.2024,-121.4909
48.1122,-121.1139,Glacier Peak
```

The format is `Lat,Lon` or `Lat,Lon,Name`, one per line; without a name the coordinates are used. Custom rows compete in the same ranked table as discovered destinations, and a custom row that duplicates a discovered one (same name or same coordinates) replaces it.

You do not need to supply an elevation, and there is nowhere in the format to put one. Each pasted coordinate is matched to the nearest mapped peak and shows that peak's elevation once you analyze, the same figure a polygon search shows for it. A point with no mapped peak beside it stays blank, and rides along like any other row. The ready-made lists in [`examples/`](../examples/) are formatted this way.

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
- **Pick a day** to analyze that whole day, midnight to 23:59 your local time; that also moves the toggle to **Dates**. By default precipitation ranks by the day's total, the freezing level by its minimum, and wind, temperature and AQI by their average; the Metrics section's aggregate dropdowns change that.
- **Pick a second day** to extend to a range, or **drag across days** to choose one in a single gesture. Dragging either end of an existing range adjusts that end, and picking a day inside a range starts over from that day.
- **Dates** on the toggle brings back the last range you had, so switching to Current to compare and back does not cost you the range. With no range yet the calendar opens empty — today is outlined, nothing is selected, and Analyze waits until you pick a day (one click for a single day, a second click or a drag for a range).
- **Hours** appears under **When**, set to **All day**. Switch it to **Hourly** for part of a day rather than all of it: it opens on the current hour through the end of the day, and runs from the first time on your first day to the second time on your last, as one continuous window. Two equal hours analyze that single hour, which is the finest question you can ask.

Both rows sit above the grid, so the two decisions the window needs are together and neither is below the fold on a short screen. Days in the past are ordinary here: the calendar reaches back as far as the archive the service publishes (`limits.archive_days` in `GET /api/capabilities`) against about 15 days forward, which is why the toggle says Dates rather than anything that implies the future. How wet was this ridge last July is a question it can answer.

Narrowed hours apply to the selection as a whole, not to each day in it: 06:00 to 18:00 across five days is one continuous window from the first morning to the last evening, and hovering **Hours** says so. Daylight hours on each of several days is a separate feature and is not built yet.

How bright a day is says how much of it Bluebird Forecast can tell you about:

| Day | Meaning |
| --- | --- |
| Normal | Weather and air quality. |
| Dimmed | Weather only. Past the air-quality horizon, so the AQI columns come back blank. Still analyzes fine. |
| Greyed, not clickable | Outside what the weather service serves. The near edge is how far back its archive goes; the far edge is whichever comes first, the API's own limit or the reach of the forecast model you picked under **Forecast**. |

Hovering either dimmed step says why, and selecting one past the air-quality horizon says so under the Analyze button. Air quality runs shorter than weather because the underlying CAMS model reaches a fraction as far (`limits.aqi_forecast_days` in `GET /api/capabilities` says how far); that horizon is not the only thing worth knowing about the column, so see [Air quality](DATA.md#air-quality) for how coarse the model grid is and which scale the number is on.

Days are your local calendar days, converted to UTC for the API, and the far edge accounts for that: west of Greenwich the last local day's final hour falls on the next UTC date, so the calendar offers one day less there than it does in London. Selecting days in the past is fine and normal. Those hours are recorded conditions rather than a forecast, and a chart covering both marks where one becomes the other.

**A window older than about two months is served from a different place**, and the far past is the one stretch of the calendar where the model you picked does not apply: those hours come from Open-Meteo's archive, which is one recorded dataset rather than a forecast any model made, so the model control is faded out while such a window is selected, and a line under the Analyze button says why. Wind is measured 10 m above the ground there rather than adjusted to each summit, for the reason [DATA.md](DATA.md#open-meteo) gives.

**A range may cross that join.** It is fetched twice, once from each place, and the hours are joined in order before anything is ranked, so the report is one window rather than two halves. A line under the Analyze button names the day the archive's hours end and the day your chosen model's begin, because a report whose first days are recorded conditions and whose last days are a forecast should say so. Nothing about it is blocked, and the model control stays live: the later half is that model's.

**The results header spells the year** whenever the window is not in the current one, on both ends of it. A report of last September otherwise reads as four days of "Sat, Sep 13", which is a date no reader can place.

**The forecast model moves this calendar.** Picking a short-range model above greys out the days it cannot reach, and shortens a window you had already chosen, with a note saying it did. The shortening is undoable by construction: switch back to a model that can serve your original window and it returns whole. The remembered window is dropped once you edit the dates yourself or run an analysis. HRRR is the case that matters: it reaches about two days where the global models reach one to two weeks.

The calendar is fully keyboard operable: arrow keys move by day, Page Up and Page Down by month, Enter or Space selects, and Escape abandons a half-made range.

## Metrics

Once you have set your destinations and forecast window, one table shapes the report. Two controls at the top say how the list is ordered: **Rank by** picks Lowest or Highest, and **Max results** says how far down it to go. Under them, one row per metric: its radio and its dropdown say how the row ranks, and its Min and Max boxes say who qualifies. The rows read in alphabetical order.

### Ranking

Sort destinations by any metric, and by any of that metric's aggregates. Each row pairs a metric with a dropdown naming how it is reduced over your window — Avg, Max, and Min for every metric, plus Total for precipitation — so "calmest peak wind" (`Wind · Max`, Lowest) is as askable as "calmest average wind". The defaults are total precipitation, the averages of the other weather metrics, and the minimum for the freezing level, which is the one that answers the overnight refreeze. Changing a dropdown, a radio, or Lowest/Highest re-ranks every destination in your analyzed area, not just the ones on screen, so the winners really are the extremes of the area; the markers and the map legend follow the chosen aggregate. For a single-hour window the dropdowns disappear: one hour has no minimum, average, or maximum to choose between. Clicking a column header in the table reorders the rows on screen only — the Metrics table is what re-ranks the whole field.

Ranking by a freezing level reads naturally in either direction: Highest
`Freezing level · Min` finds the destinations whose coldest hour still froze high
up, and Lowest finds the ones that froze deepest. A destination the model
publishes no freezing level for ranks last either way, as every missing value
does.

**Snow depth is the one row with no dropdown**, and the one metric that is not
a reading of your forecast window. It is how much snow is on the ground today,
from the NOHRSC snow analysis, so there is no average, minimum or maximum to
choose between and no hour it belongs to. Rank by it and the caption beside the
results header says which day the analysis is from, `Snow depth as of Sep 22`,
in place of the window it would otherwise name.

**Cloud base and cloud cover cost a second request**, so an analysis fetches
them only when you rank by one or bound one. Pick either row over a report
analyzed without them and the line under the Analyze button asks for a new
analysis; until you run it, the table shows no cloud numbers. Cloud base
defaults to its minimum, the lowest the cloud came down, and cloud cover to its
average. Ranking by Highest `Cloud base · Min` finds the destinations most
likely to stay above the cloud. How the base is worked out, and how far to
trust it, are in [DATA.md](DATA.md#cloud-base-and-cloud-cover).

Wind and temperature are both reported at each destination's own elevation, not at the standard 10 meters and 2 meters above the model's terrain — on a summit the near-ground values are the wrong air. The 10-meter wind understates what you would feel, often by a factor of two, and the 2-meter temperature carries the surface layer of a valley floor that cools by radiation on a clear night (Open-Meteo lapses it to the summit's own height, and the cold comes with it), which is why the temperature columns used to show a peak below freezing while its own freezing level sat thousands of feet higher. How both numbers are derived, and their limits, are in [DATA.md](DATA.md#open-meteo). Destinations with no known elevation show the plain near-ground values.

**No header says which method produced a number.** Every metric column reports at the destination's elevation: precipitation and air quality as the grid cell's surface values at that point, the freezing level as a height of its own, and the wind and temperature as above. A header that named the method on two of the five read as a difference in place, so the method lives in [DATA.md](DATA.md#open-meteo) instead. Over an archive window the pressure levels are not published and both families fall back to the near-ground value; the line under the Analyze button names the window.

### Bounds

The Min and Max boxes say which destinations you would consider at all: on AQI, cloud base, cloud cover, the freezing level, precipitation, snow depth, temperature and wind. An empty box shows its unit and bounds nothing. **Clear filters** turns on as soon as any box holds a number, and it empties every one of them, the results cap included.

**A ceiling is a promise about every hour**, not an average: a 20 mph wind ceiling excludes a destination that gusts to 45 at noon even if it averages 8. A floor is the opposite: a 15 mph wind floor asks for somewhere whose *calmest* hour still blows 15, which almost nowhere satisfies. For wind, temperature, the freezing level and both cloud metrics the bounds are exactly the table's Min and Max columns, so a freezing-level floor of 6,000 asks for somewhere the level never dropped below 6,000 ft. Precipitation is bounded on its window total in both columns, because a per-hour minimum would read 0.000 almost everywhere. Snow depth is bounded on today's one number in both columns, there being no hours to reduce.

**Destinations with unknown AQI, freezing level or snow depth are included.** Air quality is only forecast about five days out, most forecast models publish no freezing level at all, and the snow analysis covers the contiguous United States, southern Canada and northern Mexico and nothing else. Missing values are not evidence of bad conditions, so those rows ride along: the table shows a dash where a number is missing, and `N/A` where the model carries no freezing level or the snow analysis never covered the destination.

Every bound applies the instant you type, since the browser already holds forecasts for every destination it found. None of them can ever ask for a forecast the app does not have, so loosening one is as immediate as tightening it.

Everything on screen follows a bound: the table, the map markers, the chart, and the row count in the header.

### Max results

The default is 200, sized to sit above the 100-row lists people usually paste so a first analysis does not open half-cut. The ceiling is what the running service reports. Raising this number costs nothing upstream: weather is fetched for *every* destination in your area, and the top N by your ranking come back. Lowering it shows you the extremes.

## Map layers

Five optional overlays, on the map's own **Layers** button rather than in the
controls panel: they are the only controls in the app that change what you are
looking at rather than what you are asking for. All off by default, all live. Switching one on draws it
immediately and changes nothing about the analysis: an overlay is a picture beside
the ranking, never an input to it, so none of them ever asks you to press Analyze
again. Each of the four that draw somebody else's data is credited in its own section of the map's legend, and each rides in the shared link.

| Layer | What it draws | Coverage |
|---|---|---|
| **Wildfires (US only)** | Active fire perimeters, in red | United States — the label says so because the proximity check shares the limit ([DATA.md](DATA.md#wildfires)) |
| **Rain radar** | The NEXRAD reflectivity mosaic, as a loop of the last 50 minutes | Continental United States |
| **Smoke** | Smoke plumes at three densities, in grey | North America |
| **Snow depth (US only)** | Snow on the ground now, in NOAA's own bands from under an inch to 65 feet ([DATA.md](DATA.md#snow-depth)) | Coterminous United States |
| **Forecast grid** | The ranked metric drawn across the area your analysis covered | Wherever the chosen model reaches |

The rows read in alphabetical order, and one of them draws nothing: **Forecast player** switches the
timeline bar at the bottom of the map on and off. It is on by default in a
desktop-sized window and off on a phone, where the bar is a band across a map the
report already stands on. It changes nothing about the ranking either, and once
you have set it, it rides in the shared link like the four above. It goes gray when
nothing on the map spans time, which is a report of one hour with the rain radar
off. Every row stays in the list whether or not it applies, so the list is the same
length every time you open it.

Clicking a perimeter names the fire and links to it on NIFC's live map; clicking a plume says how
dense it is, which satellite it was traced from, and over what hours. Where smoke
sits over a fire — which is most of the time, since one causes the other — the
click goes to the fire.

Read them for what they are. Radar is a **measurement of the last hour** and
snow depth is an **analysis of now**, which makes them the two layers here that
are not a model's opinion about the future. Snow depth is on a 1 km grid, so its
colour is an average over a square kilometre that may run from a valley floor to
a ridge; on steep ground the depth at a point can be well either side of it.
Smoke is an analyst's tracing of what a satellite could see, updated about twice a
day, and it describes a column of air rather than the ground: a plume overhead can
mean a hazy sky and clean air to breathe, or the opposite. The AQI columns in the
table are what measure air.

### The forecast grid

The other three overlays draw somebody else's data. This one draws yours: the same
metric your results are ranked by, asked for on a lattice of points across the area
your analysis covered, and painted on the colors the marker legend already shows. It answers the question the markers cannot — is this one summit's
weather, or is the whole valley like that?

It is the one layer whose switch costs something, which is why it is a switch. Turning
it on fetches a forecast for every square, after your results have landed and never
in front of them; leave it on and each later analysis grids itself the same way. Once
the points are in hand everything else is free: changing the ranking recolors the
field without asking for anything new, and so does the timeline. It fills in as it
arrives rather than appearing all at once. A square stays empty only where the
model published no number for it, which for a freezing-level ranking is the five
models that carry no freezing level at all.

After a very large analysis it can take a while to start, because it shares a
per-minute allowance with the analysis you just ran and has to wait its turn. The
legend says so while that is happening, and counts down. If it cannot be fetched
at all, the legend says that too rather than leaving the layer switched on with
nothing under it.

The switch is faded out while the report on screen carries any archive hours,
because those hours are one recorded dataset rather than a model with a grid
spacing of its own, so there is no sample spacing the picture could state. That
covers a window that crosses the join as well as one wholly behind it: half such a
report is that dataset, and one stated spacing cannot be true of both halves.
Hovering the row says so, and so does a screen reader; analyze a recent window and
the layer comes back.

A segment under the row picks how it is drawn, and both readings are true:

- **Smooth** (the default) draws the space between the points, which is how every
  other forecast map reads and is the honest shape of something the model already
  treats as continuous. It also matches the markers standing on it, which take a
  color from anywhere on the scale. What it hides is how few points are underneath,
  which is what the pitch beside the layer's name in the legend states.
- **Blocks** draws each point as its own square. You can see and count the points,
  so how much detail the forecast actually has is visible rather than stated. The
  hard edges are the one thing it overstates: the model has no boundary there.

Switching costs nothing. It is the same data drawn two ways, so it applies instantly
and rides in the shared link. The segment and the coverage slider show only while the
layer is on.

Two things to know when reading it:

- **The legend states the sample spacing** — `Forecast grid   3 km`. That is
  the distance between the points actually asked about: inside it you are looking
  at one forecast, and between two of them you are looking at a blend. Over a
  large area the points spread further apart to keep the request reasonable, and
  the legend says the spacing actually used.
- **It covers where you looked.** The field extends a set distance around each
  destination the analysis found — the **Coverage** slider under the style
  toggle — and fades out at that edge. The slider's range follows the model:
  from one to four of its own grid cells around each destination, with the
  default in the middle. On NOAA GFS's 3 km grid that is 3 to 12 km; on
  ECMWF's 25 km grid, 25 to 100 km. Destinations far apart each get their own
  patch, and the gap between them stays empty: a list with peaks on two
  continents grids as two local fields, never as one band across the ocean
  between. Shrinking follows the thumb in real time from points already
  fetched; only growing past what has been fetched asks for more, on release.
  Panning away does not extend it: every point is a live request rather than a
  pre-drawn tile.

The field can disagree with a marker standing on it. A 3 km grid cell holds a summit
and the valley floor below it, and the model answers for the cell rather than for
either. That is the model's real resolution showing, not a fault. [DATA.md](DATA.md)
has the longer version, including why drawing between grid points is a different act
from drawing between summits.

### The timeline

A bar appears at the bottom of the map whenever something on it spans time, as
long as **Forecast player** is switched on in the map's Layers list: it is on by
default in a desktop-sized window and off on a phone. Press play to run it, or
drag the scrubber to a moment. With it switched off the markers keep the window
colors they are ranked on.

It has up to two axes, and a switch to pick between them when both exist:

- **Radar** plays the last 50 minutes of observed rain, in six frames ten
  minutes apart. The readout counts backwards from now rather than naming a clock
  time, because the frames are addressed as "ten minutes ago" and the capture
  moment is only known that closely.
- **The forecast axis**, which the switch labels with the ranked metric —
  Wind, Precipitation, Temperature, Freezing level, Snow depth, or AQI — appears once an analysis covers
  more than one hour, and scrubs the window you asked for. The markers recolor to the hour under the playhead, on the
  same bands the legend shows, and the legend follows: precipitation switches to
  inches per hour, since an hour of rain and a window's total are different
  quantities. Ranking a wind metric also draws an arrow beside each marker,
  pointing the way the wind is blowing at that hour. With the forecast grid
  switched on, the field scrubs too, on the same colors and with an arrow of its
  own per sample, so an hour of playback shows the whole picture moving rather
  than a handful of points.

The chart below the map draws the same playhead as a vertical line, and clicking
or tapping the chart moves it. The two are one grid seen twice, so finding the bad
afternoon on the chart puts it on the map.

Playback costs nothing upstream. Every destination's hourly series is already in
hand from the analysis; the timeline is a position in it.

## Viewing the results

The results bar at the top of the report gives you three viewing modes. The report opens as a table; a desktop-sized window switches to Both when an analysis completes, and a mode you pick yourself sticks across visits. **Table** is the detailed breakdown you can sort, filter and download. **Chart** is a time series of the plotted destinations, one metric at a time: the dropdown above the plot picks it, and opens on the metric the report is ranked by. In Both, the table's checkbox column is the series picker; in Chart alone, a legend under the plot lists the rows the table would, one chip per line in that line's color. Click a chip to hide or show its destination, or its × to remove the destination from the report, and scroll the legend when two rows cannot hold them all. Every destination gets its line color the moment it appears — searched places included, before any analysis — and keeps it for the whole session no matter how the list changes; the first destination of a session wears Bluebird Forecast blue. **Both** stacks them. Each view has a drag handle to trade height with the map, and in Both the divider between the two trades their share. Double-press a handle to put its panel back.

On a phone the report is a sheet standing on the map rather than a panel beside it: the map keeps its full height and runs on behind the sheet, and the sheet opens low enough for the map's legend and its timeline to stay in view. Drag its handle up for more rows and the legend gives way, as it does on any map too short for it.

Every column is resizable: drag the divider at a header's right edge, or double-click it to fit the column to its longest value. Name opens wide enough for a 25-character name so more numbers fit on a phone — widen it whenever a longer name is cut off. Widths hold for the session.

**Columns** opens a picker for the columns the table shows. Every column starts on — the table scrolls sideways when it must — and unticking narrows the view for easier comparison. The downloaded CSV always carries every column regardless of what the table displays.

**Columns can be moved.** Drag a table header sideways and the column goes where you drop it; on a touch screen, hold it for a moment first, so a tap still sorts. The column you picked up rides under the pointer and a blue line shows the gap it will drop into, so nothing moves until you let go. The same order can be set in the **Columns** picker, by dragging a row's grip at its right edge, and the two are one order: move a column in either place and the other follows at once. The grip is also the keyboard route, since a drag needs a pointer — focus it and the up and down arrows move that column one place at a time. A column you have hidden keeps its place and comes back where you left it, and the downloaded CSV is written in the order on screen.

Your order lasts until you change **Rank by**. Ranking pulls the metric you rank on to the front of the table, and it wins: a new ranking puts the columns back to the standard order with that metric leading. Short of that the order is yours and survives a reload. It rides in no link, so a report you share opens in the standard order for whoever opens it.

### Comparing models on the chart

The picker does two things, and each has its own half of the popover.

The **list selects**. Every model carries a checkbox at its right edge; tick one, or click anywhere on its row, and that model joins the chart. Untick it and it leaves. The list stays open either way, so selecting three models is one visit rather than three.

The **chips rank**. They sit in two labelled groups, so which model does which job is read off the layout rather than off a colour. Under **Ranking** is one chip, the model the field is ranked by, which is the model the table, the markers and the downloaded file are built from. Under **Comparing** are the rest, the models drawn on the chart beside it, in the list's own order. Tap a chip under **Comparing** and it moves up into **Ranking**; the model it replaces moves down and gains an x. Tap a chip's x, or untick its row, and that model leaves the chart. The chip under **Ranking** has no x, because a report has to come from some model. With nothing compared there is one group and one chip.

Nothing inside the picker closes it. Press Escape, or click outside it, the way the Columns picker and the map's Layers popover close.

The closed control reads the ranking model's name followed by how many extra models are on the chart, as in **NOAA GFS +2**.

The chart then draws one line per destination per model: three destinations under three models is nine lines. Every line is solid, and every line has a color of its own, so nine lines are nine colors. Lines from the model that ranks wear their destination's color, the same color it wears in the table and on the map, so those read as the destinations you already know, and a chart with nothing compared looks as it always did. Every other line takes a new color when it first appears and keeps it for as long as the tab is open, so hiding a model and showing it again draws it in the color you last saw. In Chart alone, the legend under the plot has one chip per line, in the line's color, and each chip names its destination and its model, as in **Mount Rainier (NOAA GFS)**. A chip still acts on the destination: it hides, shows or removes that place under every model, the same as the table row's checkbox and ×. Move the cursor over the chart, and every line in the hover box names all three things it is: rank, destination, model, as in **1. Mount Rainier (NOAA GFS)**. A model the picker marks **Blend** serves one agency's fine regional model for roughly the first two days and its coarse global model after that, so those lines change model partway along.

Nine lines is a lot to read at once, so **Models** in the results bar puts some of them down. It sits beside **Columns** and is there whenever **Columns** is. It opens the same kind of popover: one row per model you have selected in the picker, the ranking model first and the rest in the picker's order, each with a checkbox and the model's name. The rows carry no color, because a model has no single color to show you: its lines wear one color per destination. The hover box is where a line is named and its color shown. A model you have just selected has a row straight away, before the Analyze that buys its lines. Untick a model and its lines leave the chart and its chips leave the legend; tick it back and they return, and a model unticked before an Analyze stays hidden when its lines arrive. Nothing else moves: the forecasts are bought either way, so this costs nothing, and it touches no ranking, no table, no file and no link. Unticking every box is allowed, and leaves an empty chart. A model you unselect in the picker and select again comes back showing.

A comparison is a real fetch, so it is bought by **Analyze** like the ranking model itself: select a model and the panel says the report no longer answers what the panel asks. Unselecting one is free and takes effect at once, because its line is drawn from numbers already in hand. It costs about one weighted call per model per destination, against the hundred or more an analysis of a polygon spends. It changes nothing about the ranking or the markers, which come from the ranking model alone.

The results table carries the comparison too. With models compared it grows a **Model** column, sitting directly after **Name**, and every destination gets one row per model: two destinations under three models is six rows. The rank is the destination's, so the rows of one destination all read the same number, and the table can still be sorted by any column including **Model**. The downloaded CSV is the same table, so it carries the column and the rows as well. With one model selected the column is absent and every destination is one row, as it always was.

**Model** is in the **Columns** picker like every other column, so you can show it on a report with no comparison, where every row names the model the analysis ran, or hide it on one with a comparison. It is the only column whose default depends on the report: off with one model, on with several. Tick or untick it once and your answer stands from then on, whatever the model count does.

Every line on the chart runs to its own model's reach, so a model that stops before the analyzed window ends simply stops, and the other lines keep going. A dashed line in the axis color stands at the hour where it stops, labeled with the model's name, the same way the **Now** line is drawn. Two models that end on the same hour share one line, and its label names both. Hide a model and its dashed line goes with its lines.

The results table marks the same thing. On the rows of a model that ends before the window does, every weather number is aggregated over fewer hours than the rows beside it, so the row's **Model** cell carries a raised asterisk after the model's name. The mark is on the name, once per row, and never on a number. Air quality, snow depth and the cloud columns on those rows still cover the whole window, because they are the same whatever model the row names. One line under the table says what the mark means: `* Data is aggregated over a subset of the forecast window due to the model's limited range.` The model that ranks never carries the mark, because the calendar already shortens the window to its reach. The mark rides the **Model** column, so hiding that column in the **Columns** picker hides the marks and the line under the table together. The downloaded CSV carries the same mark and the same line (see [Downloading the Table](#downloading-the-table)).

A model Open-Meteo has no data for at that spot draws no line and says so in a note beside the chart's metric dropdown, which is never the same as drawing a flat one. A model you have hidden leaves no note, because its lines are missing by your own instruction.

Three metrics cannot be compared at all, and **Analyze** says so rather than selling you a report that cannot answer the question. Ranking by **AQI** with more than one model selected blocks it: `AQI data is retrieved independently of the model and cannot be compared.` So does ranking by **Snow depth**, for the same reason and in the same words: `Snow depth is retrieved independently of the model and cannot be compared.` Ranking by **Freezing level** with any selected model that does not forecast one blocks it too, and names them: `Freezing level data is not available for ECMWF IFS.` Three of the eight models forecast a freezing level; the other five answer with nothing at all, which on a chart is indistinguishable from never having asked. Either way the remedy is yours to choose, rank on something else or change the models, so the message says what is wrong and leaves it there. See [Data Sources](DATA.md) for the rest of the caveats.

The comparison travels in the link as `compare=`, a comma-separated list of model ids in the picker's own order, so the same set of models always reads the same way whoever built the link. A restored link reopens with the boxes ticked and buys the forecasts on your first Analyze, never on load, unless the link carries `analyze=1` (below).

The rest of the panel travels the same way. A shared link carries the destination types and the unnamed-peaks toggle, the polygon, a pasted list (compressed), the forecast window, the model and its comparison, the ranking, its direction and the results cap, every bound, the layer switches, the coverage slider, the forecast player once you have set it, and pinned destinations. It does not carry column order or widths, hidden models, or anything else that is one reader's view of the report rather than the report. A shared link opens the map on every destination it carries: the polygon, a pasted list, and searched places.

A link you build by hand can also carry `analyze=1`. The app then runs the analysis once when the page opens, as if you had clicked **Analyze**, after it has read this deployment's limits. It runs only when **Analyze** would be enabled; if an input is missing or out of bounds, nothing runs and the panel shows the usual reasons below the button. The flag leaves the address bar when the analysis starts, so a reload restores the link without running it again. The app never writes `analyze=1` itself, so a link you copy from the address bar after an edit does not run on open. There is no control for it: you add it to the link yourself.

## Analyze

Weather is fetched for *every* named destination in the polygon. There is no sampling, so the winners really are the extremes of the area, and the results bar says how many rows you are seeing out of how many there are. Past the cap on candidates the app refuses the analysis and says so rather than truncating in silence. See [Limits](LIMITS.md) for why the caps exist and where to read their current values.

Destinations you name yourself are candidates like any other. A searched place and every row of a pasted CSV are analyzed and then ranked against whatever the polygon found, so combining the two can push some of your own destinations below the cut, where they are simply not listed. Their forecasts were still fetched: raise max results and they appear, already filled in.

## What happens when you analyze

Click **Analyze**. Results appear in a sortable table below the map and as color-coded markers on the map itself.

A large area arrives in pieces. Forecasts are fetched in batches, and each batch that lands is ranked and shown at once rather than held back until the last one returns, so the first rows are up in well under a second where the whole run can take a minute or more. While that is happening the results bar marks its count **so far** (`946 of 946 so far`), because both numbers are a floor and the order still moves as the rest arrive. The words go when the analysis finishes.

Once results are up, the knobs split in two. **Ranking, max results and every forecast bound apply instantly**, with no second click: the browser keeps the forecast for every destination it found, not just the ones that fit on screen, so it can re-rank, re-filter and re-cut them for free. Changing the **destinations, the search area, the destination types, the forecast window, or the model** needs Analyze again, because those need forecasts the app does not have yet, and the panel says which one is waiting. That is also why the numbers are exact rather than approximate: a new ranking reconsiders every destination in your area, not just the rows currently listed.

If Open-Meteo cannot be reached from your browser, the analysis stops and says so. There is no second path: the browser holds your forecasts, and rerouting the fetch through the server would spend a quota every visitor shares.

### The map's legend

One box, under the **Layers** button. It holds a section for the marker colors
and one for each layer that is switched on, and they read in alphabetical order
by name, so a section is where you last looked for it.

A section keyed on a single value — smoke, rain radar, active wildfires — is one
line with its swatch on the right. A section keyed on a **scale** is a strip
across the box with its numbers **inside** it, along the bottom edge: the bottom
of the scale, its middle and its top, each standing on the band boundary it
names. That is the shape both the marker colors and the snow depth layer take,
and it is one line rather than two. The unit rides the section's name —
`Temperature (°F)`, `Precipitation (in)`, `Precipitation (in/hr)` while the
forecast player is scrubbing, and `Snow depth (in)` — so the numbers on the strip
stay bare. AQI is the one with no unit to state, its index being a plain index.
The strip is drawn in equal bands rather than to scale, because a scale running
from 0.39 to 787 inches to scale would be most of its bands in the first few
pixels.

Marker colors follow the ranked metric. Under the default ranking that is total precipitation:

| Color | Precip Total |
|---|---|
| Green | 0.01 in or less |
| Lime | 0.01 in to 0.10 in |
| Yellow | 0.10 in to 0.25 in |
| Orange | 0.25 in to 0.50 in |
| Red | 0.50 in to 1.00 in |
| Purple | more than 1.00 in |

Wind uses the same six colors, with red from 35 to 50 mph and purple above 50 mph. Purple is the same color the AQI scale gives its Very Unhealthy band, so wherever you meet it the reading is the same: past the end of the ramp. Temperature is the one scale with a bad end on both sides: purple at or below 30°F, through sky blue and cyan, green from 60 to 75°F, then orange and red above 90°F.

Click a marker for a popup carrying the same columns the results table is showing, in the table's order. A Current lookup shows one value per metric, because the table collapses its aggregates for a single hour; a date range shows every aggregate, grouped one metric per heading with its values on the line below. Hiding a column in the **Columns** picker hides it in the popup too, and changing the ranking moves that metric to the top of the card. The type, the model and the coordinates sit above the rule, ahead of the numbers. The freezing-level value reads `N/A` under a model that publishes none, the same mark the table's cells carry. Every one of those numbers is a link to Windy, on the same terms the table's cells use: the same overlay, the same forecast model, and for the freezing-level minimum and the AQI maximum the hour that produced the value. A wildfire warning stays a banner at the top of the popup rather than a line among the metrics, and links to that fire on the NIFC map. The elevation and the coordinates carry no link, because neither is a forecast. When you sort by AQI instead, the marker thresholds switch to the US EPA category boundaries (50 / 100 / 150 / 200 / 300). When you sort by the freezing level they switch again, to six bands of 4,000 ft apiece running purple for the lowest freezing line, through indigo and blue, to cyan for the highest. That ramp is deliberately not green to red: a freezing level is a height rather than a verdict, and a skier and a rock climber want opposite ends of it. The map's legend always names the metric it is drawing and the numbers its scale turns on.

## Results Table

Every row carries a **Type** — Peak, Lake, Trailhead, or Custom for one you supplied — because a single polygon can now look for several kinds at once. It travels into the downloaded CSV too, lower-case there, so a file you re-import reads the same value the API uses.

Click any column header to sort the rows on screen by it, ascending or descending. From the keyboard, Tab reaches each header and Enter or Space sorts by it, exactly as a click does; a screen reader reads that hint on each header. That is all a header click does: the ranking, the column order, and the cell shading move only with the **Metrics** table in the panel. By default the table reads in the ranking's order, for example lowest total precipitation for driest-first, and a header click reorders those same rows in place.

Hovering a row reveals a × at its end (always visible on touch screens) that removes the destination from the report — the rows below renumber, and it stays gone as you re-rank, raise the max results, or change any bound. Changing the destinations themselves starts a fresh report where it may return: edit the pasted list or the checked types and a removed destination you still name comes back as a pending destination immediately, while the report on screen keeps it struck out until you run the analysis. To undo one, a **Removed** button appears in the results bar while any removal is in force: it lists every removed row by name, and restores them one at a time or all at once. A restore never fetches — a row the report still holds simply reappears, and one it no longer holds (a searched place, or a row removed before a re-analysis) comes back as a pending destination that rejoins the next Analyze.

| Column | Description |
|---|---|
| Name | Destination name. Click it to center the map on the destination, before or after an analysis; the ↗ beside it opens the destination on Peakbagger or OpenStreetMap |
| Elevation (ft) | Elevation in feet, from the OSM `ele` tag |
| Precipitation · Total (in) | Sum of hourly precipitation over the window, in inches |
| Precipitation · Avg (in/hr) | Average hourly precipitation rate |
| Precipitation · Max (in/hr) | Peak single-hour precipitation rate |
| Temperature · Min/Max/Avg (°F) | Temperature range and average over the window, read at the destination's own elevation. The near-ground value over an archive window |
| Wind · Min/Max/Avg (mph) | Wind speed range and average over the window |
| Freezing level · Min/Max/Avg (ft) | Height of the freezing level over the window, in feet above sea level. `N/A` on the five models that do not publish it |
| Snow depth (in) | Snow on the ground today, from the NOHRSC snow analysis. Not a forecast and not a reading of the window. `≥1,290` marks the source file's own ceiling, which is permanent ice rather than a measurement. `N/A` outside the analysis area |
| AQI · Avg/Max | US AQI over the window, blank past the air quality horizon |
| Cloud base · Min/Max/Avg (ft) | The lowest height above the destination where the model's air is close to saturated, in feet above sea level. Shown only when the report fetched it. Blank for a destination with no known elevation and over an archive window |
| Cloud cover · Min/Max/Avg (%) | The model's total cloud cover over the window, every layer at once. Shown only when the report fetched it |

A single-hour analysis ("now", or a chosen moment) collapses each of those
groups to one column, because over one hour the average, the minimum and the
maximum are the same number three times. Snow depth is already one
column and stays as it is.

The columns belonging to whichever metric you ranked by are shaded, and **each
cell is shaded by its own number** rather than by the ranking. So a destination
with a low precipitation total and one violent hour inside it shows a green
total beside a red peak, which is the spread those extra columns exist to show.

The freezing-level columns are shaded on a scale of their own, and it is the one
scale in the app that does not run green to red. A height is not a verdict:
9,000 ft is a solid night below a 9,500 ft summit and a wasted one below an
8,000 ft col, so a ramp with a bad end would have picked a side. The colours say
only how high the freezing line stands, running purple at the bottom through
indigo and blue to cyan at the top, in even steps of 4,000 ft. It is read by
hue rather than by how dark a band is: every shade is light enough that the
number printed in the cell stays legible on it. Read them against the
**Elevation (ft)** column, which is the comparison the number
exists for. Rank by one of them and the markers, the map's colour key and the
forecast grid all read the same six bands.

Only three of the eight forecast models publish the freezing level, and a cell
answered by one of the other five reads `N/A` with a note saying which three do.
Rank by the freezing level under one of those five and every row reads `N/A`,
the markers stay the neutral grey the map uses for "no answer", and the map's
colour key is not drawn: there is nothing on screen for it to explain.
Zero is a reading rather than a gap: it means the freezing level reached sea
level, so everything above it was below freezing. What the number can and cannot
tell you about an overnight refreeze is in [DATA.md](DATA.md#open-meteo).

The snow depth column is shaded on the freezing level's six shades, run the
other way: cyan for bare ground through sky, blue, indigo and violet to purple
for the deepest, and for the same reason: a depth is not a verdict either. Its
bands are the snow layer's own numbers, so a marker and the layer under it say
the same thing. The top band starts at 400 in because SNODAS does not melt
permanent ice out: a glaciated summit reads hundreds of inches year round, and
that is ice rather than this season's snow. A destination outside the analysis
area reads `N/A`, which is not the same as zero. Ranking by it leaves the
forecast player's markers on the one number they rank by, because today's depth
has no hours to scrub through, and the forecast chart keeps whatever metric it
was showing: there is no hourly series to draw.

The cloud base columns wear the freezing level's shades too, low to high in
even steps of 3,000 ft, because a cloud base is a height like it. The cloud
cover columns are shaded in grey, light for a clear sky and darker as the cover
thickens, the one scale in the app drawn in greys: a cover is a fact about
the sky, not a verdict on it.

The two per-hour precipitation columns are read on a rainfall-intensity scale
rather than on the totals scale the markers and the map legend use, because
they measure a different quantity: 0.30" spread over three days is drizzle and
0.30 in/hr is a downpour. Their boundaries at 0.10 / 0.30 / 0.50 in/hr are the
National Weather Service's intensity classes, with a purple band above 1.00
in/hr. Every other group shares one unit across its columns, and so shares one
scale.

### Downloading the Table

**Download CSV**, in the table's header bar, saves what is currently on screen
as a file. It is a pure copy of the report you are looking at rather than a
fresh query, so nothing is fetched and nothing is spent.

What lands in the file:

- The rows in the order you are reading them, ranking or detail-column sort
  alike, numbered by a leading **Rank** column.
- Every column, under the same headers, whatever the table is showing, which
  means a single-hour analysis exports the collapsed set.
- The **Wildfire (mi)** column, once the fire check answers and while the
  column is shown. On screen the column is on by default and can be hidden like
  any other: its cells tick while the check runs, then show
  ⚠️ and the distance where a fire is within 10 miles, a dash where the
  check ran and cleared the row, and `N/A` where the row has no answer.
  A warned cell is a link to that fire on the NIFC map, the same map a fire
  on Bluebird's own map opens. Hovering an `N/A` says which of its two
  causes applies: the destination sits outside the fire data's US coverage,
  or NIFC is unreachable and the whole check failed. The file writes the same answers with the distance
  bare and the cleared cell empty; a coverage `N/A` carries over as written.
- Nothing a removed row would have contributed. Removals and the max-results
  cut apply first, exactly as on screen.

**The forecast window stands below the data.** Under the last row, behind one
blank row, the file states the window the report was analyzed over:

```
Forecast start,2026-09-18T00:00-07:00
Forecast end,2026-09-21T23:59-07:00
```

With models compared, one more row follows for every compared model whose
forecast ends before the window does, in the picker's order, so a spreadsheet
can work out the hours that model's numbers cover:

```
Forecast end (NOAA HRRR),2026-09-20T02:00-07:00
```

Two models that end on the same hour still get a row each. The mark from the
table goes on the Model column, as `NOAA HRRR*`, and never on a number, because
a mark inside a number would turn it into text that a spreadsheet cannot sort
or average. When the file carries the Model column and at least one marked row,
the footnote follows the model rows behind one blank row:

```
Forecast end (NOAA HRRR),2026-09-20T02:00-07:00

* Data is aggregated over a subset of the forecast window due to the model's limited range.
```

The window is the same one the caption above the table states. The file name carries
the download time instead, so without these two rows a file opened a week later
named no days at all. They are rows rather than columns because the window is
the same for every destination: a value that does not vary by row is something
the file says about itself, which is the part of the file the supplier credits
below already occupy.

Both are written as ISO 8601 local times with the UTC offset, to the minute. A
spreadsheet reads that as a date rather than as text, and the offset says which
clock the hour is on, so a file that travels to another time zone keeps its
meaning. A Current analysis states the hour it sampled. A file downloaded
before any analysis has run carries no window rows at all, because no forecast
covers anything in it yet.

**Every metric cell is a link to Windy**, opened on the same spot, the same
overlay, and the same forecast model the row was analyzed with. Where models
are compared, each row links to its own model. A **Min** or **Max** cell also
opens on the hour that produced it. Three things Windy does with that, measured
rather than assumed: it snaps the hour to the model's own step, so a
three-hourly model lands on the nearest frame; it clamps an hour past that
model's reach; and it ignores a time in the past, opening at the current hour
instead. Windy carries only some agencies' regional models, and where it has none for
your destination it falls back to its own default.

A blank cell means no value, never a zero. AQI is blank past its forecast
horizon, and elevation is blank where OpenStreetMap has no `ele` tag. The
freezing-level columns are the exception and write `N/A` rather than a blank,
because there the absence is the model carrying no such variable rather than a
number that came back empty, and a file is read with nothing around it to say
which.

The wildfire column is the one that can disappear from the file. If the fire
check could not run, the column is left out entirely and a warning under
Analyze says NIFC is unreachable, rather than the file reporting every row as
clear. So a blank wildfire cell in a file means the check ran and found
nothing within 10 miles, which still is not proof there is no fire:
[the wildfire notes](DATA.md#wildfires) explain the coverage gap that a
successful check can still miss.

Coordinates are deliberately absent. The file is meant to be read, not pasted
back into [Coordinates](#d-coordinates).
