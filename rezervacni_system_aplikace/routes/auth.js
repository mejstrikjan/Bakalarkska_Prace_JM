const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const crypto = require('crypto');

// GET: Přihlášení
router.get('/login', (req, res) => {
  res.render('login');
});

// POST: Přihlášení
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  try {
    const [rows] = await db.execute(
      "SELECT * FROM user WHERE email = ? AND passwordHash = ?",
      [email, passwordHash]
    );

    if (rows.length > 0) {
        req.session.user = {
            id: rows[0].userID,
            name: rows[0].name,
            email: rows[0].email,
            userType: rows[0].userType
          };
          
        // Přesměrování podle typu uživatele
        if (rows[0].userType === 'admin') {
            return res.redirect('/admin');
        } else {
            return res.redirect('/user');
        }
    } else {
      res.render('login', { error: 'Neplatné přihlašovací údaje' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Chyba serveru');
  }
});

// GET: Registrace
router.get('/register', (req, res) => {
  res.render('register');
});

// POST: Registrace
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
        'user'
      ]);
      res.redirect('/login');
    } catch (err) {
      console.error(err);
      res.render('register', { error: 'Registrace selhala. Uživatelské údaje možná již existují.' });
    }
  });
  

// GET: Odhlášení
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
