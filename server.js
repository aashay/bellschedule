var express = require('express');
var serveStatic = require('serve-static');
var session = require('express-session')
var request = require('request');

var APPURL = process.env.APPURL || 'http://bellschedule.herokuapp.com'

var DISTRICTTOKEN = process.env.DISTRICTTOKEN || '4f51ccbb08b756c1361e4b0853d8b9f4c97df65a';
var DISTRICTID = process.env.DISTRICTID || '5327a245c79f90670e001b78';
var CLIENTID = process.env.CLIENTID || '631c186dcef0f81043cd';
var CLIENTSECRET = process.env.CLIENTSECRET || '8a7f27db39769749371cd0eb920d1906898d8759';

var APIPREFIX = 'https://api.clever.com/v1.1/'
var OAUTHPREFIX = 'https://clever.com/oauth'


// var globalOptions = {
//     headers: {
//         'Authorization': 'Bearer ' + TOKEN
//     }
// };

var app = express();
app.use(serveStatic(__dirname + '/public/html'));
app.use(session({secret: 'somekindasecret'}));

var makeRequest = function (options, cb){
    request(options, function(err, response, body){
        if(!err){            

            if(response.statusCode != 200){
                var errorMsg = body['error'];
                console.error('Non-200 status code: ', response.statusCode, ' with error ' + errorMsg);
                cb(errorMsg);
            }else{            
                cb(null, result);
            }
        }else{
            console.error('Something broke: ' + err);
            cb(err);
        }
    });
};

app.get('/oauth', function(req, res){        
    if(!req.query.code){
        res.redirect('/');
    }else{
        var body = {
            code: req.query.code,
            grant_type: 'authorization_code',
            redirect_uri: APPURL + '/oauth'
        };

        var options = {
            'url': OAUTHPREFIX + '/tokens',
            'method': 'POST',
            'json': true,
            'body': body,
            'headers' : {
                'Authorization': 'Basic ' + new Buffer(CLIENTID + ':' + CLIENTSECRET).toString('base64')
            }
        }

        makeRequest(options, function(err, result){
            if(!err){
                var result = JSON.parse(body);                    
                req.session.token = result['access_token'];
                res.redirect('/app');
            }else{
                console.error('Something broke: ' + err);
                res.status(500).send(err);
            }
        });        
    }    
});

app.get('/app', function(req, res){
    if(!req.session.token){
        res.redirect('/');
    }else{
        res.send('Yay you\'re logged in, here is your session information: ' + req.session.token)    
    }    
});

var port = parseInt(process.env.PORT) || 5000;
app.listen(port, function() {
  console.log("Bell Schedule now running on port " + port);
});