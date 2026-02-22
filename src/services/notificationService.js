const Notification = require('../models/Notification');

function normalizeText(value) {
  return String(value || '').trim();
}

function hasEmailWebhook() {
  return Boolean(process.env.EMAIL_WEBHOOK_URL);
}

async function createInAppNotification({ userId, type = 'system', title, message, metadata }) {
  if (!userId) {
    return null;
  }

  return Notification.create({
    user: userId,
    type,
    title: normalizeText(title),
    message: normalizeText(message),
    channel: 'in-app',
    deliveryStatus: 'sent',
    metadata
  });
}

async function sendEmailNotification({ userId, email, type = 'system', title, message, metadata }) {
  if (!userId || !email) {
    return null;
  }

  const doc = await Notification.create({
    user: userId,
    type,
    title: normalizeText(title),
    message: normalizeText(message),
    channel: 'email',
    email: normalizeText(email).toLowerCase(),
    deliveryStatus: 'pending',
    metadata
  });

  if (!hasEmailWebhook()) {
    doc.deliveryStatus = 'skipped';
    doc.deliveryError = 'EMAIL_WEBHOOK_URL not configured';
    await doc.save();
    return doc;
  }

  if (typeof fetch !== 'function') {
    doc.deliveryStatus = 'failed';
    doc.deliveryError = 'Global fetch is not available in this Node runtime';
    await doc.save();
    return doc;
  }

  const body = {
    to: doc.email,
    subject: doc.title,
    text: doc.message,
    fromName: normalizeText(process.env.EMAIL_FROM_NAME || 'Smart Location Service Provider'),
    metadata: doc.metadata || {}
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (process.env.EMAIL_WEBHOOK_AUTH) {
    headers.Authorization = `Bearer ${process.env.EMAIL_WEBHOOK_AUTH}`;
  }

  try {
    const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      doc.deliveryStatus = 'failed';
      doc.deliveryError = `Webhook returned ${response.status}`;
      await doc.save();
      return doc;
    }

    doc.deliveryStatus = 'sent';
    doc.deliveryError = '';
    await doc.save();
    return doc;
  } catch (error) {
    doc.deliveryStatus = 'failed';
    doc.deliveryError = normalizeText(error.message).slice(0, 300);
    await doc.save();
    return doc;
  }
}

async function notifyUser({
  userId,
  email,
  type = 'system',
  title,
  message,
  metadata,
  sendEmail = false
}) {
  const tasks = [
    createInAppNotification({
      userId,
      type,
      title,
      message,
      metadata
    })
  ];

  if (sendEmail && email) {
    tasks.push(
      sendEmailNotification({
        userId,
        email,
        type,
        title,
        message,
        metadata
      })
    );
  }

  const [inApp, emailNotification] = await Promise.all(tasks);
  return { inApp, emailNotification: emailNotification || null };
}

module.exports = {
  notifyUser
};
