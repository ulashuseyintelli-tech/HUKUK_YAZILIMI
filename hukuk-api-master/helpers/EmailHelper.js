const nodemailer = require("nodemailer");

const sendEmail = async (emailModel) => {
  try {
    let transporter = nodemailer.createTransport({
      host: "mail.limagroup.com.tr",
      port: 465,
      auth: {
        user: "software@limagroup.com.tr", // generated ethereal user
        pass: "U2381808fb", // generated ethereal password
      },
    });

    const info = await transporter.sendMail(emailModel);
    return { status: true, info };
  } catch (err) {
    return { status: false, err };
  }
};

const sendDeneme = async (user, ticket) => {
  const sendingResponse = await sendEmail({
    from: "Telli Hukuk <admin@tellihukuk.com",
    to: "ookndkrk@gmail.com",
    subject: "Talep Ataması",
    text: "deneme",
    html: "deneme",
  });
  return sendingResponse;
};

const sendClientIntelEmail = async (email) => {
  const sendingResponse = await sendEmail({
    from: "Telli Hukuk <admin@tellihukuk.com",
    to: email,
    subject: "Deneme Müvekkil",
    text: "deneme",
    html: "deneme",
  });
  return sendingResponse;
};

module.exports = {
  sendEmail,
  sendDeneme,
  sendClientIntelEmail,
};
