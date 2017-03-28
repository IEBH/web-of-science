var _ = require('lodash');
var argy = require('argy');
var async = require('async-chainable');
var base64 = require('hi-base64');
var superagent = require('superagent').agent();
var xmlParser = require('xml-js');

function webOfScience(options) {
	var wos = {};
	wos.settings = _.defaults(options, {
		user: '',
		pass: '',
	});

	/**
	* The currently active session (if any)
	* @var {string}
	*/
	wos.sessionToken;


	/**
	* Attempts to login to the WoS service
	* If the user is already logged in (i.e. wos.sessionToken is set) this function will call the callback with 'false' as the return but no error
	* @param {function} cb The callback, called with (err, result) where result is either false=already logged in or the string value of the session token. Any login errors set the error return
	*/
	wos.login = function(cb) {
		if (wos.sessionToken) return cb(null, false);
		if (!wos.settings.user || !wos.settings.pass) throw new Error('Both "user" and "pass" options are required to login to WoS');

		var encodedToken = base64.encode(wos.settings.user + ':' + wos.settings.pass, true)

		superagent.post('http://search.webofknowledge.com/esti/wokmws/ws/WOKMWSAuthenticate')
			.set('Authorization', 'Basic ' + encodedToken)
			.send(
				'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:auth="http://auth.cxf.wokmws.thomsonreuters.com">' +
					'<soapenv:Header/>' +
					'<soapenv:Body>' +
						'<auth:authenticate/>' +
					'</soapenv:Body>' +
				'</soapenv:Envelope>'
			)
			.end(function(err, res) {
				if (err) return cb(err);
				res.body = xmlParser.xml2js(res.text, {compact: true});

				var authPath = ['soap:Envelope', 'soap:Body', 'ns2:authenticateResponse', 'return', '_text'];

				if (_.has(res.body, authPath)) {
					cb(null, _.get(res.body, authPath))
				} else {
					cb('Failed login: ' + res.text);
				}
			});
	};


	/**
	* Return the cited references of a resource
	* NOTE: to compute the wID use doiToWosID to convert from the more universal DOI
	*
	* The return value of this function is an object containing some meta information + the results array
	*     {meta: {found: Number, searched: Number}, results: Array}
	*
	* Each result is an object containing at least a `wosID` field and any of the following optional fields: `author`, `count`, `volume`, `pages`, `year`, `work`, `hot`
	*
	* @param {string} wosID The WoS resource ID to query
	* @param {object} [options] Optional additional options to pass when querying
	* @param {function} cb The callback, returns (err, results)
	*/
	wos.cited = argy('string [object] function', function(wosID, options, cb) {
		async()
			.then(next => wos.login(next))
			.then('refs', function(next) {
				superagent.post('http://search.webofknowledge.com/esti/wokmws/ws/WokSearch')
					.send(
						'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:woksearch="http://woksearch.v3.wokmws.thomsonreuters.com">' +
							'<soapenv:Header/>' +
							'<soapenv:Body>' +
								'<woksearch:citedReferences>' +
									'<databaseId>WOS</databaseId> ' +
									'<uid>' + wosID + '</uid>' +
									'<queryLanguage>en</queryLanguage>' +
									'<retrieveParameters>' +
										'<firstRecord>1</firstRecord>' +
										'<count>100</count>' +
										'<option>' +
											'<key>Hot</key>' +
											'<value>On</value>' +
										'</option>' +
									'</retrieveParameters>' +
								'</woksearch:citedReferences>' +
							'</soapenv:Body>' +
						'</soapenv:Envelope>'
					)
					.end(function(err, res) {
						if (err) return cb(err);
						res.body = xmlParser.xml2js(res.text, {compact: true});

						var refsPath = ['soap:Envelope', 'soap:Body', 'ns2:citedReferencesResponse', 'return'];
						if (_.has(res.body, refsPath)) {
							var raw = _.get(res.body, refsPath);
							next(null, {
								meta: {
									found: parseInt(raw.recordsFound._text),
									searched: parseInt(raw.recordsSearched._text),
								},
								results: raw.references.map(r => {
									var ref = {
										wosID: r.docid._text,
									};

									[
										{wosField: 'citedAuthor', ourField: 'author', type: 'string'},
										{wosField: 'timesCited', ourField: 'count', type: 'number'},
										{wosField: 'volume', ourField: 'volume', type: 'string'},
										{wosField: 'pages', ourField: 'pages', type: 'string'},
										{wosField: 'year', ourField: 'year', type: 'number'},
										{wosField: 'citedWork', ourField: 'work', type: 'string'},
										{wosField: 'hot', ourField: 'hot', type: 'boolean'},
									].forEach(f => { // Glue optional fields
										if (r[f.wosField]) {
											switch (f.type) {
												case 'string':
													ref[f.ourField] = r[f.wosField]._text;
													break;
												case 'number':
													ref[f.ourField] = parseInt(r[f.wosField]._text);
													break;
												case 'boolean':
													ref[f.ourField] = r[f.wosField]._text == 'yes';
													break;
												default: throw new Error('Unknown conversion type: ' + f.type);
											}
										}
									})

									return ref;
								})
							});
						} else {
							next('No results returned');
						}
					});
			})
			.end(function(err) {
				if (err) return cb(err);
				cb(null, this.refs);
			});
	});

	return wos;
}

module.exports = webOfScience;
