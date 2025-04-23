module.exports = {
  ensureUser: (req, res, next) => {
    if (req.session && req.session.user) {
      return next();
    }
    res.redirect('/login');
  },

  ensureAdmin: (req, res, next) => {
    if (
      req.session &&
      req.session.user &&
      req.session.user.userType === 'admin'
    ) {
      return next();
    }
    res.status(403).send('Přístup zakázán');
  }
};
