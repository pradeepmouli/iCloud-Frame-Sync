import { WebServer } from './web-server.js';

const webServer = new WebServer({
  port: Number(process.env.WEB_PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
});

webServer.start();
