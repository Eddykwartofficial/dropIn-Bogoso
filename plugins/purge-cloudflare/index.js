// Local replacement for the Cloudflare purge plugin installed in the Netlify UI.
// The upstream plugin fails every build when Cloudflare credentials are missing;
// this version purges when they are set and otherwise skips without failing the deploy.
const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_API_KEY, CLOUDFLARE_ZONE_ID, CLOUDFLARE_EMAIL } = process.env;

function authHeaders() {
  if (!CLOUDFLARE_ZONE_ID) return null;
  if (CLOUDFLARE_API_TOKEN) return { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` };
  if (CLOUDFLARE_API_KEY && CLOUDFLARE_EMAIL) return { 'X-Auth-Email': CLOUDFLARE_EMAIL, 'X-Auth-Key': CLOUDFLARE_API_KEY };
  return null;
}

module.exports = {
  async onSuccess({ utils: { build: { failPlugin } } }) {
    const headers = authHeaders();
    if (!headers) {
      console.log('Cloudflare credentials are not configured; skipping cache purge.');
      return;
    }
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ purge_everything: true }),
      });
      if (!res.ok) return failPlugin(`Cloudflare cache couldn't be purged. Status: ${res.status} ${res.statusText}`);
      console.log('Cloudflare cache purged successfully!');
    } catch (error) {
      return failPlugin('Cloudflare cache purge failed', { error });
    }
  },
};
