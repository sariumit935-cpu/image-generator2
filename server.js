const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const MUSIC_URL = 'https://res.cloudinary.com/df1u8jqzy/video/upload/v1780299910/kutlama_abvxfs_cj39rm.mp3';
const CLOUD_NAME = 'df1u8jqzy';
const BG_PUBLIC_ID = 'confession_bg_1_nrxrxr';

app.post('/generate', async (req, res) => {
  const text = req.body.html;
  if (!text) return res.status(400).json({ error: 'html is empty' });

  const tmpDir = '/tmp';
  const stamp = Date.now();
  const imgPath = path.join(tmpDir, `img_${stamp}.png`);
  const videoPath = path.join(tmpDir, `video_${stamp}.mp4`);
  const musicPath = path.join(tmpDir, `music_${stamp}.mp3`);

  try {
    // Metni kısalt ve temizle — Cloudinary URL'si için güvenli hale getir
    // Cloudinary text overlay max ~50 kelime
    const cleanText = text
      .replace(/['"]/g, '')        // tırnak kaldır
      .replace(/[^\x00-\x7F]/g, '') // emoji ve unicode kaldır
      .substring(0, 300);           // max 300 karakter

    const encoded = encodeURIComponent(cleanText);
    const imageUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/l_text:Arial_42:${encoded},co_rgb:1a1a1a,w_850,c_fit,g_north_west,x_130,y_340/${BG_PUBLIC_ID}.png`;

    // Görseli indir
    const imgRes = await axios.get(imageUrl, { responseType: 'stream', timeout: 30000 });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(imgPath);
      imgRes.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Müziği indir
    const musicRes = await axios.get(MUSIC_URL, { responseType: 'stream', timeout: 60000 });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(musicPath);
      musicRes.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Video oluştur
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(imgPath).inputOptions(['-loop 1', '-framerate 30'])
        .input(musicPath).inputOptions(['-stream_loop -1'])
        .outputOptions([
          '-t 15', '-c:v libx264', '-preset veryfast',
          '-profile:v high', '-level 4.0', '-r 30',
          '-vf format=yuv420p,scale=1080:1920',
          '-c:a aac', '-b:a 128k', '-ar 44100', '-ac 2',
          '-movflags +faststart', '-shortest'
        ])
        .output(videoPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const stat = fs.statSync(videoPath);
    res.set({ 'Content-Type': 'video/mp4', 'Content-Length': stat.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(videoPath).pipe(res);

  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    [imgPath, videoPath, musicPath].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
    });
  }
});

app.get('/', (req, res) => res.send('Image generator is running.'));
app.listen(3000, () => console.log('Running on port 3000'));
