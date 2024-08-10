module.exports = (res, statusCode, message,data ) => {
  return res.status(statusCode).json({status: statusCode, message: message, data: data});
}
