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
	* Convert a DOI into a Web of Science ID
	* WOS ID's are prefixed with an optional 'WOS:'
	* @param {string} doi The DOI to convert
	* @param {Object} options Optional options to use
	* @param {funtion} cb The callback fired with (err, wosID)
	*/
	wos.doiToWosID = argy('string [object] function', function(doi, options, cb) {
		superagent.post('https://ws.isiknowledge.com/cps/xrpc')
			.send(
				'<?xml version="1.0" encoding="UTF-8" ?>' +
				'<request xmlns="http://www.isinet.com/xrpc42" src="app.id=API Demo">' +
					'<fn name="LinksAMR.retrieve">' +
						'<list>' +
							'<map>   ' +
								'<val name="username">' + wos.settings.user + '</val>' +
								'<val name="password">' + wos.settings.pass + '</val>' +
							'</map>' +
							'<map>' +
								'<list name="WOS">' +
									'<val>doi</val>' +
									'<val>ut</val>' +
								'</list>' +
							'</map>' +
							'<map>' +
								'<map name="cite_1">' +
									'<val name="doi">' + doi + '</val>' +
								'</map>' +
							'</map>' +
						'</list>' +
					'</fn>' +
				'</request>'
			)
			.end(function(err, res) {
				if (err) return cb(err);
				res.body = xmlParser.xml2js(res.text, {compact: true});
				var dataPath = ['response', 'fn', 'map', 'map', 'map', 'val'];
				if (!_.has(res.body, dataPath)) return cb('No wosID found');

				cb(null, 'WOS:' + _.get(res.body, dataPath).filter(i => i._attributes.name == 'ut')[0]._text);
			});
	});


	/**
	* Convert a Web of Science ID into a DOI
	* WOS ID's are prefixed with an optional 'WOS:'
	* @param {string} wosID The wosID to convert
	* @param {Object} options Optional options to use
	* @param {funtion} cb The callback fired with (err, doi)
	*/
	wos.wosIDToDoi = argy('string [object] function', function(wosID, options, cb) {
		superagent.post('https://ws.isiknowledge.com/cps/xrpc')
			.send(
				'<?xml version="1.0" encoding="UTF-8" ?>' +
				'<request xmlns="http://www.isinet.com/xrpc42" src="app.id=API Demo">' +
					'<fn name="LinksAMR.retrieve">' +
						'<list>' +
							'<map>   ' +
								'<val name="username">' + wos.settings.user + '</val>' +
								'<val name="password">' + wos.settings.pass + '</val>' +
							'</map>' +
							'<map>' +
								'<list name="WOS">' +
									'<val>doi</val>' +
									'<val>ut</val>' +
								'</list>' +
							'</map>' +
							'<map>' +
								'<map name="cite_1">' +
									'<val name="ut">' + wosID + '</val>' +
								'</map>' +
							'</map>' +
						'</list>' +
					'</fn>' +
				'</request>'
			)
			.end(function(err, res) {
				if (err) return cb(err);
				res.body = xmlParser.xml2js(res.text, {compact: true});
				var dataPath = ['response', 'fn', 'map', 'map', 'map', 'val'];
				if (!_.has(res.body, dataPath)) return cb('No wosID found');

				cb(null, _.get(res.body, dataPath).filter(i => i._attributes.name == 'doi')[0]._text);
			});
	});


	/**
	* Return the cited references of a resource (i.e. the papers THIS paper has as citations)
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


	/**
	* Return the citing references of a resource (i.e. papers that have THIS paper as a citation)
	* This function is the reverse loookup of wos.cited()
	* NOTE: While at first glance this function and wos.cited() appear to be similar they work entirely differently and return different data
	*
	* The return value of this function is an object containing some meta information + the results array
	*     {meta: {found: Number, searched: Number}, results: Array}
	*
	* Each result has the keys `wosID`, `title`, `authors` and `publisher`
	*
	* @param {string} wosID The WoS resource ID to query
	* @param {object} [options] Optional additional options to pass when querying
	* @param {function} cb The callback, returns (err, results)
	*/
	wos.citing = argy('string [object] function', function(wosID, options, cb) {
		async()
			.then(next => wos.login(next))
			.then('refs', function(next) {
				superagent.post('http://search.webofknowledge.com/esti/wokmws/ws/WokSearch')
					.send(
						'<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:woksearch="http://woksearch.v3.wokmws.thomsonreuters.com">' +
							'<soapenv:Header/>' +
							'<soapenv:Body>' +
								'<woksearch:citingArticles>' +
									'<databaseId>WOS</databaseId> ' +
									'<uid>' + wosID + '</uid>' +
									'<queryLanguage>en</queryLanguage>' +
									'<retrieveParameters>' +
										'<firstRecord>1</firstRecord>' +
										'<count>100</count>' +
										'<option>' +
											'<key>RecordIDs</key>' +
											'<value>On</value>' +
										'</option>' +
									'</retrieveParameters>' +
								'</woksearch:citingArticles>' +
							'</soapenv:Body>' +
						'</soapenv:Envelope>'
					)
					.end(function(err, res) {
						if (err) return cb(err);
						res.body = xmlParser.xml2js(res.text, {compact: true});

						var refsPath = ['soap:Envelope', 'soap:Body', 'ns2:citingArticlesResponse', 'return'];
						if (_.has(res.body, refsPath)) {
							var raw = _.get(res.body, refsPath);

							// For reasons of utter insanity WoS returns its result set as an encoded text BLOB which needs to be broken back into XML
							// I can only assume the people who thought this was a good idea have now been thoroughly beaten with their own shoes - MC 2017-04-11
							raw.references = xmlParser.xml2js(raw.records._text, {compact: true}).records.REC;

							next(null, {
								meta: {
									found: parseInt(raw.recordsFound._text),
									searched: parseInt(raw.recordsSearched._text),
								},
								results: raw.references.map(r => {
									try {
										var ref = {
											wosID: r.UID._text,
											title: r.static_data.summary.titles.title.filter(t => t._attributes.type == 'item')[0]._text,
											authors: _.get(r, 'static_data.summary.names.name.full_name._text') || r.static_data.summary.names.name.map(n => n.full_name._text),
											publisher: r.static_data.summary.publishers.publisher.names.name.full_name._text,
										};
									} catch (e) {
										console.log('FAIL - ', e, 'FOR', r);
										debugger;
									}
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
