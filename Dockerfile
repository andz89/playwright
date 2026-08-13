# Playwright's own base image ships a Chromium build plus every OS-level
# library it needs to run, matched exactly to this npm package version — far
# more reliable than apt-installing deps by hand. Keep the tag in sync with
# the `playwright` version in package.json.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next.js inlines NEXT_PUBLIC_* vars into the client bundle at build time, so
# they must be passed as build args (Render forwards matching env vars from
# render.yaml automatically) rather than left as runtime-only env vars.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

# Set only after the build: `next build` needs devDependencies (e.g.
# @tailwindcss/postcss) installed above, which npm skips when NODE_ENV is
# already "production" during `npm ci`.
ENV NODE_ENV=production

# Render sets $PORT at runtime; Next.js reads it automatically.
EXPOSE 3000
ENV CHROMIUM_NO_SANDBOX=1

CMD ["npm", "start"]
