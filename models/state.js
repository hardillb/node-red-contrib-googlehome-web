var mongoose = require('mongoose');
var AutoIncrement = require('mongoose-sequence');
var Schema = mongoose.Schema;

var stateLife = 60 * 24 * 90 * 60000;

var State = new Schema({
	device: { type: Number },
	state: {type: Schema.Types.Mixed},
	updated: {
		type: Date,
		default: function(){
			return new Date();
		},
		expires: stateLife
	}
});

State.set('toObject', {getters: true});
State.set('toJSON', {getters: true});

module.exports = mongoose.model('State', State);
