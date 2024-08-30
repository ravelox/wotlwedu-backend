const nodemailer = require("nodemailer");
const aws = require("@aws-sdk/client-ses");
const { defaultProvider } = require("@aws-sdk/credential-provider-node");

const Config = require("../config/wotlwedu");

const ses = new aws.SES({
  region: "us-east-1",
  defaultProvider,
});

const transport = nodemailer.createTransport({
  SES: { ses, aws },
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
  
      transport.sendMail(message, function (error, info) {
        if (error) {
          console.log(error);
          reject("AWS Mailer error: " + error);
        }
        resolve("OK");
      });
    });
  };

  module.exports.sendEmail = sendEmail;