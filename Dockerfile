FROM node:slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /usr/app

# Copy package files for dependency installation (caching layer)
COPY package.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the entire project
COPY . .

# Build the application
RUN pnpm run build

ENV NODE_ENV=production
ENV LOG_LEVEL=info

EXPOSE 3001
CMD [ "pnpm", "start:web" ]
