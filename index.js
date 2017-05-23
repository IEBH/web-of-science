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
	* WARNING: The results from cite / cited are NOT WOS ID's even they they look like them.
	*          They are some weird internal code and cannot be conveted driectly. Instead us wos.wosTitleToDoi as a workaround
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

				var data = _.get(res.body, dataPath);
				if (data._text) return cb(data._text);
				cb(null, data.filter(i => i._attributes.name == 'doi')[0]._text);
			});
	});


	/**
	* Generate a WoS query string from given parameters
	* @param {Object|string} q The reference to search for. If this is already a string, it is returned as-is
	* @param {string} [q.title]
	* @param {number|string} [q.year]
	* @param {number|string} [q.volume]
	* @param {string} [q.isbn]
	* @param {array} [fieldLimtied] Fields to limit the incomming reference to (equivelent of `_.omit(q, fieldLimited)`)
	* @return {string} The generated WoS search string
	*/
	wos.getQueryString = argy('string|object [array]', function(q, fieldLimited) {
		if (_.isString(q)) return q; // Pass through already encoded strings

		var fieldMap = {
			title: 'TI',
			year: 'PY',
			doi: 'DO',
			isbn: 'IS',
			issn: 'IS',
			address: 'SA',
			city: 'CI',
			country: 'CU',
			pmid: 'PMID',
			authors: 'AU',
			author: 'AU',
		};

		return _(fieldMap)
			.pickBy((v, k) => fieldLimited ? fieldLimited.includes(k) : true) // Either restrict the fields if !!fieldLimited or pick all
			.map((v, k) => q[k] ? `${v}=(${_.isArray(q[k]) ? q[k].join(' AND ') : q[k]})` : undefined)
			.filter() // Remove empty
			.join(' AND ')
	});


	/**
	* Convert a Web of Science citation return into a DOI
	* This function is largely a work around to the (exceptionally stupid fact) that WoS returns useless internal WOS ID's during a cite / cited by search
	* NOTE: Requires login first
	* @param {Object} ref The reference to search for, the query is run via getQueryString() so any parameter thats valid there is used
	* @param {Object} [options] Additional options to use
	* @param {funtion} cb The callback fired with (err, doi)
	*/
	wos.wosRefToDoi = argy('object [object] function', function(ref, options, cb) {
		if (wos.sessionToken) throw new Error('wosRefToDoi() requires login() to be called first');

		return wos.search(wos.getQueryString(ref, ['title', 'year']), options, function(err, res) {
			if (err) return cb(err);

			console.log('RETURNED');
			console.log(require('util').inspect(res, {depth: null, colors: true}))

			var useRef = res.results.find(ref => !!ref.doi)
			if (!useRef) {
				return cb();
			} else {
				return cb(null, useRef.doi);
			}
		});
	});


	/**
	* Perform a search on WoS and return the results
	* @param {Object|string} q The query to run. This is automatically translated via getQueryString() if not already a string
	* @param {Object} [options] Additional options to use
	* @param {string} [language=en] The language to query in
	* @param {number} [options.skip=0] How many records in to start at
	* @param {number} [options.limit=5] How many records to list
	* @param {funtion} cb The callback fired with (err, refs)
	*/
	wos.search = argy('object|string [object] function', function(q, options, cb) {
		if (wos.sessionToken) throw new Error('search() requires login() to be called first');

		var settings = _.defaults(options, {
			skip: 1,
			limit: 5,
			language: 'en',
		});

		var query = wos.getQueryString(q);
		if (!query) return cb('Invalid query');

		superagent.post('http://search.webofknowledge.com/esti/wokmws/ws/WokSearchLite')
			.send(`
				<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:woksearchlite="http://woksearchlite.v3.wokmws.thomsonreuters.com">
					 <soapenv:Header/>
					 <soapenv:Body>
						<woksearchlite:search>
							 <queryParameters>
								<databaseId>WOS</databaseId>
								<userQuery>${query}</userQuery>
								<editions>
									 <collection>WOS</collection>
									 <edition>SCI</edition>
								</editions>
								<timeSpan>
									 <begin>2000-01-01</begin>
									 <end>2017-12-31</end>
								</timeSpan>
								<queryLanguage>${settings.language}</queryLanguage>
							 </queryParameters>
							 <retrieveParameters>
								<firstRecord>${settings.skip+1}</firstRecord>
								<count>${settings.limit}</count>
							 </retrieveParameters>
						</woksearchlite:search>
					 </soapenv:Body>
				</soapenv:Envelope>
			`)
			.end(function(err, res) {
				if (err) return cb(err);
				res.body = xmlParser.xml2js(res.text, {compact: true});
				var dataPath = ['soap:Envelope', 'soap:Body', 'ns2:searchResponse', 'return'];
				if (!_.has(res.body, dataPath)) return cb('No result found');

				var data = _.get(res.body, dataPath);

				var fieldTranslations = {
					SourceTitle: 'journal',
					issue: 'issue',
					volume: 'volume',
					pages: 'pages',
					'Published.BiblioDate': 'date',
					'Published.BiblioYear': 'year',
					'Identifier.Doi' : 'doi',
					'Identifier.Issn': 'issn',
				};

				cb(null, {
					found: parseInt(data.recordsFound._text),
					searched: parseInt(data.recordsSearched._text),
					results: _.castArray(data.records).map(raw => {
						var ref = {
							uid: _.get(raw, 'uid._text'),
							title: _.get(raw, 'title.value._text'),
							type:  _.get(raw, 'doctype.value._text'),
							authors: [],
						};

						if (_.get(raw, 'authors.value')) {
							if (_.isObject(raw.authors.value)) raw.authors.value = [];
							ref.authors = raw.authors.value.map(a => a._text);
						}


						// Translate sources + additionalInfo {{{
						['source', 'other'].forEach(field => {
							raw[field].forEach(s => {
								if (!fieldTranslations[s.label._text]) return;
								ref[fieldTranslations[s.label._text]] = s.value._text;
							});
						});
						// }}}

						return ref;
					}),
				});
			});
	});


	/**
	* Return the cited references of a resource (i.e. the papers THIS paper has as citations)
	* NOTE: to compute the wID use doiToWosID to convert from the more universal DOI
	*
	* The return value of this function is an object containing some meta information + the results array
	*     {meta: {found: Number, searched: Number}, results: Array}
	*
	* Each result is an object containing at least a `wosID` field and any of the following optional fields: `title`, `author`, `count`, `volume`, `pages`, `year`, `work`, `hot`
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
										wosID: 'WOS:' + r.docid._text,
									};

									[
										{wosField: 'citedTitle', ourField: 'title', type: 'string'},
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
