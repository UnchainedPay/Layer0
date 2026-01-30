FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json tsconfig.json hardhat.config.ts ./
COPY contracts ./contracts
COPY scripts ./scripts
COPY src ./src
COPY state ./state
RUN npm install
RUN npx hardhat compile
RUN npm run build
CMD ["npm","run","start"]
