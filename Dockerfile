# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.16.0
FROM node:${NODE_VERSION}-slim AS base
LABEL fly_launch_runtime="Node.js/Prisma"
WORKDIR /app
ENV NODE_ENV="production"

# Build stage
FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp openssl pkg-config python-is-python3

# انسخ كل المشروع قبل تثبيت الحزم
COPY . .

# تثبيت الحزم
RUN npm ci

# توليد Prisma Client بالمسار الصحيح
RUN npx prisma generate --schema=src/models/prisma/schema.prisma

# Final stage
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY --from=build /app /app

EXPOSE 3000
CMD [ "npm", "run", "start" ]
