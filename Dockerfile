FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Tell Traefik to use plain HTTP when connecting to this container (not HTTPS)
LABEL traefik.http.services.https-0-zux6wi3woofim4nhmnpm4w4h.loadbalancer.server.scheme=http
LABEL traefik.http.services.http-0-zux6wi3woofim4nhmnpm4w4h.loadbalancer.server.scheme=http

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
