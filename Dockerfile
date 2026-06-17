FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Override Coolify UUID-based service schemes to HTTP (Coolify sets these to https)
LABEL traefik.http.services.https-0-zux6wi3woofim4nhmnpm4w4h.loadbalancer.server.scheme=http
LABEL traefik.http.services.http-0-zux6wi3woofim4nhmnpm4w4h.loadbalancer.server.scheme=http

# Custom router+service for fahi-videos.auraajenticai.cloud
# Uses a name Coolify never generates, so it won't be overridden at runtime
LABEL traefik.http.routers.fahi-main-https.entrypoints=https
LABEL traefik.http.routers.fahi-main-https.rule=Host(`fahi-videos.auraajenticai.cloud`)
LABEL traefik.http.routers.fahi-main-https.tls=true
LABEL traefik.http.routers.fahi-main-https.tls.certresolver=letsencrypt
LABEL traefik.http.routers.fahi-main-https.service=fahi-main-svc
LABEL traefik.http.services.fahi-main-svc.loadbalancer.server.port=3000
LABEL traefik.http.services.fahi-main-svc.loadbalancer.server.scheme=http

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
