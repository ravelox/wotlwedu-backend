module.exports = new Proxy({}, {
  get(target, prop) {
    throw new Error(`Postgres adapter not implemented: ${prop}`);
  }
});
