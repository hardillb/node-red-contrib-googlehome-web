const fs = require("fs");
const jwt = require('jsonwebtoken');
const request = require('request');

var file = fs.readFileSync("./Node-RED-c27b500a47b4.json");
var secrets = JSON.parse(file);

var tokenPayload = {
	iat: new Date().getTime()/1000,
	exp: new Date().getTime()/1000 + 3600,
	aud: "https://accounts.google.com/o/oauth2/token",
	iss: secrets.client_email,
	scope: "https://www.googleapis.com/auth/homegraph"
}

console.log(tokenPayload);

var cert = secrets.private_key;

var token = jwt.sign(tokenPayload, cert, { algorithm: 'RS256'});

request.post({
	url: 'https://accounts.google.com/o/oauth2/token',
	form: {
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion: token
		}
	},
	function(err,httpResp,body){
		if (err) {
			console.log(err)
		} else {
			var oAuthToken = JSON.parse(body)
			var payload = {
		  "agentUserId": "5a242f2c80ee0155662642c0",
		  "payload": {
			    "devices": {
			      "states": {
			        "35": {
			          "on": true,
			          "brightness": 50,
			          "color": {
			          	"name": "blue",
			          	"spectrumRgb": 255
			          }
			        }
			        // "45": {
			        // 	"on": true,
			        // 	"currentFanSpeedSetting": "Low"
			        // }
			      }
			    }
			  }
			}
			console.log(body);
			console.log(JSON.stringify(payload,null,3))
			request({
				url: "https://homegraph.googleapis.com/v1/devices:reportStateAndNotification",
				method: 'POST',
				headers:{
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + oAuthToken.access_token,
					'X-GFE-SSL': 'yes'
				},
				json: payload
			},
			function(err, resp, body){
				console.log(err);
				console.log(body);
			});
		}
	}
)