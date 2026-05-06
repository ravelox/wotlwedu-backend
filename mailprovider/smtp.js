const nodemailer = require("nodemailer");
const Config = require("../config/wotlwedu");
const toBool = require("../util/tobool");

const transportOptions = {
  host: process.env.WOTLWEDU_SMTP_HOST || "localhost",
  port: process.env.WOTLWEDU_SMTP_PORT || 465,
  secure: toBool(process.env.WOTLWEDU_SMTP_SECURE || false),
};

if (process.env.WOTLWEDU_SMTP_USER || process.env.WOTLWEDU_SMTP_PASSWORD) {
  transportOptions.auth = {
    user: process.env.WOTLWEDU_SMTP_USER || "",
    pass: process.env.WOTLWEDU_SMTP_PASSWORD || "",
  };
}

const transport = nodemailer.createTransport(transportOptions);

function sendEmail(messageDetails) {
  return new Promise((resolve, reject) => {
    let message = {
      to: messageDetails.to,
      from: Config.mailerDisplayName + " <" + Config.mailerFromAddress + ">",
      subject: messageDetails.subject,
    };

    if (messageDetails.text) message.text = messageDetails.text;
    if (messageDetails.html) message.html = messageDetails.html;

    transport.sendMail(message, function (error, info) {
      if (error) {
        console.log(error);
        reject("SMTP Mailer error: " + error);
      }
      console.log(info)
      resolve("OK");
    });
  });
}

module.exports.sendEmail = sendEmail;
