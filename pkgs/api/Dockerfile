FROM rust:1.80.1-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg libgcc libstdc++ musl-dev

COPY . .

RUN cargo build --release

CMD ["./target/release/api"]
