mod processing;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    routing::get,
    serve, Extension, Router,
    extract::Request,
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
    collections::HashMap,
    fmt::Display,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};
use thiserror::Error;
use tokio::net::TcpListener;
use tower::ServiceExt;
use tower_http::services::ServeFile;
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
    static ref VIDEO_CACHE_DIR: PathBuf = std::env::var_os("VIDEO_CACHE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("bskx-videos"));
    static ref REMUXING: Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>> = Default::default();
}

const VIDEO_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);

async fn clean_video_cache() {
    let Ok(mut dir) = tokio::fs::read_dir(&*VIDEO_CACHE_DIR).await else {
        return;
    };
    while let Ok(Some(entry)) = dir.next_entry().await {
        let age = entry
            .metadata()
            .await
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| SystemTime::now().duration_since(t).ok());
        if age.is_some_and(|age| age > VIDEO_CACHE_TTL) {
            let _ = tokio::fs::remove_file(entry.path()).await;
        }
    }
}

#[tokio::main]
async fn main() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }

    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    tokio::fs::create_dir_all(&*VIDEO_CACHE_DIR)
        .await
        .expect("VIDEO_CACHE_DIR must be writable");
    tokio::spawn(async {
        let mut interval = tokio::time::interval(Duration::from_secs(10 * 60));
        loop {
            interval.tick().await;
            clean_video_cache().await;
        }
    });

    let client = reqwest::ClientBuilder::new()
        .timeout(Duration::from_millis(5000))
        .build()
        .unwrap();

    let app = Router::new()
        .route("/", get(index_redirect))
        .route("/healthz", get(|| async { "ok" }))
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

    #[error("Too many images, maximum is {}", processing::MAX_IMAGES)]
    #[status(StatusCode::BAD_REQUEST)]
    TooManyImages,

    #[error("Failed to generate combined thumbnail")]
    #[status(StatusCode::INTERNAL_SERVER_ERROR)]
    ProcessingError(#[from] processing::ProcessingError),
}

#[derive(Deserialize, Debug)]
struct HandlePath {
    render_type: String,
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

    if image_ids.len() > processing::MAX_IMAGES {
        return Err(BskxImageError::TooManyImages);
    }

    let format = processing::OutputFormat::from_render_type(&path.render_type);
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
        span.in_scope(|| processing::generate_combined_thumbnail(images, format))
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

    Ok((
        [
            (axum::http::header::CONTENT_TYPE, format.content_type()),
            (
                axum::http::header::CACHE_CONTROL,
                "public, max-age=604800, immutable",
            ),
        ],
        bytes,
    ))
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

    #[error("This video has no {0} rendition, see /profile/<user>/post/<post>/qualities on bskx.app")]
    #[status(StatusCode::NOT_FOUND)]
    RenditionNotFound(String),

    #[error("Failed to reach Bluesky's video service")]
    #[status(StatusCode::BAD_GATEWAY)]
    UpstreamError(#[from] reqwest::Error),

    #[error("Failed to remux video")]
    #[status(StatusCode::INTERNAL_SERVER_ERROR)]
    VideoBufferError(#[from] std::io::Error),
}

fn is_quality(quality: &str) -> bool {
    quality
        .strip_suffix('p')
        .is_some_and(|n| (3..=4).contains(&n.len()) && n.bytes().all(|b| b.is_ascii_digit()))
}

fn is_id(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b':' || b == b'.' || b == b'-' || b == b'_')
}

async fn handle_video(
    path: Path<VideoPath>,
    State(state): State<AppState>,
    request: Request,
) -> Result<impl IntoResponse, BskxVideoError> {
    let is_cid = !path.video_id.is_empty() && path.video_id.bytes().all(|b| b.is_ascii_alphanumeric());
    if !path.did.starts_with("did:") || !is_id(&path.did) || !is_cid || !is_quality(&path.quality) {
        return Err(BskxVideoError::InvalidVideoPayload);
    }

    let file = VIDEO_CACHE_DIR.join(format!("{}_{}_{}.mp4", path.did, path.video_id, path.quality));

    if !tokio::fs::try_exists(&file).await.unwrap_or(false) {
        let lock = REMUXING.lock().unwrap().entry(file.clone()).or_default().clone();
        let guard = lock.lock().await;

        let result = if tokio::fs::try_exists(&file).await.unwrap_or(false) {
            Ok(())
        } else {
            remux(&state, &path, &file).await
        };

        drop(guard);
        let mut remuxing = REMUXING.lock().unwrap();
        if Arc::strong_count(&lock) == 2 {
            remuxing.remove(&file);
        }
        drop(remuxing);
        result?;
    }

    let response = ServeFile::new(&file)
        .oneshot(request)
        .await
        .unwrap_or_else(|e| match e {});

    Ok((
        [(axum::http::header::CACHE_CONTROL, "public, max-age=604800")],
        response,
    ))
}

async fn remux(state: &AppState, path: &VideoPath, file: &std::path::Path) -> Result<(), BskxVideoError> {
    let url = format!(
        "https://video.bsky.app/watch/{}/{}/{}/video.m3u8",
        path.did, path.video_id, path.quality
    );

    debug!("Fetching video from {}", url);

    let status = state.http_client.head(&url).send().await?.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(BskxVideoError::RenditionNotFound(path.quality.clone()));
    }

    let start = Instant::now();
    processing::remux_video(&url, file).await.map_err(|e| {
        error!("Failed to remux video: {}", e);
        BskxVideoError::VideoBufferError(e)
    })?;
    debug!("Remuxed video in {:?}", start.elapsed());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quality_names() {
        for ok in ["360p", "720p", "1080p", "2160p"] {
            assert!(is_quality(ok), "{ok}");
        }
        for bad in ["", "p", "72p", "720", "720P", "99999p", "../720p", "720p/../x", "best"] {
            assert!(!is_quality(bad), "{bad}");
        }
    }

    #[test]
    fn ids() {
        assert!(is_id("did:plc:2yehul7kewhtyhf3royv4nei"));
        assert!(is_id("did:web:example.com"));
        assert!(is_id("bafkreihbbgiqrbsyplhto4buw3otpvi4hkn7ktsbjkyq3zwcxgtlmtbfo4"));
        assert!(!is_id(""));
        assert!(!is_id("a/b"));
        assert!(!is_id("a?b"));
        assert!(!is_id("a%2Fb"));
    }
}
