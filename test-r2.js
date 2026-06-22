require('dotenv').config();
const s3Client = require('./config/r2-config');
const { Upload } = require('@aws-sdk/lib-storage');
const sharp = require('sharp');
const fs = require('fs');

console.log('Testing R2 connection with bucket:', process.env.R2_BUCKET_NAME);

async function run() {
  try {
    // 1. Create a dummy text upload
    console.log('1. Testing small text upload...');
    const uploadText = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: 'test-r2-connection.txt',
        Body: 'Hello Cloudflare R2 from Node.js!',
        ContentType: 'text/plain',
      },
    });
    await uploadText.done();
    console.log('Text upload SUCCESS!');

    // 2. Test sharp compression
    console.log('2. Testing sharp image compression...');
    // Create a dummy 100x100 PNG buffer
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 }
      }
    })
    .png()
    .toBuffer();

    console.log('Dummy image buffer created with size:', buffer.length);

    // Compress using sharp stream/pipe
    const readableStream = require('stream').Readable.from(buffer);
    const compressedStream = readableStream.pipe(
      sharp()
        .resize({ width: 50, withoutEnlargement: true })
        .jpeg({ quality: 80 })
    );

    const uploadImage = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: 'test-r2-image.jpg',
        Body: compressedStream,
        ContentType: 'image/jpeg',
      },
    });
    await uploadImage.done();
    console.log('Image upload SUCCESS!');
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  }
}

run();
