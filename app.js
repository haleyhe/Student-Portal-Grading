var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var bodyParser = require('body-parser');

var index = require('./routes/index');
var login = require('./routes/login');
var users = require('./routes/users');
var group = require('./routes/group');
var assignment = require('./routes/assignment');
var worker = require('./routes/worker');
var angular = require('./routes/angular-front');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(session);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/', login);
app.use('/users', users);
app.use('/group', group);
app.use('/assignment', assignment);
app.use('/worker', worker);
app.use(function(err, req, res, next) {
    if(req.app.get('env') === 'development'){
        res.status(500).send({status: false, reason: err.message});
    }else{
        res.status(500).send({status: false, reason: "Server Error"});
    }
    if(err.constructor.name !== 'UserError') console.error(err);
});
app.use('/', angular); // this has to be the last route

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  let err = new UserError('Not Found');
  err.status = 404;
  res.status(404).send("Not Found");
});

// error handler
app.use(function(err, req, res, next) {
  if(req.app.get('env') === 'development'){
      res.locals.message = err.message;
      res.locals.error = err;
  }else{
      res.locals.message = 'Server Error';
      res.locals.error = {};
  }

  // render the error page
  res.status(err.status || 500);
  res.render('error');

  if(err.constructor.name !== 'UserError') console.error(err);
});

module.exports = app;
