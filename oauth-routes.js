var oauth2orize = require('oauth2orize');
var oauthServer = require('./oauth');

module.exports = function(app, passport, logger) {

	app.get('/auth/start',oauthServer.authorize(function(applicationID, redirectURI,done) {
		oauthModels.Application.findOne({ oauth_id: applicationID }, function(error, application) {
			if (application) {
				var match = false, uri = url.parse(redirectURI || '');
				for (var i = 0; i < application.domains.length; i++) {
					if (uri.host == application.domains[i] || (uri.protocol == application.domains[i] && uri.protocol != 'http' && uri.protocol != 'https')) {
						match = true;
						break;
					}
				}
				if (match && redirectURI && redirectURI.length > 0) {
					done(null, application, redirectURI);
				} else {
					done(new Error("You must supply a redirect_uri that is a domain or url scheme owned by your app."), false);
				}
			} else if (!error) {
				done(new Error("There is no app with the client_id you supplied."), false);
			} else {
				done(error);
			}
		});
	}),function(req,res){
		var scopeMap = {
			// ... display strings for all scope variables ...
			access_devices: 'access you devices',
			create_devices: 'create new devices'
		};

		res.render('pages/oauth', {
			transaction_id: req.oauth2.transactionID,
			currentURL: encodeURIComponent(req.originalUrl),
			response_type: req.query.response_type,
			errors: req.flash('error'),
			scope: req.oauth2.req.scope,
			application: req.oauth2.client,
			user: req.user,
			map: scopeMap
		});
	});

	app.post('/auth/finish',function(req,res,next) {
		console.log("/auth/finish user: ", req.user);
		console.log(req.body);
		console.log(req.params);
		if (req.user) {
			next();
		} else {
			passport.authenticate('local', {
				session: false
			}, function(error,user,info){
				//console.log("/auth/finish authenting");
				if (user) {
					//console.log(user.username);
					req.user = user;
					next();
				} else if (!error){
					//console.log("not authed");
					req.flash('error', 'Your email or password was incorrect. Please try again.');
					res.redirect(req.body['auth_url'])
				}
	 		})(req,res,next);
		}
	}, oauthServer.decision(function(req,done){
		//console.log("decision user: ", req);
		done(null, { scope: req.oauth2.req.scope });
	}));

	app.post('/auth/exchange',function(req,res,next){
		var appID = req.body['client_id'];
		var appSecret = req.body['client_secret'];

		oauthModels.Application.findOne({ oauth_id: appID, oauth_secret: appSecret }, function(error, application) {
			if (application) {
				req.appl = application;
				next();
			} else if (!error) {
				error = new Error("There was no application with the Application ID and Secret you provided.");
				next(error);
			} else {
				next(error);
			}
		});
	}, oauthServer.token(), oauthServer.errorHandler());
}