FROM mcr.microsoft.com/playwright:v1.55.0-jammy


# Create app directory
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy app files
COPY . .

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
# Create app directory
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy app files
COPY . .

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
