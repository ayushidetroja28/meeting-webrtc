const express = require('express');
const socket = require('socket.io');
const { ExpressPeerServer } = require('peer');
const groupCallHandler = require('./groupCallHandler');
const { v4: uuidv4 } = require('uuid');

const PORT = 3000;

const app = express();

const server = app.listen(PORT, () => {
  console.log(`server is listening on port ${PORT}`);
  console.log(`https://localhost:${PORT}`);
});

const peerServer = ExpressPeerServer(server, {
  debug: true
});

app.use('/peerjs', peerServer);

groupCallHandler.createPeerServerListeners(peerServer);

const io = socket(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let peers = [];
let groupCallRooms = [];

const broadcastEventTypes = {
  ACTIVE_USERS: 'ACTIVE_USERS',
  GROUP_CALL_ROOMS: 'GROUP_CALL_ROOMS'
};

io.on('connection', (socket) => {
  socket.emit('connection', null);
  console.log('new user connected');
  console.log(socket.id);

  socket.on('register-new-user', (data) => {
    peers.push({
      username: data.username,
      socketId: data.socketId
    });
    console.log('registered new user');
    console.log(peers);

    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers
    });

    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms
    });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
    peers = peers.filter(peer => peer.socketId !== socket.id);
    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers
    });

    groupCallRooms = groupCallRooms.filter(room => room.socketId !== socket.id);
    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms
    });
  });

  socket.on('group-call-register', (data) => {
    const roomId = uuidv4();
    socket.join(roomId);

    const newGroupCallRoom = {
      type: data.type,
      peerId: data.peerId,
      hostName: data.username,
      socketId: socket.id,
      roomId: roomId
    };

    groupCallRooms.push(newGroupCallRoom);
    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms
    });
  });

  socket.on('group-call-join-request', (data) => {
    
    peers.push({
      username: data.username,
      socketId: data.socketId,
      peerId: data.peerId,
      streamId: data.streamId,
      role: data.role,
      screenShare: false,
    });

    io.to(data.roomId).emit('group-call-join-request', {
      username: data.username,
      peerId: data.peerId,
      streamId: data.streamId,
      role: data.role,
      socketId: data.socketId,
    });

    socket.join(data.roomId);
    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers
    });
  });

  socket.on('group-call-start-share-screen', (data) => {
    let a = [];
    peers.map((user, index) => {
      if (user.socketId === data.socketId) {
        user.screenShare = true;
      } else {
        user.screenShare = false;
      }
      a.push(user);
    })
    peers = a;
    // peers[peers.findIndex(user => user.socketId === data.socketId)].screenShare = true;
    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers
    });
    io.to(data.roomId).emit('group-call-start-share-screen', {
      socketId: data.socketId
    });
  });

  socket.on('group-call-stop-share-screen', (data) => {
    let a = [];
    peers.map((user, index) => {
      user.screenShare = false;
      a.push(user);
    })
    peers = a;
    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.ACTIVE_USERS,
      activeUsers: peers
    });
    io.to(data.roomId).emit('group-call-stop-share-screen', {
      socketId: data.socketId
    });
  });

  socket.on('group-call-user-left', (data) => {
    socket.leave(data.roomId);

    io.to(data.roomId).emit('group-call-user-left', {
      streamId: data.streamId
    });
  });

  socket.on('group-call-closed-by-host', (data) => {
    groupCallRooms = groupCallRooms.filter(room => room.peerId !== data.peerId);

    io.sockets.emit('broadcast', {
      event: broadcastEventTypes.GROUP_CALL_ROOMS,
      groupCallRooms
    });
  });
});
