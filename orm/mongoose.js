module.exports = new Proxy({}, {
  get(target, prop) {
    throw new Error(`Mongoose adapter not implemented: ${prop}`);
  }
});
