var expect = require('chai').expect;
var mlog = require('mocha-logger');
var webOfScience = require('..');

describe('getQueryString()', function() {

	var wos;
	before(()=> wos = new webOfScience(require('./config')));

	it('should a query into a query string', function() {
		expect(wos.getQueryString({
			title: 'Example title',
		})).to.equal('TI=(Example title)');

		expect(wos.getQueryString({
			title: 'Example title',
			year: 2017,
		})).to.equal('TI=(Example title) AND PY=(2017)');

		expect(wos.getQueryString({
			title: 'Foo',
			authors: 'J Smith',
		})).to.equal('TI=(Foo) AND AU=(J Smith)');

		expect(wos.getQueryString({
			title: 'Bar',
			authors: ['J Smith', 'J Random'],
		})).to.equal('TI=(Bar) AND AU=(J Smith AND J Random)');
	});

	it('should a query into a query string (with restricted fields)', function() {
		expect(wos.getQueryString({
			title: 'Example title',
			year: 2017,
		}, ['title'])).to.equal('TI=(Example title)');
	});
});
