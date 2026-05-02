const handleUpdate = require('../bot');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'HanziLearn Bot is running' });
  }

  try {
    await handleUpdate(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Bot error:', err);
    res.status(200).json({ ok: true }); // always 200 to Telegram
  }
};
