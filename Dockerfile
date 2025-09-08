FROM mcr.microsoft.com/playwright:v1.46.0-focal

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
