const Config = require("../config/wotlwedu");

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

    Config.mailerProvider
      .sendEmail(messageDetails)
      .then((success) => {
        resolve("OK", { data: success });
      })
      .catch((err) => {
        console.log( err )
        reject(err);
      });
  });
}

module.exports.sendEmail = sendEmail;

function wrapHtmlMessage(title, bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2933;">
      <h2 style="margin-bottom:12px;">${title}</h2>
      <div>${bodyHtml}</div>
      <p style="margin-top:20px;">Best regards,<br/>Wotlwedu admin team</p>
    </div>
  `;
}

function buildSupportCopy() {
  return `If you did not request this change or need help, contact ${Config.supportEmail}.`;
}

function resolveLinkBase(configuredValue, fallbackValue) {
  return configuredValue || fallbackValue || Config.baseFrontendUrl;
}

function buildEmailConfirmMessage(emailAddress, confirmationToken, frontendUrl) {
  const confirmationBaseUrl = resolveLinkBase(
    Config.confirmationLinkBaseUrl,
    frontendUrl
  );
  const confirmationUrl = `${confirmationBaseUrl}/confirm/${confirmationToken}`;
  const textBody = `Hi there,

Your email address has been registered with Wotlwedu. To confirm, please follow the link below:

${confirmationUrl}

${buildSupportCopy()}

Best regards,

Wotlwedu admin team`;

  return {
    to: emailAddress,
    subject: "Wotlwedu registration confirmation",
    text: textBody,
    html: wrapHtmlMessage(
      "Confirm your Wotlwedu registration",
      `<p>Your email address has been registered with Wotlwedu. Confirm it here:</p>
         <p><a href="${confirmationUrl}">${confirmationUrl}</a></p>
         <p>${buildSupportCopy()}</p>`
    ),
  };
}

function buildPasswordResetMessage(emailAddress, userId, resetToken, frontendUrl) {
  const passwordResetBaseUrl = resolveLinkBase(
    Config.passwordResetLinkBaseUrl,
    frontendUrl
  );
  const passwordResetUrl = `${passwordResetBaseUrl}/pwdreset/${userId}/${resetToken}`;
  const textBody = `Hi there,
  
We have received a request to reset your password. To proceed, please follow the link below and enter the verification code provided:

${passwordResetUrl}

${buildSupportCopy()}

Best regards,

Wotlwedu admin team`;

  return {
    to: emailAddress,
    subject: "Wotlwedu password reset",
    text: textBody,
    html: wrapHtmlMessage(
      "Reset your Wotlwedu password",
      `<p>We received a request to reset your password. Continue here:</p>
         <p><a href="${passwordResetUrl}">${passwordResetUrl}</a></p>
         <p>${buildSupportCopy()}</p>`
    ),
  };
}

function buildEmailChangeMessage(
  changeFromEmail,
  changeToEmail,
  confirmationToken,
  frontendUrl
) {
  const confirmationBaseUrl = resolveLinkBase(
    Config.confirmationLinkBaseUrl,
    frontendUrl
  );
  const confirmationUrl = `${confirmationBaseUrl}/confirm/${confirmationToken}`;
  const textBody = `Hi there,

Your email address is being changed from ${changeFromEmail} to ${changeToEmail}. To confirm, please follow the link below:

${confirmationUrl}

${buildSupportCopy()}

Best regards,

Wotlwedu admin team`;

  return {
    to: changeFromEmail,
    subject: "Wotlwedu email address change",
    text: textBody,
    html: wrapHtmlMessage(
      "Confirm your Wotlwedu email change",
      `<p>Your Wotlwedu email is being changed from ${changeFromEmail} to ${changeToEmail}.</p>
         <p>Confirm it here:</p>
         <p><a href="${confirmationUrl}">${confirmationUrl}</a></p>
         <p>${buildSupportCopy()}</p>`
    ),
  };
}

function buildEmailChangeCompleteMessage(emailAddress) {
  const textBody = `Hi there,

Your email address at Wotlwedu is now being used by a user.
${buildSupportCopy()}

Best regards,

Wotlwedu admin team`;

  return {
    to: emailAddress,
    subject: "Wotlwedu email address change complete",
    text: textBody,
    html: wrapHtmlMessage(
      "Your Wotlwedu email change is complete",
      `<p>Your email address at Wotlwedu is now being used by a user.</p>
         <p>${buildSupportCopy()}</p>`
    ),
  };
}

function buildOrganizationInviteMessage(
  emailAddress,
  organizationName,
  inviteToken,
  frontendUrl,
  expiresAt
) {
  const inviteBaseUrl = resolveLinkBase(Config.inviteLinkBaseUrl, frontendUrl);
  const inviteUrl =
    inviteBaseUrl + `/login?invite=` + encodeURIComponent(inviteToken);
  const expiryText = expiresAt
    ? `This invitation expires on ${new Date(expiresAt).toLocaleString()}.`
    : "This invitation does not currently have an expiration date.";
  const textBody = `Hi there,

You have been invited to join ${organizationName} on Wotlwedu.

If you already use a social sign-in provider with this email address, sign in with that provider and Wotlwedu will place you in the invited organization automatically.

You can start here:

${inviteUrl}

${expiryText}

If you did not expect this invitation, you can ignore this email. ${buildSupportCopy()}

Best regards,

Wotlwedu admin team`;

  return {
    to: emailAddress,
    subject: "Wotlwedu organization invitation",
    text: textBody,
    html: wrapHtmlMessage(
      `You're invited to join ${organizationName}`,
      `<p>You have been invited to join <strong>${organizationName}</strong> on Wotlwedu.</p>
         <p>If you already use Google sign-in with this email address, continue here:</p>
         <p><a href="${inviteUrl}">${inviteUrl}</a></p>
         <p>${expiryText}</p>
         <p>If you did not expect this invitation, you can ignore this email. ${buildSupportCopy()}</p>`
    ),
  };
}

function buildPublicPollInviteMessage(
  emailAddress,
  pollName,
  publicToken,
  inviteToken = null
) {
  const inviteUrl =
    `${Config.baseFrontendUrl}/public/poll/${encodeURIComponent(publicToken)}` +
    (inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "");
  const unsubscribeUrl = inviteToken
    ? `${Config.baseFrontendUrl}/public/unsubscribe/${encodeURIComponent(inviteToken)}`
    : null;
  const unsubscribeCopy = unsubscribeUrl
    ? `You can opt out of future public poll invites here:\n\n${unsubscribeUrl}`
    : `If you no longer want invites like this, contact ${Config.supportEmail}.`;
  const consentCopy =
    "When you open a guest voting session, Wotlwedu stores your display name, invite status, and votes for the poll so the organizer can count responses and handle abuse reports.";
  const textBody = `Hi there,

You have been invited to participate in the Wotlwedu poll "${pollName}".

Open the poll here:

${inviteUrl}

${consentCopy}

${unsubscribeCopy}

Best regards,

Wotlwedu admin team`;

  return {
    to: emailAddress,
    subject: `Invitation to participate in "${pollName}"`,
    text: textBody,
    html: wrapHtmlMessage(
      `You're invited to "${pollName}"`,
      `<p>You have been invited to participate in the Wotlwedu poll <strong>${pollName}</strong>.</p>
         <p><a href="${inviteUrl}">${inviteUrl}</a></p>
         <p>${consentCopy}</p>
         ${
           unsubscribeUrl
             ? `<p>You can opt out of future public poll invites here:</p><p><a href="${unsubscribeUrl}">${unsubscribeUrl}</a></p>`
             : `<p>If you no longer want invites like this, contact ${Config.supportEmail}.</p>`
         }`
    ),
  };
}

module.exports._buildEmailConfirmMessage = buildEmailConfirmMessage;
module.exports._buildPasswordResetMessage = buildPasswordResetMessage;
module.exports._buildEmailChangeMessage = buildEmailChangeMessage;
module.exports._buildEmailChangeCompleteMessage = buildEmailChangeCompleteMessage;
module.exports._buildOrganizationInviteMessage = buildOrganizationInviteMessage;
module.exports._buildPublicPollInviteMessage = buildPublicPollInviteMessage;

module.exports.sendEmailConfirmMessage = (
  emailAddress,
  confirmationToken,
  frontendUrl
) => {
  return new Promise((resolve, reject) => {
    const messageDetails = buildEmailConfirmMessage(
      emailAddress,
      confirmationToken,
      frontendUrl
    );
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
    const messageDetails = buildPasswordResetMessage(
      emailAddress,
      userId,
      resetToken,
      frontendUrl
    );
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
    const messageDetails = buildEmailChangeMessage(
      changeFromEmail,
      changeToEmail,
      confirmationToken,
      frontendUrl
    );
    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send email address change message: " + err));
    });
    resolve("OK");
  });
};

module.exports.sendEmailChangeCompleteMessage = (emailAddress, frontendUrl) => {
  return new Promise((resolve, reject) => {
    const messageDetails = buildEmailChangeCompleteMessage(emailAddress, frontendUrl);
    sendEmail(messageDetails).catch((err) => {
      reject(
        new Error(
          "Failed to send email address change completion message: " + err
        )
      );
    });
    resolve("OK");
  });
};

module.exports.sendOrganizationInviteMessage = (
  emailAddress,
  organizationName,
  inviteToken,
  frontendUrl,
  expiresAt
) => {
  return new Promise((resolve, reject) => {
    const messageDetails = buildOrganizationInviteMessage(
      emailAddress,
      organizationName,
      inviteToken,
      frontendUrl,
      expiresAt
    );
    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send organization invite email: " + err));
    });
    resolve("OK");
  });
};

module.exports.sendPublicPollInviteMessage = (
  emailAddress,
  pollName,
  publicToken,
  inviteToken = null
) => {
  return new Promise((resolve, reject) => {
    const messageDetails = buildPublicPollInviteMessage(
      emailAddress,
      pollName,
      publicToken,
      inviteToken
    );

    sendEmail(messageDetails).catch((err) => {
      reject(new Error("Failed to send public poll invite email: " + err));
    });
    resolve("OK");
  });
};
