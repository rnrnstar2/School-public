import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://school.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/hearing/', '/plan/', '/lesson/', '/workspace/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
