import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create profile routes
 * @param {Object} deps - Dependencies
 * @param {string} deps.MAIL_USER - Default mail user
 * @param {string} deps.MAIL_PASS - Default mail password
 * @param {string} deps.IMAP_HOST - Default IMAP host
 * @param {number} deps.IMAP_PORT - Default IMAP port
 * @param {string} deps.IMAP_TLS - Default IMAP TLS setting
 * @param {string} deps.SMTP_HOST - Default SMTP host
 * @param {number} deps.SMTP_PORT - Default SMTP port
 * @param {string} deps.SMTP_SECURE - Default SMTP secure setting
 * @param {number} deps.PORT - Default port
 */
export function createProfileRoutes(deps) {
  const { MAIL_USER, MAIL_PASS, IMAP_HOST, IMAP_PORT, IMAP_TLS, SMTP_HOST, SMTP_PORT, SMTP_SECURE, PORT } = deps;

  const profilesFilePath = path.join(__dirname, '..', 'profiles.json');

  async function loadProfiles() {
    try {
      const data = await fs.readFile(profilesFilePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      // File doesn't exist or is corrupted, return defaults
      return [
        {
          id: 1,
          name: 'longriver.com',
          remark: 'longriver.com',
          customerName: '',
          contactPerson: '',
          mailUser: MAIL_USER || '',
          mailPass: MAIL_PASS || '',
          imapHost: IMAP_HOST || 'imap.bbmail.com.hk',
          imapPort: Number(IMAP_PORT) || 993,
          imapTls: IMAP_TLS || 'true',
          smtpHost: SMTP_HOST || 'homegw.bbmail.com.hk',
          smtpPort: Number(SMTP_PORT) || 465,
          smtpSecure: SMTP_SECURE || 'true',
          port: Number(PORT) || 3001,
          isActive: 1,
        },
        {
          id: 2,
          name: 'lcf',
          remark: 'lcf',
          customerName: '',
          contactPerson: '',
          mailUser: 'weiwu@fuchanghk.com',
          mailPass: 'mrkE190#',
          imapHost: 'imap.qiye.163.com',
          imapPort: 993,
          imapTls: 'true',
          smtpHost: 'smtp.qiye.163.com',
          smtpPort: 994,
          smtpSecure: 'true',
          port: 3001,
          isActive: 0,
        },
        {
          id: 3,
          name: 'gmail',
          remark: 'eric.brilliant@gmail.com - Gmail TLS',
          customerName: '',
          contactPerson: '',
          mailUser: 'eric.brilliant@gmail.com',
          mailPass: 'opqx pfna kagb bznr',
          imapHost: 'imap.gmail.com',
          imapPort: 993,
          imapTls: 'true',
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpSecure: 'false',
          port: 3001,
          isActive: 0,
        },
        {
          id: 4,
          name: '163',
          remark: '19902475292@163.com - 163.com SSL',
          customerName: '',
          contactPerson: '',
          mailUser: '19902475292@163.com',
          mailPass: 'JDy8MigeNmsESZRa',
          imapHost: 'imap.163.com',
          imapPort: 993,
          imapTls: 'true',
          smtpHost: 'smtp.163.com',
          smtpPort: 465,
          smtpSecure: 'true',
          port: 3001,
          isActive: 0,
        }
      ];
    }
  }

  async function saveProfiles(profiles) {
    try {
      await fs.writeFile(profilesFilePath, JSON.stringify(profiles, null, 2));
    } catch (err) {
      console.error('Failed to save profiles:', err);
    }
  }

  // Get all profiles
  router.get('/', async (req, res) => {
    try {
      const profiles = await loadProfiles();
      res.json({ success: true, profiles });
    } catch (err) {
      console.error('Error getting profiles:', err);
      res.status(500).json({ success: false, error: 'Failed to load profiles' });
    }
  });

  // Get profile by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const profiles = await loadProfiles();
      const profile = profiles.find(p => p.id === id);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
      res.json({ success: true, profile });
    } catch (err) {
      console.error('Error getting profile:', err);
      res.status(500).json({ success: false, error: 'Failed to load profile' });
    }
  });

  // Create new profile
  router.post('/', async (req, res) => {
    try {
      const profiles = await loadProfiles();
      const nextId = Math.max(...profiles.map(p => p.id)) + 1;
      const payload = req.body || {};
      const profile = {
        id: nextId,
        name: payload.name || 'Unnamed',
        remark: payload.remark || '',
        customerName: payload.customerName || '',
        contactPerson: payload.contactPerson || '',
        mailUser: payload.mailUser || '',
        mailPass: payload.mailPass || '',
        imapHost: payload.imapHost || '',
        imapPort: Number(payload.imapPort) || 993,
        imapTls: payload.imapTls || 'true',
        smtpHost: payload.smtpHost || '',
        smtpPort: Number(payload.smtpPort) || 465,
        smtpSecure: payload.smtpSecure || 'true',
        port: Number(payload.port) || 3001,
        isActive: payload.isActive ? 1 : 0,
      };
      profiles.push(profile);
      await saveProfiles(profiles);
      res.json({ success: true, id: nextId });
    } catch (err) {
      console.error('Error creating profile:', err);
      res.status(500).json({ success: false, error: 'Failed to create profile' });
    }
  });

  // Update profile
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const profiles = await loadProfiles();
      const idx = profiles.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ success: false, error: 'Profile not found' });
      const payload = req.body || {};
      profiles[idx] = {
        ...profiles[idx],
        ...payload,
        id,
        imapPort: Number(payload.imapPort ?? profiles[idx].imapPort) || 993,
        smtpPort: Number(payload.smtpPort ?? profiles[idx].smtpPort) || 465,
        port: Number(payload.port ?? profiles[idx].port) || 3001,
        isActive: payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : profiles[idx].isActive,
      };
      await saveProfiles(profiles);
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  });

  // Activate profile
  router.post('/:id/activate', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const profiles = await loadProfiles();
      profiles.forEach(p => (p.isActive = p.id === id ? 1 : 0));
      await saveProfiles(profiles);
      res.json({ success: true });
    } catch (err) {
      console.error('Error activating profile:', err);
      res.status(500).json({ success: false, error: 'Failed to activate profile' });
    }
  });

  // Test send email from a profile
  router.post('/:id/test-send', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const profiles = await loadProfiles();
      const profile = profiles.find(p => p.id === id);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const toEmail = (req.body?.to || '').trim() || profile.mailUser;

      const transport = nodemailer.createTransport({
        host: profile.smtpHost,
        port: Number(profile.smtpPort),
        secure: profile.smtpSecure === 'true',
        auth: {
          user: profile.mailUser,
          pass: profile.mailPass,
        },
        tls: { rejectUnauthorized: true },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });

      // For port 587 (STARTTLS)
      if (profile.smtpSecure !== 'true') {
        transport.options.requireTLS = true;
      }

      const info = await transport.sendMail({
        from: `"ERP Test" <${profile.mailUser}>`,
        to: toEmail,
        subject: `ERP Test Email from ${profile.name}`,
        text: `This is a test email from profile "${profile.name}" (${profile.mailUser}).\nSent to: ${toEmail}\nSent at: ${new Date().toISOString()}`,
        html: `<p>This is a test email from profile <strong>${profile.name}</strong> (${profile.mailUser}).</p><p>Sent to: ${toEmail}</p><p>Sent at: ${new Date().toISOString()}</p>`,
      });

      transport.close();
      res.json({ success: true, messageId: info.messageId });
    } catch (err) {
      console.error('Error test sending email:', err);
      res.status(500).json({ success: false, error: `Test send failed: ${err.message}` });
    }
  });

  // Delete profile
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const profiles = await loadProfiles();
      const filtered = profiles.filter(p => p.id !== id);
      if (filtered.length === profiles.length) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }
      await saveProfiles(filtered);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting profile:', err);
      res.status(500).json({ success: false, error: 'Failed to delete profile' });
    }
  });

  // Export helper functions for use in server.js
  router.loadProfiles = loadProfiles;
  router.saveProfiles = saveProfiles;

  return router;
}
