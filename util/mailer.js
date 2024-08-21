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

module.exports.testMessage = (toName, toAddress) => {
  let message = {
    to: toName + "<" + toAddress + ">",
    from: Config.mailerDisplayName + "<" + Config.mailerFromAddress + ">",
    subject: "Test message from Wotlwedu",
    text: "This is the text body part",
    html: "<H1>This is the HTML body part</H1>",
  };

  transport.sendMail(message, function (error, info) {
    if (error) {
      console.log("Mailer Error:");
      console.log(error);
    } else {
      console.log("Mailer Info:");
      console.log(info.response);
    }
  });
};

function sendEmail(messageDetails) {
  return new Promise((resolve, reject) => {
    if (!messageDetails) {
      reject("No message details provided for email");
    }

    if (!messageDetails.to) {
      reject("No To address provided for email");
    }

    if (!messageDetails.subject) {
      reject("No subject provided for email");
    }

    if (!messageDetails.text && !messageDetails.html) {
      reject("No message body provided as either text or HTML");
    }

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
        reject("Mailer error: " + error);
      }
      resolve("OK");
    });
  });
};

module.exports.sendEmail = sendEmail;

module.exports.sendEmailConfirmMessage = (emailAddress, confirmationToken, frontendUrl ) => {
  return new Promise((resolve, reject) => {
    const textBody =
      `Hi there,

Your email address has been registered with Wotlwedu. To confirm, please follow the link below:

` + frontendUrl + `confirm/` +
      confirmationToken +
      `

If you did not request this change or need further assistance, please contact our support team immediately at [Support Email Address].\

Best regards,

Wotlwedu admin team`;

    const messageDetails = {
      to: emailAddress,
      subject: "Wotlwedu registration confirmation",
      text: textBody,
    };
    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send confirmation email: " + err));
    });
    resolve("OK");
  });
};

module.exports.sendPasswordResetMessage = (
  emailAddress,
  userId,
  resetToken,
  frontendUrl
) => {
  return new Promise((resolve, reject) => {
    const textBody =
      `Hi there,
  
We have received a request to reset your password. To proceed, please follow the link below and enter the verification code provided:

` + frontendUrl + `pwdreset/` +
      userId +
      `/` +
      resetToken +
      `

If you did not request this change or need further assistance, please contact our support team immediately at [Support Email Address].\

Best regards,

Wotlwedu admin team`;

    const messageDetails = {
      to: emailAddress,
      subject: "Wotlwedu password reset",
      text: textBody,
    };
    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send password reset email: " + err));
    });
    resolve("OK");
  });
};

module.exports.sendEmailChangeMessage = (
  changeFromEmail,
  changeToEmail,
  confirmationToken,
  frontendUrl
) => {
  return new Promise((resolve, reject) => {
    const textBody =
      `Hi there,

Your email address is being changed from ` +
      changeFromEmail +
      ` to ` +
      changeToEmail +
      `. To confirm, please follow the link below:

` + frontendUrl + `confirm/` +
      confirmationToken +
      `

If you did not request this change or need further assistance, please contact our support team immediately at [Support Email Address].\

Best regards,

Wotlwedu admin team`;

    const messageDetails = {
      to: changeFromEmail,
      subject: "Wotlwedu email address change",
      text: textBody,
    };
    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send email address change message: " + err));
    });
    resolve("OK");
  });
};

module.exports.sendEmailChangeCompleteMessage = (emailAddress, frontendUrl) => {
  return new Promise((resolve, reject) => {
    const textBody =
      `Hi there,

Your email address at Wotlwedu is now being used by a user.
If you did not request this change or need further assistance, please contact our support team immediately at [Support Email Address].\

Best regards,

Wotlwedu admin team`;

    const messageDetails = {
      to: emailAddress,
      subject: "Wotlwedu email address change complete",
      text: textBody,
    };
    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send email address change completion message: " + err));
    });
    resolve("OK");
  });
};
