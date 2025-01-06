mod processing;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    routing::get,
    serve, Extension, Router,
    body::Body,
};
use axum_thiserror::ErrorStatus;
use image::DynamicImage;
use lazy_static::lazy_static;
use reqwest::{
    header,
    header::{HeaderMap, HeaderValue},
    Client,
};
use serde::Deserialize;
use std::{
    fmt::Display,
    net::SocketAddr,
    time::{Duration, Instant},
};
use thiserror::Error;
use tokio::net::TcpListener;
use tokio_util::io::ReaderStream;
use tracing::{debug, error, info, trace, Level};
use tower_http;

#[derive(Clone)]
struct AppState {
    http_client: Client,
}

lazy_static! {
    static ref HEADERS: HeaderMap = {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::ACCEPT_ENCODING,
            HeaderValue::from_static("gzip, deflate, br, zstd"),
        );
        headers.insert(header::ACCEPT_LANGUAGE, HeaderValue::from_static("en"));
        headers.insert(
            header::REFERER,
            HeaderValue::from_static("https://bsky.app"),
        );
        headers.insert(
            header::USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/133.0",
            ),
        );
        headers.insert(header::ACCEPT, HeaderValue::from_static("*/*"));
        headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("document"));
        headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("document"));
        headers.insert("Sec-Fetch-Site", HeaderValue::from_static("same-site"));
        headers
    };
    static ref BSKX_HEADERS: HeaderMap = {
        let mut headers = HeaderMap::new();

        headers.insert(header::ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            header::USER_AGENT,
            HeaderValue::from_static("bskx-mosaic (v0.1.0, +https://api.bskx.app)"),
        );

        headers
    };
}

#[tokio::main]
async fn main() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }

    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    let client = reqwest::ClientBuilder::new()
        .timeout(Duration::from_millis(5000))
        .build()
        .unwrap();

    let app = Router::new()
        .route("/", get(index_redirect))
        .route("/images/:render_type/:did/*image_ids", get(handle_image))
        .route("/video/:quality/:did/:video_id", get(handle_video))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(Extension(client.clone()))
        .with_state(AppState {
            http_client: client,
        });

    let port = std::env::var("PORT")
        .unwrap_or("3000".to_string())
        .parse::<u16>()
        .expect("PORT must be a number");

    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port)))
        .await
        .unwrap();

    info!("Starting server on {}", listener.local_addr().unwrap());
    serve(listener, app).await.unwrap();
}

#[derive(Debug, Error, ErrorStatus)]
enum BskxImageError {
    #[error("Failed to retrieve data from bskx, status code: {0}")]
    #[status(StatusCode::INTERNAL_SERVER_ERROR)]
    BskxError(#[from] reqwest::Error),

    #[error("Could not retrieve image from URL")]
    #[status(StatusCode::INTERNAL_SERVER_ERROR)]
    ImageLoadingError(#[from] image::ImageError),

    #[error("No images found for post")]
    #[status(StatusCode::BAD_REQUEST)]
    NoImagesFound,

    #[error("Failed to generate combined thumbnail")]
    #[status(StatusCode::INTERNAL_SERVER_ERROR)]
    ProcessingError(#[from] processing::ProcessingError),
}

#[derive(Deserialize, Debug)]
struct HandlePath {
    did: String,
    image_ids: String,
}

#[derive(Deserialize)]
pub struct RenderImageParams {
    pub uri: String,
}

#[derive(Copy, Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ImageSize {
    Thumbnail,
    Fullsize,
}

impl Display for ImageSize {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImageSize::Thumbnail => write!(f, "thumbnail"),
            ImageSize::Fullsize => write!(f, "fullsize"),
        }
    }
}

async fn get_image(
    state: &AppState,
    image_size: ImageSize,
    did: &str,
    image_id: &str,
) -> Result<DynamicImage, BskxImageError> {
    let url = format!(
        "https://cdn.bsky.app/img/feed_{}/plain/{}/{}@jpeg",
        image_size, did, image_id
    );

    debug!("Fetching image from {}", url);

    let start = Instant::now();

    let response = state
        .http_client
        .get(&url)
        .headers(HEADERS.clone())
        .send()
        .await?;

    let bytes = response.bytes().await?;

    debug!(
        bytes = bytes.len(),
        "Fetched image in {:?}",
        start.elapsed()
    );

    image::load_from_memory(&bytes).map_err(BskxImageError::ImageLoadingError)
}

async fn handle_image(
    path: Path<HandlePath>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, BskxImageError> {
    let image_ids = path
        .image_ids
        .split('/')
        .filter(|i| !i.is_empty())
        .collect::<Vec<_>>();

    debug!("Image IDs: {}", image_ids.join(", "));

    let start = Instant::now();

    let tasks: Vec<_> = image_ids
        .iter()
        .map(|image_id| get_image(&state, ImageSize::Fullsize, &path.did, image_id))
        .collect();

    let images: Vec<_> = futures::future::join_all(tasks)
        .await
        .into_iter()
        .flatten()
        .collect();

    if images.is_empty() {
        trace!("No images found this post");
        return Err(BskxImageError::NoImagesFound);
    }

    let span = tracing::Span::current();

    let combined_thumbnail_start = Instant::now();

    let image = match tokio::task::spawn_blocking(move || {
        span.in_scope(|| processing::generate_combined_thumbnail(images))
    })
    .await
    {
        Ok(Ok(image)) => image,
        Ok(Err(e)) => {
            error!("Failed to generate combined thumbnail: {}", e);
            return Err(BskxImageError::ProcessingError(e));
        }
        Err(e) => {
            error!("Failed to spawn blocking task: {}", e);
            return Err(BskxImageError::ProcessingError(
                processing::ProcessingError::BlurBufferError,
            ));
        }
    };

    let combined_thumbnail_time = combined_thumbnail_start.elapsed();
    let size = format!("{}x{}", image.width, image.height);
    let bytes = image.to_bytes().to_owned();

    debug!(
        "Generated combined thumbnail in {:?} with size {} and {} bytes, total time: {:?}",
        combined_thumbnail_time,
        size,
        bytes.len(),
        start.elapsed()
    );

    Ok(([(axum::http::header::CONTENT_TYPE, "image/png")], bytes))
}

async fn index_redirect() -> Redirect {
    Redirect::permanent("https://bskx.app")
}

#[derive(Deserialize)]
struct VideoPath {
    quality: String,
    did: String,
    video_id: String,
}

#[derive(Debug, Error, ErrorStatus)]
enum BskxVideoError {
    #[error("Invalid video payload")]
    #[status(StatusCode::BAD_REQUEST)]
    InvalidVideoPayload,

    #[error("Failed to buffer video")]
    #[status(StatusCode::INTERNAL_SERVER_ERROR)]
    VideoBufferError(#[from] Box<dyn std::error::Error>),
}

async fn handle_video(path: Path<VideoPath>) -> Result<impl IntoResponse, BskxVideoError> {
    if !path.did.starts_with("did") || path.video_id.is_empty() || path.quality.is_empty() {
        return Err(BskxVideoError::InvalidVideoPayload);
    }

    let url = format!(
        "https://video.bsky.app/watch/{}/{}/{}/video.m3u8",
        path.did, path.video_id, path.quality
    );

    debug!("Fetching video from {}", url);

    let start = Instant::now();

    let stdout = match processing::buffer_video(&url).await {
        Ok(stdout) => stdout,
        Err(e) => {
            error!("Failed to buffer video: {}", e);
            return Err(BskxVideoError::VideoBufferError(e));
        }
    };

    let stream = ReaderStream::new(stdout);
    let body = Body::from_stream(stream);

    debug!("Started streaming video in {:?}", start.elapsed());

    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "video/mp4"),
            (axum::http::header::CACHE_CONTROL, "public, max-age=604800"),
            (axum::http::header::CONNECTION, "keep-alive"),
        ],
        body,
    ))
}
