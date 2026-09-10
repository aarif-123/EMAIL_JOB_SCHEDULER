import nodemailer, { Transporter } from 'nodemailer';
import fs from 'fs';
import path from 'path';

interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  body: string;
}

interface SendEmailResult {
  messageId: string;
  previewUrl: string;
}

const CACHE_FILE = path.join(__dirname, '../../.ethereal_cache.json');

export class EmailService {
  private static transporter: Transporter | null = null;

  /**
   * Initializes or returns cached SMTP transporter
   */
  private static async getTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;

    // 0. Check if a real SMTP server is configured (e.g. Gmail, SendGrid, custom SMTP)
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log(`🚀 Using real SMTP server: ${process.env.SMTP_HOST}:${port} (${process.env.SMTP_USER})`);
      return this.transporter;
    }

    // 1. Check if configured in environment (Ethereal)
    if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.ETHEREAL_PORT || '587', 10),
        secure: false,
        auth: {
          user: process.env.ETHEREAL_USER,
          pass: process.env.ETHEREAL_PASS,
        },
      });
      return this.transporter;
    }

    // 2. Check local disk cache to avoid pounding api.nodemailer.com
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        if (cached.user && cached.pass) {
          this.transporter = nodemailer.createTransport({
            host: cached.smtp?.host || 'smtp.ethereal.email',
            port: cached.smtp?.port || 587,
            secure: cached.smtp?.secure || false,
            auth: {
              user: cached.user,
              pass: cached.pass,
            },
          });
          return this.transporter;
        }
      } catch {
        // ignore cache parse errors
      }
    }

    // 3. Create fresh test account with retry
    let testAccount: any = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        testAccount = await nodemailer.createTestAccount();
        break;
      } catch (err) {
        attempts++;
        if (attempts >= 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(testAccount, null, 2));

    this.transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    console.log(`✉️ Initialized Ethereal test account: ${testAccount.user}`);
    return this.transporter;
  }

  /**
   * Sends email via fake SMTP (Ethereal) and captures preview URL
   */
  static async send(params: SendEmailParams): Promise<SendEmailResult> {
    const transporter = await this.getTransporter();

    const etherealAccount = process.env.ETHEREAL_USER || 'juanita20@ethereal.email';

    const info = await transporter.sendMail({
      from: params.from,
      to: params.to,
      bcc: etherealAccount,
      subject: params.subject,
      text: params.body,
      html: `<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; padding: 20px; max-width: 600px;">
        <h2 style="color: #0f172a; margin-bottom: 12px;">${params.subject}</h2>
        <p>${params.body.replace(/\n/g, '<br/>')}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <small style="color: #64748b;">Delivered via ReachInbox Email Scheduler (Ethereal Test SMTP)</small>
      </div>`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || '';

    return {
      messageId: info.messageId,
      previewUrl,
    };
  }
}
