web-of-science
==============
NodeJS API interface for Thompson Reuters' Web of Science.

```javascript
var WebOfScience = require('web-of-science');

var wos = new WebOfScience({
	user: 'someUser',
	pass: 'somePass',
});


// Login (done automatically by all APIs anyway)
wos.login(function(err, sessionToken) {
	// sessionToken is the Cookie to use (automatically stored against this WebOfScience object instance)
});


// Convert a DOI -> WebOfScienceID
wos.doiToWosID('10.3322/caac.20107', function(err, doi) {
	// ...
});


// Convert a WebOfScienceID -> DOI
wos.wosIDToDoi('WOS:000270372400005', function(err, wosID) {
	// ...
});


// Get papers that WOS:000270372400005 cites
wos.cites('WOS:000270372400005', function(err, res) {
	// res = res.meta + res.results
});


// Get papers that cite WOS:000270372400005
wos.cited('WOS:000270372400005', function(err, res) {
	// res = res.meta + res.results
});
```
