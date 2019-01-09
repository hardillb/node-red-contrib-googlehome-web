var mongoose = require('mongoose');
var AutoIncrement = require('mongoose-sequence');
var Schema = mongoose.Schema;

var State = new Schema({
	device: { type: Schema.Types.ObjectId, ref: 'Device' },
	state: {type: Schema.Types.Mixed}
});

State.set('toObject', {getters: true});
State.set('toJSON', {getters: true});

module.exports = mongoose.model('State', State);
