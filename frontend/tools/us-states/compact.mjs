// mapshaper's TopoJSON, flattened into the shape usStates.ts decodes: each arc
// one array of alternating quantized x and y deltas, and each state its name,
// how far its coast was simplified (the reach a point off it is still given
// the state by), and its rings as lists of arc indexes.
import fs from 'node:fs'

const topo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const layer = Object.values(topo.objects)[0]
const coastM = (name) => (name === 'Alaska' || name === 'Hawaii' ? 3000 : 1000)

const states = layer.geometries
  .map((g) => {
    const polygons = g.type === 'MultiPolygon' ? g.arcs : [g.arcs]
    return [g.properties.NAME, coastM(g.properties.NAME), polygons.flat()]
  })
  .sort((a, b) => a[0].localeCompare(b[0]))

process.stdout.write(
  JSON.stringify({
    scale: topo.transform.scale,
    translate: topo.transform.translate,
    arcs: topo.arcs.map((arc) => arc.flat()),
    states,
  }),
)
