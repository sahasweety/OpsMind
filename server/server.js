
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http');
const { init: initSocket } = require('./utils/socket');
const connectDB = require('./config/db');
const notFound = require('./middleware/notFoundMiddleware');
const errorHandler = require('./middleware/errorMiddleware');
const authRoutes = require('./routes/authRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const projectRoutes = require('./routes/projectRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const ingestRoutes = require('./routes/ingestRoutes');
const logRoutes = require('./routes/logRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const githubRoutes = require('./routes/githubRoutes');

const app = express();

// Trust exactly one proxy hop (Nginx in the Docker Compose network).
// This lets express-rate-limit resolve the real client IP from
// X-Forwarded-For without accepting arbitrary forwarded headers from
// untrusted sources further upstream.
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cors());
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 500
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ingest/:serviceId', ingestRoutes);
app.use('/api/services/:serviceId/logs', logRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/github', githubRoutes);

app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.json({
    success: true,
    message: "OpsMind API is running",
    database: isDbConnected ? "connected" : "disconnected"
  });
});

// Fallback for 404
app.use(notFound);

// Centralized error handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect to database and start server
connectDB().then(() => {
  const server = http.createServer(app);
  initSocket(server);
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
