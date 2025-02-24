import { createCanvas } from 'canvas';
import fs from 'fs';
import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Create canvas with OG image dimensions
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Set background
  ctx.fillStyle = '#111827'; // Dark background
  ctx.fillRect(0, 0, width, height);

  // Add gradient overlay
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.1)'); // Blue tint
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Set text styles
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';

  // Draw main title
  ctx.font = 'bold 72px Arial';
  ctx.fillText('ID Marking Tool', width / 2, height / 2 - 50);

  // Draw subtitle
  ctx.font = '36px Arial';
  ctx.fillText('Free Online MyKad Cross Out & Watermark', width / 2, height / 2 + 30);

  // Draw feature text
  ctx.font = '28px Arial';
  ctx.fillText('Simple • Secure • No Registration Required', width / 2, height / 2 + 100);

  // Save the image
  const buffer = canvas.toBuffer('image/jpeg');
  const publicDir = path.join(process.cwd(), 'public');
  fs.writeFileSync(path.join(publicDir, 'og-image.jpg'), buffer);

  res.status(200).json({ message: 'OG image generated successfully' });
} 