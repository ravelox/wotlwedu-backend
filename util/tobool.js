// Code copied from https://www.npmjs.com/package/to-bool
// and modified to add "on" as a possible value
// "off" is implicitly false in that case

module.exports = function toBool(item) {
    switch(typeof item) {
      case "boolean":
        return item;
      case "function":
        return true;
      case "number":
        return item > 0 || item < 0;
      case "object":
        return !!item;
      case "string":
        item = item.toLowerCase();
        return ["true", "1","on"].indexOf(item) >= 0;
      case "symbol":
        return true;
      case "undefined":
        return false;
  
      default:
        throw new TypeError("Unrecognised type: unable to convert to boolean");
    }
  };