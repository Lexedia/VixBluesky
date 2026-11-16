FROM rust:1.98-alpine AS build

RUN apk add --no-cache musl-dev

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src target/release/deps/api-* target/release/api*

COPY src ./src
RUN cargo build --release --locked

FROM alpine:3.22

RUN apk add --no-cache ffmpeg ca-certificates libgcc \
    && adduser -D -H -u 10001 api

COPY --from=build /app/target/release/api /usr/local/bin/api

USER api
ENV PORT=8080
EXPOSE 8080
CMD ["api"]
