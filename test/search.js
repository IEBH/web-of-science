var expect = require('chai').expect;
var mlog = require('mocha-logger');
var webOfScience = require('..');

describe('search()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));
	before(done => wos.login(done));

	it('should perform a search', function(done) {
		this.timeout(5 * 1000);

		wos.search({
			title: 'Cancer',
			year: 2016,
			foo: 'bar!',
		}, function(err, res) {
			expect(err).to.not.be.ok;
			expect(res).to.be.an.object;
			expect(res).to.have.property('results');

			expect(res).to.have.property('found');
			expect(res.found).to.be.above(0);

			expect(res).to.have.property('searched');
			expect(res.searched).to.be.above(0);

			res.results.forEach(ref => {
				expect(ref).to.have.property('uid');
				expect(ref).to.have.property('title');
				expect(ref).to.have.property('type');
				expect(ref).to.have.property('authors');
				expect(ref.authors).to.be.an.array;
			});

			done();
		});
	});

});
