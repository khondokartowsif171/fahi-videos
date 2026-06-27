# CLAUDE.md — fahi-videos & auraajenticai.cloud Infrastructure Runbook

> Operational reference for this project and the wider VPS/Coolify/Cloudflare setup.
> **Secrets are NOT in this file** (it can be committed to GitHub). All tokens, keys and
> passwords live in `CREDENTIALS.local.md`, which is gitignored. When a step needs a
> secret, it says `<see CREDENTIALS.local.md>`.

---

## 1. What this project is

- **fahi-videos** — a Next.js 14 (App Router) YouTube video/downloader app.
- Build: multi-stage `Dockerfile`, `output: 'standalone'`, runs `node server.js` on port **3000**.
- Public URL: **https://fahi-videos.auraajenticai.cloud** (downloader at `/downloader`).
- Source repo: `khondokartowsif171/fahi-videos` (GitHub).
- Active dev branch: `claude/wizardly-wright-lkyavh`.

---

## 2. Hosting topology

```
User ──▶ Cloudflare DNS (auraajenticai.cloud)
              │
              ▼
       VPS 195.35.7.154  (Hostinger)
              │
        Coolify 4.0.0-beta.473  ── manages ──▶ Traefik v3.6.21 (container: coolify-proxy)
              │                                      │ routes by Host() rule, terminates TLS
              ▼                                      ▼
     App containers (Docker)                fahi-videos container :3000
```

- **VPS:** `195.35.7.154`, SSH port 22 (firewalled — not reachable from the Claude sandbox).
- **Coolify dashboard:** https://coolify.auraajenticai.cloud
- **Reverse proxy:** Traefik, container name `coolify-proxy`.
  - ACME store: `/data/coolify/proxy/acme.json`
  - Dynamic config dir (file provider, auto-watched): `/data/coolify/proxy/dynamic/`
  - Host mount: `/data/coolify/proxy/ : /traefik` inside the container.

---

## 3. Coolify identifiers (non-secret)

| Thing                | Value |
|----------------------|-------|
| Coolify URL          | `https://coolify.auraajenticai.cloud` |
| Coolify version      | `4.0.0-beta.473` |
| API base             | `https://coolify.auraajenticai.cloud/api/v1` |
| API token            | `<see CREDENTIALS.local.md>` (Bearer) |
| Server UUID          | `skakvm8isqsutesv0b9i8qc1` (name "test", is_coolify_host) |
| Destination UUID     | `e5fuj5qtsqz7gcqqumusbypp` (network `coolify`) |
| Project "AI Tools"   | `e3jeo9dlxzgcmgr3sabd86yy` |
| fahi-videos app UUID | `zux6wi3woofim4nhmnpm4w4h` |
| fahi-videos FQDN     | `https://fahi-videos.auraajenticai.cloud`, port 3000 |

### Coolify API quick reference (all need `Authorization: Bearer <token>`)

```bash
TOKEN='<see CREDENTIALS.local.md>'
BASE='https://coolify.auraajenticai.cloud/api/v1'

# List apps / servers / projects / resources
curl -s "$BASE/applications"            -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/servers"                 -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/projects"                -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/servers/skakvm8isqsutesv0b9i8qc1/resources" -H "Authorization: Bearer $TOKEN"

# Get one app
curl -s "$BASE/applications/zux6wi3woofim4nhmnpm4w4h" -H "Authorization: Bearer $TOKEN"

# Redeploy / restart / stop an app
curl -s -X POST "$BASE/applications/zux6wi3woofim4nhmnpm4w4h/restart" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/applications/zux6wi3woofim4nhmnpm4w4h/start"   -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/applications/zux6wi3woofim4nhmnpm4w4h/stop"    -H "Authorization: Bearer $TOKEN"

# Patch app config (e.g. custom_labels, commands)
curl -s -X PATCH "$BASE/applications/zux6wi3woofim4nhmnpm4w4h" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"...":"..."}'

# Deployment status + logs (logs field is a JSON string -> parse it)
curl -s "$BASE/deployments/<deployment_uuid>" -H "Authorization: Bearer $TOKEN"

# SSH keys Coolify holds (INCLUDES the VPS host private key)
curl -s "$BASE/security/keys" -H "Authorization: Bearer $TOKEN"
```

**API gaps in this Coolify version (confirmed 404 / not allowed):**
- No proxy restart endpoint (`/servers/{uuid}/proxy/restart` → 404).
- No host command-exec endpoint.
- `redirect` field only accepts `both` (not `none`/`http`/`https`).
- `pre_deployment_command` / `post_deployment_command` run **inside the app container**,
  which has **no `docker` binary** — so you can't restart Traefik that way.

---

## 4. All resources on the VPS (Coolify project "AI Tools")

| Name                         | Type                    | Subdomain |
|------------------------------|-------------------------|-----------|
| fahi-videos                  | application (Next.js)   | fahi-videos |
| auraajenticai-main           | application             | (root / app) |
| aura-api                     | application             | api |
| aura-auth                    | application             | auth |
| aura-client                  | application             | client |
| aura-billing                 | application             | billing |
| aura-team                    | application             | (team) |
| aura-dashboard               | application             | app / app1 |
| aura-sites-server            | application             | aura |
| crypto-api                   | application             | cryptox-api |
| cryptotradeanalysis:main     | application (unhealthy)  | — |
| aura-sql-db                  | standalone PostgreSQL   | — |
| aura-doc-db                  | standalone MongoDB      | — |
| aura-flow / aura-agent / auraagent / aura-git | services | n8n, agent, auraagent, git |
| langflow (x2)                | service (exited)        | — |

> Full live list: `GET /servers/skakvm8isqsutesv0b9i8qc1/resources`.

---

## 5. DNS / Cloudflare

| Thing            | Value |
|------------------|-------|
| Zone             | `auraajenticai.cloud` |
| Zone ID          | `b4656a879001798028753351c4533007` |
| API token        | `<see CREDENTIALS.local.md>` (DNS edit only — SSL/settings return 9109 unauthorized) |

- Wildcard `*.auraajenticai.cloud` → `195.35.7.154` (🟠 proxied).
- Most specific app subdomains are ⚪ grey-cloud (direct to VPS) so Traefik issues real LE certs.
- `auraajenticai.cloud` root + `www` + some Vercel records (`cryptox`, `tradingbangla`, `data-driven`).

```bash
CF_TOKEN='<see CREDENTIALS.local.md>'
ZONE='b4656a879001798028753351c4533007'
# List records
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?per_page=100" \
  -H "Authorization: Bearer $CF_TOKEN"
# Toggle proxy (orange/grey) on a record
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/<record_id>" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"proxied": false}'
```

---

## 6. The 503 / TLS cert problem (history + fix)

**Symptom:** `https://fahi-videos.auraajenticai.cloud` returns **503**; the app container is
healthy (`✓ Ready` on :3000) and all Coolify labels are correct.

**Root cause:** Traefik never issued a Let's Encrypt cert for this host. Early ACME HTTP-01
challenges failed (DNS once pointed at Vercel), and Traefik keeps the ACME **retry backoff in
memory**. App redeploys start a new app container but **don't restart Traefik**, so the backoff
persists. The cert is never retried.

**Definitive fixes (any one works):**

1. **Restart Traefik** (clears in-memory ACME backoff; cert issues within ~30s):
   Coolify UI → **Servers → test → Proxy tab → Restart Proxy**. (No API endpoint for this in
   beta.473; must be the UI button or host shell.)

2. **Issue the cert out-of-band via DNS-01 and drop it into Traefik's dynamic dir**
   (works without restarting Traefik or touching ACME). See `scripts/issue-cert-dns01.sh`
   and `scripts/traefik-dynamic-fahi.yaml` notes below. Requires writing to
   `/data/coolify/proxy/dynamic/` on the host.

3. **Cloudflare proxy** the record (🟠) so Cloudflare terminates TLS for users. Only works if
   the zone SSL mode tolerates the origin cert; zone-wide SSL changes affect every app, so
   prefer fix #1 or #2.

> Note: from the Claude sandbox, HTTPS checks go through Anthropic's egress proxy, which does
> strict cert verification — a `CERTIFICATE_VERIFY_FAILED` / 503 there can be a *test-side*
> artifact, not necessarily what real users see. Verify from a normal browser too.

### Issuing a cert manually with acme.sh (DNS-01, Cloudflare)

```bash
export CF_Token='<see CREDENTIALS.local.md>'
export CF_Zone_ID='b4656a879001798028753351c4533007'
curl -s https://get.acme.sh | sh -s email=khondokartowsif171@gmail.com --force
~/.acme.sh/acme.sh --issue --dns dns_cf -d fahi-videos.auraajenticai.cloud \
  --server letsencrypt --keylength 2048
# Output: ~/.acme.sh/fahi-videos.auraajenticai.cloud/{fullchain.cer,*.key}
```

To install into Traefik, place cert + key in `/data/coolify/proxy/dynamic/` on the host and add
a dynamic file:

```yaml
# /data/coolify/proxy/dynamic/fahi-tls.yaml
tls:
  certificates:
    - certFile: /traefik/dynamic/fahi-videos.crt
      keyFile:  /traefik/dynamic/fahi-videos.key
```

Traefik watches that directory and loads the cert automatically (no restart needed).

---

## 7. Deploy / git workflow

- Develop on branch **`claude/wizardly-wright-lkyavh`**.
- Commit, then `git push -u origin <branch>` (retry with backoff on network errors).
- After pushing, open a **draft PR** if none exists.
- Git identity for commits: `user.name=Claude`, `user.email=noreply@anthropic.com`.
- The git remote uses a local proxy URL (`http://local_proxy@127.0.0.1:<port>/git/...`); a
  GitHub PAT is used transiently for direct pushes and the remote is then restored. The PAT is
  in `CREDENTIALS.local.md`.

---

## 8. Dockerfile (current, clean)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Keep this clean — do **not** add Traefik `LABEL`s here; Coolify manages routing via
`custom_labels` on the app.

---

## 9. Security notes

- All tokens/keys/passwords in `CREDENTIALS.local.md` are **gitignored**. Never commit them.
- These credentials have been shared in plaintext during setup — **rotate them** when
  convenient (Coolify API token, Cloudflare token, GitHub PAT, app basic-auth password) and
  store the new ones in a password manager.
- The Coolify `security/keys` endpoint exposes the VPS host SSH private key — treat the API
  token as root-equivalent to the whole VPS.
