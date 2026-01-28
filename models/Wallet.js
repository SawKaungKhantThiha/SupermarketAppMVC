const db = require('../db');

const ensureWalletSql = `
  INSERT INTO wallets (userId, balance, updatedAt)
  VALUES (?, 0, NOW())
  ON DUPLICATE KEY UPDATE updatedAt = updatedAt
`;

const getBalanceSql = 'SELECT balance FROM wallets WHERE userId = ? LIMIT 1';
const lockBalanceSql = 'SELECT balance FROM wallets WHERE userId = ? FOR UPDATE';

const getNumber = (value) => Number(Number(value || 0).toFixed(2));

const Wallet = {
  getBalance(userId, callback) {
    db.query(ensureWalletSql, [userId], (err) => {
      if (err) return callback(err);
      db.query(getBalanceSql, [userId], (err, rows) => {
        if (err) return callback(err);
        const balance = rows && rows[0] ? Number(rows[0].balance) : 0;
        return callback(null, getNumber(balance));
      });
    });
  },

  credit(userId, amount, reference, type, callback) {
    const safeAmount = getNumber(amount);
    const entryType = type || 'topup';
    if (safeAmount <= 0) return callback(new Error('Invalid wallet credit amount.'));

    db.beginTransaction((err) => {
      if (err) return callback(err);
      const rollback = (error) => db.rollback(() => callback(error));

      db.query(ensureWalletSql, [userId], (err) => {
        if (err) return rollback(err);

        if (reference) {
          const checkSql = 'SELECT id FROM wallet_transactions WHERE reference = ? LIMIT 1';
          db.query(checkSql, [reference], (err, rows) => {
            if (err) return rollback(err);
            if (rows && rows.length) {
              return db.commit((err) => {
                if (err) return rollback(err);
                return callback(null, { alreadyProcessed: true });
              });
            }
            return creditLocked();
          });
        } else {
          return creditLocked();
        }
      });

      const creditLocked = () => {
        db.query(lockBalanceSql, [userId], (err, rows) => {
          if (err) return rollback(err);
          const current = rows && rows[0] ? Number(rows[0].balance) : 0;
          const next = getNumber(current + safeAmount);
          const updateSql = 'UPDATE wallets SET balance = ?, updatedAt = NOW() WHERE userId = ?';
          db.query(updateSql, [next, userId], (err) => {
            if (err) return rollback(err);
            const insertSql = `
              INSERT INTO wallet_transactions (userId, type, amount, reference, createdAt)
              VALUES (?, ?, ?, ?, NOW())
            `;
            db.query(insertSql, [userId, entryType, safeAmount, reference || null], (err) => {
              if (err) return rollback(err);
              db.commit((err) => {
                if (err) return rollback(err);
                return callback(null, { balance: next });
              });
            });
          });
        });
      };
    });
  },

  charge(userId, amount, reference, callback) {
    const safeAmount = getNumber(amount);
    if (safeAmount <= 0) return callback(new Error('Invalid wallet charge amount.'));

    db.beginTransaction((err) => {
      if (err) return callback(err);
      const rollback = (error) => db.rollback(() => callback(error));

      db.query(ensureWalletSql, [userId], (err) => {
        if (err) return rollback(err);

        if (reference) {
          const checkSql = 'SELECT id FROM wallet_transactions WHERE reference = ? LIMIT 1';
          db.query(checkSql, [reference], (err, rows) => {
            if (err) return rollback(err);
            if (rows && rows.length) {
              return db.commit((err) => {
                if (err) return rollback(err);
                return callback(null, { alreadyProcessed: true });
              });
            }
            return chargeLocked();
          });
        } else {
          return chargeLocked();
        }
      });

      const chargeLocked = () => {
        db.query(lockBalanceSql, [userId], (err, rows) => {
          if (err) return rollback(err);
          const current = rows && rows[0] ? Number(rows[0].balance) : 0;
          if (current < safeAmount) {
            const insufficient = new Error('Insufficient wallet balance.');
            insufficient.code = 'INSUFFICIENT_FUNDS';
            return rollback(insufficient);
          }
          const next = getNumber(current - safeAmount);
          const updateSql = 'UPDATE wallets SET balance = ?, updatedAt = NOW() WHERE userId = ?';
          db.query(updateSql, [next, userId], (err) => {
            if (err) return rollback(err);
            const insertSql = `
              INSERT INTO wallet_transactions (userId, type, amount, reference, createdAt)
              VALUES (?, 'payment', ?, ?, NOW())
            `;
            db.query(insertSql, [userId, safeAmount, reference || null], (err) => {
              if (err) return rollback(err);
              db.commit((err) => {
                if (err) return rollback(err);
                return callback(null, { balance: next });
              });
            });
          });
        });
      };
    });
  }
};

module.exports = Wallet;
