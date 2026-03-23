const https = require('https');

const server = require('http').createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET') {
    res.writeHead(200);
    res.end('PDG Assistant Proxy — OK');
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const parsed = JSON.parse(body);

      // Route: /drive — Google Drive API proxy
      if (req.url && req.url.startsWith('/drive')) {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'No authorization header' }));
          return;
        }

        const { method: driveMethod, url: driveUrl, data: driveData } = parsed;
        const driveOptions = {
          hostname: 'www.googleapis.com',
          path: driveUrl,
          method: driveMethod || 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          }
        };

        const driveReq = https.request(driveOptions, (driveRes) => {
          let driveBody = '';
          driveRes.on('data', chunk => driveBody += chunk);
          driveRes.on('end', () => {
            res.writeHead(driveRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(driveBody);
          });
        });

        driveReq.on('error', (e) => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        });

        if (driveData) driveReq.write(JSON.stringify(driveData));
        driveReq.end();
        return;
      }

      // Route: / — Anthropic API proxy
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      apiReq.on('error', (e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      });

      apiReq.write(body);
      apiReq.end();

    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
