import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { restaurant, priceRange, menu } from './src/data/restaurant.ts';

/**
 * Optional: set SITE_URL (e.g. SITE_URL=https://www.example.in npm run build)
 * to emit absolute canonical / Open Graph URLs and a sitemap.xml.
 */
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/$/, '');

function seoPlugin(): Plugin {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    slogan: restaurant.tagline,
    founder: { '@type': 'Person', name: restaurant.founder.replace(/^Mr\.\s*/, '') },
    servesCuisine: ['Hyderabadi', 'Biryani', 'Indian'],
    priceRange: `₹${priceRange.min}–₹${priceRange.max}`,
    telephone: restaurant.phone.e164,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${restaurant.address.line1}, ${restaurant.address.line2}`,
      addressLocality: restaurant.address.city,
      addressRegion: restaurant.address.state,
      postalCode: restaurant.address.postalCode,
      addressCountry: restaurant.address.countryCode,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: restaurant.hours.days.map((d) => dayNames[d]),
        opens: restaurant.hours.open,
        closes: restaurant.hours.close,
      },
    ],
    sameAs: [restaurant.social.instagram, restaurant.social.youtube, restaurant.social.google],
    hasMenu: {
      '@type': 'Menu',
      hasMenuSection: {
        '@type': 'MenuSection',
        name: 'Biryani & Gravies',
        hasMenuItem: menu
          .filter((m) => m.status === 'available')
          .map((m) => ({
            '@type': 'MenuItem',
            name: m.name,
            offers: m.variants.map((v) => ({ '@type': 'Offer', price: v.price, priceCurrency: 'INR' })),
          })),
      },
    },
    ...(SITE_URL ? { url: SITE_URL, image: `${SITE_URL}/og-image.jpg` } : {}),
  };

  return {
    name: 'dawat-seo',
    transformIndexHtml(html) {
      let out = html.replace(
        '<!--JSON_LD-->',
        `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      );
      out = out.replace(
        '<!--CANONICAL-->',
        SITE_URL
          ? `<link rel="canonical" href="${SITE_URL}/" />\n    <meta property="og:url" content="${SITE_URL}/" />\n    <meta property="og:image" content="${SITE_URL}/og-image.jpg" />\n    <meta name="twitter:image" content="${SITE_URL}/og-image.jpg" />`
          : `<meta property="og:image" content="og-image.jpg" />`,
      );
      return out;
    },
    generateBundle() {
      const robots = SITE_URL
        ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
        : `User-agent: *\nAllow: /\n`;
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (SITE_URL) {
        const today = new Date().toISOString().slice(0, 10);
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
        });
      }
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any folder or sub-path.
  base: './',
  plugins: [react(), tailwindcss(), seoPlugin()],
  build: {
    rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } },
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
  },
});
