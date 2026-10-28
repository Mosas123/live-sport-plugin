FROM node:22-slim

WORKDIR /app

# Copy package configs and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and assets
COPY . .

# Install internal resolver dependencies
RUN cd resolver && npm install

# Build the bundled distribution
RUN npm run build:local

# Configure runtime environment
ENV PORT=7000
ENV NODE_ENV=production
EXPOSE 7000

# Start server directly with node
CMD ["node", "dist/index.js"]

