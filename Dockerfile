# Base image with Playwright & Chromium
FROM mcr.microsoft.com/playwright:v1.55.0-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose the port
EXPOSE 3000

# Run the server
CMD ["node", "index.js"]
