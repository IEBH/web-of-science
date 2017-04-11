var expect = require('chai').expect;
var mlog = require('mocha-logger');
var webOfScience = require('..');

describe('login()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));

	it('should login', function(done) {
		wos.login(function(err, session) {
			expect(err).to.not.be.ok;
			expect(session).to.be.a.string;
			mlog.log('session token:', session);
			done();
		});
	});

});
