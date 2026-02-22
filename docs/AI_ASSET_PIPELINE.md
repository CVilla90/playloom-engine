# AI Asset Pipeline (Phase 1)

## Purpose
Let AI agents generate usable starter assets quickly and register them automatically.

## Command
Use:

```bash
npm run asset:gen -- <command> <game-id> <asset-id> [options]
```

Commands:
1. `svg`
2. `sprite`
3. `sfx`
4. `music-loop`

## Examples
```bash
npm run asset:gen -- svg embervault crystal-core --palette ember --size 96
npm run asset:gen -- sprite embervault scout-bot --frames 6 --size 48 --fps 10 --palette neon
npm run asset:gen -- sfx embervault impact-hard --preset hit --duration 0.35
npm run asset:gen -- music-loop embervault bunker-drift --preset ambient --duration 8
```

## Output
Generated files are placed under:
- `games/<game-id>/assets/generated/icons/*`
- `games/<game-id>/assets/generated/sprites/*`
- `games/<game-id>/assets/generated/audio/*`

The tool auto-upserts entries in:
- `games/<game-id>/assets/asset.manifest.json`

## Presets
Palettes:
- `ember`
- `forest`
- `neon`
- `mono`

SFX presets:
- `laser`
- `hit`
- `pickup`
- `jump`

Music presets:
- `ambient`
- `chiptune`

## Validation
After generation:

```bash
npm run validate
npm run smoke
```
