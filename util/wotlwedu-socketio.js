const SocketInfo = require("../model/socketinfo");

let _io;

module.exports.init = (server) => {
  _io = require("socket.io")(server, {
    cors: {
      origin: "*",
    },
  });
  _registeredUsers = [];
  return _io;
};

module.exports.getIO = () => {
  if (!_io) throw new Error("Socket.io not initialised");
  return _io;
};

module.exports.register = async (userId, socketId) => {
  const registrationData = { userId: userId, socketId: socketId };
  const newInfo = new SocketInfo(registrationData);

  const options = {};

  options.where = registrationData;
  const foundData = await SocketInfo.findOne(options);

  if (!foundData) {
    await newInfo.save();
  }
};

module.exports.unregister = async (socketId) => {
  const options = {};

  options.where = { socketId: socketId };
  const foundRegistration = await SocketInfo.findOne(options);
  if (foundRegistration) {
    await foundRegistration.destroy();
  }
};

async function getSocket(userId) {
  const options = {};

  options.where = { userId: userId };
  options.attributes = ["socketId"];
  options.raw = true;

  const foundSockets = await SocketInfo.findAll(options);
  if (foundSockets) {
    return foundSockets;
  }

  return [];
}

module.exports.notifyUser = async (userId) => {
  if (!_io) return;
  const sockets = await getSocket(userId);
  console.log(sockets);
  for (let s of sockets) {
    _io.to(s.socketId).emit("notification");
  }
};

module.exports.clearRegistrations = () => {
  console.log("Clearing registrations");
  return SocketInfo.truncate();
};
