/** Populate depth with every solid before drawing depth-tested edges/overlays. */
export function collectDraws(items, lines, {wireframe = false, edges = true} = {}) {
  const draws = [];
  if (!wireframe) for (const entry of items.values()) if (entry.surface) draws.push([entry, entry.surface, false]);
  if (edges || wireframe) for (const entry of items.values()) if (entry.edge) draws.push([entry, entry.edge, true]);
  for (const entry of lines.values()) if (entry.surface && !entry.id.startsWith('selection-')) draws.push([entry, entry.surface, false]);
  // Selection wins color ties with coplanar sketch outlines, but remains depth tested.
  for (const entry of lines.values()) if (entry.surface && entry.id.startsWith('selection-')) draws.push([entry, entry.surface, false]);
  return draws;
}
