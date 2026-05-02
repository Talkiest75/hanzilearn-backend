const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get progress
    const { data: progress } = await supabase
      .from('progress')
      .select('card_id, correct, total, last_seen')
      .eq('user_id', user_id);

    // Get active tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('student_id', user_id)
      .order('created_at', { ascending: false });

    // Get students if teacher
    let students = [];
    if (user.role === 'teacher') {
      const { data: s } = await supabase
        .from('users')
        .select('id, full_name, username, hsk_level, streak, last_active')
        .eq('teacher_id', user_id);
      students = s || [];
    }

    return res.status(200).json({
      user,
      progress: progress || [],
      tasks:    tasks || [],
      students
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
};
