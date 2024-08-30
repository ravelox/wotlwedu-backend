const nodemailer = require("nodemailer");
const Config = require("../config/wotlwedu");
const toBool = require("../util/tobool");

const transport = nodemailer.createTransport({
  host: process.env.WOTLWEDU_SMTP_HOST || "localhost",
  port: process.env.WOTLWEDU_SMTP_PORT || 465,
  secure: toBool(process.env.WOTLWEDU_SMTP_SECURE || false),
  auth: {
    user: process.env.WOTLWEDU_SMTP_USER || "user",
    pass: process.env.WOTLWEDU_SMTP_PASSWORD || "password",
  },
});

function sendEmail(messageDetails) {
  return new Promise((resolve, reject) => {
    let message = {
      to: messageDetails.to,
      from: Config.mailerDisplayName + " <" + Config.mailerFromAddress + ">",
      subject: messageDetails.subject,
    };

    if (messageDetails.text) message.text = messageDetails.text;
    if (messageDetails.html) message.html = messageDetails.html;

    console.log( transport )

    transport.sendMail(message, function (error, info) {
      if (error) {
        console.log(error);
        reject("SMTP Mailer error: " + error);
      }
      resolve("OK");
    });
  });
}

module.exports.sendEmail = sendEmail;
