import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'WC2026 by Qwen';
const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '');
const GSC_TOKEN = import.meta.env.VITE_GSC_VERIFICATION || '';
const DEFAULT_DESC =
  'AI-powered FIFA World Cup 2026 match predictions — ELO ratings, Poisson model, head-to-head history and live web intelligence. Updated daily for all 104 matches.';

const websiteSchema = {
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL || '/',
  description: DEFAULT_DESC,
  inLanguage: 'en',
};

export default function SEO({ title, description, path = '', image, jsonLd }) {
  const fullTitle = title || `${SITE_NAME} — World Cup 2026 AI Predictions`;
  const desc = description || DEFAULT_DESC;
  const url = SITE_URL ? `${SITE_URL}${path}` : null;
  const img = SITE_URL ? (image || `${SITE_URL}/og-image.png`) : null;

  const extraSchemas = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
  const graph = [websiteSchema, ...extraSchemas];
  const ldJson = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {GSC_TOKEN && <meta name="google-site-verification" content={GSC_TOKEN} />}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      {url && <link rel="canonical" href={url} />}
      {url && <meta property="og:url" content={url} />}
      {img && <meta property="og:image" content={img} />}
      {img && <meta property="og:image:width" content="1200" />}
      {img && <meta property="og:image:height" content="630" />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      {img && <meta name="twitter:image" content={img} />}
      <script type="application/ld+json">{ldJson}</script>
    </Helmet>
  );
}
