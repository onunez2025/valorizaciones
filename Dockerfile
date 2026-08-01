# Multi-stage build for production
FROM node:22-slim AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

# Install build dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# Final production image
FROM node:22-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.18.0 --activate

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the API and UI port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
