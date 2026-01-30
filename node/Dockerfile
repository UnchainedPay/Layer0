FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build
EXPOSE 7000
CMD ["npm","run","start"]
