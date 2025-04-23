const express = require('express');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const secureRouter = require('./routes/secure');
const apiRoutes = require('./routes/api');

dotenv.config();

const app = express();

app.use(session({
  secret: 'tajny_retezec',
  resave: false,
  saveUninitialized: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use('/', indexRouter);
app.use('/', authRouter);
app.use('/', secureRouter);

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
