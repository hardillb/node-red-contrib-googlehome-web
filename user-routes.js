const Account = require('./models/account');
const Topics = require('./models/topics');
const Devices = require('./models/device');
const Oauth = require('./models/oauth');
const request = require('request');
const ObjectId = require('mongoose').Types.ObjectId;

const mailer = require('./sendemail');

module.exports = function(app, passport, logger) {

	const API_KEY = (process.env.API_KEY);
	const SYNC_URL = (process.env.SYNC_URL || "https://homegraph.googleapis.com/v1/devices:requestSync?key=" + API_KEY);

	app.get('/login', function(req,res){
		res.render('pages/login',{user: req.user, message: req.flash('error')});
	});

	app.post('/login', 
		passport.authenticate('local', {failureRedirect: '/login',failureFlash: true, session: true }),
		function(req,res){
			if (req.query.next) {
				res.reconnect(req.query.next);
			} else {
				res.redirect('/user/devices');
			}
		}
	);

	app.get('/logout', function(req,res){
		req.logout();
		if (req.query.next) {
			console.log(req.query.next);
			res.redirect(req.query.next);
		} else {
			res.redirect('/');
		}
	});

	app.post('/register', function(req,res){
		Account.register(new Account({ username : req.body.username, email: req.body.email, mqttPass: "foo" }), req.body.password, function(err, account) {
			if(err) {
				res.status(500).send(err.message);
			}

			var topics = new Topics({topics: [
				'command/' + account.username +'/#', 
				'presence/'+ account.username + '/#',
				'response/' + account.username + '/#'
			]});
			topics.save(function(err){
				if (!err) {
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
				} else {
					res.status(500).send(err.message);
				}
			});
			passport.authenticate('local')(req, res, function () {
				console.log("created new user %s", req.body.username);
				// measurement.send({
				// 	t:'event', 
				// 	ec:'System', 
				// 	ea: 'NewUser',
				// 	uid: req.body.username
				// });
	            res.status(201).send();
	        });
		});
	});

	app.get('/user/verifyEmail', function(req,res){
	})

	app.get('/user/lostPassword', function(req, res){
		res.render('pages/lostPassword', { user: req.user});
	})

	app.post('/user/lostPassword', function(req, res, next){
		var email = req.body.email;
		Account.findOne({email: email}, function(error, user){
			if (!error){
				if (user){
					var lostPassword = new LostPassword({user: user});
					lostPassword.save(function(err){
						if (!err) {
							res.status(200).send();
						}
						var body = mailer.buildLostPasswordBody(lostPassword.uuid, lostPassword.user.username);
						mailer.send(email, 'alexa-node-red@hardill.me.uk', 'Password Reset for Alexa Node-RED', body.text, body.html);
					});
				} else {
					res.status(404).send("No user found with that email address");
				}
			}
		});
	});

	app.get('/user/api/devices',
		passport.authenticate(['basic'], { session: false }),
		function (req,res){
			var user = req.user.username;

			Devices.find({username:user}, function(err, data){
				if (!err) {
					logger.debug(data);
					res.send(data);
				} else {
					res.status(500);
					res.send();
				}
			});
		});


	app.get('/user/devices', 
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;

			Devices.find({username:user}, function(err, data){
				if (!err) {
					logger.debug(data);
					res.render('pages/devices',{user: req.user ,devices: data, devs: true});
				}
			});
		}
	);

	app.put('/user/devices',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var device = req.body;

			device.username = user;
			var dev = new Devices(device);
			dev.save(function(err,data){
				if(!err) {
					res.status(201);
					res.send(data);
					triggerSync(req.user._id);
				} else {
					res.status(500);
					res.send(err);
				}
			});
		}
	);

	app.post('/user/devices/:dev_id',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var id = req.params.dev_id;
			var device = req.body;
			if (user === device.username) {
				Devices.findOne({_id: id, username: user},
					function( err, data) {
						if (err) {
							logger.debug(err);
							res.status(500);
							res.send(err);
						} else {
							data.type = device.type;
							data.traits = device.traits;
							data.attributes = device.attributes;
							data.roomHint = device.roomHint;
							data.save(function(err, d) {
								res.status(201);
								res.send(d);
								triggerSync(req.user._id);
							});
						}
					}
				)
			}
		}
	);

	app.delete('/user/devices/:dev_id',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var id = req.params.dev_id;
			Devices.remove({_id: id, username: user },
				function(err) {
					if (err) {
						console.log(err);
						res.status(500);
						res.send(err);
					} else {
						res.status(202);
						res.send();
						triggerSync(req.user._id);
					}
				}
			);
		}
	);

	function ensureAuthenticated(req,res,next) {
		if (req.isAuthenticated()) {
	    	return next();
		} else {
			res.redirect('/login');
		}
	}

	function triggerSync(userAgentId) {
		// make HTTP call
		//need to check if currently live
		Oauth.AccessToken.find({user: new ObjectId(userAgentId)},function(err, data){
			if (!err && data.length > 0) {
				request(
					{
						url: SYNC_URL,
						method: "POST",
						json: {
							agentUserId: userAgentId
						}
					},
					function(err, resp, body) {
						if (!err) {
							logger.debug("trigger sync for ", userAgentId, " ",  resp && resp.statusCode)
						} else {
							logger.debug("error triggering sync for ", userAgentId, " ", err);
						}
					}
				);
			}
		});
	}

}