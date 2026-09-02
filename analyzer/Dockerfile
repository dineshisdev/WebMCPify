FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
COPY lib ./lib
COPY analyzer ./analyzer
COPY public/bridge.js ./public/bridge.js

WORKDIR /app/analyzer
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npx", "tsx", "src/server.ts"]
