import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

/**
 * Create profile routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getProfiles - Get all profiles from SQL
 * @param {Function} deps.createProfile - Create profile in SQL
 * @param {Function} deps.updateProfile - Update profile in SQL
 * @param {Function} deps.deleteProfile - Delete profile from SQL
 * @param {Function} deps.activateProfile - Activate profile in SQL
 */
export function createProfileRoutes(deps) {
  const { getProfiles, createProfile, updateProfile, deleteProfile, activateProfile } = deps;

  // Load all profiles from SQL
  async function loadProfiles() {
    return await getProfiles();
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
      const payload = req.body || {};
      const profileData = {
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
      const newProfile = await createProfile(profileData);
      res.json({ success: true, id: newProfile.id });
    } catch (err) {
      console.error('Error creating profile:', err);
      res.status(500).json({ success: false, error: 'Failed to create profile' });
    }
  });

  // Update profile
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const payload = req.body || {};
      const profileData = {
        name: payload.name,
        remark: payload.remark || '',
        customerName: payload.customerName || '',
        contactPerson: payload.contactPerson || '',
        mailUser: payload.mailUser,
        mailPass: payload.mailPass,
        imapHost: payload.imapHost,
        imapPort: Number(payload.imapPort) || 993,
        imapTls: payload.imapTls || 'true',
        smtpHost: payload.smtpHost,
        smtpPort: Number(payload.smtpPort) || 465,
        smtpSecure: payload.smtpSecure || 'true',
        port: Number(payload.port) || 3001,
        isActive: payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : 0,
      };
      await updateProfile(id, profileData);
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
      await activateProfile(id);
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
      await deleteProfile(id);
      res.json({ success: true });
    } catch (err) {
      console.error('Error deleting profile:', err);
      res.status(500).json({ success: false, error: 'Failed to delete profile' });
    }
  });

  // Export helper functions for use in server.js
  router.loadProfiles = loadProfiles;

  return router;
}
