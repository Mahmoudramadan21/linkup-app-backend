const sgMail = require("@sendgrid/mail");

// Set SendGrid API Key from environment variable
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Sends a password reset email using SendGrid
 * @param {string} email - Recipient's email address
 * @param {string} resetContent - Either a 4-digit verification code or a reset link
 * @param {boolean} isCode - If true, sends a verification code; if false, sends a reset link
 */
const sendResetEmail = async (email, resetContent, isCode = false) => {
  try {
    let subject, text, html;

    if (isCode) {
      // Email for 4-digit verification code
      subject = "Your LinkUp Password Reset Verification Code";
      text = `Your verification code to reset your password is: ${resetContent}\nThis code expires in 15 minutes.\nIf you did not request this, please ignore this email.`;
      html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Verification Code</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f4f4;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
            <tr>
              <td style="padding: 40px 0; background-color: #f4f4f4;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 30px; text-align: center; background: linear-gradient(135deg, #007bff, #00d4ff);">
                      <h1 style="margin: 0; font-size: 28px; color: #ffffff; font-weight: bold;">LinkUp</h1>
                    </td>
                  </tr>
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px; text-align: center;">
                      <h2 style="font-size: 24px; color: #333333; margin: 0 0 20px;">Password Reset Verification Code</h2>
                      <p style="font-size: 16px; color: #666666; line-height: 1.5; margin: 0 0 20px;">
                        You requested to reset your password. Use the following verification code to proceed:
                      </p>
                      <div style="display: inline-block; padding: 15px 25px; background-color: #007bff; color: #ffffff; font-size: 24px; font-weight: bold; border-radius: 5px; margin: 20px 0;">
                        ${resetContent}
                      </div>
                      <p style="font-size: 14px; color: #666666; line-height: 1.5; margin: 0 0 20px;">
                        This code expires in <strong>15 minutes</strong>. If you did not request this, please ignore this email.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 30px; text-align: center; background-color: #f8f9fa;">
                      <p style="font-size: 14px; color: #999999; margin: 0;">
                        &copy; ${new Date().getFullYear()} LinkUp. All rights reserved.
                      </p>
                      <p style="font-size: 14px; color: #999999; margin: 5px 0 0;">
                        Need help? Contact us at <a href="mailto:support@linkup.com" style="color: #007bff; text-decoration: none;">support@linkup.com</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    } else {
      // Email for reset link (backward compatibility)
      subject = "LinkUp Password Reset Request";
      text = `Click the link to reset your password: ${resetContent}\nThis link expires in 1 hour.\nIf you did not request this, please ignore this email.`;
      html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f4f4;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
            <tr>
              <td style="padding: 40px 0; background-color: #f4f4f4;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 30px; text-align: center; background: linear-gradient(135deg, #007bff, #00d4ff);">
                      <h1 style="margin: 0; font-size: 28px; color: #ffffff; font-weight: bold;">LinkUp</h1>
                    </td>
                  </tr>
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px; text-align: center;">
                      <h2 style="font-size: 24px; color: #333333; margin: 0 0 20px;">Reset Your Password</h2>
                      <p style="font-size: 16px; color: #666666; line-height: 1.5; margin: 0 0 20px;">
                        You requested to reset your password. Click the button below to proceed:
                      </p>
                      <a href="${resetContent}" style="display: inline-block; padding: 15px 30px; background-color: #007bff; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 5px; margin: 20px 0;">
                        Reset Password
                      </a>
                      <p style="font-size: 14px; color: #666666; line-height: 1.5; margin: 0 0 20px;">
                        This link expires in <strong>1 hour</strong>. If you did not request this, please ignore this email.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 30px; text-align: center; background-color: #f8f9fa;">
                      <p style="font-size: 14px; color: #999999; margin: 0;">
                        &copy; ${new Date().getFullYear()} LinkUp. All rights reserved.
                      </p>
                      <p style="font-size: 14px; color: #999999; margin: 5px 0 0;">
                        Need help? Contact us at <a href="mailto:support@linkup.com" style="color: #007bff; text-decoration: none;">support@linkup.com</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    // Email options
    const msg = {
      to: email,
      from: process.env.EMAIL_FROM, // Use the email verified in SendGrid
      subject,
      text,
      html,
    };

    // Send email via SendGrid
    const response = await sgMail.send(msg);
    console.log("Reset email sent successfully:", response);
  } catch (error) {
    console.error(
      "Error sending reset email:",
      error.response?.body || error.message
    );
    throw new Error("Failed to send reset email");
  }
};

module.exports = { sendResetEmail };
