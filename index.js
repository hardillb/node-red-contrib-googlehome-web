var fs = require('fs');
var url = require('url');
var rfs = require('rotating-file-stream');
var http = require('http');
var path = require('path');
var https = require('https');
var flash = require('connect-flash');
var morgan = require('morgan');
var express = require('express');
var session = require('express-session');
var passport = require('passport');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var BasicStrategy = require('passport-http').BasicStrategy;
var LocalStrategy = require('passport-local').Strategy;
var SimpleNodeLogger = require('simple-node-logger');

var loggingOptions = {
	logDirectory: 'log',
	fileNamePattern:'debug-<DATE>.log',
	timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS',
	dateFormat:'YYYY.MM.DD'
};

var logger = SimpleNodeLogger.createRollingFileLogger(loggingOptions);

var port = (process.env.VCAP_APP_PORT || process.env.PORT || 3000);
var host = (process.env.VCAP_APP_HOST || '0.0.0.0');
var mongo_url = (process.env.MONGO_URL || 'mongodb://localhost:27017/assistant');

var mqtt_url = (process.env.MQTT_URL || 'mqtt://localhost:1883');
var mqtt_user = (process.env.MQTT_USER || undefined);
var mqtt_password = (process.env.MQTT_PASSWORD || undefined);
console.log(mqtt_url);

mqtt_url = url.parse(mqtt_url);

var mqttOptions = {
	reconnectPeriod: 3000,
	keepAlive: 10,
	clean: true,
	clientId: 'homeApp_' + Math.random().toString(16).substr(2, 8),
	host: mqtt_url.hostname,
	port: mqtt_url.port,
	protocol: mqtt_url.protocol
};

if (mqtt_user) {
	mqttOptions.username = mqtt_user;
	mqttOptions.password = mqtt_password;
}

var app_id = 'https://localhost:' + port;

if (process.env.VCAP_APPLICATION) {
	var application = JSON.parse(process.env.VCAP_APPLICATION);

	var app_uri = application['application_uris'][0];

	app_id = 'https://' + app_uri;
}

console.log(mongo_url);
mongoose.Promise = global.Promise;
var mongoose_options = {
	server: {
		auto_reconnect:true,
		autoReconnect: true,
		reconnectTries: Number.MAX_VALUE,
		reconnectInterval: 1000,
		socketOptions: {
			autoReconnect: true
		}
	}
};
var mongoose_connection = mongoose.connection;
mongoose.connect(mongo_url, mongoose_options);

var Account = require('./models/account');
var oauthModels = require('./models/oauth');
var Topics = require('./models/topics');

Account.findOne({username: mqtt_user}, function(error, account){
	if (!error && !account) {
		Account.register(new Account({username: mqtt_user, email: '', mqttPass: '', superuser: 1}),
			mqtt_password, function(err, account){

			var topics = new Topics({topics: [
					'command/' +account.username+'/#', 
					'presence/' + account.username + '/#',
					'response/' + account.username + '/#'
				]});
			topics.save(function(err){
				if (!err){

					var s = Buffer.from(account.salt, 'hex').toString('base64');
					var h = Buffer.from(account.hash, 'hex').toString(('base64'));

					var mqttPass = "PBKDF2$sha256$901$" + account.salt + "$" + account.hash;

					Account.update(
						{username: account.username}, 
						{$set: {mqttPass: mqttPass, topics: topics._id}}, 
						{ multi: false },
						function(err, count){
							if (err) {
								console.log(err);
							}
						}
					);
				}
			});
		});
	} else {
		console.log("MQTT account already exists");
	}
});

//Should be passed in as a env var
var cookieSecret = 'ihytsrf334';

var logDirectory = path.join(__dirname, 'log');
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

var accessLogStream = rfs('access.log', {
  interval: '1d', // rotate daily
  compress: 'gzip', // compress rotated files
  maxFiles: 30,
  path: logDirectory
});

var app = express();

app.set('view engine', 'ejs');
app.enable('trust proxy');
app.use(morgan("combined", {stream: accessLogStream}));
app.use(cookieParser(cookieSecret));
app.use(flash());
app.use(session({
  // genid: function(req) {
  //   return genuuid() // use UUIDs for session IDs
  // },
  secret: cookieSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
  	secure: true
  }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());
app.use(passport.session());

function requireHTTPS(req, res, next) {
	if (req.get('X-Forwarded-Proto') === 'http') {
        //FYI this should work for local development as well
        var url = 'https://' + req.get('host');
        if (req.get('host') === 'localhost') {
        	url += ':' + port;
        }
        url  += req.url;
        return res.redirect(url); 
    }
    next();
}

//app.use(requireHTTPS);

passport.use(new LocalStrategy(Account.authenticate()));
passport.use(new BasicStrategy(Account.authenticate()));

passport.serializeUser(Account.serializeUser());
passport.deserializeUser(Account.deserializeUser());

app.use('/',express.static('static'));

app.get('/',function(req,res){
	res.render('pages/index',{user: req.user, home: true, message: req.flash('error')});
});

app.get('/:page',function(req,res,next){
	var opts = {
		user: req.user, 
		message: req.flash('error')
	};
	opts[req.params.page] = true;
	try {
		res.render('pages/' + req.params.page, opts);
	} catch (err) {
		err.status = 404;
		next(err);
	}
});

require('./admin-routes.js')(app, passport, logger);
require('./user-routes.js')(app, passport, logger);
require('./oauth-routes.js')(app, passport, logger);
require('./action-route.js')(app, passport, mqttOptions, logger);
require('./api.js')(app,passport);

app.use(function (err, req,res,next){
	if (err.status !== 404) {
		return next();
	}
	res.status(404);
	res.send("File Not Found");
});


var server = http.Server(app);
if (app_id.match(/^https:\/\/localhost:/)) {
	var options = {
		key: fs.readFileSync('server.key'),
		cert: fs.readFileSync('server.crt')
	};
	server = https.createServer(options, app);
} 


server.listen(port, host, function(){
	console.log('App listening on  %s:%d!', host, port);
	console.log("App_ID -> %s", app_id);

	setTimeout(function(){
		//started?
	},5000);
	
	
	
});