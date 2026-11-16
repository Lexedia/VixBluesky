use std::{ffi::OsStr, io::Cursor, path::Path};

use image::{
    imageops, imageops::FilterType, DynamicImage, GenericImageView, ImageError, ImageOutputFormat,
    RgbImage,
};
use rayon::prelude::*;
use thiserror::Error;
use tokio::process::Command;
use tracing::debug;

#[derive(Debug, Error)]
pub enum ProcessingError {
    #[error("Image array is empty")]
    EmptyImageArray,
    #[error("Image array has too many images, maximum is 16")]
    TooManyImages,
    #[error("Could not find image with most pixels, array is likely empty")]
    CouldNotFindMostPixels,
    #[error("Image encoding error: {0}")]
    ImageError(#[from] ImageError),
    #[error("Failed to blur image: {0}")]
    BlurSliceSizeError(#[from] blurslice::SliceSizeError),
    #[error("Failed to blur image, final image buffer could not be allocated")]
    BlurBufferError,
}

pub struct CombinedThumbnail {
    inner: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

impl CombinedThumbnail {
    pub fn new(
        image: DynamicImage,
        format: ImageOutputFormat,
        width: u32,
        height: u32,
    ) -> Result<Self, ImageError> {
        let mut buffer = Cursor::new(Vec::new());
        image.write_to(&mut buffer, format)?;

        Ok(CombinedThumbnail {
            inner: buffer.into_inner(),
            width,
            height,
        })
    }

    pub fn to_bytes(&self) -> &[u8] {
        &self.inner
    }
}

pub const MAX_IMAGES: usize = 16;
const MAX_SIDE: u32 = 2048;
const JPEG_QUALITY: u8 = 85;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Png,
    Jpeg,
}

impl OutputFormat {
    pub fn from_render_type(render_type: &str) -> Self {
        match render_type.to_ascii_lowercase().as_str() {
            "jpeg" | "jpg" => OutputFormat::Jpeg,
            _ => OutputFormat::Png,
        }
    }

    pub fn content_type(self) -> &'static str {
        match self {
            OutputFormat::Png => "image/png",
            OutputFormat::Jpeg => "image/jpeg",
        }
    }

    fn image_format(self) -> ImageOutputFormat {
        match self {
            OutputFormat::Png => ImageOutputFormat::Png,
            OutputFormat::Jpeg => ImageOutputFormat::Jpeg(JPEG_QUALITY),
        }
    }
}


fn grid_rows(n: usize) -> Vec<usize> {
    if n <= 2 {
        return vec![n];
    }
    let cols = (n as f64).sqrt().ceil() as usize;
    let mut rows = Vec::new();
    let mut left = n;
    while left > 0 {
        let k = left.min(cols);
        rows.push(k);
        left -= k;
    }
    rows
}

fn find_img_with_most_pixels(images: &[DynamicImage]) -> Result<&DynamicImage, ProcessingError> {
    images
        .iter()
        .max_by_key(|img| img.width() as u64 * img.height() as u64)
        .ok_or(ProcessingError::CouldNotFindMostPixels)
}

fn fit_into_cell(image: &DynamicImage, width: u32, height: u32, pad: bool) -> DynamicImage {
    if !pad {
        return image.resize_exact(width, height, FilterType::Triangle);
    }

    let resized = image.resize(width, height, FilterType::Lanczos3);
    let x = (width - resized.width()) / 2;
    let y = (height - resized.height()) / 2;

    let mut cell = DynamicImage::new_rgba8(width, height);
    imageops::overlay(&mut cell, &resized, x as i64, y as i64);
    cell
}

struct Layout {
    rows: Vec<usize>,
    width: u32,
    row_height: u32,
}

impl Layout {
    fn new(images: &[DynamicImage]) -> Result<Self, ProcessingError> {
        let rows = grid_rows(images.len());
        let biggest = find_img_with_most_pixels(images)?;
        let (cell_w, cell_h) = biggest.dimensions();

        let cols = rows[0] as u32;
        let (raw_w, raw_h) = (cols * cell_w, rows.len() as u32 * cell_h);
        let scale = (MAX_SIDE as f64 / raw_w.max(raw_h) as f64).min(1.0);

        let cell_w = ((cell_w as f64 * scale).round() as u32).max(1);
        let row_height = ((cell_h as f64 * scale).round() as u32).max(1);

        Ok(Layout {
            width: cols * cell_w,
            row_height,
            rows,
        })
    }

    fn height(&self) -> u32 {
        self.rows.len() as u32 * self.row_height
    }

    fn cells(&self) -> Vec<(u32, u32, u32, u32)> {
        let mut cells = Vec::new();
        for (row, &count) in self.rows.iter().enumerate() {
            let y = row as u32 * self.row_height;
            let base = self.width / count as u32;
            for i in 0..count {
                let x = i as u32 * base;
                let w = if i + 1 == count { self.width - x } else { base };
                cells.push((x, y, w, self.row_height));
            }
        }
        cells
    }

    fn render(&self, images: &[DynamicImage], pad: bool) -> DynamicImage {
        let cells = self.cells();
        let tiles: Vec<_> = images
            .par_iter()
            .zip(cells.par_iter())
            .map(|(img, &(x, y, w, h))| (x, y, fit_into_cell(img, w, h, pad)))
            .collect();

        let mut canvas = DynamicImage::new_rgba8(self.width, self.height());
        for (x, y, tile) in tiles {
            debug!("Overlaying image at x: {x}, y: {y}");
            imageops::overlay(&mut canvas, &tile, x as i64, y as i64);
        }
        canvas
    }
}

fn blur_background(background: &mut RgbImage) -> Result<DynamicImage, ProcessingError> {
    let start = std::time::Instant::now();
    let (width, height) = background.dimensions();

    debug!("Blurring background: {:?}", (width, height));

    let sigma = (width.max(height) as f32 / 40.0).max(4.0);
    let samples = background.as_flat_samples_mut();
    blurslice::gaussian_blur_bytes::<3>(samples.samples, width as usize, height as usize, sigma)
        .map_err(ProcessingError::BlurSliceSizeError)?;

    let duration = start.elapsed();
    debug!("Finished blurring background in {duration:?}");

    Ok(DynamicImage::ImageRgb8(background.to_owned()))
}

pub fn generate_combined_thumbnail(
    images: Vec<DynamicImage>,
    format: OutputFormat,
) -> Result<CombinedThumbnail, ProcessingError> {
    match images.len() {
        0 => return Err(ProcessingError::EmptyImageArray),
        n if n > MAX_IMAGES => return Err(ProcessingError::TooManyImages),
        1 => {
            let image = &images[0];
            let image = if image.width().max(image.height()) > MAX_SIDE {
                image.resize(MAX_SIDE, MAX_SIDE, FilterType::Lanczos3)
            } else {
                image.to_owned()
            };
            let (w, h) = image.dimensions();
            let image = DynamicImage::ImageRgb8(image.to_rgb8());
            return Ok(CombinedThumbnail::new(image, format.image_format(), w, h)?);
        }
        _ => {}
    }

    let layout = Layout::new(&images)?;
    let combined = layout.render(&images, true);
    let background = layout.render(&images, false);
    let mut blurred_bg = blur_background(&mut background.to_rgb8())?;

    imageops::overlay(&mut blurred_bg, &combined, 0, 0);

    let (width, height) = (layout.width, layout.height());
    let thumbnail = CombinedThumbnail::new(blurred_bg, format.image_format(), width, height)?;
    Ok(thumbnail)
}

#[cfg(test)]
mod tests {
    use image::{
        Rgb,
        RgbImage,
    };

    use super::*;

    fn solid(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_pixel(w, h, Rgb([200, 30, 30])))
    }

    #[test]
    fn grid_shapes() {
        assert_eq!(grid_rows(1), vec![1]);
        assert_eq!(grid_rows(2), vec![2]);
        assert_eq!(grid_rows(3), vec![2, 1]);
        assert_eq!(grid_rows(4), vec![2, 2]);
        assert_eq!(grid_rows(5), vec![3, 2]);
        assert_eq!(grid_rows(9), vec![3, 3, 3]);
        assert_eq!(grid_rows(10), vec![4, 4, 2]);
        assert_eq!(grid_rows(16), vec![4, 4, 4, 4]);
    }

    #[test]
    fn cells_cover_the_canvas() {
        let images: Vec<_> = (0..10).map(|_| solid(301, 200)).collect();
        let layout = Layout::new(&images).unwrap();
        let cells = layout.cells();
        assert_eq!(cells.len(), 10);
        for row in 0..layout.rows.len() as u32 {
            let y = row * layout.row_height;
            let width: u32 = cells.iter().filter(|c| c.1 == y).map(|c| c.2).sum();
            assert_eq!(width, layout.width);
        }
    }

    #[test]
    fn output_is_bounded() {
        let images: Vec<_> = (0..10).map(|_| solid(3000, 2000)).collect();
        let thumb = generate_combined_thumbnail(images, OutputFormat::Jpeg).unwrap();
        assert!(thumb.width <= MAX_SIDE && thumb.height <= MAX_SIDE);
        assert_eq!(&thumb.to_bytes()[..2], &[0xFF, 0xD8]); // JPEG magic

        let single =
            generate_combined_thumbnail(vec![solid(4000, 1000)], OutputFormat::Png).unwrap();
        assert_eq!((single.width, single.height), (MAX_SIDE, 512));
    }

    #[test]
    fn rejects_too_many() {
        let images: Vec<_> = (0..MAX_IMAGES + 1).map(|_| solid(10, 10)).collect();
        assert!(matches!(
            generate_combined_thumbnail(images, OutputFormat::Png),
            Err(ProcessingError::TooManyImages)
        ));
    }
}

pub async fn remux_video(playlist_url: &str, out: &Path) -> std::io::Result<()> {
    let start = std::time::Instant::now();
    let part = out.with_extension(format!("{}.part", std::process::id() ^ rand_suffix()));

    let args: [&OsStr; 16] = [
        "-loglevel".as_ref(),
        "error".as_ref(),
        "-i".as_ref(),
        playlist_url.as_ref(),
        "-c:v".as_ref(),
        "copy".as_ref(),
        "-c:a".as_ref(),
        "aac".as_ref(),
        "-bsf:a".as_ref(),
        "aac_adtstoasc".as_ref(),
        "-movflags".as_ref(),
        "+faststart".as_ref(),
        "-f".as_ref(),
        "mp4".as_ref(),
        "-y".as_ref(),
        part.as_os_str(),
    ];

    debug!("Spawning `ffmpeg {:?}`", args);

    let output = Command::new("ffmpeg")
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .output()
        .await?;

    if !output.status.success() {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(std::io::Error::other(format!(
            "ffmpeg exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    tokio::fs::rename(&part, out).await?;
    debug!("Remuxed {} in {:?}", playlist_url, start.elapsed());
    Ok(())
}

fn rand_suffix() -> u32 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0)
}
