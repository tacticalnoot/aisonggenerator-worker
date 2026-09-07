# AI Song Generator Worker

Cloudflare Worker for AI song-generation provider orchestration.

## Development

```bash
pnpm install
pnpm start
```

`pnpm start` runs Wrangler in remote development mode on port `8787`.

## Deploy

```bash
pnpm deploy
```

Regenerate Cloudflare bindings after configuration changes with:

```bash
pnpm cf-typegen
```

## Repository shape

- `src/api/` — provider/API adapters and song-generation request handling
- `wrangler.jsonc` — Cloudflare Worker configuration
- `worker-configuration.d.ts` — generated Cloudflare bindings/types
