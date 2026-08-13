FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

# Need vite/typescript (devDependencies) for `remix vite:build`
RUN npm ci && npm cache clean --force

COPY . .

# Generate Prisma client before Remix build (does not need a live DB)
RUN npx prisma generate

# Shopify Remix embeds the API key at build time
ARG SHOPIFY_API_KEY
ENV SHOPIFY_API_KEY=$SHOPIFY_API_KEY
ENV NODE_ENV=production

RUN npm run build

# Shrink runtime image
RUN npm prune --omit=dev && (npm remove @shopify/cli || true)

CMD ["npm", "run", "docker-start"]
