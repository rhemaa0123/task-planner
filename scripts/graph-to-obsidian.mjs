#!/usr/bin/env node
/**
 * Turns graphify's graph.json into an Obsidian vault.
 *
 *   node scripts/graph-to-obsidian.mjs [--in graphify-out] [--out obsidian-vault]
 *
 * One note per graph node, with every edge written as a [[wikilink]] so
 * Obsidian's own graph view renders the same structure graphify found. Re-run it
 * after `graphify update .`; the generated notes are rebuilt from scratch, while
 * hand-written notes at the vault root (e.g. `Web Structure.md`) are kept and
 * listed on Home.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const IN = resolve(arg('--in', 'graphify-out'))
const OUT = resolve(arg('--out', 'obsidian-vault'))

const graphPath = join(IN, 'graph.json')
if (!existsSync(graphPath)) {
  console.error(`No graph at ${graphPath}. Run \`graphify update .\` first.`)
  process.exit(1)
}
const graph = JSON.parse(readFileSync(graphPath, 'utf8'))
const nodes = graph.nodes || []
const links = graph.links || graph.edges || []

/* ---- Filenames -------------------------------------------------------- */

// Obsidian (and Windows) reject these in a filename; # ^ [ ] | also break
// wikilink syntax even when the filesystem would accept them.
const ILLEGAL = /[\\/:*?"<>|#^[\]]/g
const safeName = (label) =>
  label.replace(ILLEGAL, '-').replace(/\s+/g, ' ').replace(/-{2,}/g, '-')
    .replace(/^[-\s.]+|[-\s.]+$/g, '') || 'node'

// Labels are not unique (two `@vitejs/plugin-react` nodes, two `src/supabase.js`),
// so names are assigned per node id and disambiguated by source file.
const nameById = new Map()
const taken = new Map()
for (const n of nodes) {
  const base = safeName(n.label ?? n.id)
  const count = taken.get(base) ?? 0
  taken.set(base, count + 1)
  if (count === 0) {
    nameById.set(n.id, base)
  } else {
    const stem = safeName((n.source_file || '').split('/').pop()?.replace(/\.[^.]+$/, '') || String(count + 1))
    let candidate = `${base} (${stem})`
    let bump = 2
    while ([...nameById.values()].includes(candidate)) candidate = `${base} (${stem} ${bump++})`
    nameById.set(n.id, candidate)
  }
}
const link = (id) => (nameById.has(id) ? `[[${nameById.get(id)}]]` : `\`${id}\``)

/* ---- Edge index ------------------------------------------------------- */

const REL = {
  calls: ['Calls', 'Called by'],
  imports: ['Imports', 'Imported by'],
  imports_from: ['Imports from', 'Provides imports to'],
  contains: ['Contains', 'Part of'],
  dynamic_import: ['Dynamically imports', 'Dynamically imported by'],
  indirect_call: ['Indirectly calls', 'Indirectly called by'],
}
const relLabel = (rel, dir) => (REL[rel] ? REL[rel][dir] : `${rel} (${dir ? 'in' : 'out'})`)

const out = new Map()
const inc = new Map()
const push = (map, key, value) => {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(value)
}
for (const l of links) {
  push(out, l.source, l)
  push(inc, l.target, l)
}
const degree = (id) => (out.get(id)?.length ?? 0) + (inc.get(id)?.length ?? 0)

/* ---- Communities ------------------------------------------------------ */

const communities = new Map()
for (const n of nodes) {
  const key = n.community ?? 'none'
  if (!communities.has(key)) {
    communities.set(key, { id: key, name: n.community_name || `Community ${key}`, nodes: [] })
  }
  communities.get(key).nodes.push(n)
}
const commSlug = (c) => `${String(c.id).padStart(2, '0')} - ${safeName(c.name)}`
const commTag = (c) => `community/${safeName(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

/* ---- Writing ---------------------------------------------------------- */

// Only what this script writes is cleared, so notes added by hand survive
const GENERATED = ['Home.md', 'Graph Report.md']
for (const d of ['Nodes', 'Communities']) rmSync(join(OUT, d), { recursive: true, force: true })
for (const f of GENERATED) rmSync(join(OUT, f), { force: true })
for (const d of ['', 'Nodes', 'Communities', '.obsidian']) mkdirSync(join(OUT, d), { recursive: true })

const handwritten = readdirSync(OUT)
  .filter((f) => f.endsWith('.md') && !GENERATED.includes(f))
  .map((f) => f.replace(/\.md$/, ''))
  .sort()

const yamlStr = (s) => `"${String(s).replace(/"/g, '\\"')}"`
const write = (rel, body) => writeFileSync(join(OUT, rel), body.replace(/\n{3,}/g, '\n\n'), 'utf8')

// --- node notes
for (const n of nodes) {
  const name = nameById.get(n.id)
  const comm = communities.get(n.community ?? 'none')
  const tags = [n.file_type || 'node', n._callable ? 'callable' : 'symbol', commTag(comm)]

  const fm = [
    '---',
    `aliases: [${yamlStr(n.label ?? n.id)}]`,
    `tags: [${tags.join(', ')}]`,
    n.source_file ? `file: ${yamlStr(n.source_file)}` : null,
    n.source_location ? `line: ${yamlStr(n.source_location)}` : null,
    `community: ${yamlStr(comm.name)}`,
    `degree: ${degree(n.id)}`,
    n._origin ? `origin: ${n._origin}` : null,
    `graphify_id: ${yamlStr(n.id)}`,
    '---',
  ].filter(Boolean).join('\n')

  const where = [
    n.source_file ? `\`${n.source_file}\`` : null,
    n.source_location || null,
  ].filter(Boolean).join(' · ')

  const sections = []
  const bucket = (edges, dir) => {
    const byRel = new Map()
    for (const e of edges || []) {
      if (!byRel.has(e.relation)) byRel.set(e.relation, [])
      byRel.get(e.relation).push(e)
    }
    for (const [rel, list] of [...byRel].sort()) {
      const lines = list.map((e) => {
        const other = dir ? e.source : e.target
        // A guessed edge is marked, so it is never mistaken for something read
        // out of the syntax tree
        const flag = e.confidence && e.confidence !== 'EXTRACTED'
          ? ` *(${e.confidence.toLowerCase()}${e.confidence_score ? `, ${e.confidence_score}` : ''})*`
          : ''
        return `- ${link(other)}${flag}`
      })
      sections.push(`## ${relLabel(rel, dir)}\n${[...new Set(lines)].sort().join('\n')}`)
    }
  }
  bucket(out.get(n.id), 0)
  bucket(inc.get(n.id), 1)

  write(
    join('Nodes', `${name}.md`),
    `${fm}\n\n# ${n.label ?? n.id}\n\n${where}\nCommunity: [[${commSlug(comm)}]]\n\n${
      sections.join('\n\n') || '*No edges recorded.*'
    }\n\n---\n[[Home]]\n`,
  )
}

// --- community notes
const sortedComms = [...communities.values()].sort((a, b) => b.nodes.length - a.nodes.length)
for (const c of sortedComms) {
  const members = [...c.nodes].sort((a, b) => degree(b.id) - degree(a.id))
  const rows = members.map(
    (n) => `| ${link(n.id)} | ${degree(n.id)} | ${n.source_file ? `\`${n.source_file}\`` : '—'} |`,
  )
  write(
    join('Communities', `${commSlug(c)}.md`),
    `---\ntags: [community, ${commTag(c)}]\n---\n\n# ${c.name}\n\n` +
      `Community ${c.id} · ${c.nodes.length} node${c.nodes.length === 1 ? '' : 's'}\n\n` +
      `| Node | Edges | File |\n| --- | --- | --- |\n${rows.join('\n')}\n\n---\n[[Home]]\n`,
  )
}

// --- home
const god = [...nodes].sort((a, b) => degree(b.id) - degree(a.id)).slice(0, 12)
const inferred = links.filter((l) => l.confidence && l.confidence !== 'EXTRACTED')
const files = [...new Set(nodes.map((n) => n.source_file).filter(Boolean))].sort()

write(
  'Home.md',
  `---\ntags: [index]\n---\n\n# task-planner — code graph\n\n` +
    `${nodes.length} nodes · ${links.length} edges · ${communities.size} communities\n` +
    `Built from commit \`${graph.built_at_commit || 'unknown'}\`\n\n` +
    `> Open the graph view (Ctrl/Cmd+G) to see it. Communities are colour-grouped by tag.\n\n` +
    `## Most connected\n` +
    god.map((n, i) => `${i + 1}. ${link(n.id)} — ${degree(n.id)} edges`).join('\n') +
    `\n\n## Communities\n` +
    sortedComms.map((c) => `- [[${commSlug(c)}]] — ${c.nodes.length} nodes`).join('\n') +
    (inferred.length
      ? `\n\n## Inferred edges\nNot read from the syntax tree — graphify guessed these.\n\n` +
        inferred.map((l) => `- ${link(l.source)} → ${link(l.target)} (${l.relation}, ${l.confidence_score ?? '?'})`).join('\n')
      : '') +
    (handwritten.length
      ? `\n\n## Hand-written\n` + handwritten.map((n) => `- [[${n}]]`).join('\n')
      : '') +
    `\n\n## Files\n` + files.map((f) => `- \`${f}\``).join('\n') +
    `\n\n## Source report\n[[Graph Report]]\n`,
)

// --- the graphify report, carried in verbatim so the vault stands alone
const reportPath = join(IN, 'GRAPH_REPORT.md')
if (existsSync(reportPath)) {
  write('Graph Report.md', `---\ntags: [index, report]\n---\n\n${readFileSync(reportPath, 'utf8')}\n\n---\n[[Home]]\n`)
}

/* ---- Obsidian config -------------------------------------------------- */

const PALETTE = [0x4ade80, 0x94b4c1, 0xf0a868, 0xc084fc, 0xf87171, 0x60a5fa, 0xfbbf24, 0x2dd4bf]
writeFileSync(
  join(OUT, '.obsidian', 'graph.json'),
  JSON.stringify(
    {
      collapseFilter: false,
      search: '',
      showTags: false,
      showAttachments: false,
      hideUnresolved: true,
      showOrphans: true,
      collapseColorGroups: false,
      colorGroups: sortedComms.map((c, i) => ({
        query: `tag:#${commTag(c)}`,
        color: { a: 1, rgb: PALETTE[i % PALETTE.length] },
      })),
      collapseDisplay: false,
      showArrow: true,
      textFadeMultiplier: -0.7,
      nodeSizeMultiplier: 1.4,
      lineSizeMultiplier: 1,
      collapseForces: false,
      centerStrength: 0.42,
      repelStrength: 12,
      linkStrength: 0.6,
      linkDistance: 180,
      scale: 0.7,
      close: false,
    },
    null,
    2,
  ),
  'utf8',
)
writeFileSync(
  join(OUT, '.obsidian', 'app.json'),
  JSON.stringify({ attachmentFolderPath: 'attachments', alwaysUpdateLinks: true, newLinkFormat: 'shortest' }, null, 2),
  'utf8',
)

console.log(`Vault written to ${OUT}`)
console.log(`  ${nodes.length} node notes · ${communities.size} community notes · Home + Graph Report`)
console.log(`  ${links.length} edges as wikilinks${inferred.length ? ` (${inferred.length} inferred, marked)` : ''}`)
if (handwritten.length) console.log(`  kept ${handwritten.length} hand-written note${handwritten.length === 1 ? '' : 's'}: ${handwritten.join(', ')}`)
