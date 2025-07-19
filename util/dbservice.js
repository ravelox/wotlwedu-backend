const database = require('./database');

module.exports.findOne = function(model, options) {
  return model.findOne(options);
};

module.exports.findAndCountAll = function(model, options) {
  return model.findAndCountAll(options);
};

module.exports.findByPk = function(model, id, options) {
  return model.findByPk(id, options);
};

module.exports.save = function(instance, options) {
  return instance.save(options);
};

module.exports.destroy = function(target, options) {
  return target.destroy(options);
};