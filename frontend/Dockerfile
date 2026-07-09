# Build context is ./frontend (see docker-compose.yml) - no cross-directory
# dependencies here, unlike the backend.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
