const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { ensureUser, ensureAdmin } = require('../middleware/auth');

// Stránka uživatele s přehledem rezervací
router.get('/user', ensureUser, async (req, res) => {
  try {
    const [reservations] = await db.query(`
      SELECT * FROM v_user_reservations
      WHERE userID = ?
      ORDER BY reservationDate ASC
    `, [req.session.user.id]);

    res.render('user', {
      user: req.session.user,
      reservations
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Chyba při načítání rezervací');
  }
});

// Admin stránka s přehledem rezervací
router.get('/admin', ensureAdmin, async (req, res) => {
  const {
    searchRes,
    searchVoucher,
    upcoming,
    sort,
    page = 1,
    voucherPage = 1
  } = req.query;

  const limit = 20;
  const offset = (parseInt(page) - 1) * limit;
  const voucherOffset = (parseInt(voucherPage) - 1) * limit;

  const sortOrder = sort === 'date_asc' ? 'ASC' : 'DESC';
  const showUpcomingOnly = upcoming === 'true';

  // 🔹 REZERVACE dotaz
  let reservationQuery = showUpcomingOnly
    ? `SELECT * FROM v_admin_reservations WHERE reservationDate >= CURDATE()`
    : `SELECT * FROM v_admin_reservations`;

  let resParams = [];

  if (searchRes && searchRes.trim() !== '') {
    reservationQuery += `
      AND (email LIKE ? OR name LIKE ? OR sname LIKE ? OR phonenumber LIKE ?)
    `;
    const like = `%${searchRes.trim()}%`;
    resParams.push(like, like, like, like);
  }

  reservationQuery += ` ORDER BY reservationDate ${sortOrder} LIMIT ? OFFSET ?`;
  resParams.push(limit, offset);

  // 🔹 VOUCHERY dotaz
  let voucherQuery = `SELECT * FROM v_admin_vouchers`;
  let voucherParams = [];

  if (searchVoucher && searchVoucher.trim() !== '') {
    voucherQuery += `
      WHERE email LIKE ? OR name LIKE ? OR sname LIKE ? OR voucherCode LIKE ?
    `;
    const like = `%${searchVoucher.trim()}%`;
    voucherParams = [like, like, like, like];
  }

  voucherQuery += ` LIMIT ? OFFSET ?`;
  voucherParams.push(limit, voucherOffset);

  // 🔹 DASHBOARD – dnešní rezervace
  const todayQuery = `
    SELECT * FROM v_admin_reservations
    WHERE DATE(reservationDate) = CURDATE()
    ORDER BY reservationDate ASC
  `;

  try {
    const [reservations] = await db.query(reservationQuery, resParams);
    const [vouchers] = await db.query(voucherQuery, voucherParams);
    const [todayReservations] = await db.query(todayQuery);

    // 🔹 Počet všech rezervací a voucherů pro stránkování
    const [[{ count: totalReservations }]] = await db.query("SELECT COUNT(*) AS count FROM v_admin_reservations");
    const [[{ count: totalVouchers }]] = await db.query("SELECT COUNT(*) AS count FROM v_admin_vouchers");

    const hasMore = totalReservations > offset + limit;
    const voucherHasMore = totalVouchers > voucherOffset + limit;

    res.render('admin', {
      user: req.session.user,
      reservations,
      vouchers,
      todayReservations,
      searchRes: searchRes || '',
      searchVoucher: searchVoucher || '',
      upcoming: upcoming || '',
      sort: sort || 'date_desc',
      page: parseInt(page),
      hasMore,
      voucherPage: parseInt(voucherPage),
      voucherHasMore
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Chyba při načítání dat pro administraci");
  }
});


  

  //Editační formulář pro admina

  router.get('/admin/reservation/:id/edit', ensureAdmin, async (req, res) => {
    try {
      const [rows] = await db.query(
        "SELECT * FROM v_admin_reservations WHERE reservationID = ?",
        [req.params.id]
      );
  
      const [vouchers] = await db.query("SELECT voucherID, voucherCode FROM voucher");
  
      if (rows.length === 0) return res.status(404).send("Rezervace nenalezena");
  
      res.render('admin_edit_reservation', {
        user: req.session.user,
        reservation: rows[0],
        vouchers
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Chyba při načítání rezervace");
    }
  });

  router.post('/admin/reservation/:id/edit', ensureAdmin, async (req, res) => {
    const {
      reservationDate,
      durationMinutes,
      totalPrice,
      status,
      voucherID
    } = req.body;
  
    try {
      await db.execute("CALL edit_reservation(?, ?, ?, ?, ?, ?)", [
        req.params.id,
        reservationDate,
        durationMinutes,
        totalPrice,
        status,
        voucherID || null
      ]);
  
      res.redirect('/admin');
    } catch (err) {
      console.error(err);
      res.status(500).send("Chyba při ukládání změn");
    }
  });

  //Vytvoření voucheru adminem

  router.get('/admin/vouchers', ensureAdmin, async (req, res) => {
    try {
      const [vouchers] = await db.query("SELECT * FROM v_admin_vouchers");
      res.render('admin_vouchers', {
        user: req.session.user,
        vouchers
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Chyba při načítání voucherů");
    }
  });
  
  router.get('/admin/create-voucher', ensureAdmin, async (req, res) => {
    const [users] = await db.query("SELECT userID, name, sname, email FROM user");
    res.render('admin_voucher_create', { users, error: null });
  });  
  
  router.post('/admin/create-voucher', ensureAdmin, async (req, res) => {
    const {
      useExistingUser,
      userId,
      name,
      sname,
      email,
      username,
      password,
      code,
      maxUses,
      expirationDate
    } = req.body;
  
    try {
    const anonymous = req.body.anonymousVoucher === 'on';

      let finalUserId = null;
      
      if (!anonymous) {
        if (useExistingUser === 'no') {
        // Vytvoření nového uživatele
        const hash = 123456;
  
        const [result] = await db.execute("CALL register_user(?, ?, ?, ?, ?, ?, ?)", [
          username,
          email,
          null, // phonenumber
          name,
          sname,
          hash,
          'user'
        ]);
  
        finalUserId = result.insertId || result[0][0].userID;
    } else {
      finalUserId = userId;
    }
  }
  
      // Vytvoření voucheru
      await db.execute("CALL create_voucher(?, ?, ?, ?)", [
        finalUserId,
        code.trim(),
        expirationDate,
        parseInt(maxUses)
      ]);
  
      res.redirect('/admin');
    } catch (err) {
      console.error(err);
      res.render('admin_voucher_create', { error: "Chyba při vytváření voucheru", users: [] });
    }
  });
  

  //Vytvoření rezervace uživatelem

  router.get('/user/reservation/form', ensureUser, async (req, res) => {
    try {
      const [headsets] = await db.query("SELECT headsetID, model FROM headset");
      res.render('reservation_form', { user: req.session.user, headsets });
    } catch (err) {
      console.error(err);
      res.status(500).send("Chyba při načítání headsetů");
    }
  });
  
  router.post('/user/reservation/create', ensureUser, async (req, res) => {
    const { headsetId, reservationDate, duration, voucherCode } = req.body;
  
    try {
      const userId = req.session.user.id;
      const durationMinutes = parseInt(duration);
      const unitPrice = 300 / 30; // 300 Kč / hodina
      const hours = Math.floor(durationMinutes / 60);
      const extraMinutes = durationMinutes % 60;
  
      let finalPrice = durationMinutes * unitPrice;
      let status = 'pending';
      let usesToApply = 0;
      let isVoucherValid = false;
  
      // VYTVOŘENÍ REZERVACE PŘES PROCEDURU
      await db.execute("CALL create_reservation_with_voucher(?, ?, ?, ?, ?)", [
        req.session.user.id,
        headsetId,
        reservationDate,
        duration,
        voucherCode && voucherCode.trim() !== '' ? voucherCode.trim() : null
      ]);        
  
      // Získání reservationID
      const [[{ reservationID }]] = await db.query("SELECT LAST_INSERT_ID() as reservationID");
  
  
      // Načtení rezervace pro potvrzovací stránku
      const [reservation] = await db.query(`
        SELECT * FROM v_user_reservations
        WHERE reservationID = ?
      `, [reservationID]);
  
      res.render('reservation_confirm', {
        user: req.session.user,
        reservation: reservation[0]
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).send("Chyba při vytváření rezervace");
    }
  });
  
  
//Potvrzení rezervace

router.get('/qr/:id', ensureUser, async (req, res) => {
    try {
      const [result] = await db.query(
        "SELECT totalPrice FROM v_user_reservations WHERE reservationID = ? AND userID = ?",
        [req.params.id, req.session.user.id]
      );
  
      if (result.length === 0) return res.status(404).send("Rezervace nenalezena");
  
      const amount = result[0].totalPrice.toFixed(2);
  
      // QR platba
      const paymentText = `SPD*1.0*ACC:CZ1234567890123456789012*AM:${amount}*CC:CZK*MSG:Platba VR rezervace`;
  
      const qrImage = await QRCode.toDataURL(paymentText);
      const img = Buffer.from(qrImage.split(",")[1], 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': img.length
      });
      res.end(img);
    } catch (err) {
      console.error(err);
      res.status(500).send("Chyba při generování QR kódu");
    }
  });

//Vytvoření voucheru

const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };
  
  router.get('/user/voucher/buy', ensureUser, (req, res) => {
    res.render('voucher_form', {
      user: req.session.user,
      error: null
    });
  });
  
  router.post('/user/voucher/buy', ensureUser, async (req, res) => {
    const { maxUses } = req.body;
    const uses = parseInt(maxUses);
    const price = uses * 600.0;
    const code = generateCode();
    const expiration = new Date();
    expiration.setMonth(expiration.getMonth() + 6);
  
    try {
        const isGift = req.body.gift === 'on';
        const userId = isGift ? null : req.session.user.id; 
        
        await db.execute("CALL create_voucher(?, ?, ?, ?)", [
          userId,
          code,
          expiration.toISOString().slice(0, 19).replace('T', ' '),
          uses
        ]);
        
  
      res.render('voucher_confirm', {
        code,
        uses,
        price,
        expiration,
        user: req.session.user
      });
  
    } catch (err) {
      console.error(err);
      res.render('voucher_form', { error: "Chyba při vytváření voucheru" });
    }
  });
  

  router.get('/qr/voucher/:code', ensureUser, async (req, res) => {
    const code = req.params.code;
  
    const [rows] = await db.query(
      "SELECT total FROM (SELECT voucherCode, maxUses * 10.00 AS total FROM voucher) AS t WHERE voucherCode = ?",
      [code]
    );
  
    if (!rows.length) return res.status(404).send("Voucher nenalezen");
  
    const QRCode = require('qrcode');
    const paymentText = `SPD*1.0*ACC:CZ1234567890123456789012*AM:${rows[0].total.toFixed(2)}*CC:CZK*MSG=Voucher ${code}`;
  
    const qr = await QRCode.toDataURL(paymentText);
    const img = Buffer.from(qr.split(',')[1], 'base64');
  
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length
    });
    res.end(img);
  });

//úprava rezervace uživatelem
router.post('/user/reservation/:id/cancel', ensureUser, async (req, res) => {
    const reservationId = req.params.id;
  
    try {
      const [[reservation]] = await db.execute(`
        SELECT reservationDate, status
        FROM reservation
        WHERE reservationID = ? AND userID = ?
      `, [reservationId, req.session.user.id]);
  
      if (!reservation) {
        return res.status(404).send("Rezervace nebyla nalezena.");
      }
  
      if (reservation.status === 'cancelled') {
        return res.status(400).send("Rezervace již byla zrušena.");
      }
  
      const now = new Date();
      const reservationTime = new Date(reservation.reservationDate);
  
      const diffMinutes = (reservationTime - now) / 60000;
  
      if (diffMinutes < 60) {
        return res.status(400).send("Rezervaci nelze zrušit méně než 60 minut předem.");
      }
  
      await db.execute('CALL cancel_reservation(?)', [reservationId]);
      res.redirect('/user');
    } catch (err) {
      console.error(err);
      res.status(500).send('Chyba při rušení rezervace');
    }
  });
  
  
  

module.exports = router;
