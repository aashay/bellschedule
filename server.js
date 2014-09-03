var express = require('express');
var serveStatic = require('serve-static');
var expressHbs = require('express-handlebars');

var session = require('express-session')
var request = require('request');

var PORT = parseInt(process.env.PORT) || 5000;
var APP_URL = process.env.APP_URL || 'http://localhost:' + PORT;

var DISTRICT_TOKEN = process.env.DISTRICT_TOKEN || '4f51ccbb08b756c1361e4b0853d8b9f4c97df65a';
var DISTRICT_ID = process.env.DISTRICT_ID || '5327a245c79f90670e001b78';
var CLIENT_ID = process.env.CLIENT_ID || '631c186dcef0f81043cd';
var CLIENT_SECRET = process.env.CLIENT_SECRET || '8a7f27db39769749371cd0eb920d1906898d8759';

var API_PREFIX = 'https://api.clever.com'
var OAUTH_TOKEN_URL = 'https://clever.com/oauth/tokens'

var app = express();
app.use(serveStatic(__dirname + '/public'));

app.engine('handlebars', expressHbs());
app.set('view engine', 'handlebars');

app.use(session({secret: 'somekindasecret'}));

var makeRequest = function (options, cb){
    request(options, function(err, response, body){
        if(!err){            
            if(response.statusCode != 200){
                var errorMsg = body['error'];
                console.error('Non-200 status code: ', response.statusCode, ' with error ' + errorMsg);
                cb(errorMsg);
            }else{            
                cb(null, body);
            }
        }else{
            console.error('Something broke: ' + err);
            cb(err);
        }
    });
};

app.get('/', function(req, res){
    res.render('index', {
        'redirect_uri': encodeURIComponent(APP_URL + '/oauth'),
        'client_id': CLIENT_ID,
        'district_id': DISTRICT_ID
    });
});

app.get('/oauth', function(req, res){        
    if(!req.query.code){
        res.redirect('/');
    }else{
        var body = {
            'code': req.query.code,
            'grant_type': 'authorization_code',
            'redirect_uri': APP_URL + '/oauth'
        };

        var options = {
            'url': OAUTH_TOKEN_URL,
            'method': 'POST',
            'json': body,            
            'headers' : {
                'Authorization': 'Basic ' + new Buffer(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            }
        }

        makeRequest(options, function(err, result){
            if(!err){                
                //If we had read:student scope, it would be handy to store the user's access token
                //in their session.  However, since we only have read:sis scope, we'll make another request
                //to get the user data and store that in their session for future requests.
                var options = {
                    'url': API_PREFIX + '/me',
                    'json': true,            
                    'headers' : {
                        'Authorization': 'Bearer ' + result['access_token']
                    }
                }
                makeRequest(options, function(err, result){
                    if(!err){
                        var userData = result['data'];
                        req.session.user = userData;                        
                        res.redirect('/app');
                    }else{
                        console.error('Something broke: ' + err);
                        res.status(500).send(err);
                    }
                });                
            }else{
                console.error('Something broke: ' + err);
                res.status(500).send(err);
            }
        });        
    }    
});

app.get('/app', function(req, res){
    if(!req.session.user){
        res.redirect('/');  //If we're not logged in, redirect to the homepage
    }else{
        var userType = req.session.user.type + 's'; //students vs teachers
        var options = {
            'url': API_PREFIX + '/v1.1/' + userType + '/' + req.session.user.id + '/sections',
            'json': true,            
            'headers' : {
                'Authorization': 'Bearer ' + DISTRICT_TOKEN
            }
        }
        makeRequest(options, function(err, result){            
            if(!err){                
                var data = result['data'];
                res.render('schedule', {
                    'data': data.sort(function(a, b) {
                        var x = parseInt(a['data']['period']); var y = parseInt(b['data']['period']);                
                        return ((x < y) ? -1 : ((x > y) ? 1 : 0));
                    }),
                    'name': req.session.user.name
                });
            }else{
                console.error('Something broke: ' + err);
                res.status(500).send(err);
            }
        });
    }    
});

app.listen(PORT, function() {
  console.log('Bell Schedule now running on port ' + PORT);
});