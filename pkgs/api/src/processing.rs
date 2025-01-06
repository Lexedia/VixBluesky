use std::{
    io::Cursor,
    sync::{Arc, Mutex},
};

use ffmpeg_next::{frame, software, util, media, format, codec, };
use image::{
    imageops, imageops::FilterType, DynamicImage, GenericImageView, ImageError, ImageOutputFormat,
    RgbImage,
};
use rayon::prelude::*;
use thiserror::Error;
use tokio::task;
use tracing::{debug, error};

#[derive(Debug, Error)]
pub enum ProcessingError {
    #[error("Image array is empty")]
    EmptyImageArray,
    #[error("Image array has too many images, maximum is 4")]
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

fn scale_image_iterable(
    image: &DynamicImage,
    target_width: u32,
    target_height: u32,
    pad: bool,
) -> DynamicImage {
    if pad {
        let (width, height) = image.dimensions();

        let aspect_ratio = width as f64 / height as f64;
        let (new_width, new_height) = if aspect_ratio > (target_width as f64 / target_height as f64)
        {
            (target_width, (target_width as f64 / aspect_ratio) as u32)
        } else {
            ((target_height as f64 * aspect_ratio) as u32, target_height)
        };

        let resized = image.resize_exact(new_width, new_height, FilterType::Lanczos3);

        let x = (target_width - new_width) / 2;
        let y = (target_height - new_height) / 2;

        let mut new_img = DynamicImage::new_rgba8(target_width, target_height);
        imageops::overlay(&mut new_img, &resized, x as i64, y as i64);

        new_img
    } else {
        image.resize_exact(target_width, target_height, FilterType::Gaussian)
    }
}

fn scale_all_images_to_same_size(
    image_array: &[DynamicImage],
    target_width: u32,
    target_height: u32,
    pad: bool,
) -> Vec<DynamicImage> {
    image_array
        .par_iter()
        .map(|image| scale_image_iterable(image, target_width, target_height, pad))
        .collect()
}

fn find_img_with_most_pixels(images: &[DynamicImage]) -> Result<&DynamicImage, ProcessingError> {
    images
        .par_iter()
        .max_by_key(|img| img.dimensions().0 * img.dimensions().1)
        .ok_or(ProcessingError::CouldNotFindMostPixels)
}

fn layout_horizontal(new_image: &mut DynamicImage, images: &[DynamicImage], y_offset: u32) {
    let mut x_offset: u32 = 0;
    for image in images {
        imageops::overlay(new_image, image, x_offset as i64, y_offset as i64);
        debug!("Overlaying image at x: {x_offset}, y: {y_offset}");
        x_offset += image.width();
    }
}

fn combine_images(
    images: &[DynamicImage],
    total_width: u32,
    total_height: u32,
    pad: bool,
) -> Result<DynamicImage, ProcessingError> {
    if images.len() == 1 {
        return Ok(images[0].to_owned());
    }

    let mut new_image = DynamicImage::new_rgba8(total_width, total_height);
    let top_img = find_img_with_most_pixels(images)?;

    let scaled_images =
        scale_all_images_to_same_size(images, top_img.width(), top_img.height(), pad);

    match scaled_images.len() {
        0 => return Err(ProcessingError::EmptyImageArray),
        // should never happen, but jic..
        1 => return Ok(images[0].to_owned()),
        2 => {
            layout_horizontal(&mut new_image, &scaled_images, 0);
        }
        3 => {
            layout_horizontal(&mut new_image, &scaled_images[..2], 0);


            let processed_last_img = scale_all_images_to_same_size(
                &[images[2].to_owned()],
                total_width,
                top_img.height(),
                pad,
            );
            let last_img = processed_last_img.first().unwrap().to_owned();

            layout_horizontal(&mut new_image, &[last_img], scaled_images[0].height());
        }
        4 => {
            layout_horizontal(&mut new_image, &scaled_images[..2], 0);
            layout_horizontal(
                &mut new_image,
                &scaled_images[2..],
                scaled_images[0].height(),
            );
        }
        _ => return Err(ProcessingError::TooManyImages),
    }

    Ok(new_image)
}

fn get_total_img_size(images: &[DynamicImage]) -> Result<(u32, u32), ProcessingError> {
    let max_image = find_img_with_most_pixels(images)?;
    let (width, height) = max_image.dimensions();
    let size = match images.len() {
        1 => (width, height),
        2 => (width * 2, height),
        _ => (width * 2, height * 2),
    };
    Ok(size)
}

fn blur_background(background: &mut RgbImage) -> Result<DynamicImage, ProcessingError> {
    let start = std::time::Instant::now();
    let (width, height) = background.dimensions();

    debug!("Blurring background: {:?}", (width, height));

    let samples = background.as_flat_samples_mut();
    blurslice::gaussian_blur_bytes::<3>(samples.samples, width as usize, height as usize, 50.0)
        .map_err(ProcessingError::BlurSliceSizeError)?;

    let duration = start.elapsed();
    debug!("Finished blurring background in {duration:?}");

    Ok(DynamicImage::ImageRgb8(background.to_owned()))
}

pub fn generate_combined_thumbnail(
    images: Vec<DynamicImage>,
) -> Result<CombinedThumbnail, ProcessingError> {
    let (width, height) = get_total_img_size(&images)?;
    let combined = combine_images(&images, width, height, true)?;
    let background = combine_images(&images, width, height, false)?;
    let mut blurred_bg = blur_background(&mut background.to_rgb8())?;

    imageops::overlay(&mut blurred_bg, &combined, 0, 0);

    let thumbnail = CombinedThumbnail::new(blurred_bg, ImageOutputFormat::Png, width, height)?;
    Ok(thumbnail)
}

pub async fn buffer_video(master_url: String) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let start = std::time::Instant::now();

    let buffer = Arc::new(Mutex::new(Vec::new()));
    let buffer_clone = Arc::clone(&buffer);

    let handle = task::spawn(async move {
        let mut ictx = format::input(&master_url).unwrap();
        let input = ictx.streams().best(media::Type::Video).unwrap();
        let video_stream_index = input.index();

        let mut decoder = codec::context::Context::from_parameters(input.parameters())
            .unwrap()
            .decoder()
            .video()
            .unwrap();
        let mut scaler = software::scaling::Context::get(
            decoder.format(),
            decoder.width(),
            decoder.height(),
            util::format::Pixel::RGB24,
            decoder.width(),
            decoder.height(),
            software::scaling::Flags::FAST_BILINEAR,
        )
        .unwrap();

        let mut frame = frame::Video::empty();
        let mut rgb_frame = frame::Video::empty();

        for (stream, packet) in ictx.packets() {
            if stream.index() == video_stream_index {
                decoder.send_packet(&packet).unwrap();
                while decoder.receive_frame(&mut frame).is_ok() {
                    scaler.run(&frame, &mut rgb_frame).unwrap();
                    let mut buffer = buffer_clone.lock().unwrap();
                    buffer.extend_from_slice(rgb_frame.data(0));
                }
            }
        }

        decoder.send_eof().unwrap();
        while decoder.receive_frame(&mut frame).is_ok() {
            scaler.run(&frame, &mut rgb_frame).unwrap();
            let mut buffer = buffer_clone.lock().unwrap();
            buffer.extend_from_slice(rgb_frame.data(0));
        }
    });

    tokio::select! {
        _ = handle => {},
    }

    let buffer = Arc::try_unwrap(buffer).unwrap().into_inner().unwrap();

    let duration = start.elapsed();

    debug!("Buffered video in {:?}", duration);

    Ok(buffer)
}
