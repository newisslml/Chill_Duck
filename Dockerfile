# syntax=docker/dockerfile:1
# Las VITE_* son valores públicos (URL y anon key de Supabase, clave pública VAPID): van dentro del
# bundle de la app de todos modos. Se desactiva el aviso de "secretos en ARG/ENV" por el nombre *_KEY.
# check=skip=SecretsUsedInArgOrEnv

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /repo

# Dependencias solo de la app (sin sharp, vitest ni pglite, que son del resto del repo).
FROM base AS app-deps
COPY package.json package-lock.json ./
COPY app/package.json app/
RUN --mount=type=cache,target=/root/.npm npm ci -w app

# Todas las dependencias del repo, como en Vercel: el typecheck de la app también revisa sus pruebas (vitest).
FROM base AS full-deps
COPY package.json package-lock.json ./
COPY app/package.json app/
RUN --mount=type=cache,target=/root/.npm npm ci

# Servidor de desarrollo con recarga en vivo. El código fuente se monta desde docker-compose.yml.
FROM app-deps AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "app", "--", "--host", "0.0.0.0"]

# Suite de pruebas (vitest + Postgres embebido).
FROM full-deps AS test
COPY . .
CMD ["npm", "test"]

# Compila la PWA. Vite incrusta las VITE_* en el bundle, por eso se piden al construir la imagen.
FROM full-deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
COPY app ./app
# Lógica compartida con las Edge Functions (alias @shared de la app).
COPY supabase/functions/_shared ./supabase/functions/_shared
RUN npm run build -w app

# Imagen final (target por defecto): solo nginx con la PWA ya compilada.
FROM nginx:alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
