const http = require('http');
const { URL } = require('url');

const TARGET_BASE = 'https://www.6696996.xyz';
const PORT = 8787;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Api-Key');
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const incomingUrl = new URL(req.url, `http://localhost:${PORT}`);
    const targetUrl = `${TARGET_BASE}${incomingUrl.pathname}${incomingUrl.search}`;

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;
    delete headers['content-length'];

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseBuffer = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'x-proxy-target': targetUrl,
    });
    res.end(responseBuffer);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`CORS proxy running: http://localhost:${PORT}`);
  console.log(`Forwarding to: ${TARGET_BASE}`);
});
