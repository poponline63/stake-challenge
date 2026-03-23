// Local proxy server that forwards to NordVPN SOCKS5 with auth
require('dotenv').config();
const http = require('http');
const net = require('net');
const { SocksClient } = require('socks');

const NORD_HOST = process.env.NORD_HOST || 'amsterdam.nl.socks.nordhold.net';
const NORD_PORT = parseInt(process.env.NORD_PORT) || 1080;
const NORD_USER = process.env.NORD_USER;
const NORD_PASS = process.env.NORD_PASS;
const LOCAL_PORT = 8899;

const server = http.createServer();

// Handle CONNECT method (HTTPS)
server.on('connect', async (req, clientSocket, head) => {
  const [host, port] = req.url.split(':');
  try {
    const { socket } = await SocksClient.createConnection({
      proxy: { host: NORD_HOST, port: NORD_PORT, type: 5, userId: NORD_USER, password: NORD_PASS },
      command: 'connect',
      destination: { host, port: parseInt(port) || 443 }
    });
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.write(head);
    socket.pipe(clientSocket);
    clientSocket.pipe(socket);
    socket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => socket.destroy());
  } catch (e) {
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    clientSocket.destroy();
  }
});

// Handle regular HTTP requests
server.on('request', async (req, res) => {
  const url = new URL(req.url);
  try {
    const { socket } = await SocksClient.createConnection({
      proxy: { host: NORD_HOST, port: NORD_PORT, type: 5, userId: NORD_USER, password: NORD_PASS },
      command: 'connect',
      destination: { host: url.hostname, port: parseInt(url.port) || 80 }
    });
    const reqLine = `${req.method} ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\n`;
    const headers = Object.entries(req.headers).filter(([k]) => k !== 'proxy-connection').map(([k, v]) => `${k}: ${v}`).join('\r\n');
    socket.write(reqLine + headers + '\r\n\r\n');
    req.pipe(socket);
    socket.pipe(res);
    socket.on('error', () => res.destroy());
  } catch (e) {
    res.writeHead(502);
    res.end('Proxy error');
  }
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`Local proxy running on 127.0.0.1:${LOCAL_PORT} → NordVPN Brazil SOCKS5`);
});
