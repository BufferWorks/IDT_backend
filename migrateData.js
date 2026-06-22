require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const { Upload } = require('@aws-sdk/lib-storage');
const s3Client = require('./config/r2-config');
const connectDB = require('./database/connection');

// Models
const Gallery = require('./models/gallery');
const Contest = require('./models/contest');
// If other models exist, we require them dynamically or statically
const User = require('./models/user');
const ContestEntry = require('./models/contestEntry');

const stage = process.argv.find(arg => arg.startsWith('--stage='))?.split('=')[1] || 'gallery';
const dryRun = process.argv.includes('--dry-run');

console.log(`Starting Data Migration...`);
console.log(`Stage: ${stage.toUpperCase()}`);
console.log(`Dry Run: ${dryRun ? 'YES (No database writes or uploads)' : 'NO'}`);
console.log(`----------------------------------------`);

async function downloadStream(url) {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'stream',
  });
  return {
    stream: response.data,
    contentType: response.headers['content-type'] || 'image/jpeg',
  };
}

function getR2KeyFromUrl(url, targetFolder) {
  // Extract filename from URL (gets everything after the last slash, excluding query parameters)
  const cleanUrl = url.split('?')[0];
  const originalFilename = cleanUrl.split('/').pop();
  
  // Clean filename: replace non-alphanumeric chars (excluding dots/dashes) with underscores
  const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `${targetFolder}/${Date.now()}-${cleanFilename}`;
}

async function migrateGallery() {
  const docs = await Gallery.find({ imageUrl: { $regex: 'res.cloudinary.com' } });
  console.log(`Found ${docs.length} gallery images in Cloudinary to migrate.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const oldUrl = doc.imageUrl;
    console.log(`[${i + 1}/${docs.length}] Migrating Gallery Doc ID: ${doc._id}`);
    console.log(`  Source: ${oldUrl}`);

    try {
      const r2Key = getR2KeyFromUrl(oldUrl, 'IDT-MEDIA/gallery');
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`;
      console.log(`  Target Key: ${r2Key}`);
      console.log(`  Public URL: ${publicUrl}`);

      if (!dryRun) {
        // Download from Cloudinary
        console.log(`  Downloading from Cloudinary...`);
        const { stream, contentType } = await downloadStream(oldUrl);

        // Upload to Cloudflare R2
        console.log(`  Uploading to R2...`);
        const uploadTask = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: r2Key,
            Body: stream,
            ContentType: contentType,
          },
        });
        await uploadTask.done();

        // Update MongoDB record
        doc.imageUrl = publicUrl;
        await doc.save();
        console.log(`  SUCCESS! Document updated in MongoDB.`);
      } else {
        console.log(`  DRY RUN: Download and upload skipped.`);
      }
      successCount++;
    } catch (err) {
      console.error(`  FAILED:`, err.message);
      failCount++;
    }
    console.log(`----------------------------------------`);
  }

  console.log(`Stage Gallery Migration Complete!`);
  console.log(`Successfully Migrated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

async function run() {
  try {
    await connectDB();
    console.log('Database connected.');
    console.log(`----------------------------------------`);

    if (stage === 'gallery') {
      await migrateGallery();
    } else {
      console.error(`Unsupported stage: ${stage}`);
      console.log(`Please run with --stage=gallery`);
    }

    mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Migration crashed:', err);
    process.exit(1);
  }
}

run();
