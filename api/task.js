const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const BOT_TOKEN = process.env.BOT_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).end();

  const { teacher_id, student_id, topic, hsk_level, deadline, note } = req.body;

  if (!teacher_id || !student_id || !topic || !hsk_level) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Create task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        teacher_id,
        student_id,
        topic,
        hsk_level,
        deadline: deadline || null,
        note:     note || null,
        status:   'new'
      })
      .select()
      .single();

    if (error) throw error;

    // Get teacher name
    const { data: teacher } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', teacher_id)
      .single();

    // Notify student via Telegram
    const teacherName = teacher?.full_name || 'Преподаватель';
    const deadlineStr = deadline ? `\n📅 Срок: <b>${deadline}</b>` : '';
    const noteStr     = note ? `\n💬 <i>${note}</i>` : '';

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    student_id,
        parse_mode: 'HTML',
        text:
          `📚 <b>Новое задание от ${teacherName}</b>\n\n` +
          `📖 Тема: <b>${topic}</b>\n` +
          `🏷 Уровень: HSK ${hsk_level}` +
          deadlineStr + noteStr +
          `\n\nОткрой приложение чтобы выполнить:`,
        reply_markup: JSON.stringify({
          inline_keyboard: [[{
            text: '📖 Выполнить задание',
            web_app: { url: process.env.APP_URL }
          }]]
        })
      })
    });

    return res.status(200).json({ ok: true, task });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
