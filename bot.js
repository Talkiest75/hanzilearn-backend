const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BOT_TOKEN    = process.env.BOT_TOKEN;
const APP_URL      = process.env.APP_URL; // your Vercel URL

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── SEND MESSAGE ──────────────────────────────────────────────
async function sendMessage(chat_id, text, extra = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', ...extra })
  });
  return res.json();
}

// ── OPEN MINI APP BUTTON ──────────────────────────────────────
function appButton(label = '📖 Открыть HanziLearn') {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: [[{
        text: label,
        web_app: { url: APP_URL }
      }]]
    })
  };
}

// ── REGISTER OR GET USER ─────────────────────────────────────
async function getOrCreateUser(tg) {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', tg.id)
    .single();

  if (existing) return existing;

  const { data: newUser } = await supabase
    .from('users')
    .insert({
      id:        tg.id,
      username:  tg.username || null,
      full_name: [tg.first_name, tg.last_name].filter(Boolean).join(' '),
      role:      'student',
      streak:    0,
    })
    .select()
    .single();

  return newUser;
}

// ── HANDLE TEACHER INVITE LINK ────────────────────────────────
async function handleTeacherRef(student_id, teacher_id) {
  // link student to teacher
  await supabase
    .from('users')
    .update({ teacher_id: parseInt(teacher_id) })
    .eq('id', student_id);

  // get teacher name
  const { data: teacher } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', parseInt(teacher_id))
    .single();

  return teacher ? teacher.full_name : null;
}

// ── MAIN WEBHOOK HANDLER ──────────────────────────────────────
module.exports = async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  const tg   = msg.from;
  const text = msg.text.trim();
  const chat = msg.chat.id;

  // Register user
  const user = await getOrCreateUser(tg);

  // ── /start ──
  if (text === '/start' || text.startsWith('/start ')) {
    const parts = text.split(' ');
    const param = parts[1] || '';

    // Teacher invite link: /start teacher_XXXXXXX
    if (param.startsWith('teacher_')) {
      const teacher_id = param.replace('teacher_', '');
      const teacherName = await handleTeacherRef(tg.id, teacher_id);
      await sendMessage(chat,
        `👋 Привет, <b>${tg.first_name}</b>!\n\n` +
        (teacherName
          ? `✅ Ты подключён к преподавателю <b>${teacherName}</b>.\n\n`
          : '') +
        `Открой приложение чтобы начать учить китайский:`,
        appButton()
      );
      return;
    }

    // Normal start
    await sendMessage(chat,
      `你好, <b>${tg.first_name}</b>! 👋\n\n` +
      `Добро пожаловать в <b>HanziLearn</b> — приложение для изучения китайского языка.\n\n` +
      `🗂 Карточки по темам и уровням HSK\n` +
      `✏️ Тесты на запоминание\n` +
      `👩‍🏫 Задания от преподавателя\n` +
      `📊 Отслеживание прогресса\n\n` +
      `Нажми кнопку чтобы начать:`,
      appButton()
    );
    return;
  }

  // ── /progress ──
  if (text === '/progress') {
    const { data: prog } = await supabase
      .from('progress')
      .select('correct, total')
      .eq('user_id', tg.id);

    if (!prog || prog.length === 0) {
      await sendMessage(chat,
        `📊 Ты ещё не изучал слова.\n\nОткрой приложение чтобы начать:`,
        appButton()
      );
      return;
    }

    const totalCards  = prog.length;
    const totalRight  = prog.reduce((s, r) => s + r.correct, 0);
    const totalAns    = prog.reduce((s, r) => s + r.total, 0);
    const accuracy    = totalAns > 0 ? Math.round(totalRight / totalAns * 100) : 0;
    const learned     = prog.filter(r => r.total > 0 && r.correct / r.total >= 0.8).length;

    await sendMessage(chat,
      `📊 <b>Твой прогресс</b>\n\n` +
      `📚 Слов изучено: <b>${totalCards}</b>\n` +
      `✅ Хорошо знаешь: <b>${learned}</b> (≥80%)\n` +
      `🎯 Точность: <b>${accuracy}%</b>\n` +
      `🔥 Серия: <b>${user.streak} дней</b>\n\n` +
      `Продолжай в приложении:`,
      appButton()
    );
    return;
  }

  // ── /tasks ──
  if (text === '/tasks') {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('student_id', tg.id)
      .neq('status', 'done')
      .order('created_at', { ascending: false });

    if (!tasks || tasks.length === 0) {
      await sendMessage(chat,
        `📋 Активных заданий нет.\n\nОткрой приложение:`,
        appButton()
      );
      return;
    }

    const statusEmoji = { new: '🆕', in_progress: '⏳', done: '✅' };
    let taskText = `📋 <b>Твои задания:</b>\n\n`;
    tasks.forEach((t, i) => {
      const emoji = statusEmoji[t.status] || '📌';
      const deadline = t.deadline ? ` · срок: ${t.deadline}` : '';
      taskText += `${i+1}. ${emoji} HSK ${t.hsk_level} · ${t.topic}${deadline}\n`;
      if (t.note) taskText += `   <i>${t.note}</i>\n`;
    });

    await sendMessage(chat, taskText, appButton('📖 Выполнить в приложении'));
    return;
  }

  // ── /invite (for teachers) ──
  if (text === '/invite') {
    if (user.role !== 'teacher') {
      await sendMessage(chat,
        `⚠️ Эта команда только для преподавателей.\n\n` +
        `Если ты преподаватель, измени роль в приложении:`,
        appButton()
      );
      return;
    }

    const link = `https://t.me/${await getBotUsername()}?start=teacher_${tg.id}`;
    await sendMessage(chat,
      `👩‍🏫 <b>Ссылка для учеников:</b>\n\n` +
      `<code>${link}</code>\n\n` +
      `Отправь эту ссылку своим ученикам — они автоматически привяжутся к тебе.`
    );
    return;
  }

  // ── /help ──
  if (text === '/help') {
    await sendMessage(chat,
      `<b>HanziLearn — команды:</b>\n\n` +
      `/start — открыть приложение\n` +
      `/progress — мой прогресс\n` +
      `/tasks — мои задания\n` +
      `/invite — ссылка для учеников (для преподавателей)\n` +
      `/help — список команд`
    );
    return;
  }

  // ── Default ──
  await sendMessage(chat,
    `Открой приложение чтобы учить китайский:`,
    appButton()
  );
};

async function getBotUsername() {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
  const data = await res.json();
  return data.result.username;
}
