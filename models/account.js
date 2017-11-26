var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var passportLocalMongoose = require('passport-local-mongoose');

var Account = new Schema({
    username: String,
    password: String,
    agentUserId: {type: Number, get: function(value){
        return value.toString();
    }},
    email: String,
    validated: { type: Boolean, default: false},
    mqttPass: { type: String, default: '' },
    superuser: { type: Number, default: 0},
    topics: { type: Number},
    created: { type: Date, default: function(){
        return new Date();
    }}
});

var options = {
	usernameUnique: true,
	saltlen: 12,
	keylen: 24,
	iterations: 901,
	encoding: 'base64'
};

Account.plugin(passportLocalMongoose,options);
Account.set('toObject', {getters: true});
Account.set('toJSON', {getters: true});

module.exports = mongoose.model('Account', Account);
