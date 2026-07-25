FROM node:22-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Remove dev/test files from the image
RUN rm -rf test/ test-utils/ scripts/ reports/ eval/ .env

EXPOSE 5000

CMD ["node", "server.js"]
