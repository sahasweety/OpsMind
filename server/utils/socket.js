const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { getMembership } = require('./authHelpers');

let io;

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // For development
      methods: ['GET', 'POST']
    }
  });

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.name} (${socket.id})`);

    socket.on('join_org', async (orgId) => {
      try {
        const organization = await Organization.findById(orgId).lean();
        if (organization && getMembership(organization, socket.user._id)) {
          socket.join(`org_${orgId}`);
          console.log(`User ${socket.user.name} joined org_${orgId}`);
        }
      } catch (err) {
        console.error('Error joining org room:', err);
      }
    });

    socket.on('leave_org', (orgId) => {
      socket.leave(`org_${orgId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.user.name}`);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

// Helper to broadcast events to an org room
const broadcastToOrg = (orgId, eventName, payload) => {
  if (io) {
    io.to(`org_${orgId}`).emit(eventName, payload);
  }
};

module.exports = { init, getIo, broadcastToOrg };
