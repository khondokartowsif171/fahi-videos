# CLAUDE.md — auraajenticai.cloud VPS Master Runbook

> Single reference for the **entire VPS estate**: every project, the Coolify control plane,
> Cloudflare DNS, the self-hosted Gitea, databases, the reverse proxy, and operational runbooks.
>
> **Secrets are NOT in this file** (it is committed to GitHub). All tokens, keys and passwords
> live in `CREDENTIALS.local.md`, which is gitignored. When a step needs a secret it says
> `<see CREDENTIALS.local.md>`.

---

## 1. Overview

- **One VPS** (Hostinger): IPv4 `195.35.7.154`, IPv6 `2a02:4780:12:2f79::1`.
- Everything is hosted under the domain **`auraajenticai.cloud`** (DNS on Cloudflare).
- Orchestrated by **Coolify** (self-hosted PaaS), reverse-proxied by **Traefik**
  (container `coolify-proxy`), which terminates TLS and routes by `Host()` rule.
- 11 applications, 6 services, 1 standalone database — all in Coolify project **"AI Tools"**.

---

## 2. Topology

```
User ──▶ Cloudflare DNS (auraajenticai.cloud)
              │
              ▼
       VPS 195.35.7.154  (Hostinger)  ─ IPv6 2a02:4780:12:2f79::1
              │
        Coolify 4.0.0-beta.473  ── manages ──▶ Traefik v3.6.21 (coolify-proxy)
              │                                      │ TLS + Host()-rule routing
              ▼                                      ▼
     Docker containers (apps / services / db) ── on docker network `coolify`
```

---

## 3. Coolify control plane

| Thing                | Value |
|----------------------|-------|
| Dashboard            | `https://coolify.auraajenticai.cloud` |
| Version              | `4.0.0-beta.473` |
| API base             | `https://coolify.auraajenticai.cloud/api/v1` |
| API token            | `<see CREDENTIALS.local.md>` (Bearer; **root-equivalent over the whole VPS**) |
| Server UUID          | `skakvm8isqsutesv0b9i8qc1` (name "test", is_coolify_host) |
| Destination UUID     | `e5fuj5qtsqz7gcqqumusbypp` (docker network `coolify`) |
| Project "AI Tools"   | `e3jeo9dlxzgcmgr3sabd86yy` |

### API quick reference (all need `Authorization: Bearer <token>`)

```bash
TOKEN='<see CREDENTIALS.local.md>'
BASE='https://coolify.auraajenticai.cloud/api/v1'

curl -s "$BASE/applications" -H "Authorization: Bearer $TOKEN"   # list apps
curl -s "$BASE/services"     -H "Authorization: Bearer $TOKEN"   # list services
curl -s "$BASE/databases"    -H "Authorization: Bearer $TOKEN"   # list databases
curl -s "$BASE/servers/skakvm8isqsutesv0b9i8qc1/resources" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/servers/skakvm8isqsutesv0b9i8qc1/domains"   -H "Authorization: Bearer $TOKEN"

# One app + lifecycle
curl -s        "$BASE/applications/<uuid>"          -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/applications/<uuid>/restart" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/applications/<uuid>/start"   -H "Authorization: Bearer $TOKEN"
curl -s -X POST "$BASE/applications/<uuid>/stop"    -H "Authorization: Bearer $TOKEN"

# Patch config (custom_labels, commands, env…)
curl -s -X PATCH "$BASE/applications/<uuid>" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"...":"..."}'

# Deployment status + logs (the logs field is a JSON STRING — parse it)
curl -s "$BASE/deployments/<deployment_uuid>" -H "Authorization: Bearer $TOKEN"

# SSH keys Coolify holds (INCLUDES the VPS host private key — id 0)
curl -s "$BASE/security/keys" -H "Authorization: Bearer $TOKEN"
```

**Known API gaps in beta.473 (don't waste time on these):**
- No proxy/Traefik restart endpoint (`/servers/{uuid}/proxy/restart` → 404). Restart the proxy
  from the **UI**: Servers → "test" → **Proxy** tab → **Restart Proxy**.
- No host command-exec endpoint.
- `pre_deployment_command` / `post_deployment_command` run **inside the app container**, which
  has **no `docker` binary** — cannot be used to restart Traefik.
- `redirect` field only accepts `both`.

---

## 4. Applications (11)

| App | UUID | Domain(s) | Port | Source |
|-----|------|-----------|------|--------|
| aura-api | `m43q7n7vlttrzyxy5v2hkaig` | api.auraajenticai.cloud | 3000 | Gitea `khondokar/aura-api` |
| aura-auth | `g5ehpyu7i1azk7f1sv1bhctz` | auth.auraajenticai.cloud | 3000 | Gitea (SSH) `khondokar/aura-auth` |
| aura-billing | `j8xnv56xhx6wiaeal2bfiktm` | billing.auraajenticai.cloud | 3000 | Gitea `khondokar/aura-billing` |
| aura-client | `rdqk1mqe0k8fifs64d7jrzfi` | client.auraajenticai.cloud | 3000 | Gitea `khondokar/aura-client` |
| aura-dashboard | `zu9kxa9iung19q003ybvcdj3` | aura.auraajenticai.cloud | 3000 | Gitea `khondokar/aura-dashboard` |
| aura-sites-server | `y28n5oyv5cm3a0l3hosl52xc` | aubdullahoptics + aura-sites .auraajenticai.cloud | 80 | Gitea `khondokar/aura-sites-server` |
| aura-team | `m6fnc3kfy72tf77anuv4o2f4` | team.auraajenticai.cloud | 3000 | Gitea `khondokar/aura-team` |
| auraajenticai-main | `q2kkhvkrpdm6ukj20gv69tuk` | **auraajenticai.cloud** (root) | 80 | Gitea `khondokar/auraajenticai-main` |
| crypto-api | `o9k95y0ge6nge9yitxicjef0` | cryptox-api.auraajenticai.cloud | 3001 | GitHub `khondokartowsif171/cryptotradeanalysis-public` |
| cryptotradeanalysis:main | `p137l3v9vzvmwzv9tditcfvg` | p137…auraajenticai.cloud | 80 | GitHub `khondokartowsif171/cryptotradeanalysis` ⚠️ **exited:unhealthy** |
| fahi-videos | `zux6wi3woofim4nhmnpm4w4h` | fahi-videos.auraajenticai.cloud | 3000 | GitHub `khondokartowsif171/fahi-videos` |

> All apps build with the **dockerfile** build pack, all on docker network `coolify`.
> `aura-*` apps are cloned from the **self-hosted Gitea** (§8); the three crypto/fahi apps from GitHub.

---

## 5. Services (6)

| Service | UUID | Type | Domain | Status |
|---------|------|------|--------|--------|
| aura-flow | `j9pqq74tuik1oqd5runx5ncb` | n8n + PostgreSQL | n8n.auraajenticai.cloud | ✅ healthy |
| aura-git | `oqwgsn2lcv3hsk13c6ayj8du` | Gitea + PostgreSQL | git.auraajenticai.cloud | ✅ healthy |
| aura-agent | `dhcia3tgcvwmwwvexznjw9gr` | openclaw | agent.auraajenticai.cloud | ✅ healthy |
| auraagent | `pi475djbkunezi95xzxl28bx` | openclaw | auraagent.auraajenticai.cloud | ✅ healthy |
| langflow | `j502oo…q6k` | langflow | langflow-j502…auraajenticai.cloud | ⚠️ exited |
| langflow | `l13zhx…zm6` | langflow | langflow-l13z…auraajenticai.cloud | ⚠️ exited |

---

## 6. Databases

| Name | UUID | Engine | Status | Exposure |
|------|------|--------|--------|----------|
| aura-doc-db | `b3bhfd7bocb4pm36uv36rebq` | standalone MongoDB | ✅ healthy | private (no public port) |

> PostgreSQL instances also exist but are **bundled inside services** (`aura-flow` = n8n+postgres,
> `aura-git` = gitea+postgres), not standalone Coolify databases.

---

## 7. DNS / Cloudflare

| Thing            | Value |
|------------------|-------|
| Zone             | `auraajenticai.cloud` |
| Zone ID          | `b4656a879001798028753351c4533007` |
| API token        | `<see CREDENTIALS.local.md>` — **DNS edit only**; SSL/zone-settings return `9109 unauthorized` |

- Wildcard `*.auraajenticai.cloud` → `195.35.7.154` (🟠 proxied).
- Most specific app subdomains are ⚪ **grey-cloud** (direct to VPS) so Traefik can issue real
  Let's Encrypt certs via HTTP-01.
- Vercel-hosted records also exist (`cryptox`, `tradingbangla`, `data-driven`).

```bash
CF_TOKEN='<see CREDENTIALS.local.md>'
ZONE='b4656a879001798028753351c4533007'
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?per_page=100" \
  -H "Authorization: Bearer $CF_TOKEN"
# Toggle proxy (orange/grey) on a record
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/<record_id>" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"proxied": false}'
```

---

## 8. Self-hosted Gitea

- URL: **`git.auraajenticai.cloud`** (Coolify service `aura-git`, gitea+postgresql).
- SSH clone port: **22222** (e.g. `git@git.auraajenticai.cloud:22222/khondokar/<repo>.git`).
- The `aura-*` applications clone from here using HTTP basic-auth tokens (`user:token@host`)
  embedded in their Coolify git URL. Tokens are in `CREDENTIALS.local.md`.

---

## 9. Reverse proxy / TLS (Traefik)

- Container: **`coolify-proxy`**, Traefik **v3.6.21**, managed by Coolify.
- ACME store: `/data/coolify/proxy/acme.json`
- Dynamic config dir (file provider, auto-watched): `/data/coolify/proxy/dynamic/`
- Host mount inside the container: `/data/coolify/proxy/ : /traefik`
- Certs: Let's Encrypt via **HTTP-01** (default, for grey-cloud subdomains).

### Known issue — fahi-videos 503 (cert never issued)

**Symptom:** `https://fahi-videos.auraajenticai.cloud` returns **503**; app container healthy on :3000.

**Root cause:** Traefik never issued an LE cert for this host. Early ACME HTTP-01 challenges
failed (DNS once pointed at Vercel) and Traefik keeps the ACME **retry backoff in memory**. App
redeploys start a new app container but **don't restart Traefik**, so the backoff persists and
the cert is never retried.

**Fixes (any one works):**
1. **Restart Traefik** — Coolify UI → Servers → "test" → Proxy → **Restart Proxy**. Clears the
   in-memory backoff; cert issues within ~30s. (No API endpoint for this in beta.473.)
2. **Issue out-of-band via DNS-01 and drop into Traefik's dynamic dir** (no Traefik restart):

   ```bash
   export CF_Token='<see CREDENTIALS.local.md>'
   export CF_Zone_ID='b4656a879001798028753351c4533007'
   curl -s https://get.acme.sh | sh -s email=khondokartowsif171@gmail.com --force
   ~/.acme.sh/acme.sh --issue --dns dns_cf -d fahi-videos.auraajenticai.cloud \
     --server letsencrypt --keylength 2048
   # → ~/.acme.sh/fahi-videos.auraajenticai.cloud/{fullchain.cer,*.key}
   ```

   Then place cert+key in `/data/coolify/proxy/dynamic/` on the host and add:

   ```yaml
   # /data/coolify/proxy/dynamic/fahi-tls.yaml
   tls:
     certificates:
       - certFile: /traefik/dynamic/fahi-videos.crt
         keyFile:  /traefik/dynamic/fahi-videos.key
   ```

   Traefik watches the directory and loads it automatically.
3. **Cloudflare-proxy the record** (🟠) so Cloudflare terminates TLS for users — depends on the
   zone SSL mode and affects all apps, so prefer #1 or #2.

> Note: from the Claude sandbox, HTTPS checks go through Anthropic's egress proxy (strict cert
> verification). A `CERTIFICATE_VERIFY_FAILED` / 503 there can be a *test-side* artifact — always
> confirm from a normal browser too.

---

## 10. Deploy / git workflow

- **fahi-videos** dev branch: **`claude/wizardly-wright-lkyavh`**.
- Commit, then `git push -u origin <branch>` (retry with exponential backoff on network errors).
- The git remote uses a local proxy URL (`http://local_proxy@127.0.0.1:<port>/git/...`). If a
  proxy push fails, push directly with the GitHub PAT, then **restore** the proxy remote:
  ```bash
  ORIG=$(git remote get-url origin)
  git push "https://khondokartowsif171:<PAT>@github.com/khondokartowsif171/fahi-videos.git" <branch>
  git remote set-url origin "$ORIG"
  ```
- After pushing, open a **draft PR** if none exists.
- Commit identity: `user.name=Claude`, `user.email=noreply@anthropic.com`.

---

## 11. Security notes

- All tokens/keys/passwords live in `CREDENTIALS.local.md` (**gitignored** via `*.local.md`).
  Never commit them. The container is ephemeral — keep a copy in a password manager.
- These credentials were shared in plaintext during setup — **rotate them**: Coolify API token,
  Cloudflare token, GitHub PAT, the two Gitea tokens, and the app basic-auth password.
- The Coolify `security/keys` endpoint exposes the VPS **host SSH private key** → treat the
  Coolify API token as **root over the entire VPS**.
