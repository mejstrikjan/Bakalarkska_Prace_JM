const express = require('express');
const router = express.Router();
const db = require('../db/connection'); 

router.get('/reservations/:date', async (req, res) => {
  const date = req.params.date;

  try {
    const [rows] = await db.query(`
      SELECT rh.headsetID, TIME(r.reservationDate) AS time, r.durationMinutes
      FROM reservation r
      JOIN reservation_headset rh ON r.reservationID = rh.reservationID
      WHERE DATE(r.reservationDate) = ?
      AND r.status != 'cancelled'
    `, [date]);

    const result = {};

    rows.forEach(row => {
      const headsetId = row.headsetID;
      const start = row.time.substring(0, 5); 
      const duration = row.durationMinutes;

      const startHour = parseInt(start.split(':')[0]);
      const startMin = parseInt(start.split(':')[1]);
      const slotCount = duration / 30;

      const slots = [];
      for (let i = 0; i < slotCount; i++) {
        const minutes = startHour * 60 + startMin + (i * 30);
        const h = Math.floor(minutes / 60).toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        slots.push(`${h}:${m}`);
      }

      if (!result[headsetId]) result[headsetId] = [];
      result[headsetId].push(...slots);
    });

    res.json({ headsets: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Chyba při načítání slotů' });
  }
});

router.get('/validate-voucher/:code/:minutes', async (req, res) => {
  const { code, minutes } = req.params;
  const duration = parseInt(minutes);
  const unitPrice = 10.00;

  if (!code || isNaN(duration) || duration <= 0) {
    return res.json({ valid: false });
  }

  try {
    const [rows] = await db.query(`
      SELECT maxUses, usedCount
      FROM voucher
      WHERE voucherCode = ?
        AND expirationDate > NOW()
    `, [code]);

    if (rows.length === 0) {
      return res.json({ valid: false });
    }

    const voucher = rows[0];
    const availableHours = voucher.maxUses - voucher.usedCount;
    const usableMinutes = Math.min(availableHours * 60, duration);
    const remainingMinutes = duration - usableMinutes;
    const remainingPrice = remainingMinutes * unitPrice;

    return res.json({
      valid: usableMinutes > 0,
      discountHours: Math.floor(usableMinutes / 60),
      remainingPrice
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false });
  }
});


module.exports = router;
