var expect = require('chai').expect;
var mlog = require('mocha-logger');
var webOfScience = require('..');

describe('cited()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));

	it('should get a list of papers cited (using docs example paper wosID)', function(done) {
		this.timeout(10 * 1000);

		wos.cited('WOS:000270372400005', function(err, res) {
			expect(err).to.not.be.ok;

			expect(res).to.have.property('meta');
			expect(res.meta).to.be.an.object;
			expect(res.meta).to.have.property('found');
			expect(res.meta.found).to.be.a.number;
			expect(res.meta.found).to.be.at.least(88); // As of 2017-03-28

			expect(res.meta).to.have.property('searched');
			expect(res.meta.searched).to.be.a.number;
			expect(res.meta.searched).to.be.at.least(227821310); // As of 2017-03-28

			expect(res.results).to.be.an.array;
			res.results.forEach(row => {
				expect(row).to.have.property('wosID');
				expect(row.wosID).to.be.a.string;

				if (row.author) expect(row.author).to.be.a.string;
				if (row.count) expect(row.count).to.be.a.number;
				if (row.year) {
					expect(row.year).to.be.a.number;
					expect(row.year).to.be.at.least(1700);
				}
				if (row.volume) expect(row.year).to.be.a.string;
				if (row.work) expect(row.year).to.be.a.string;
				if (row.hot) expect(row.hot).to.be.a.boolean;
			});

			done();
		});
	});

});
