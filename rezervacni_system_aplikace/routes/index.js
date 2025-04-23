const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const crypto = require('crypto');

router.get('/', (req, res) => {
    const user = req.session.user;
    res.render('home', { user });
  });

router.post('/register', async (req, res) => {
  const { username, email, phonenumber, name, sname, password } = req.body;
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  try {
    await db.execute("CALL register_user(?, ?, ?, ?, ?, ?, ?)", [
      username,
      email,
      phonenumber || null,
      name,
      sname,
      passwordHash,
      0
    ]);
    res.send('Uživatel byl úspěšně registrován!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Chyba při registraci');
  }
});

module.exports = router;
