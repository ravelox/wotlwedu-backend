const formData = require("form-data");
const Mailgun = require("mailgun.js");
const mailgun = new Mailgun(formData);
const Config = require("../config/wotlwedu");

const mg = mailgun.client({
  username: "api",
  key: process.env.WOTLWEDU_MAILGUN_API_KEY || "undefined",
});
const domain = process.env.WOTLWEDU_MAILGUN_DOMAIN || "undefined";

function sendEmail(messageDetails) {
  let message = {
    to: messageDetails.to,
    from: Config.mailerDisplayName + " <" + Config.mailerFromAddress + ">",
    subject: messageDetails.subject,
  };

  if (messageDetails.text) message.text = messageDetails.text;
  if (messageDetails.html) message.html = messageDetails.html;

  return mg.messages.create(domain, message );
}

module.exports.sendEmail = sendEmail;