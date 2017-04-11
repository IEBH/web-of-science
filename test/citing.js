var expect = require('chai').expect;
var mlog = require('mocha-logger');
var webOfScience = require('..');

describe('wos.citing()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));

	it('should get a list of papers cited (using docs example paper wosID)', function(done) {
		this.timeout(10 * 1000);

		wos.citing('WOS:000270372400005', function(err, res) {
			expect(err).to.not.be.ok;

			expect(res).to.have.property('meta');
			expect(res.meta).to.be.an.object;
			expect(res.meta).to.have.property('found');
			expect(res.meta.found).to.be.a.number;
			expect(res.meta.found).to.be.at.least(17); // As of 2017-04-11

			expect(res.meta).to.have.property('searched');
			expect(res.meta.searched).to.be.a.number;
			expect(res.meta.searched).to.be.at.least(64127317); // As of 2017-04-11

			expect(res.results).to.be.an.array;
			res.results.forEach(row => {
				expect(row).to.have.property('wosID');
				expect(row.wosID).to.be.a.string;

				if (row.title) expect(row.title).to.be.a.string;
				if (row.authors) expect(row.authors).to.be.an.array;
				if (row.publisher) expect(row.publisher).to.be.a.string;
			});

			done();
		});
	});

});
