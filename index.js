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
				res.body = xmlParser.xml2js(res.text, {compact: true});

				var authPath = ['soap:Envelope', 'soap:Body', 'ns2:authenticateResponse', 'return', '_text'];

				if (_.has(res.body, authPath)) {
					cb(null, _.get(res.body, authPath))
				} else {
					cb('Failed login: ' + res.text);
				}
			});
	};

	return wos;
}

module.exports = webOfScience;
