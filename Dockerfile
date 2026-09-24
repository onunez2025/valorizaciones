# El token del registro privado de Forgejo, necesario para bajar @siatc/c4c-client.
# Dokploy lo pasa como argumento de construccion. Ver el README del paquete.
ARG FORGEJO_TOKEN=""

# Multi-stage build for production
FROM node:22-slim AS builder
ARG FORGEJO_TOKEN

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

# Install build dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN printf '//git.siatc.cloud/api/packages/MT_Ind/npm/:_authToken=%s\n' "$FORGEJO_TOKEN" > /root/.npmrc \
 && pnpm install --frozen-lockfile \
 && rm -f /root/.npmrc

# Copy source and build
COPY . .
RUN pnpm run build

# Final production image
FROM node:22-slim
ARG FORGEJO_TOKEN

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Install only production dependencies
RUN printf '//git.siatc.cloud/api/packages/MT_Ind/npm/:_authToken=%s\n' "$FORGEJO_TOKEN" > /root/.npmrc \
 && pnpm install --frozen-lockfile --prod \
 && rm -f /root/.npmrc

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the API and UI port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
