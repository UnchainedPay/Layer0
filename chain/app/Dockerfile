FROM golang:1.22-alpine AS build
WORKDIR /src
RUN apk add --no-cache git

# Copy only go.mod first (go.sum will be generated during download/tidy)
COPY go.mod ./
RUN go mod download

# Now copy sources and build
COPY . .
RUN go mod tidy
RUN go build -o /out/l0app ./cmd/l0app

FROM alpine:3.20
WORKDIR /app
RUN adduser -D appuser
USER appuser
COPY --from=build /out/l0app /app/l0app
EXPOSE 27158
ENTRYPOINT ["/app/l0app"]
