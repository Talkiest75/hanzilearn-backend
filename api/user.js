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

  // POST — update user profile (from onboarding)
  if(req.method === 'POST'){
    const { user_id, role, daily_goal, hsk_level } = req.body;
    if(!user_id) return res.status(400).json({ error: 'user_id required' });
    const { error } = await supabase
      .from('users')
      .update({ role, daily_goal, hsk_level })
      .eq('id', user_id);
    if(error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // GET — fetch user data
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data: progress } = await supabase
      .from('progress')
      .select('card_id, correct, total, last_seen')
      .eq('user_id', user_id);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('student_id', user_id)
      .order('created_at', { ascending: false });

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
