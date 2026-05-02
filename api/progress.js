const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = async function handler(req, res) {
  // CORS for Mini App
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { user_id, card_id, correct } = req.body;

  if (!user_id || !card_id) {
    return res.status(400).json({ error: 'user_id and card_id required' });
  }

  try {
    // Upsert progress record
    const { error } = await supabase.rpc('upsert_progress', {
      p_user_id: user_id,
      p_card_id: card_id,
      p_correct: correct ? 1 : 0
    });

    if (error) {
      // Fallback: manual upsert
      const { data: existing } = await supabase
        .from('progress')
        .select('id, correct, total')
        .eq('user_id', user_id)
        .eq('card_id', card_id)
        .single();

      if (existing) {
        await supabase
          .from('progress')
          .update({
            correct: existing.correct + (correct ? 1 : 0),
            total:   existing.total + 1,
            last_seen: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('progress')
          .insert({
            user_id,
            card_id,
            correct: correct ? 1 : 0,
            total:   1
          });
      }
    }

    // Update streak
    await updateStreak(user_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

async function updateStreak(user_id) {
  const today = new Date().toISOString().split('T')[0];
  const { data: user } = await supabase
    .from('users')
    .select('streak, last_active')
    .eq('id', user_id)
    .single();

  if (!user) return;

  const last = user.last_active;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let newStreak = user.streak;
  if (last === today) return; // already counted today
  if (last === yesterday) newStreak += 1; // continuing streak
  else newStreak = 1; // streak broken

  await supabase
    .from('users')
    .update({ streak: newStreak, last_active: today })
    .eq('id', user_id);
}
