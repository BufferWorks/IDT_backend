const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { Upload } = require('@aws-sdk/lib-storage');
const cloudinary = require('./cloudinary-config');
const s3Client = require('./r2-config');

// 1. Legacy Cloudinary Storage Engine
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const targetFolder = req.folderName || 'IDT-MEDIA/misc';
    let allowedFormats = ['jpg', 'jpeg', 'png']; // default

    if (file.mimetype.startsWith('video/')) {
      allowedFormats = ['mp4', 'mov', 'avi', 'mkv'];
    }

    return {
      folder: targetFolder,
      resource_type: 'auto',
      allowedFormats: allowedFormats,
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
    };
  },
});

const upload = multer({ storage: cloudinaryStorage });

// 2. New Cloudflare R2 Storage Engine with on-the-fly Image Compression
class R2Storage {
  constructor(opts) {
    this.s3 = opts.s3;
    this.bucket = opts.bucket;
  }

  _handleFile(req, file, cb) {
    const targetFolder = req.folderName || 'IDT-MEDIA/misc';

    // Clean original name: replace non-alphanumeric chars (excluding dots/dashes) with underscores
    const cleanOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const ext = cleanOriginalName.split('.').pop().toLowerCase();

    // Determine target file type based on extension (safest for cross-platform browser uploads)
    const imageExtensions = ['jpg', 'jpeg', 'png'];
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv'];
    const isImage = imageExtensions.includes(ext);
    const isVideo = videoExtensions.includes(ext);

    if (!isImage && !isVideo) {
      return cb(new Error('Invalid file extension. Only JPG, PNG, MP4, MOV, AVI, and MKV are allowed.'));
    }

    let fileKey;
    let uploadBody;
    let contentType = file.mimetype;

    // Correct generic browser mime type if necessary
    if (contentType === 'application/octet-stream' || !contentType) {
      if (isImage) {
        contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      } else if (isVideo) {
        const videoMap = {
          'mp4': 'video/mp4',
          'mov': 'video/quicktime',
          'avi': 'video/x-msvideo',
          'mkv': 'video/x-matroska'
        };
        contentType = videoMap[ext] || 'video/mp4';
      }
    }

    let isImageOptimized = false;

    // Stream-based image optimization using sharp
    if (isImage) {
      try {
        const sharp = require('sharp');
        // Force conversion to progressive JPEG, limit width to 1200px (standard banner width)
        // while preserving aspect ratio, and compress at 80% quality.
        uploadBody = file.stream.pipe(
          sharp()
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: true })
        );
        
        // Rewrite extension to .jpg
        const baseName = cleanOriginalName.substring(0, cleanOriginalName.lastIndexOf('.')) || cleanOriginalName;
        fileKey = `${targetFolder}/${Date.now()}-${baseName}.jpg`;
        contentType = 'image/jpeg';
        isImageOptimized = true;
      } catch (e) {
        console.error('[R2Storage] Sharp compression failed, falling back to raw upload:', e);
      }
    }

    if (!isImageOptimized) {
      uploadBody = file.stream;
      fileKey = `${targetFolder}/${Date.now()}-${cleanOriginalName}`;
    }

    // Streaming upload directly to Cloudflare R2
    const uploadTask = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: fileKey,
        Body: uploadBody,
        ContentType: contentType,
      },
    });

    uploadTask.done()
      .then(() => {
        // Set path to the R2 public delivery URL to maintain compatibility with req.file.path
        cb(null, {
          path: `${process.env.R2_PUBLIC_URL}/${fileKey}`,
          size: file.size,
          key: fileKey,
        });
      })
      .catch((err) => {
        cb(err);
      });
  }

  _removeFile(req, file, cb) {
    // Cleanup if upload fails later during request lifecycle
    cb(null);
  }
}

const r2StorageInstance = new R2Storage({
  s3: s3Client,
  bucket: process.env.R2_BUCKET_NAME,
});

const r2Upload = multer({ storage: r2StorageInstance });

// Attach r2Upload as a property to the default upload middleware to preserve backward compatibility
upload.r2Upload = r2Upload;

module.exports = upload;
