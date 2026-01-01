const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary-config');

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const targetFolder = req.folderName || 'IDT-MEDIA/misc';

    // Determine allowed formats based on MIME type
    let allowedFormats = ['jpg', 'jpeg', 'png']; // default

    if (file.mimetype.startsWith('video/')) {
      allowedFormats = ['mp4', 'mov', 'avi', 'mkv'];
    }

    return {
      folder: targetFolder,
      resource_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
      allowed_formats: allowedFormats,
      public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
    };
  },
});

const upload = multer({ storage });

module.exports = upload;
