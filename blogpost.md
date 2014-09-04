# Building a Basic App with the Clever API

I recently talked to the good folks at [Clever](https://clever.com) about their platform for modern learning software, and decided to experiment a bit with their API.

In order to understand how to use the API, I wrote a simple demo app that uses Clever's Instant Login feature to let teachers and students log in using their Clever credentials and view a simple table containing classes, sorted by period.

In this blog post, I'll walk you through some of the lessons I learned while writing the app, including the ins-and-outs of how to write a basic [Node.js](http://nodejs.org/) app using the Clever Identity and Data APIs.

![Poorly Styled Bell Schedule](http://f.cl.ly/items/0E3z3g0p1o3a033T1Q0W/bellschedule.png)

Before we get started, some quick notes/caveats:

* If you haven't set up a [Clever Developer Account](https://clever.com/developers/signup) and created an app, make sure to contact Clever and have that set up first.
* This tutorial assumes that you have basic knowledge of Node.js/JavaScript and have already set up Node on your machine.  If you haven't, go ahead and get it set up now (or, just follow along if Node's not your thing).
* The Node.js ecosystem has dozens of frameworks and hundreds of modules to choose from.  For the sake of simplicity, I've chosen to use good ol' fashioned [Express](http://expressjs.com/).  I've also decided to avoid using useful modules such as [Passport](http://passportjs.org/) so that I can show the Clever Instant Login workflow in more detail.
* I've decided to use [Heroku](https://heroku.com) to deploy my code.  You're welcome to deploy elsewhere, but this tutorial will assume you're up and running with Heroku.
* All of the code was written using a "hackathon" style (no tests, no modules, etc) for time purposes.  Feel free to reorganize/refactor as you see fit.

## The Demo

You can visit a live demo of the app here: [http://bellschedule.herokuapp.com](http://bellschedule.herokuapp.com)


## The Setup

### Dependencies
As with any Node app, you'll want to `mkdir` a new project (I called mine `bellschedule`) and run `npm install` to pull in dependencies from a `package.json` file.

I'm going to use a pretty simple `package.json` with the following dependencies: 

```
{
  "name": "BellSchedule",
  "description": "Bell Schedule demo app using Clever API",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "express": "4.8.7",
    "express-session": "1.7.6",
    "express-handlebars": "1.0.1",
    "serve-static": "1.5.3",
    "request": "2.40.0"
  }
}

```

Of particular interest is the [`request`](https://github.com/mikeal/request) dependency, which we'll use to make REST requests to Clever's API.  You're welcome to use a different REST client library (or use raw http, if you're into that kind of thing).

Drop the above `package.json` into your `bellschedule` directory and run `npm install` to install the dependencies.

You'll also want to make a few directories in your project to serve up things like static content and views.  My directory structure (not including `node_modules` ) looks like this:

```
bellschedule
├─┬public
│ ├──images
├─┬views

```

### Server.js

Let's create a basic Hello World `server.js` and choose [Handlebars](http://handlebarsjs.com/) as a templating engine (I like Handlebars but you can use a different one) just to make sure we're up and running.  We'll also use the `serve-static` middleware to server static content.

```
/**
 * Dependencies
 */
var express = require('express');
var serveStatic = require('serve-static');
var expressHbs = require('express-handlebars');

var session = require('express-session')
var request = require('request');
//

/**
 * Useful Constants
 */
var PORT = parseInt(process.env.PORT) || 5000; //process.env.PORT is a Heroku environment var
//

/**
 * App and middleware
 */
var app = express();
app.use(serveStatic(__dirname + '/public'));
app.engine('handlebars', expressHbs());
app.set('view engine', 'handlebars');
app.use(session({secret: 'somesecretthing'}));
//

/**
 * Homepage
 */
app.get('/', function(req, res){
  res.send('Hello World');
});

/**
 * Fire up the server!
 */
app.listen(PORT, function() {
  console.log("Bell Schedule now running on port " + PORT);
});

```

Go ahead and `git push heroku master` your code to make sure everything is working.

## OAuth 2.0 and the Clever Identity API

Now that we've got a basic app running, let's walk through the flow of the Clever Identity API.

[Clever's Identity API](https://clever.com/developers/docs#identity-api-sso-instant-login) is built using the [OAuth2](http://oauth.net/2/) standard.  If you're not familiar with OAuth2, please do read up on it, but know that as with any OAuth2 implementation, there's going to be a bit of a "dance" involved.

![Not this kind of dance](http://i.imgur.com/jsm0x2c.gif)

Here are the basic steps involved (distilled from the [Instant Login Overview docs](https://clever.com/developers/docs#identity-api-sso-overview-section)):

1. Users will visit your app from their Clever Dashboard (i.e. they'll already be logged in) or will need to log in using a "Log In With Clever" button that we'll provide.  The latter will link to a `https://clever.com/oauth/authorize` endpoint with specific parameters.
2. Our app will need an endpoint (`/oauth`) to handle OAuth requests. Clever will pass back a `code` parameter which we will need to exchange for an [OAuth 2 Bearer Token](http://tools.ietf.org/html/rfc6750).  This is basically a unique token that identifies a particular user.
3. We'll use the bearer token against the `/me` endpoint to get a unique ID for our user, and store that information (along with other user information) in the user's session.  Any user that has user information stored in their session is considered logged in.

In order to make things a little easier, I'm going to create a few constant variables and a helper function to wrap the `request` library and make error handling a little easier.  Here's what our `server.js` looks like now:


```
/**
 * Dependencies
 */
var express = require('express');
var serveStatic = require('serve-static');
var expressHbs = require('express-handlebars');

var session = require('express-session')
var request = require('request');
//

/**
 * Useful Constants
 */
var PORT = parseInt(process.env.PORT) || 5000;
var APP_URL = process.env.APP_URL || 'http://localhost:' + PORT;

var DISTRICT_TOKEN = process.env.DISTRICT_TOKEN || 'YOUR_DISTRICT_TOKEN';
var DISTRICT_ID = process.env.DISTRICT_ID || 'YOUR_DISTRICT_ID';
var CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
var CLIENT_SECRET = process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

var API_PREFIX = 'https://api.clever.com'
var OAUTH_TOKEN_URL = 'https://clever.com/oauth/tokens'
//

/**
 * App and middleware
 */
var app = express();
app.use(serveStatic(__dirname + '/public'));
app.engine('handlebars', expressHbs());
app.set('view engine', 'handlebars');
app.use(session({secret: 'somekindasecret'}));
//

/**
 * A helper function to make external REST requests.
 * @param {hash} option - options hash passed to the request lib
 * @param {function} cb - A callback function with err, body as params
 */
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

/**
 * Homepage
 */
app.get('/', function(req, res){
    res.render('index', {
        'redirect_uri': encodeURIComponent(APP_URL + '/oauth'),
        'client_id': CLIENT_ID,
        'district_id': DISTRICT_ID
    });
});

/**
 * OAuth 2.0 endpoint
 */
app.get('/oauth', function(req, res){        
	//TODO
});

/**
 * Fire up the server!
 */
app.listen(PORT, function() {
  console.log('Bell Schedule now running on port ' + PORT);
});
```

The constant variables are initialized first with `process.env` variables (if they exist, i.e. if you're running in production on Heroku) but it's good to hardcode fallbacks for local development.  Just make sure not to check in your production keys to github!

Here's the breakdown of our newly added constants:

* `APP_URL`: The location of your app.  This is useful in construction dynamic URLs for your templates.
* `DISTRICT_ID`: Your school district ID.  Obtained via the [Clever Account Dashboard](https://account.clever.com/).
* `DISTRICT_TOKEN`: Your app's district token.  Obtained via the [Clever Account Dashboard](https://account.clever.com/) under Settings -> OAuth Applications.
* `CLIENT_ID`: Your app's Client Id.  Obtained via the [Clever Account Dashboard](https://account.clever.com/) under Settings -> OAuth Applications.
* `CLIENT_SECRET`: Your app's Client Secret.  Obtained via the [Clever Account Dashboard](https://account.clever.com/) under Settings -> OAuth Applications.

Finally, we'll want to populate the actual OAuth 2.0 endpoint and get rid of that `TODO`.  Time to write some more code!

![Hackin away](http://i.imgur.com/bF33Vsv.gif)

```
/**
 * OAuth 2.0 endpoint
 */
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
                        //Store the user data returned from Clever in a 'user' session variable and redirect to the app
                        req.session.user = result['data'];                        
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
```

The first thing we do is check to see if the `/oauth` endpoint was hit without a code from Clever, and redirect to the homepage if that's the case.  Once we've verified that we have a code, we construct a body according to the [Clever OAuth2 Flow spec](https://clever.com/developers/docs#identity-api-sso-oauth2-flow-section).  The `'json': body,` line simply tells the `request` library that we are passing in a JSON object and expecting JSON back.

A few things are important to note with the options and body passed to the initial request:

* This must be a `POST` request
* The `redirect_uri` needs to be the same as the uri on our site that handles the oauth flow (in our case, http://APP_URL/oauth).
* For the initial OAuth flow, we must use `Basic` Authorization and pass in a base64 encoding of `CLIENT_ID:CLIENTSECRET`.

Finally, we'll make one more request to `/me` using the `access_token` that came from the result of the OAuth dance.  This will give us a bunch of useful user data, including the user's `id` and `name` among other things.

Don't forget to update your [app settings](https://account.clever.com/) with your OAuth redirect urls. I used `http://localhost:5000/oauth` for local development and `http://bellschedule.herokuapp.com/oauth` for my production environment.

## Getting Data from Clever

### Scopes

One of the reasons we need to store user data in a local session is due to the scopes I'm using for my application.  In particular, I'm using the `read:sis` and `read:user_id` scopes.  Had Clever granted me the `read:student` scope, using the student Bearer token would've been enough to get additional data.  Since we're using the `read:sis` scope, we'll use our `DISTRICT_TOKEN` to get data on our user's behalf (since each session has unique user data at this point).

Hop on over to [Clever's API Explorer](https://clever.com/developers/docs/explorer) to poke around at the various data endpoints.

### Getting a schedule

Since our end goal is to display a student's or teacher's class schedule (sections), the endpoints we care about are [/v1.1/teachers/{id}/sections](https://clever.com/developers/docs/explorer#endpoint_teachers_teachers_id_sections) and [/v1.1/students/{id}/sections](https://clever.com/developers/docs/explorer#endpoint_students_students_id_sections).

But wait! How do we know which endpoint to use? Fortunately, our `req.session.user` session variable is loaded with a ton of useful information about our user, including a `type` parameter that determines if our user is a student or teacher!  We use this to do a little magic and create an `app` endpoint to display our final content.

![Magic](http://i.imgur.com/Ty9lM0L.gif)

Here's what my `app` endpoint looks like:

```
/**
 * The main app!
 */
app.get('/app', function(req, res){
    if(!req.session.user){
        res.redirect('/');  //If we're not logged in, redirect to the homepage
    }else{
        var userType = req.session.user.type + 's'; //studentS vs teacherS
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
```

Notice that crafty `url` construction? This will make sure that we can pull down schedules for either students or teachers, regardless of user type.  Here are some other things to pay attention to:

* The `Authorization` header now users a `Bearer` token with the `DISTRICT_TOKEN` which has global access to district information.
* Clever returns a data block with an initial key of `data` for most responses, but each `data` block is an array that contains objects that contain additional `data` keys.  This will be more obvious when you look at the handlehbar templates.
* As of writing this blog post, Clever does not support passing in a `sort` parameter to `/v1.1/teachers/{id}/sections` or `/v1.1/students/{id}/sections` (unlike the `/v1.1/sections` endpoint) so I chose to implement a sorting function to sort `data` by `period` but you're welcome to omit that and simply pass in `'data': data,`


## The Final Touches

I went ahead and created a basic `/logout` route that destroys session information.  It's important to note that Clever doesn't provide any real facility to log users out: if a user comes back and clicks the Log In With Clever button, they'll be logged in right away (however, the logout functionality will prevent people from visiting routes that require authorization such as `/app`). 

Here's what that looks like:

```
/**
 * A simple logout route.
 */
app.get('/logout', function(req, res){
    if(!req.session.user){
        res.redirect('/');  //If we're not logged in, redirect to the homepage
    }else{
        delete req.session.user;
        res.redirect('/');
    }    
});
```

Finally, our app needs some pages to display.  Rather than embed the handlebar templates here, feel free to [hop over to Github](https://github.com/aashay/bellschedule) and check them out.

Once you've deployed your final code, visit your app's site and you should be presented with a "Log in with Clever" button:

![Log in with Clever](http://cl.ly/XNGG/bellschedulelogin.png)

After logging in with valid student or teacher credentials, you should be redirected to an appropriate schedule. Awesome!

![Hooray](http://i.imgur.com/05KljcF.gif)

I hope this has been a useful tutorial, and as always, if you have any questions, [please do drop me a line](https://twitter.com/aashay).
