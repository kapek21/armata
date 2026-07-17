# Armata Siege Asset Pack

## Part A (shared textures)
- textures/tex_wood_albedo_512.png
- textures/tex_metal_albedo_512.png
- textures/tex_stone_albedo_512.png
- textures/tex_ground_albedo_512.png
- textures/tex_keystone_shield_256.png (transparent PNG, decal on critical bricks)
- textures/palette_ref.png

## Part B — Machines (Tier 1..30, 10 variants each = 300 total)
Archetype cycle v1..v10 (per tier):
`trebuchet, mangonel, ram, siege_tower, ballista, mantlet, trebuchet, mangonel, ram, siege_tower`

Directory: `machines/SE-T{tier:02d}-V{variant:02d}-<archetype>/`

Each machine folder contains:
- `blocks.json` — source of truth for render + physics (CastleModule-compatible)
- `hero.png` (1050x1050) — isometric render, deterministic from blocks.json
- `ortho_front.png` (900x900, +Z view) — grid + brick IDs + shield decal on critical
- `ortho_side.png`  (900x900, +X view) — grid + brick IDs
- `ortho_top.png`   (900x900, -Y view) — grid + brick IDs
- `collapse.txt` — critical → collapse behavior note

Tier manifests: `MANIFEST_T{1..30}.json`

## Scaling per tier
- foundation and structural sizes scale ×(1 + 0.05·(tier-1)) → T30 ≈ 2.5× T1
- brick counts grow (extra arm segments, more posts, more floors, taller mantlet stacks)
- material upgrades: wood → metal/stone probabilistically (up to 60% at high tiers) — foundations always `ground`, criticals unchanged
- critical count = `1 + floor((tier-1)/6)` → T1=1, T7=2, T13=3, T19=4, T25=5

## Coordinate system
- origin (0,0,0) = ground center under machine
- +Y up, +Z toward player (FRONT), +X to the player's right
- brick `pos` = center of the box; snap to 0.5

## Materials
`wood | metal | stone | ground` — mapped 1:1 to textures above.
`ground` = foundation slab only (static, always B00).

## Critical bricks
Marked with `render.decal = {type:'shield', face:'+Z', asset:'tex_keystone_shield_256.png'}`.
Rendered as bronze shield emblem on the +Z face in hero + ortho_front.
Destroying every critical brick disables the machine (see `collapse.txt`).

## Determinism
Generator seeds RNG from md5(`{tier}-{variant}-{archetype}`) — regenerating produces byte-identical output.

## Regeneration
`python3 /tmp/armata_gen.py [tier ...]` (defaults to tiers 2..30). T1 was authored during the pilot.
