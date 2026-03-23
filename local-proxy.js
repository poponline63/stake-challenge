// Creates a local SOCKS5 proxy (no auth) that forwards to NordVPN SOCKS5 (with auth)
require('dotenv').config();
const net = require('net');
const { SocksClient } = require('socks');

const LOCAL_PORT = 1090;
const NORD = {
  host: process.env.NORD_HOST || 'ca-us.socks.nordhold.net',
  port: parseInt(process.env.NORD_PORT) || 1080,
  type: 5,
  userId: process.env.NORD_USER,
  password: process.env.NORD_PASS
};

const server = net.createServer((clientSocket) => {
  let authed = false;
  let headerBuf = Buffer.alloc(0);

  clientSocket.once('data', (data) => {
    // SOCKS5 greeting
    if (data[0] === 0x05) {
      // Accept no-auth
      clientSocket.write(Buffer.from([0x05, 0x00]));
      
      clientSocket.once('data', async (connReq) => {
        // Parse SOCKS5 connect request
        const cmd = connReq[1]; // 0x01 = connect
        const addrType = connReq[3];
        let host, port;
        
        if (addrType === 0x01) { // IPv4
          host = `${connReq[4]}.${connReq[5]}.${connReq[6]}.${connReq[7]}`;
          port = connReq.readUInt16BE(8);
        } else if (addrType === 0x03) { // Domain
          const domLen = connReq[4];
          host = connReq.slice(5, 5 + domLen).toString();
          port = connReq.readUInt16BE(5 + domLen);
        } else if (addrType === 0x04) { // IPv6
          host = connReq.slice(4, 20).toString('hex').match(/.{4}/g).join(':');
          port = connReq.readUInt16BE(20);
        }

        try {
          const { socket: remoteSocket } = await SocksClient.createConnection({
            proxy: NORD,
            command: 'connect',
            destination: { host, port }
          });

          // Success response
          const resp = Buffer.from([0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
          clientSocket.write(resp);

          remoteSocket.pipe(clientSocket);
          clientSocket.pipe(remoteSocket);
          remoteSocket.on('error', () => clientSocket.destroy());
          clientSocket.on('error', () => remoteSocket.destroy());
        } catch (e) {
          const resp = Buffer.from([0x05, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
          clientSocket.write(resp);
          clientSocket.destroy();
        }
      });
    }
  });

  clientSocket.on('error', () => {});
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`Local SOCKS5 proxy on 127.0.0.1:${LOCAL_PORT} → NordVPN Amsterdam`);
});
