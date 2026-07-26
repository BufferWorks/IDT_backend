/**
 * Scan all active contest entry videos in MongoDB/R2,
 * run ffprobe remotely to get their resolution (width/height),
 * classify them as HD/SD, and compile a report.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { execFile } = require('child_process');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const connectDB = require('./database/connection');
const ContestEntry = require('./models/contestEntry');
const User = require('./models/user');
const Contest = require('./models/contest');

// Locate ffprobe path. Since it was installed via winget/globally on Windows, 
// it should be available in the system PATH. We can just execute 'ffprobe'.
const FFPROBE_CMD = 'ffprobe';

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  region: 'auto',
});

const BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const PREFIX = 'IDT-MEDIA/contest-entries/';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function r2KeyFromUrl(url) {
  if (!url) return null;
  if (url.startsWith(R2_PUBLIC_URL + '/')) return url.substring(R2_PUBLIC_URL.length + 1);
  if (url.includes('pub-518eafbf110d4fa6858313f5442a70e9.r2.dev/')) {
    return url.split('pub-518eafbf110d4fa6858313f5442a70e9.r2.dev/')[1];
  }
  if (url.includes('ik.imagekit.io/idtmedia/')) {
    return url.split('ik.imagekit.io/idtmedia/')[1];
  }
  return null;
}

function getVideoResolution(url) {
  return new Promise((resolve) => {
    // ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 <url>
    execFile(FFPROBE_CMD, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      url
    ], (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve({ width: null, height: null, error: err ? err.message : 'No output' });
      } else {
        const parts = stdout.trim().split(',');
        const width = parseInt(parts[0], 10);
        const height = parseInt(parts[1], 10);
        resolve({ width, height });
      }
    });
  });
}

async function run() {
  await connectDB();

  console.log('\n==================================================');
  console.log('  🎬 SCANNING R2 VIDEOS & RESOLUTION DETAILS');
  console.log('==================================================\n');

  // 1. Fetch all R2 files to get sizes
  console.log('📦 Fetching R2 file metadata...');
  const r2Files = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX,
      ContinuationToken: token,
    }));
    if (r.Contents) r2Files.push(...r.Contents);
    token = r.NextContinuationToken;
  } while (token);

  const r2Map = new Map();
  r2Files.forEach(f => r2Map.set(f.Key, f));
  console.log(`   Found ${r2Files.length} files in R2 bucket.`);

  // 2. Fetch all entries populated with User
  console.log('🗄️  Fetching active contest entries from DB...');
  const entries = await ContestEntry.find({
    videoUrl: { $exists: true, $ne: null, $ne: "" }
  }).populate('userId', 'name').lean();

  console.log(`   Found ${entries.length} video entries in MongoDB.\n`);

  console.log('================================================================================');
  console.log('  No.  | User Name       | Size     | Resolution | Quality | File Key');
  console.log('================================================================================');

  let hdCount = 0;
  let sdCount = 0;
  let unknownCount = 0;
  let totalSize = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const userName = entry.userId ? entry.userId.name : 'Unknown';
    const r2Key = r2KeyFromUrl(entry.videoUrl);
    
    // Get file size from R2
    let sizeStr = 'N/A';
    if (r2Key && r2Map.has(r2Key)) {
      const f = r2Map.get(r2Key);
      sizeStr = formatBytes(f.Size);
      totalSize += f.Size;
    }

    // Get resolution from ffprobe
    const res = await getVideoResolution(entry.videoUrl);
    let resStr = 'Unknown';
    let qualStr = 'Unknown';

    if (res.width && res.height) {
      resStr = `${res.width}x${res.height}`;
      // Standard definition: height < 720 and width < 720
      if (res.height >= 720 || res.width >= 720) {
        qualStr = 'HD';
        hdCount++;
      } else {
        qualStr = 'SD';
        sdCount++;
      }
    } else {
      unknownCount++;
    }

    const idx = (i + 1).toString().padStart(4, ' ');
    const name = userName.substring(0, 15).padEnd(15, ' ');
    const size = sizeStr.padEnd(8, ' ');
    const resolution = resStr.padEnd(10, ' ');
    const quality = qualStr.padEnd(7, ' ');
    const file = r2Key ? r2Key.split('/').pop() : 'N/A';

    console.log(`  ${idx} | ${name} | ${size} | ${resolution} | ${quality} | ${file}`);
  }

  console.log('================================================================================');
  console.log(`\n📊 SUMMARY:`);
  console.log(`  Total Videos:           ${entries.length}`);
  console.log(`  Total Video Size:       ${formatBytes(totalSize)}`);
  console.log(`  HD (720p/1080p/etc.):   ${hdCount}`);
  console.log(`  SD (480p/360p/etc.):    ${sdCount}`);
  console.log(`  Failed to probe:        ${unknownCount}`);
  console.log('==================================================\n');

  await mongoose.connection.close();
}

run().catch(console.error);
