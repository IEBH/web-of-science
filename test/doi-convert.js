var expect = require('chai').expect;
var mlog = require('mocha-logger');
var webOfScience = require('..');

describe('doiToWosID()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));

	it('should convert a DOI into a WosID', function(done) {
		this.timeout(5 * 1000);

		wos.doiToWosID('10.3322/caac.20107', function(err, wosID) {
			expect(err).to.not.be.ok;
			expect(wosID).to.be.a.string;
			expect(wosID).to.be.equal('WOS:000288278400004');
			done();
		});
	});

});

describe('wosIDToDoi()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));


	it('should convert a WosID into a DOI', function(done) {
		this.timeout(5 * 1000);

		wos.wosIDToDoi('000288278400004', function(err, wosID) {
			expect(err).to.not.be.ok;
			expect(wosID).to.be.a.string;
			expect(wosID).to.be.equal('10.3322/caac.20107');
			done();
		});
	});


	it('should work with a `WOS:` prefix', function(done) {
		this.timeout(5 * 1000);

		wos.wosIDToDoi('WOS:000288278400004', function(err, wosID) {
			expect(err).to.not.be.ok;
			expect(wosID).to.be.a.string;
			expect(wosID).to.be.equal('10.3322/caac.20107');
			done();
		});
	});

});
