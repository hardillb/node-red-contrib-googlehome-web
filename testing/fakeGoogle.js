const http = require('http')
const morgan = require('morgan')
const express = require('express')
const request = require('request')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var port = (process.env.VCAP_APP_PORT || process.env.PORT || 3001);
var host = (process.env.VCAP_APP_HOST || '0.0.0.0');

var app_id = 'http://localhost:' + port;

var app = express()

app.set('view engine', 'ejs')
app.enable('trust proxy')
app.use(morgan("combined"))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }))

app.post('/requestSync', function(req,res,next){
	var body = req.body;
	console.log(body);
	request({
		url: "https://localhost:3000/action",
		method: "POST",
		json: {
		  "requestId": "ff36a3cc-ec34-11e6-b1a0-64510650abcf",
		  "inputs": [{
		    "intent": "action.devices.SYNC"
		  }]
		},
		headers: {
			Authorization: "Bearer 4bFKvVSCPxneduqUc0R1bV5A2cLB7iqkCU4EM1MLNyCQICIy4552SMKDGKWnb0ioKb5KyZX5QCBv1sTiA2oKKOFtbfppCWD6V4r5Iqg01aKg0v5FeBurQWPUOwyb"
		}
	}, function (err, resp, body){
		console.log("Sync: %j", body);	
	})
	res.send({});
})


app.post('/reportState', function(req,res,next){
	console.log(JSON.stringify(req.body,null,2));
	res.send({});
});

var server = http.Server(app)

server.listen(port, host, function(){
	console.log('App listening on  %s:%d!', host, port);
	console.log("App_ID -> %s", app_id);
})
