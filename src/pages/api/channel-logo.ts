// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { getStorageFileUrl } from '@/firebase/channelLogos';

type ResponseData = {
  url?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  // მხოლოდ GET მეთოდი დავუშვათ
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // მივიღოთ მისამართი query პარამეტრიდან
  const { path } = req.query;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  try {
    // დეკოდირება URL-ენკოდირებული მისამართის
    const decodedPath = decodeURIComponent(path);

    // Firebase Storage-დან ფაილის მიღება
    const fileUrl = await getStorageFileUrl(decodedPath);

    if (!fileUrl) {
      return res.status(404).json({ error: 'File not found' });
    }

    // დავაბრუნოთ URL
    return res.status(200).json({ url: fileUrl });
  } catch (error) {
    console.error('Error fetching logo:', error);
    return res.status(500).json({ error: 'Failed to fetch file' });
  }
} 